/**
 * Social-Cognitive Fusion Service
 * Bridges UBPM cognitive profiles with social system
 */

import unifiedCognitiveEngine from './unifiedCognitiveEngine.js';
import Post from '../models/Post.js';
import logger from '../utils/logger.js';

class SocialCognitiveFusion {
  constructor() {
    this.archetypeMapping = {
      'systematic_analyzer': 'Analytical',
      'socratic_questioner': 'Curious', 
      'pragmatic_builder': 'Practical',
      'empathetic_connector': 'Supportive',
      'intellectual_challenger': 'Analytical',
      'creative_synthesizer': 'Creative',
      'reflective_philosopher': 'Curious',
      'adaptive_explorer': 'Curious'
    };

    this.communityMapping = {
      'Analytical': ['Analytical Minds', 'Mental Frameworks', 'Cognitive Collective'],
      'Creative': ['Creative Collective', 'Thought Experiments'],
      'Supportive': ['Supportive Circle', 'Equal Minds'],
      'Curious': ['Curious Thinkers', 'Peer Learning'],
      'Practical': ['Practical Minds', 'Collective Action']
    };
  }

  /**
   * Get social archetype from UBPM cognitive profile
   */
  async getSocialArchetype(userId) {
    try {
      const analysis = await unifiedCognitiveEngine.analyzeCognitiveProfile(userId);
      
      if (!analysis || analysis.confidence < 0.3) {
        return 'Curious'; // Safe default
      }

      const { cognitiveProfile } = analysis;
      
      // Map communication style to archetype
      if (cognitiveProfile.communication?.primary === 'technical_focused') return 'Analytical';
      if (cognitiveProfile.communication?.primary === 'emotionally_expressive') return 'Supportive';
      if (cognitiveProfile.communication?.primary === 'task_oriented') return 'Practical';
      
      // Map decision making to archetype
      if (cognitiveProfile.decisionMaking?.primary === 'analytical_processor') return 'Analytical';
      if (cognitiveProfile.decisionMaking?.primary === 'creative_explorer') return 'Creative';
      
      // Map personality traits
      if (cognitiveProfile.personalityTraits?.traits?.analytical > 0.6) return 'Analytical';
      if (cognitiveProfile.personalityTraits?.traits?.openness > 0.6) return 'Creative';
      if (cognitiveProfile.emotionalIntelligence?.overallEQ > 0.7) return 'Supportive';
      
      return 'Curious'; // Default
    } catch (error) {
      logger.error('Social archetype mapping error:', error);
      return 'Curious';
    }
  }

  /**
   * Suggest communities based on cognitive profile
   */
  async suggestCommunities(userId) {
    try {
      const archetype = await this.getSocialArchetype(userId);
      const suggestions = this.communityMapping[archetype] || ['Curious Thinkers'];
      
      // Add user's current community activity for context
      const userPosts = await Post.find({ authorId: userId })
        .distinct('community')
        .limit(3);
      
      return {
        primary: suggestions,
        active: userPosts,
        archetype
      };
    } catch (error) {
      logger.error('Community suggestion error:', error);
      return {
        primary: ['Curious Thinkers'],
        active: [],
        archetype: 'Curious'
      };
    }
  }

  /**
   * Get social context for chat enhancement
   */
  async getSocialContext(userId) {
    try {
      const [recentPosts, communities] = await Promise.all([
        Post.find({ authorId: userId })
          .sort({ createdAt: -1 })
          .limit(3)
          .select('community title badge createdAt'),
        this.suggestCommunities(userId)
      ]);

      return {
        recentActivity: recentPosts.map(post => ({
          community: post.community,
          title: post.title,
          badge: post.badge,
          daysAgo: Math.floor((Date.now() - post.createdAt) / (1000 * 60 * 60 * 24))
        })),
        archetype: communities.archetype,
        activeCommunities: communities.active,
        suggestedCommunities: communities.primary
      };
    } catch (error) {
      logger.error('Social context error:', error);
      return null;
    }
  }
}

export default new SocialCognitiveFusion();