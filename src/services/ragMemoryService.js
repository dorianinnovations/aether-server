/**
 * RAG Memory Service - Production MongoDB + Vector Search
 * Clean architecture with UserMemory collection
 */

import UserMemory from '../models/UserMemory.js';
import Activity from '../models/Activity.js';
import { embed, scoreByCosine, mmr, summarize, formatMemoryBlock } from '../utils/vectorUtils.js';
import { log } from '../utils/logger.js';

const TOP_K = 24;
const MMR_K = 10;
const MMR_LAMBDA = 0.7;

class RAGMemoryService {
  
  /**
   * Build enhanced context from user memories
   */
  async buildEnhancedContext(userId, message) {
    try {
      const queryVec = await embed(message);
      if (!queryVec) return '';

      // Get user memories
      const memories = await UserMemory.find({ 
        user: userId,
        $or: [
          { decayAt: { $exists: false } },
          { decayAt: { $gt: new Date() } }
        ]
      }).lean().exec();

      if (memories.length === 0) return '';

      // Score by cosine similarity
      const scored = scoreByCosine(memories, queryVec);
      
      // Filter minimum relevance
      const relevant = scored.filter(s => s.similarity >= 0.25);
      if (relevant.length === 0) return '';

      // Apply MMR for diversity
      const diversified = mmr(relevant, queryVec, { k: MMR_K, lambda: MMR_LAMBDA });
      
      // Extract content and compress
      const content = diversified.map(d => d.memory.content).join('\n');
      const compressed = await summarize(content, 1000);
      
      // Update salience for used memories
      await this.bumpUsedMemories(diversified.map(d => d.memory._id));
      
      log.debug('Built RAG memory context', { memoryCount: diversified.length, contentLength: compressed.length });
      
      return formatMemoryBlock(compressed);
    } catch (error) {
      log.error('Error building enhanced context:', error);
      return '';
    }
  }

  /**
   * Upsert facts into UserMemory collection
   */
  async upsertFacts(userId, facts) {
    try {
      const results = [];
      
      for (const fact of facts) {
        if (!fact.content || fact.content.length < 10) continue;
        
        const vec = await embed(fact.content);
        if (!vec) continue;

        const memory = await UserMemory.findOneAndUpdate(
          { user: userId, content: fact.content },
          {
            ...fact,
            user: userId,
            embedding: vec,
            updatedAt: new Date()
          },
          { upsert: true, new: true }
        );

        results.push(memory._id);
      }

      log.debug('Upserted RAG facts', { count: results.length });
      return results;
    } catch (error) {
      log.error('Error upserting facts:', error);
      return [];
    }
  }

