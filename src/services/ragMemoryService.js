/**
 * RAG Memory Service - Production MongoDB + Vector Search
 * Clean architecture with UserMemory collection
 */

import UserMemory from '../models/UserMemory.js';
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
      // Memory context should always be available when relevant
      // Skip random chance - memories should be used consistently
      
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

      // Score by cosine similarity with higher threshold to be more selective
      const scored = scoreByCosine(memories, queryVec);
      
      // Filter for relevance - lowered threshold for better recall
      const relevant = scored.filter(s => s.similarity >= 0.2); // Allow more memories through
      if (relevant.length === 0) return '';

      // Use fewer memories for less overwhelming context
      const diversified = mmr(relevant, queryVec, { k: Math.min(5, MMR_K), lambda: MMR_LAMBDA });
      
      // Extract content and compress more aggressively
      const content = diversified.map(d => d.memory.content).join('\n');
      const compressed = await summarize(content, 600); // Reduced from 1000
      
      // Update salience for used memories
      await this.bumpUsedMemories(diversified.map(d => d.memory._id));
      
      log.debug('Built selective RAG memory context', { memoryCount: diversified.length, contentLength: compressed.length });
      
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
   * Auto-learn music preferences from conversation
   */
  async learnMusicPreferences(userId, userMessage, aiResponse) {
    try {
      // Extract music-related preferences from conversation
      const musicMentions = this.extractMusicMentions(userMessage, aiResponse);
      
      if (musicMentions.length === 0) return 0;
      
      // Convert music mentions to preference facts
      const preferenceFacts = musicMentions.map(mention => ({
        kind: 'preference',
        content: `Music preference: ${mention.content}`,
        tags: ['music', mention.type, 'auto-learned'],
        salience: mention.confidence,
        source: {
          origin: 'music_conversation',
          extractedAt: new Date(),
          type: mention.type,
          confidence: mention.confidence
        }
      }));
      
      const stored = await this.upsertFacts(userId, preferenceFacts);
      
      if (stored.length > 0) {
        log.info('Auto-learned music preferences', { 
          userId, 
          preferencesLearned: stored.length,
          types: [...new Set(musicMentions.map(m => m.type))]
        });
      }
      
      return stored.length;
    } catch (error) {
      log.error('Error learning music preferences:', error);
      return 0;
    }
  }

  /**
   * Extract music mentions from conversation
   */
  extractMusicMentions(userMessage, aiResponse) {
    const mentions = [];
    const combinedText = `${userMessage} ${aiResponse}`;
    
    // Artist mentions
    const artistPattern = /\b(?:artist|band|musician|singer)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
    let artistMatch;
    while ((artistMatch = artistPattern.exec(combinedText)) !== null) {
      const artist = artistMatch[1].trim();
      if (artist.length > 2 && !this.isCommonWord(artist)) {
        mentions.push({
          type: 'artist',
          content: `likes artist ${artist}`,
          confidence: 0.7
        });
      }
    }
    
    // Genre mentions
    const genres = ['rock', 'pop', 'hip-hop', 'hip hop', 'electronic', 'jazz', 'country', 'classical', 'indie', 'folk', 'r&b', 'soul', 'funk', 'metal', 'punk', 'blues', 'reggae', 'alternative', 'experimental', 'ambient', 'house', 'techno', 'dubstep', 'trap'];
    const genrePattern = new RegExp(`\\b(${genres.join('|')})\\b`, 'gi');
    let genreMatch;
    while ((genreMatch = genrePattern.exec(combinedText)) !== null) {
      mentions.push({
        type: 'genre',
        content: `enjoys ${genreMatch[1].toLowerCase()} music`,
        confidence: 0.8
      });
    }
    
    // Music activity mentions
    const activityPattern = /\b(listening to|playing|discovering|exploring|into|love|like|enjoy|obsessed with|addicted to|vibing to)\s+([^.!?]+)/gi;
    let activityMatch;
    while ((activityMatch = activityPattern.exec(combinedText)) !== null) {
      const activity = activityMatch[2].trim();
      if (activity.length > 3 && activity.length < 50) {
        mentions.push({
          type: 'activity',
          content: `currently ${activityMatch[1]} ${activity}`,
          confidence: 0.6
        });
      }
    }
    
    return mentions;
  }

  /**
   * Check if a word is too common to be meaningful
   */
  isCommonWord(word) {
    const commonWords = ['The', 'This', 'That', 'You', 'I', 'We', 'They', 'It', 'And', 'Or', 'But', 'So', 'Now', 'Here', 'There', 'When', 'Where', 'How', 'What', 'Who', 'Why', 'Music', 'Song', 'Album', 'Band', 'Artist'];
    return commonWords.includes(word);
  }

  /**
   * Store music preferences from user's Spotify and music profile data
   */
  async distillFromMusicProfile(userId) {
    try {
      const User = (await import('../models/User.js')).default;
      const user = await User.findById(userId).lean();
      
      if (!user) return 0;
      
      const facts = [];
      
      // Extract from Spotify data
      const spotifyData = user.musicProfile?.spotify;
      if (spotifyData) {
        // Recent tracks for artist preferences
        if (spotifyData.recentTracks?.length > 0) {
          const recentArtists = [...new Set(spotifyData.recentTracks.map(t => t.artist).filter(Boolean))];
          if (recentArtists.length > 0) {
            facts.push({
              kind: 'preference',
              content: `Recently listening to artists: ${recentArtists.slice(0, 5).join(', ')}`,
              tags: ['music', 'spotify', 'artists'],
              salience: 0.8,
              source: { origin: 'spotify_analysis', type: 'music' }
            });
          }
        }
        
        // Top tracks for music taste
        if (spotifyData.topTracks?.length > 0) {
          const topArtists = [...new Set(spotifyData.topTracks.map(t => t.artist).filter(Boolean))];
          if (topArtists.length > 0) {
            facts.push({
              kind: 'preference',
              content: `Favorite artists include: ${topArtists.slice(0, 3).join(', ')}`,
              tags: ['music', 'favorites'],
              salience: 0.9,
              source: { origin: 'spotify_analysis', type: 'music' }
            });
          }
        }
      }
      
      // Extract from followed artists
      if (user.artistPreferences?.followedArtists?.length > 0) {
        const followedNames = user.artistPreferences.followedArtists.map(a => a.artistName);
        facts.push({
          kind: 'preference',
          content: `Following artists: ${followedNames.slice(0, 5).join(', ')}`,
          tags: ['music', 'following', 'artists'],
          salience: 0.9,
          source: { origin: 'artist_following', type: 'music' }
        });
      }
      
      // Extract from music taste genres
      if (user.artistPreferences?.musicTaste?.favoriteGenres?.length > 0) {
        const genres = user.artistPreferences.musicTaste.favoriteGenres.map(g => g.name);
        facts.push({
          kind: 'preference',
          content: `Enjoys genres: ${genres.slice(0, 3).join(', ')}`,
          tags: ['music', 'genres'],
          salience: 0.7,
          source: { origin: 'music_taste', type: 'music' }
        });
      }
      
      // Extract from recent music activities
      if (user.musicProfile?.musicPersonality?.recentMusicActivities?.length > 0) {
        const recentActivities = user.musicProfile.musicPersonality.recentMusicActivities.slice(0, 3);
        const activityText = recentActivities.map(a => a.activity).join('; ');
        facts.push({
          kind: 'activity',
          content: `Recent music activity: ${activityText}`,
          tags: ['music', 'recent', 'listening'],
          salience: 0.6,
          source: { origin: 'music_activity', type: 'music' }
        });
      }
      
      // Extract discovery style preferences
      if (user.musicProfile?.musicPersonality?.discoveryStyle) {
        const style = user.musicProfile.musicPersonality.discoveryStyle;
        const preferences = [];
        
        if (style.adventurous > 0.7) preferences.push('adventurous');
        if (style.social > 0.7) preferences.push('social discovery');
        if (style.algorithmic > 0.7) preferences.push('algorithm-based');
        if (style.nostalgic > 0.7) preferences.push('nostalgic');
        if (style.trendy > 0.7) preferences.push('trending music');
        
        if (preferences.length > 0) {
          facts.push({
            kind: 'preference',
            content: `Music discovery style: ${preferences.join(', ')}`,
            tags: ['music', 'discovery', 'personality'],
            salience: 0.6,
            source: { origin: 'music_personality', type: 'discovery' }
          });
        }
      }
      
      if (facts.length > 0) {
        const stored = await this.upsertFacts(userId, facts);
        log.info('Distilled music profile facts', { 
          factCount: stored.length, 
          sourceTypes: [...new Set(facts.map(f => f.source.origin))]
        });
        return stored.length;
      }
      
      return 0;
    } catch (error) {
      log.error('Error distilling from music profile:', error);
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
  async searchMemories(userId, query, limit = 10, minSimilarity = 0.6) {
    try {
      const queryVec = await embed(query);
      if (!queryVec) return [];

      const memories = await UserMemory.find({ user: userId }).lean();
      const scored = scoreByCosine(memories, queryVec);
      
      return scored
        .filter(s => s.similarity >= minSimilarity)
        .slice(0, limit)
        .map(s => ({
          ...s.memory,
          similarity: s.similarity
        }));
    } catch (error) {
      log.error('Error searching memories:', error);
      return [];
    }
  }

  /**
   * Store a single memory
   */
  async storeMemory(userId, content, metadata = {}) {
    try {
      const fact = {
        kind: metadata.type || 'fact',
        content,
        tags: metadata.tags || [],
        salience: metadata.salience || 0.7,
        source: {
          origin: metadata.source || 'manual',
          ...metadata
        }
      };

      const result = await this.upsertFacts(userId, [fact]);
      return result.length > 0;
    } catch (error) {
      log.error('Error storing memory:', error);
      return false;
    }
  }

  /**
   * Auto-store conversation memories
   */
  async autoStoreConversation(userId, messages, conversationId) {
    try {
      if (!messages || messages.length < 4) return 0;
      
      // Convert messages to turns format
      const turns = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      return await this.maybeAutoDistill(userId, conversationId, turns);
    } catch (error) {
      log.error('Error auto-storing conversation:', error);
      return 0;
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