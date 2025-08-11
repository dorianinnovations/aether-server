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
    const extracted = trimmed.substring(firstBrace, lastBrace + 1);
    return cleanInvalidJsonSyntax(extracted);
  }
  
  // Return cleaned original if no patterns match
  return cleanInvalidJsonSyntax(trimmed);
}

// Helper function to clean common invalid JSON patterns
function cleanInvalidJsonSyntax(json) {
  return json
    // Fix invalid numeric increments like "+0.1" -> "0.1" (CRITICAL FIX)
    .replace(/":\s*\+([0-9\.]+)/g, '": $1')
    // Fix communication style increments like '"analytical": +0.1' -> '"analytical": 0.1'
    .replace(/("(?:analytical|casual|energetic|humor|social)"\s*:\s*)\+([0-9\.]+)/g, '$1$2')
    // Fix invalid decrements like "-0.1" in wrong places
    .replace(/":\s*\-([0-9\.]+)(?=[^,}])/g, '": -$1')
    // Fix missing quotes around string values
    .replace(/":\s*([a-zA-Z_][a-zA-Z0-9_]*)(?=\s*[,}])/g, '": "$1"')
    // Fix trailing commas
    .replace(/,\s*([}\]])/g, '$1')
    // Fix any remaining + signs in numeric contexts
    .replace(/:\s*\+/g, ': ');
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
    // Temporarily disable profile analysis for artist platform
    log.debug(`Skipping profile analysis for user ${userId} - artist platform mode`);
    return { success: true, message: 'Profile analysis disabled for artist platform' };
    
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const user = await User.findById(userId);
        if (!user) return;

        // Initialize music personality if it doesn't exist
        if (!user.musicPersonality) {
          user.musicPersonality = {
            musicInterests: [],
            listeningPatterns: {
              preferredTimes: [],
              averageSessionLength: 0,
              totalSessions: 0
            },
            discoveryBehavior: {
              openToNew: 0.5, // 0-1 scale
              preferredSources: [], // 'spotify', 'recommendations', 'friends', etc.
              genreExploration: 0.5
            },
            totalMessages: 0,
            analysisVersion: '4.0'
          };
        }

        // Extract music-related interests only
        const detectedMusicInterests = this.extractMusicInterests(messageContent);
        this.updateMusicInterests(user.musicPersonality, detectedMusicInterests);

        // Analyze music discovery behavior from conversation
        const discoveryBehavior = this.analyzeMusicDiscoveryBehavior(messageContent);
        this.updateDiscoveryBehavior(user.musicPersonality, discoveryBehavior);

        // Update metadata
        user.musicPersonality.totalMessages += 1;
        user.musicPersonality.lastAnalyzed = new Date();

        await user.save();
        
        log.debug(`Music profile updated for user ${userId}:`, {
          musicInterests: user.musicPersonality.musicInterests.length,
          totalMessages: user.musicPersonality.totalMessages,
          openToNew: user.musicPersonality.discoveryBehavior?.openToNew || 0.5,
          preferredSources: user.musicPersonality.discoveryBehavior?.preferredSources || []
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
  extractMusicInterests(content) {
    const musicInterests = [];
    
    // Music-specific patterns
    const musicPatterns = [
      // Artists and bands
      { regex: /(?:i love|i like|listening to|favorite artist|really into|obsessed with) ([a-z\s\-']+)/gi, weight: 0.8, type: 'artist' },
      { regex: /(?:artist|band|musician|singer) (?:like|such as|including) ([a-z\s\-']+)/gi, weight: 0.7, type: 'artist' },
      
      // Genres
      { regex: /(?:i love|i like|into|favorite|really enjoy) ([a-z\s]+) music/gi, weight: 0.9, type: 'genre' },
      { regex: /(?:listen to|enjoy|prefer) ([a-z\s]+) (?:music|songs|tracks)/gi, weight: 0.8, type: 'genre' },
      
      // Albums and songs
      { regex: /(?:album|song|track) (?:called|named) ([a-z\s\-']+)/gi, weight: 0.6, type: 'content' },
      { regex: /(?:listening to|playing|heard) (?:the song|album) ([a-z\s\-']+)/gi, weight: 0.7, type: 'content' },
      
      // Instruments
      { regex: /(?:i play|playing|learning) (?:the )?([a-z]+)/gi, weight: 0.8, type: 'instrument' }
    ];
    
    for (const pattern of musicPatterns) {
      let match;
      while ((match = pattern.regex.exec(content)) !== null) {
        const interest = match[1].trim().toLowerCase();
        if (interest.length > 2 && interest.length < 50) {
          musicInterests.push({
            topic: interest,
            confidence: pattern.weight,
            type: pattern.type,
            source: 'pattern_match'
          });
        }
      }
    }

    return musicInterests;
  }

  /**
   * Analyze music discovery behavior from conversation
   */
  analyzeMusicDiscoveryBehavior(content) {
    const behavior = {
      openToNew: 0.5,
      preferredSources: [],
      genreExploration: 0.5
    };

    // Check for openness to new music
    const opennessPhrases = [
      /(?:love discovering|always looking for|open to new|try new|explore different)/i,
      /(?:hate when|don't like new|stick to what|only listen to)/i
    ];

    if (opennessPhrases[0].test(content)) {
      behavior.openToNew = Math.min(1.0, behavior.openToNew + 0.2);
    }
    if (opennessPhrases[1].test(content)) {
      behavior.openToNew = Math.max(0.0, behavior.openToNew - 0.2);
    }

    // Check for discovery sources
    if (/spotify.*discover|spotify.*recommend/i.test(content)) {
      behavior.preferredSources.push('spotify');
    }
    if (/friend.*recommend|friends.*told me|someone suggested/i.test(content)) {
      behavior.preferredSources.push('friends');
    }
    if (/youtube|tiktok|social media/i.test(content)) {
      behavior.preferredSources.push('social');
    }

    return behavior;
  }

  /**
   * Update music interests in user profile
   */
  updateMusicInterests(musicPersonality, newInterests) {
    if (!musicPersonality.musicInterests) {
      musicPersonality.musicInterests = [];
    }

    for (const newInterest of newInterests) {
      const existing = musicPersonality.musicInterests.find(
        i => i.topic === newInterest.topic && i.type === newInterest.type
      );

      if (existing) {
        // Boost confidence if mentioned again
        existing.confidence = Math.min(1.0, existing.confidence + 0.1);
        existing.mentions = (existing.mentions || 1) + 1;
        existing.lastMentioned = new Date();
      } else {
        musicPersonality.musicInterests.push({
          ...newInterest,
          mentions: 1,
          firstMentioned: new Date(),
          lastMentioned: new Date()
        });
      }
    }

    // Keep only top 50 interests to prevent bloat
    musicPersonality.musicInterests = musicPersonality.musicInterests
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 50);
  }

  /**
   * Update discovery behavior patterns
   */
  updateDiscoveryBehavior(musicPersonality, newBehavior) {
    if (!musicPersonality.discoveryBehavior) {
      musicPersonality.discoveryBehavior = {
        openToNew: 0.5,
        preferredSources: [],
        genreExploration: 0.5
      };
    }

    // Smooth update of openness score
    musicPersonality.discoveryBehavior.openToNew = 
      (musicPersonality.discoveryBehavior.openToNew * 0.8) + (newBehavior.openToNew * 0.2);

    // Add new sources without duplicates
    for (const source of newBehavior.preferredSources) {
      if (!musicPersonality.discoveryBehavior.preferredSources.includes(source)) {
        musicPersonality.discoveryBehavior.preferredSources.push(source);
      }
    }
  }

  /**
   * Extract music data from AI synthesis
   */
  extractMusicDataFromSynthesis(updates) {
    const musicData = {
      artists: [],
      genres: [],
      instruments: [],
      preferences: {}
    };

    // Extract music-related updates (simplified)
    if (updates.interests) {
      for (const interest of updates.interests) {
        if (this.isMusicRelated(interest.topic)) {
          const type = this.classifyMusicInterest(interest.topic);
          musicData[type + 's'] = musicData[type + 's'] || [];
          musicData[type + 's'].push(interest);
        }
      }
    }

    return musicData;
  }

  /**
   * Extract music data from basic entities
   */
  extractMusicDataFromEntities(entities) {
    const musicData = {
      artists: [],
      genres: [],
      instruments: [],
      preferences: {}
    };

    // Basic extraction from entities
    for (const entity of entities) {
      if (this.isMusicRelated(entity.text)) {
        const type = this.classifyMusicInterest(entity.text);
        musicData[type + 's'] = musicData[type + 's'] || [];
        musicData[type + 's'].push({
          topic: entity.text,
          confidence: 0.7,
          type: type
        });
      }
    }

    return musicData;
  }

  /**
   * Apply music updates to user personality
   */
  applyMusicUpdates(musicPersonality, musicData) {
    // Combine all music interests
    const allInterests = [
      ...(musicData.artists || []),
      ...(musicData.genres || []),
      ...(musicData.instruments || [])
    ];

    this.updateMusicInterests(musicPersonality, allInterests);
  }

  /**
   * Check if a topic is music-related
   */
  isMusicRelated(topic) {
    const musicKeywords = [
      'music', 'song', 'artist', 'band', 'album', 'concert', 'guitar', 'piano', 
      'drums', 'violin', 'rock', 'pop', 'jazz', 'classical', 'hip hop', 'electronic',
      'country', 'folk', 'blues', 'reggae', 'metal', 'punk', 'indie', 'alternative'
    ];
    
    const lowerTopic = topic.toLowerCase();
    return musicKeywords.some(keyword => lowerTopic.includes(keyword));
  }

  /**
   * Classify music interest type
   */
  classifyMusicInterest(topic) {
    const lowerTopic = topic.toLowerCase();
    
    if (/guitar|piano|drums|violin|bass|saxophone|trumpet|flute/.test(lowerTopic)) {
      return 'instrument';
    }
    
    if (/rock|pop|jazz|classical|hip hop|electronic|country|folk|blues|reggae|metal/.test(lowerTopic)) {
      return 'genre';
    }
    
    return 'artist'; // default assumption
  }

  /**
   * Legacy method - now removed for music focus
   */
  analyzeCommunicationStyle(content) {
    // Simplified for music platform - only return empty scores
    return {
      casual: 0,
      energetic: 0,
      analytical: 0,
      social: 0,
      humor: 0
    };
  }

  // Duplicate method removed - using updateMusicInterests instead

  /**
   * Communication style removed - not needed for music platform
   */
  updateCommunicationStyle(profile, newScores) {
    // Legacy method kept for compatibility but does nothing
    return;
  }

  /**
   * Generate music compatibility tags for matching
   */
  generateCompatibilityTags(musicProfile) {
    const tags = [];
    
    // Top music interests as tags
    const topInterests = (musicProfile.musicInterests || [])
      .filter(i => i.confidence > 0.5)
      .slice(0, 5)
      .map(i => i.topic);
    tags.push(...topInterests);

    // Music discovery behavior tags
    const discovery = musicProfile.discoveryBehavior;
    if (discovery?.openToNew > 0.7) tags.push('music_explorer');
    if (discovery?.genreExploration > 0.7) tags.push('genre_diverse');
    if (discovery?.preferredSources?.includes('spotify')) tags.push('spotify_user');
    if (discovery?.preferredSources?.includes('friends')) tags.push('social_discovery');

    // Remove duplicates and return
    return [...new Set(tags)];
  }

  /**
   * Enhanced AI-powered message analysis with two-step accuracy funnel
   * Step 1: Raw entity extraction 
   * Step 2: Contextual synthesis and validation
   */
  async analyzeMessageEnhanced(userId, messageContent, context = {}) {
    // Temporarily disable profile analysis for artist platform
    log.debug(`Skipping enhanced profile analysis for user ${userId} - artist platform mode`);
    return { success: true, message: 'Enhanced profile analysis disabled for artist platform' };
    
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const user = await User.findById(userId);
        if (!user) {
          log.warn(`User not found for analysis: ${userId}`);
          return null;
        }

        // Initialize music personality if it doesn't exist (enhanced method)
        if (!user.musicPersonality) {
          user.musicPersonality = {
            musicInterests: [],
            listeningPatterns: {
              preferredTimes: [],
              averageSessionLength: 0,
              totalSessions: 0
            },
            discoveryBehavior: {
              openToNew: 0.5,
              preferredSources: [],
              genreExploration: 0.5
            },
            totalMessages: 0,
            analysisVersion: '4.0'
          };
        }

        log.debug(`🔍 Enhanced analysis starting for user ${userId}`, {
          messageLength: messageContent.length,
          currentMusicInterests: user.musicPersonality?.musicInterests?.length || 0
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
          user.musicPersonality || {},
          extractedData.entities,
          messageContent,
          context
        );

        // Apply updates to music personality (simplified for music focus)
        if (synthesizedUpdates && synthesizedUpdates.success) {
          // Extract music-related data from synthesized updates
          const musicData = this.extractMusicDataFromSynthesis(synthesizedUpdates.updates);
          this.applyMusicUpdates(user.musicPersonality, musicData);
        } else if (extractedData && extractedData.entities) {
          // Fallback to basic music extraction
          const musicData = this.extractMusicDataFromEntities(extractedData.entities);
          this.applyMusicUpdates(user.musicPersonality, musicData);
        }

        // Update metadata
        user.musicPersonality.totalMessages += 1;
        user.musicPersonality.lastAnalyzed = new Date();

        await user.save();
        
        const updatesApplied = {
          musicInterests: user.musicPersonality.musicInterests.length,
          totalMessages: user.musicPersonality.totalMessages,
          openToNew: user.musicPersonality.discoveryBehavior?.openToNew || 0.5
        };

        log.info(`Enhanced analysis completed for user ${userId}:`, updatesApplied);

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
          log.info(`Falling back to basic analysis for user ${userId}`);
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
      // Check for empty input
      if (!messageContent || messageContent.trim().length === 0) {
        log.debug('Skipping entity extraction - empty message');
        return {
          success: false,
          error: 'Empty message content'
        };
      }

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

      let response;
      try {
        response = await llmService.generateCompletion({
          prompt,
          model: 'openai/gpt-4o-mini',
          maxTokens: 500,
          temperature: 0.1
        });

        if (!response.success) {
          throw new Error(`LLM service failed: ${response.error}`);
        }
      } catch (llmError) {
        log.error('LLM call failed in entity extraction:', llmError);
        return {
          success: false,
          error: `LLM extraction failed: ${llmError.message}`
        };
      }

      let entities;
      try {
        entities = JSON.parse(response.completion.trim());
      } catch (parseError) {
        log.error('Failed to parse extracted entities JSON:', {
          error: parseError.message,
          rawResponse: response.completion
        });
        return {
          success: false,
          error: `JSON parse failed: ${parseError.message}`
        };
      }
      
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
      // Check for empty input
      if (!originalMessage || originalMessage.trim().length === 0) {
        log.debug('Skipping synthesis - empty message');
        return { success: false, reason: 'empty_input' };
      }

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

      let response;
      try {
        response = await llmService.generateCompletion({
          prompt,
          model: 'openai/gpt-4o',
          maxTokens: 800,
          temperature: 0.2
        });

        if (!response.success) {
          throw new Error(`LLM service failed: ${response.error}`);
        }
      } catch (llmError) {
        log.error('LLM call failed in synthesis:', {
          error: llmError.message,
          stack: llmError.stack?.substring(0, 200),
          userId,
          model: 'openai/gpt-4o',
          promptLength: prompt?.length || 0
        });
        return {
          success: false,
          error: `LLM synthesis failed: ${llmError.message}`
        };
      }

      let cleanJson = extractJsonFromMarkdown(response.completion);
      // Additional cleaning for common LLM JSON issues
      cleanJson = cleanInvalidJsonSyntax(cleanJson);
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
        
        // Try aggressive fallback parsing
        try {
          const fallbackJson = this.aggressiveJsonFallback(response.completion);
          synthesized = JSON.parse(fallbackJson);
          log.info('Successfully recovered from JSON parse error with aggressive fallback');
        } catch (fallbackError) {
          log.warn('Aggressive fallback also failed, using empty synthesis result');
          return {
            success: true,
            updates: {
              interests: [],
              communicationStyle: {},
              status_updates: []
            },
            reasoning: 'JSON parse failed, using empty fallback',
            significant: false
          };
        }
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
   * Aggressive fallback JSON parsing for malformed LLM responses
   */
  aggressiveJsonFallback(text) {
    // Try to build valid JSON from text patterns
    const interests = [];
    const communicationStyle = {};
    const statusUpdates = [];

    // Extract interests using pattern matching
    const interestPatterns = [
      /"interests":\s*\[([^\]]+)\]/gi,
      /interests?[^\[]*\[([^\]]+)\]/gi,
      /"[^"]*":\s*"[^"]*"/g
    ];
    
    for (const pattern of interestPatterns) {
      const match = text.match(pattern);
      if (match) {
        try {
          const cleanMatch = match[0].replace(/'/g, '"');
          const parsed = JSON.parse(`{${cleanMatch}}`);
          if (parsed.interests) {
            interests.push(...parsed.interests);
            break;
          }
        } catch (e) {
          // Continue to next pattern
        }
      }
    }

    // Extract communication style patterns
    const stylePattern = /"(analytical|casual|energetic|humor|social)":\s*([0-9.-]+)/gi;
    let styleMatch;
    while ((styleMatch = stylePattern.exec(text)) !== null) {
      const [, key, value] = styleMatch;
      communicationStyle[key] = parseFloat(value) || 0;
    }

    // Build fallback JSON
    return JSON.stringify({
      interests: interests.slice(0, 3),
      communicationStyle,
      status_updates: statusUpdates
    });
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