  /**
   * Distill facts from conversation turns using AI
   */
  async distillFromTurns(turns) {
    try {
      const turnsText = turns.slice(-12).map(t => `${t.role}: ${t.content}`).join('\n');
      
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'openai/gpt-5-mini',
          messages: [{
            role: 'user',
            content: `Extract durable user facts from this dialog. Focus on stable preferences, identity, long-term projects, and skills. Avoid transient requests or time-bound details.

Return JSON array: [{"kind": "preference|project|fact|profile", "content": "clear factual statement", "tags": ["tag1"], "salience": 0.0-1.0}]

Dialog:
${turnsText}`
          }],
          max_tokens: 500,
          temperature: 0.2
        })
      });

      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      
      if (!content) return [];
      
      const facts = JSON.parse(content);
      
      // Filter quality facts - Drop short/noisy facts, Salience ≥ 0.6 only
      return facts.filter(f => 
        f.content && 
        f.content.length >= 15 && // Drop short facts
        f.salience >= 0.6 && 
        !this.isTransient(f.content) &&
        !this.isNoisyContent(f.content)
      );
    } catch (error) {
      log.error('Error distilling facts:', error);
      return [];
    }
  }

  /**
   * Auto-distill and store from recent conversation
   */
  async maybeAutoDistill(userId, conversationId, recentTurns) {
    try {
      if (recentTurns.length < 4) return 0; // Lowered from 6 to 4
      
      const facts = await this.distillFromTurns(recentTurns);
      if (facts.length === 0) return 0;
      
      // Add source metadata
      const factsWithSource = facts.map(fact => ({
        ...fact,
        source: {
          origin: 'conversation',
          conversationId,
          extractedAt: new Date(),
          provenance: `auto-distilled from conversation ${conversationId}`
        }
      }));
      
      const stored = await this.upsertFacts(userId, factsWithSource);
      
      log.info('Auto-distilled conversation facts', { factCount: stored.length });
      return stored.length;
    } catch (error) {
      log.error('Error auto-distilling:', error);
      return 0;
    }
  }

  /**
   * Store episodic signals from Activity collection
   */
  async distillFromActivities(userId, limit = 50) {
    try {
      const activities = await Activity.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
      
      if (activities.length === 0) return 0;
      
      // Group by type and extract patterns
      const facts = [];
      
      // Music preferences from Spotify activities
      const musicActivities = activities.filter(a => a.type === 'spotify_track');
      if (musicActivities.length > 3) {
        const artists = [...new Set(musicActivities.map(a => a.data?.artist).filter(Boolean))];
        const genres = [...new Set(musicActivities.flatMap(a => a.data?.genres || []))];
        
        if (artists.length > 0) {
          facts.push({
            kind: 'preference',
            content: `Enjoys music from artists: ${artists.slice(0, 5).join(', ')}`,
            tags: ['music', 'spotify'],
            salience: 0.7,
            source: { origin: 'activity_analysis', type: 'music' }
          });
        }
        
        if (genres.length > 0) {
          facts.push({
            kind: 'preference', 
            content: `Listens to genres: ${genres.slice(0, 3).join(', ')}`,
            tags: ['music', 'genre'],
            salience: 0.6,
            source: { origin: 'activity_analysis', type: 'music' }
          });
        }
      }
      
      // Status patterns
      const statusUpdates = activities.filter(a => a.type === 'status_update');
      if (statusUpdates.length > 5) {
        const moods = statusUpdates.map(s => s.data?.mood).filter(Boolean);
        const commonMood = this.findMostCommon(moods);
        
        if (commonMood) {
          facts.push({
            kind: 'profile',
            content: `Often has ${commonMood} mood in status updates`,
            tags: ['mood', 'personality'],
            salience: 0.5,
            source: { origin: 'activity_analysis', type: 'mood' }
          });
        }
      }
      
      if (facts.length > 0) {
        const stored = await this.upsertFacts(userId, facts);
        log.info('Distilled activity facts', { factCount: stored.length, activityCount: activities.length });
        return stored.length;
      }
      
      return 0;
    } catch (error) {
      log.error('Error distilling from activities:', error);
      return 0;
    }
  }

  /**
   * Get memory stats for user
   */
  async getMemoryStats(userId) {
    try {
      const stats = await UserMemory.aggregate([
        { $match: { user: userId } },
        {
          $group: {
            _id: '$kind',
            count: { $sum: 1 },
            avgSalience: { $avg: '$salience' }
          }
        }
      ]);

      const total = await UserMemory.countDocuments({ user: userId });
      
      return {
        total,
        byKind: stats.reduce((acc, s) => {
          acc[s._id] = { count: s.count, avgSalience: s.avgSalience };
          return acc;
        }, {})
      };
    } catch (error) {
      log.error('Error getting memory stats:', error);
      return { total: 0, byKind: {} };
    }
  }

  /**
   * Internal method to build context without auth requirements
   */
  async buildEnhancedContextInternal(userId, message) {
    try {
      return await this.buildEnhancedContext(userId, message);
    } catch (error) {
      log.error('Error building enhanced context internally:', error);
      return '';
    }
  }

  /**
   * Internal method to upsert facts without auth requirements
   */
  async upsertFactsInternal(userId, facts) {
    try {
      return await this.upsertFacts(userId, facts);
    } catch (error) {
      log.error('Error upserting facts internally:', error);
      return [];
    }
  }

  /**
   * Clear user memories
   */
  async clearUserMemories(userId) {
    try {
      const result = await UserMemory.deleteMany({ user: userId });
      log.info('Cleared user memories', { count: result.deletedCount });
      return result.deletedCount;
    } catch (error) {
      log.error('Error clearing memories:', error);
      return 0;
    }
  }

  /**
   * Search memories directly
   */
  async searchMemories(userId, query, limit = 10) {
    try {
      const queryVec = await embed(query);
      if (!queryVec) return [];

      const memories = await UserMemory.find({ user: userId }).lean();
      const scored = scoreByCosine(memories, queryVec);
      
      return scored.slice(0, limit).map(s => ({
        ...s.memory,
        similarity: s.similarity
      }));
    } catch (error) {
      log.error('Error searching memories:', error);
      return [];
    }
  }

  // === HELPER METHODS ===

  /**
   * Check if content is transient
   */
  isTransient(content) {
    const transientPatterns = [
      /\b(today|tomorrow|yesterday|this week|next week)\b/i,
      /\b(help me|can you|what is|how do)\b/i,
      /\b(right now|currently)\b/i
    ];
    
    return transientPatterns.some(p => p.test(content));
  }

  /**
   * Boost salience for used memories
   */
  async bumpUsedMemories(memoryIds) {
    try {
      await UserMemory.updateMany(
        { _id: { $in: memoryIds } },
        { 
          $inc: { salience: 0.05 },
          $set: { updatedAt: new Date() }
        }
      );
      
      // Cap salience at 1.0
      await UserMemory.updateMany(
        { _id: { $in: memoryIds }, salience: { $gt: 1.0 } },
        { $set: { salience: 1.0 } }
      );
    } catch (error) {
      log.error('Error bumping memory salience:', error);
    }
  }

  /**
   * Find most common item in array
   */
  findMostCommon(arr) {
    const counts = {};
    let maxCount = 0;
    let result = null;
    
    for (const item of arr) {
      counts[item] = (counts[item] || 0) + 1;
      if (counts[item] > maxCount) {
        maxCount = counts[item];
        result = item;
      }
    }
    
    return maxCount >= 3 ? result : null;
  }
}

export default new RAGMemoryService();