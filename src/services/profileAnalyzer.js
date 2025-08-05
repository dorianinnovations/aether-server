/**
 * Profile Analyzer Service
 * Analyzes chat messages to build user profiles for matching
 */

import User from '../models/User.js';
import { log } from '../utils/logger.js';

class ProfileAnalyzer {
  constructor() {
    // Interest detection patterns
    this.interestPatterns = [
      { regex: /(?:love|adore|obsessed with|really into|passionate about|can't get enough of)\s+([^,.!?]+)/gi, weight: 0.9 },
      { regex: /(?:favorite|fav)\s+([^,.!?]+)/gi, weight: 0.8 },
      { regex: /(?:enjoy|like|dig|into)\s+([^,.!?]+)/gi, weight: 0.6 },
      { regex: /(?:play|playing|watch|watching|read|reading|listen to|listening to)\s+([^,.!?]+)/gi, weight: 0.5 },
      { regex: /(?:been\s+(?:binge\s+)?(?:watching|playing|reading))\s+([^,.!?]+)/gi, weight: 0.7 }
    ];

    // Communication style indicators
    this.styleIndicators = {
      casual: [
        { regex: /\b(?:lol|lmao|haha|hehe|omg|wtf|tbh|ngl|fr|bruh)\b/gi, weight: 0.3 },
        { regex: /[😂😁😆😄😃🤣]/g, weight: 0.2 },
        { regex: /\b(?:gonna|wanna|kinda|sorta|dunno|prolly)\b/gi, weight: 0.2 }
      ],
      
      energetic: [
        { regex: /[!]{2,}/g, weight: 0.4 },
        { regex: /[A-Z]{3,}/g, weight: 0.3 },
        { regex: /[🔥💯⚡🚀🎉]/g, weight: 0.3 },
        { regex: /\b(?:amazing|awesome|incredible|fantastic|epic|insane)\b/gi, weight: 0.2 }
      ],
      
      analytical: [
        { regex: /\b(?:analyze|consider|evaluate|examine|theory|hypothesis|complex|nuanced)\b/gi, weight: 0.4 },
        { regex: /\b(?:however|therefore|consequently|furthermore|moreover|nonetheless)\b/gi, weight: 0.3 },
        { regex: /[.]{50,}|[\w\s]{100,}/g, weight: 0.2 } // Long sentences
      ],
      
      social: [
        { regex: /\b(?:what about you|how about you|what do you think|your thoughts|tell me about)\b/gi, weight: 0.4 },
        { regex: /\?/g, weight: 0.1 }, // Questions
        { regex: /\b(?:we should|let's|together|hang out|meet up)\b/gi, weight: 0.5 }
      ],
      
      humor: [
        { regex: /\b(?:lol|haha|funny|hilarious|joke|kidding|sarcasm)\b/gi, weight: 0.3 },
        { regex: /[😂🤣😄😆😁]/g, weight: 0.3 },
        { regex: /\b(?:meme|memes|gif|gifs)\b/gi, weight: 0.2 }
      ]
    };
  }

  /**
   * Analyze a single message and update user profile
   */
  async analyzeMessage(userId, messageContent) {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const user = await User.findById(userId);
        if (!user) return;

        // Initialize social proxy personality if it doesn't exist
        if (!user.socialProxy) {
          user.socialProxy = { personality: {} };
        }
        if (!user.socialProxy.personality) {
          user.socialProxy.personality = {
            interests: [],
            communicationStyle: {
              casual: 0,
              energetic: 0,
              analytical: 0,
              social: 0,
              humor: 0
            },
            totalMessages: 0,
            analysisVersion: '2.0'
          };
        }

        // Extract interests
        const detectedInterests = this.extractInterests(messageContent);
        this.updateInterests(user.socialProxy.personality, detectedInterests);

        // Analyze communication style
        const styleScores = this.analyzeCommunicationStyle(messageContent);
        this.updateCommunicationStyle(user.socialProxy.personality, styleScores);

        // Update metadata
        user.socialProxy.personality.totalMessages += 1;
        user.socialProxy.personality.lastAnalyzed = new Date();

        await user.save();
        
        log.debug(`Profile updated for user ${userId}:`, {
          interests: user.socialProxy.personality.interests.length,
          totalMessages: user.socialProxy.personality.totalMessages,
          tags: this.generateCompatibilityTags(user.socialProxy.personality)
        });

        return; // Success, exit retry loop

      } catch (error) {
        attempt++;
        
        // If it's a version error and we have retries left, try again
        if (error.name === 'VersionError' && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 100; // Exponential backoff: 200ms, 400ms, 800ms
          log.warn(`Version conflict on attempt ${attempt}, retrying in ${delay}ms for user ${userId}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // Log error and exit
        log.error('Profile analysis failed:', {
          userId,
          attempt,
          error: error.message,
          stack: error.stack
        });
        return;
      }
    }
  }

  /**
   * Extract interests from message content
   */
  extractInterests(content) {
    const interests = [];
    
    for (const pattern of this.interestPatterns) {
      let match;
      while ((match = pattern.regex.exec(content)) !== null) {
        const interest = match[1].trim().toLowerCase();
        if (interest.length > 2 && interest.length < 50) {
          interests.push({
            topic: interest,
            confidence: pattern.weight,
            source: 'pattern_match'
          });
        }
      }
    }

    return interests;
  }

  /**
   * Analyze communication style
   */
  analyzeCommunicationStyle(content) {
    const scores = {};
    
    for (const [style, indicators] of Object.entries(this.styleIndicators)) {
      let totalScore = 0;
      let matchCount = 0;
      
      for (const indicator of indicators) {
        const matches = content.match(indicator.regex) || [];
        if (matches.length > 0) {
          totalScore += matches.length * indicator.weight;
          matchCount++;
        }
      }
      
      // Normalize score (0-1 range)
      scores[style] = Math.min(totalScore / content.length * 100, 1);
    }
    
    return scores;
  }

  /**
   * Update user interests with decay for old interests
   */
  updateInterests(profile, newInterests) {
    const now = new Date();
    
    // Decay existing interests (older interests lose confidence)
    for (const interest of profile.interests) {
      const daysSinceLastMention = (now - interest.lastMentioned) / (1000 * 60 * 60 * 24);
      interest.confidence *= Math.exp(-daysSinceLastMention * 0.1); // Decay factor
    }

    // Add/update new interests
    for (const newInterest of newInterests) {
      const existing = profile.interests.find(i => i.topic === newInterest.topic);
      
      if (existing) {
        // Boost confidence for repeated mentions
        existing.confidence = Math.min(existing.confidence + newInterest.confidence * 0.5, 1);
        existing.lastMentioned = now;
      } else {
        profile.interests.push({
          topic: newInterest.topic,
          confidence: newInterest.confidence,
          lastMentioned: now
        });
      }
    }

    // Remove very low-confidence interests (< 0.1)
    profile.interests = profile.interests.filter(i => i.confidence >= 0.1);
    
    // Keep only top 20 interests
    profile.interests.sort((a, b) => b.confidence - a.confidence);
    profile.interests = profile.interests.slice(0, 20);
  }

  /**
   * Update communication style with smoothing
   */
  updateCommunicationStyle(profile, newScores) {
    const smoothingFactor = 0.3; // How much new data affects the score
    
    for (const [style, newScore] of Object.entries(newScores)) {
      const currentScore = profile.communicationStyle[style] || 0;
      profile.communicationStyle[style] = 
        currentScore * (1 - smoothingFactor) + newScore * smoothingFactor;
    }
  }

  /**
   * Generate simple compatibility tags for matching
   */
  generateCompatibilityTags(profile) {
    const tags = [];
    
    // Top interests as tags
    const topInterests = profile.interests
      .filter(i => i.confidence > 0.5)
      .slice(0, 5)
      .map(i => i.topic);
    tags.push(...topInterests);

    // Communication style tags
    const style = profile.communicationStyle;
    if (style.casual > 0.6) tags.push('casual_chat');
    if (style.energetic > 0.6) tags.push('high_energy');
    if (style.analytical > 0.6) tags.push('deep_thinker');
    if (style.social > 0.6) tags.push('socially_engaged');
    if (style.humor > 0.6) tags.push('funny');

    // Remove duplicates and return
    return [...new Set(tags)];
  }

  /**
   * Batch analyze multiple messages
   */
  async analyzeBatch(messages) {
    const promises = messages.map(msg => 
      this.analyzeMessage(msg.userId, msg.content)
    );
    
    await Promise.allSettled(promises);
    log.info(`Batch analyzed ${messages.length} messages`);
  }
}

export default new ProfileAnalyzer();