/**
 * Matching Service
 * Simple matching logic based on user profiles
 */

import User from '../models/User.js';
import { log } from '../utils/logger.js';

class MatchingService {
  constructor() {
    this.minInterestOverlap = 2; // Minimum shared interests for a match
    this.minConfidence = 0.3;    // Minimum confidence for interests to count
  }

  /**
   * Find potential matches for a user
   */
  async findMatches(userId, limit = 10) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.profile) {
        return [];
      }

      // Get all other users with profiles
      const otherUsers = await User.find({
        _id: { $ne: userId },
        'profile.interests': { $exists: true, $ne: [] }
      });

      const matches = [];

      for (const otherUser of otherUsers) {
        const compatibility = this.calculateCompatibility(user.profile, otherUser.profile);
        
        if (compatibility.score > 0.3) { // Minimum compatibility threshold
          matches.push({
            user: {
              id: otherUser._id,
              username: otherUser.username,
              email: otherUser.email // Remove in production
            },
            compatibility,
            matchReasons: this.generateMatchReasons(user.profile, otherUser.profile)
          });
        }
      }

      // Sort by compatibility score
      matches.sort((a, b) => b.compatibility.score - a.compatibility.score);
      
      return matches.slice(0, limit);

    } catch (error) {
      log.error('Matching error:', error);
      return [];
    }
  }

  /**
   * Calculate compatibility between two user profiles
   */
  calculateCompatibility(profile1, profile2) {
    const compatibility = {
      score: 0,
      breakdown: {
        interests: 0,
        communicationStyle: 0,
        sharedTags: 0
      }
    };

    // Interest compatibility (40% of total score)
    const interestScore = this.calculateInterestCompatibility(profile1.interests, profile2.interests);
    compatibility.breakdown.interests = interestScore;
    compatibility.score += interestScore * 0.4;

    // Communication style compatibility (40% of total score)
    const styleScore = this.calculateStyleCompatibility(
      profile1.communicationStyle, 
      profile2.communicationStyle
    );
    compatibility.breakdown.communicationStyle = styleScore;
    compatibility.score += styleScore * 0.4;

    // Shared tags bonus (20% of total score)
    const tagScore = this.calculateTagCompatibility(
      profile1.compatibilityTags, 
      profile2.compatibilityTags
    );
    compatibility.breakdown.sharedTags = tagScore;
    compatibility.score += tagScore * 0.2;

    return compatibility;
  }

  /**
   * Calculate interest overlap
   */
  calculateInterestCompatibility(interests1, interests2) {
    if (!interests1?.length || !interests2?.length) return 0;

    const validInterests1 = interests1.filter(i => i.confidence >= this.minConfidence);
    const validInterests2 = interests2.filter(i => i.confidence >= this.minConfidence);

    let sharedInterests = 0;
    let totalWeight = 0;

    for (const interest1 of validInterests1) {
      const matchingInterest = validInterests2.find(i => 
        interest1.topic.toLowerCase().includes(i.topic.toLowerCase()) ||
        i.topic.toLowerCase().includes(interest1.topic.toLowerCase())
      );

      if (matchingInterest) {
        const weight = Math.min(interest1.confidence, matchingInterest.confidence);
        sharedInterests += weight;
        totalWeight += weight;
      }
    }

    // Normalize by average profile size
    const avgProfileSize = (validInterests1.length + validInterests2.length) / 2;
    return Math.min(sharedInterests / Math.max(avgProfileSize * 0.3, 1), 1);
  }

  /**
   * Calculate communication style compatibility
   */
  calculateStyleCompatibility(style1, style2) {
    if (!style1 || !style2) return 0;

    const styleKeys = ['casual', 'energetic', 'analytical', 'social', 'humor'];
    let totalDifference = 0;
    let validComparisons = 0;

    for (const key of styleKeys) {
      const val1 = style1[key] || 0;
      const val2 = style2[key] || 0;
      
      if (val1 > 0 || val2 > 0) {
        // Similar styles = higher compatibility
        const difference = Math.abs(val1 - val2);
        totalDifference += difference;
        validComparisons++;
      }
    }

    if (validComparisons === 0) return 0;
    
    // Convert difference to similarity (lower difference = higher similarity)
    const avgDifference = totalDifference / validComparisons;
    return Math.max(1 - avgDifference, 0);
  }

  /**
   * Calculate tag-based compatibility
   */
  calculateTagCompatibility(tags1, tags2) {
    if (!tags1?.length || !tags2?.length) return 0;

    const sharedTags = tags1.filter(tag => tags2.includes(tag));
    const totalUniqueTags = new Set([...tags1, ...tags2]).size;
    
    return sharedTags.length / Math.max(totalUniqueTags * 0.5, 1);
  }

  /**
   * Generate human-readable match reasons
   */
  generateMatchReasons(profile1, profile2) {
    const reasons = [];

    // Shared interests
    const sharedInterests = this.findSharedInterests(profile1.interests, profile2.interests);
    if (sharedInterests.length > 0) {
      reasons.push(`Both interested in: ${sharedInterests.slice(0, 3).join(', ')}`);
    }

    // Similar communication styles
    const styleMatches = this.findStyleMatches(profile1.communicationStyle, profile2.communicationStyle);
    if (styleMatches.length > 0) {
      reasons.push(`Similar communication: ${styleMatches.join(', ')}`);
    }

    // Shared tags
    const sharedTags = profile1.compatibilityTags?.filter(tag => 
      profile2.compatibilityTags?.includes(tag)
    ) || [];
    if (sharedTags.length > 0) {
      reasons.push(`Shared traits: ${sharedTags.slice(0, 2).join(', ')}`);
    }

    return reasons;
  }

  /**
   * Find shared interests between profiles
   */
  findSharedInterests(interests1, interests2) {
    const shared = [];
    
    for (const interest1 of interests1 || []) {
      if (interest1.confidence < this.minConfidence) continue;
      
      const match = interests2?.find(i => 
        i.confidence >= this.minConfidence &&
        (interest1.topic.toLowerCase().includes(i.topic.toLowerCase()) ||
         i.topic.toLowerCase().includes(interest1.topic.toLowerCase()))
      );
      
      if (match) {
        shared.push(interest1.topic);
      }
    }
    
    return shared;
  }

  /**
   * Find matching communication styles
   */
  findStyleMatches(style1, style2) {
    const matches = [];
    const threshold = 0.5;
    
    const styleLabels = {
      casual: 'casual chatting',
      energetic: 'high energy',
      analytical: 'deep thinking',
      social: 'socially engaged',
      humor: 'humor'
    };

    for (const [key, label] of Object.entries(styleLabels)) {
      const val1 = style1?.[key] || 0;
      const val2 = style2?.[key] || 0;
      
      if (val1 > threshold && val2 > threshold) {
        matches.push(label);
      }
    }

    return matches;
  }
}

export default new MatchingService();