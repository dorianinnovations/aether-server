/**
 * Profile Analyzer Service
 * Analyzes chat messages to build user profiles with AI-powered two-step accuracy funnel
 */

import User from '../models/User.js';
import { log } from '../utils/logger.js';
import llmService from './llmService.js';

// Helper function to extract JSON from markdown code blocks
function extractJsonFromMarkdown(text) {
  const trimmed = text.trim();
  
  // Check if it's already valid JSON
  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch (e) {
    // Not valid JSON, try to extract from markdown
  }
  
  // More robust markdown parsing - handle various formats
  // Look for ```json blocks (with optional whitespace and newlines)
  let jsonBlockMatch = trimmed.match(/```json\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    return jsonBlockMatch[1].trim();
  }
  
  // Look for ``` blocks (without language)
  jsonBlockMatch = trimmed.match(/```\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    const content = jsonBlockMatch[1].trim();
    // Only return if it looks like JSON (starts with { or [)
    if (content.startsWith('{') || content.startsWith('[')) {
      return content;
    }
  }
  
  // Look for JSON-like content between single backticks
  const inlineMatch = trimmed.match(/`([^`]*{[\s\S]*}[^`]*)`/);
  if (inlineMatch) {
    return inlineMatch[1].trim();
  }
  
  // If all else fails, look for the first { to last } in the text
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.substring(firstBrace, lastBrace + 1);
  }
  
  // Return original if no patterns match
  return trimmed;
}

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
            analysisVersion: '3.0'
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
   * Enhanced AI-powered message analysis with two-step accuracy funnel
   * Step 1: Raw entity extraction 
   * Step 2: Contextual synthesis and validation
   */
  async analyzeMessageEnhanced(userId, messageContent, context = {}) {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const user = await User.findById(userId);
        if (!user) {
          log.warn(`User not found for analysis: ${userId}`);
          return null;
        }

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
            analysisVersion: '3.0'
          };
        }

        log.debug(`🔍 Enhanced analysis starting for user ${userId}`, {
          messageLength: messageContent.length,
          currentInterests: user.socialProxy.personality.interests.length
        });

        // STEP 1: Raw Entity Extraction
        const extractedData = await this.extractEntitiesWithAI(messageContent);
        
        if (!extractedData || !extractedData.success) {
          log.warn(`Entity extraction failed for user ${userId}`);
          // Fallback to pattern-based analysis
          return await this.analyzeMessage(userId, messageContent);
        }

        // STEP 2: Contextual Synthesis & Validation
        const synthesizedUpdates = await this.synthesizeAndValidate(
          user.socialProxy.personality,
          extractedData.entities,
          messageContent,
          context
        );

        if (!synthesizedUpdates || !synthesizedUpdates.success) {
          log.warn(`Synthesis failed for user ${userId}, using extracted data`);
          // Apply extracted data directly
          this.applyExtractedData(user.socialProxy.personality, extractedData.entities);
        } else {
          // Apply synthesized updates
          this.applyValidatedUpdates(user.socialProxy.personality, synthesizedUpdates.updates);
        }

        // Update metadata
        user.socialProxy.personality.totalMessages += 1;
        user.socialProxy.personality.lastAnalyzed = new Date();

        await user.save();
        
        const updatesApplied = {
          interests: user.socialProxy.personality.interests.length,
          totalMessages: user.socialProxy.personality.totalMessages,
          communicationStyle: user.socialProxy.personality.communicationStyle
        };

        log.system(`Enhanced analysis completed for user ${userId}:`, updatesApplied);

        return {
          success: true,
          userId,
          updates: updatesApplied,
          analysisType: 'enhanced'
        };

      } catch (error) {
        attempt++;
        
        if (error.name === 'VersionError' && attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 100;
          log.warn(`Version conflict on attempt ${attempt}, retrying in ${delay}ms for user ${userId}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        log.error('Enhanced profile analysis failed:', {
          userId,
          attempt,
          error: error.message,
          stack: error.stack
        });
        
        // Fallback to basic analysis on final failure
        if (attempt >= maxRetries) {
          log.system(`Falling back to basic analysis for user ${userId}`);
          return await this.analyzeMessage(userId, messageContent);
        }
      }
    }
  }

  /**
   * STEP 1: Extract structured entities using AI
   */
  async extractEntitiesWithAI(messageContent) {
    try {
      const prompt = `Analyze the following message and extract structured data about the person's interests, activities, mood, and communication style. 

IMPORTANT: Output ONLY a valid JSON object with this exact structure:
{
  "interests": [
    {
      "topic": "specific interest/hobby/activity",
      "confidence": 0.0-1.0,
      "type": "hobby|work|entertainment|learning|social|health|travel|technology|creative",
      "evidence": "brief quote from message"
    }
  ],
  "activities": [
    {
      "activity": "what they're doing/planning",
      "timeframe": "current|soon|future|past",
      "type": "work|hobby|social|learning|health|entertainment",
      "confidence": 0.0-1.0
    }
  ],
  "mood": {
    "primary": "excited|happy|neutral|focused|stressed|tired|curious|motivated",
    "energy": 0.0-1.0,
    "social": 0.0-1.0,
    "confidence": 0.0-1.0
  },
  "communication_style": {
    "casual": 0.0-1.0,
    "energetic": 0.0-1.0,
    "analytical": 0.0-1.0,
    "social": 0.0-1.0,
    "humor": 0.0-1.0
  },
  "significant": true/false
}

Only extract what is genuinely present. Set "significant" to true only if this message reveals meaningful information about the person.

Message: "${messageContent}"`;

      const response = await llmService.generateCompletion({
        prompt,
        model: 'openai/gpt-4o-mini',
        maxTokens: 500,
        temperature: 0.1
      });

      if (!response.success) {
        throw new Error(`LLM service failed: ${response.error}`);
      }

      const entities = JSON.parse(response.completion.trim());
      
      log.debug('🔍 Entities extracted:', {
        interests: entities.interests?.length || 0,
        activities: entities.activities?.length || 0,
        significant: entities.significant
      });

      return {
        success: true,
        entities,
        rawCompletion: response.completion
      };

    } catch (error) {
      log.error('Entity extraction failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * STEP 2: Synthesize and validate updates against existing profile
   */
  async synthesizeAndValidate(currentProfile, extractedEntities, originalMessage, context = {}) {
    try {
      // Skip if extracted data isn't significant
      if (!extractedEntities.significant) {
        log.debug('Skipping synthesis - extracted data not significant');
        return { success: false, reason: 'not_significant' };
      }

      const profileSummary = {
        totalMessages: currentProfile.totalMessages,
        currentInterests: currentProfile.interests.slice(0, 10).map(i => ({
          topic: i.topic,
          confidence: i.confidence
        })),
        communicationStyle: currentProfile.communicationStyle
      };

      const prompt = `You are analyzing a user's chat message to update their social profile intelligently.

CURRENT PROFILE:
${JSON.stringify(profileSummary, null, 2)}

EXTRACTED ENTITIES:
${JSON.stringify(extractedEntities, null, 2)}

ORIGINAL MESSAGE: "${originalMessage}"

Your task: Determine what updates to make to the user's profile. Consider:
1. Is this a new core interest or just a passing mention?
2. Should this activity be added to their current status/plans?
3. How should communication style scores be adjusted?
4. What's the appropriate confidence level for each update?

Output ONLY a valid JSON object:
{
  "updates": {
    "interests": [
      {
        "action": "add|update|boost",
        "topic": "interest name",
        "confidence": 0.0-1.0,
        "reasoning": "why this update makes sense"
      }
    ],
    "status_updates": [
      {
        "type": "currentStatus|currentPlans|mood",
        "content": "what to update",
        "confidence": 0.0-1.0
      }
    ],
    "communication_adjustments": {
      "casual": -0.1 to +0.1,
      "energetic": -0.1 to +0.1,
      "analytical": -0.1 to +0.1,
      "social": -0.1 to +0.1,
      "humor": -0.1 to +0.1
    }
  },
  "significant": true/false,
  "reasoning": "overall reasoning for these updates"
}`;

      const response = await llmService.generateCompletion({
        prompt,
        model: 'openai/gpt-4o',
        maxTokens: 800,
        temperature: 0.2
      });

      if (!response.success) {
        throw new Error(`LLM service failed: ${response.error}`);
      }

      const cleanJson = extractJsonFromMarkdown(response.completion);
      let synthesized;
      
      try {
        synthesized = JSON.parse(cleanJson);
      } catch (parseError) {
        log.error('JSON Parse Error in ProfileAnalyzer:', {
          originalLength: response.completion.length,
          cleanedLength: cleanJson.length,
          originalPreview: response.completion.substring(0, 200),
          cleanedPreview: cleanJson.substring(0, 200),
          parseError: parseError.message
        });
        throw new Error(`Failed to parse synthesized profile data: ${parseError.message}`);
      }
      
      log.debug('🧠 Synthesis completed:', {
        significant: synthesized.significant,
        interestUpdates: synthesized.updates.interests?.length || 0,
        statusUpdates: synthesized.updates.status_updates?.length || 0
      });

      return {
        success: true,
        updates: synthesized.updates,
        reasoning: synthesized.reasoning,
        significant: synthesized.significant
      };

    } catch (error) {
      log.error('Synthesis and validation failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Apply extracted data directly (fallback method)
   */
  applyExtractedData(profile, entities) {
    const now = new Date();

    // Apply interests
    if (entities.interests) {
      for (const interest of entities.interests) {
        if (interest.confidence > 0.3) { // Only apply confident interests
          const existing = profile.interests.find(i => i.topic === interest.topic);
          
          if (existing) {
            existing.confidence = Math.min(existing.confidence + interest.confidence * 0.3, 1);
            existing.lastMentioned = now;
          } else {
            profile.interests.push({
              topic: interest.topic,
              confidence: interest.confidence,
              lastMentioned: now
            });
          }
        }
      }
    }

    // Apply communication style
    if (entities.communication_style) {
      const smoothingFactor = 0.2;
      for (const [style, newScore] of Object.entries(entities.communication_style)) {
        if (profile.communicationStyle[style] !== undefined) {
          const currentScore = profile.communicationStyle[style] || 0;
          profile.communicationStyle[style] = 
            currentScore * (1 - smoothingFactor) + newScore * smoothingFactor;
        }
      }
    }

    this.cleanupProfile(profile);
  }

  /**
   * Apply validated updates from synthesis step
   */
  applyValidatedUpdates(profile, updates) {
    const now = new Date();
    let significantChanges = false;

    // Apply interest updates
    if (updates.interests) {
      for (const update of updates.interests) {
        if (update.confidence > 0.2) {
          const existing = profile.interests.find(i => i.topic === update.topic);
          
          if (update.action === 'add' && !existing) {
            profile.interests.push({
              topic: update.topic,
              confidence: update.confidence,
              lastMentioned: now,
              category: update.category || 'hobby'
            });
            significantChanges = true;
          } else if (existing) {
            if (update.action === 'boost') {
              existing.confidence = Math.min(existing.confidence + update.confidence * 0.4, 1);
            } else {
              existing.confidence = update.confidence;
            }
            existing.lastMentioned = now;
            if (update.category && existing.category !== update.category) {
              existing.category = update.category;
            }
          }
        }
      }
    }

    // Apply activity updates
    if (updates.activities) {
      // Ensure recentActivities array exists
      if (!profile.recentActivities) {
        profile.recentActivities = [];
      }

      for (const activity of updates.activities) {
        if (activity.confidence > 0.3) {
          profile.recentActivities.push({
            activity: activity.activity,
            type: activity.type || 'hobby',
            confidence: activity.confidence,
            timeframe: activity.timeframe || 'current',
            detectedAt: now
          });
          significantChanges = true;
        }
      }

      // Keep only recent activities (last 50, max 30 days old)
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      profile.recentActivities = profile.recentActivities
        .filter(a => a.detectedAt > thirtyDaysAgo)
        .sort((a, b) => b.detectedAt - a.detectedAt)
        .slice(0, 50);
    }

    // Apply mood updates
    if (updates.mood) {
      // Ensure moodHistory array exists
      if (!profile.moodHistory) {
        profile.moodHistory = [];
      }

      if (updates.mood.confidence > 0.4) {
        profile.moodHistory.push({
          mood: updates.mood.primary,
          energy: updates.mood.energy,
          confidence: updates.mood.confidence,
          detectedAt: now
        });

        // Keep only recent mood entries (last 20, max 7 days old)
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        profile.moodHistory = profile.moodHistory
          .filter(m => m.detectedAt > sevenDaysAgo)
          .sort((a, b) => b.detectedAt - a.detectedAt)
          .slice(0, 20);
      }
    }

    // Apply communication adjustments
    if (updates.communication_adjustments) {
      for (const [style, adjustment] of Object.entries(updates.communication_adjustments)) {
        if (profile.communicationStyle[style] !== undefined && Math.abs(adjustment) > 0.01) {
          profile.communicationStyle[style] = Math.max(0, Math.min(1, 
            profile.communicationStyle[style] + adjustment
          ));
        }
      }
    }

    // Update profile completeness and metadata
    if (significantChanges) {
      profile.lastSignificantUpdate = now;
    }
    
    profile.profileCompleteness = this.calculateProfileCompleteness(profile);

    this.cleanupProfile(profile);
  }

  /**
   * Calculate profile completeness score
   */
  calculateProfileCompleteness(profile) {
    let score = 0;
    
    // Interests (40% of score)
    const interestScore = Math.min(profile.interests.length / 10, 1) * 0.4;
    score += interestScore;

    // Communication style (20% of score)
    const styleEntries = Object.values(profile.communicationStyle || {}).filter(v => v > 0);
    const styleScore = Math.min(styleEntries.length / 5, 1) * 0.2;
    score += styleScore;

    // Recent activities (20% of score)
    const activityScore = Math.min((profile.recentActivities?.length || 0) / 5, 1) * 0.2;
    score += activityScore;

    // Message count (10% of score)
    const messageScore = Math.min((profile.totalMessages || 0) / 50, 1) * 0.1;
    score += messageScore;

    // Mood history (10% of score)
    const moodScore = Math.min((profile.moodHistory?.length || 0) / 3, 1) * 0.1;
    score += moodScore;

    return Math.round(score * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Clean up profile data
   */
  cleanupProfile(profile) {
    // Remove low-confidence interests
    profile.interests = profile.interests.filter(i => i.confidence >= 0.15);
    
    // Sort and limit interests
    profile.interests.sort((a, b) => b.confidence - a.confidence);
    profile.interests = profile.interests.slice(0, 25);
  }

  /**
   * Batch analyze multiple messages
   */
  async analyzeBatch(messages) {
    const promises = messages.map(msg => 
      this.analyzeMessage(msg.userId, msg.content)
    );
    
    await Promise.allSettled(promises);
    log.system(`Batch analyzed ${messages.length} messages`);
  }
}

export default new ProfileAnalyzer();