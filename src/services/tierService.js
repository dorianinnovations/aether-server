import User from '../models/User.js';

class TierService {
  constructor() {
    // Monthly GPT-5 limits by tier
    this.limits = {
      Standard: 10,     // 10 GPT-5 calls per month
      Legendary: 50,    // 5x more (50 calls per month)
      VIP: -1           // Unlimited (represented as -1)
    };

    // Bi-weekly response limits by tier (14 days)
    this.responseLimits = {
      Standard: 150,    // 150 responses every 2 weeks
      Legend: 3000,     // 20x more (150 * 20)
      VIP: -1           // Unlimited (represented as -1)
    };
  }

  /**
   * Get user's response usage info for current bi-weekly period
   * @param {string} userId - User ID
   * @returns {Object} Response usage info
   */
  async getResponseUsageInfo(userId) {
    try {
      const user = await User.findById(userId).select('tier responseUsage');
      if (!user) {
        throw new Error('User not found');
      }

      const now = new Date();
      const currentPeriodStart = this.getCurrentPeriodStart(now);
      
      // Reset period count if new 2-week period
      if (user.responseUsage.currentPeriod !== currentPeriodStart) {
        user.responseUsage.currentPeriod = currentPeriodStart;
        user.responseUsage.periodCount = 0;
        user.responseUsage.lastReset = new Date();
        await user.save();
      }

      const limit = this.responseLimits[user.tier];
      const isUnlimited = limit === -1;
      const remaining = isUnlimited ? -1 : Math.max(0, limit - user.responseUsage.periodCount);

      return {
        tier: user.tier,
        limit,
        used: user.responseUsage.periodCount,
        remaining,
        isUnlimited,
        canRespond: isUnlimited || remaining > 0,
        totalResponses: user.responseUsage.totalResponses,
        periodStart: currentPeriodStart,
        periodEnd: this.getPeriodEnd(currentPeriodStart)
      };
    } catch (error) {
      console.error('Error getting response usage info:', error);
      return {
        tier: 'Standard',
        limit: this.responseLimits.Standard,
        used: this.responseLimits.Standard,
        remaining: 0,
        isUnlimited: false,
        canRespond: false,
        totalResponses: 0
      };
    }
  }

  /**
   * Get current bi-weekly period start date (YYYY-MM-DD)
   * @param {Date} date - Current date
   * @returns {string} Period start date
   */
  getCurrentPeriodStart(date = new Date()) {
    const epochStart = new Date('2024-01-01'); // Fixed epoch start
    const daysSinceEpoch = Math.floor((date - epochStart) / (1000 * 60 * 60 * 24));
    const periodsSinceEpoch = Math.floor(daysSinceEpoch / 14);
    const periodStartDays = periodsSinceEpoch * 14;
    const periodStart = new Date(epochStart.getTime() + periodStartDays * 24 * 60 * 60 * 1000);
    return periodStart.toISOString().slice(0, 10);
  }

  /**
   * Get period end date
   * @param {string} periodStart - Period start date (YYYY-MM-DD)
   * @returns {string} Period end date
   */
  getPeriodEnd(periodStart) {
    const start = new Date(periodStart);
    const end = new Date(start.getTime() + 13 * 24 * 60 * 60 * 1000); // 13 days later
    return end.toISOString().slice(0, 10);
  }

  /**
   * Track a response usage and increment counter
   * @param {string} userId - User ID
   * @returns {Object} Usage result
   */
  async trackResponse(userId) {
    try {
      const usageInfo = await this.getResponseUsageInfo(userId);
      
      if (!usageInfo.canRespond) {
        return {
          success: false,
          reason: 'period_limit_reached',
          message: `Response limit reached for this 2-week period. Upgrade to Legend (3000/period) or VIP (unlimited) for more conversations.`,
          usageInfo
        };
      }

      // Increment usage counter
      const user = await User.findById(userId);
      user.responseUsage.periodCount += 1;
      user.responseUsage.totalResponses += 1;
      await user.save();

      const updatedUsageInfo = await this.getResponseUsageInfo(userId);

      return {
        success: true,
        message: 'Response tracked successfully',
        usageInfo: updatedUsageInfo
      };
    } catch (error) {
      console.error('Error tracking response usage:', error);
      return {
        success: false,
        reason: 'error',
        message: 'Error tracking response usage',
        usageInfo: null
      };
    }
  }

  /**
   * Get user's tier and current GPT-5 usage
   * @param {string} userId - User ID
   * @returns {Object} User tier info and usage
   */
  async getUserTierInfo(userId) {
    try {
      const user = await User.findById(userId).select('tier gpt5Usage');
      if (!user) {
        throw new Error('User not found');
      }

      const currentMonth = new Date().toISOString().slice(0, 7);
      
      // Reset monthly count if new month
      if (user.gpt5Usage.currentMonth !== currentMonth) {
        user.gpt5Usage.currentMonth = currentMonth;
        user.gpt5Usage.monthlyCount = 0;
        user.gpt5Usage.lastReset = new Date();
        
        // Clean up invalid badges before saving
        if (user.badges && Array.isArray(user.badges)) {
          user.badges = user.badges.filter(badge => 
            badge && typeof badge === 'object' && badge.id && badge.badgeType
          );
        }
        
        await user.save();
      }

      const limit = this.limits[user.tier];
      const isUnlimited = limit === -1;
      const remaining = isUnlimited ? -1 : Math.max(0, limit - user.gpt5Usage.monthlyCount);

      return {
        tier: user.tier,
        limit,
        used: user.gpt5Usage.monthlyCount,
        remaining,
        isUnlimited,
        canUseGpt5: isUnlimited || remaining > 0,
        totalUsage: user.gpt5Usage.totalUsage
      };
    } catch (error) {
      console.error('Error getting user tier info:', error);
      // Default to Standard tier with no GPT-5 access on error
      return {
        tier: 'Standard',
        limit: this.limits.Standard,
        used: this.limits.Standard, // Assume limit reached on error
        remaining: 0,
        isUnlimited: false,
        canUseGpt5: false,
        totalUsage: 0
      };
    }
  }

  /**
   * Check if user can use GPT-5 and increment counter if they can
   * @param {string} userId - User ID
   * @returns {Object} Usage result
   */
  async useGpt5(userId) {
    try {
      const tierInfo = await this.getUserTierInfo(userId);
      
      if (!tierInfo.canUseGpt5) {
        return {
          success: false,
          reason: 'monthly_limit_reached',
          message: `GPT-5 monthly limit reached. Upgrade to Legendary (50/month) or VIP (unlimited) for more advanced AI.`,
          tierInfo
        };
      }

      // Increment usage counter
      const user = await User.findById(userId);
      user.gpt5Usage.monthlyCount += 1;
      user.gpt5Usage.totalUsage += 1;
      
      // Clean up invalid badges before saving
      if (user.badges && Array.isArray(user.badges)) {
        user.badges = user.badges.filter(badge => 
          badge && typeof badge === 'object' && badge.id && badge.badgeType
        );
      }
      
      await user.save();

      const updatedTierInfo = await this.getUserTierInfo(userId);

      return {
        success: true,
        message: 'GPT-5 usage allowed',
        tierInfo: updatedTierInfo
      };
    } catch (error) {
      console.error('Error tracking GPT-5 usage:', error);
      return {
        success: false,
        reason: 'error',
        message: 'Error checking GPT-5 usage limits',
        tierInfo: null
      };
    }
  }

  /**
   * Determine the best AI model for a user and query
   * @param {string} userId - User ID
   * @param {string} queryType - Type of query (informational, creative_superproxy, etc.)
   * @param {boolean} forceGpt4o - Force GPT-4o even for scenarios that would use GPT-5
   * @returns {Object} Model selection result
   */
  async selectModel(userId, queryType = 'conversational', forceGpt4o = false) {
    try {
      if (forceGpt4o) {
        return {
          model: 'openai/gpt-4o',
          reason: 'forced_gpt4o',
          tierInfo: await this.getUserTierInfo(userId)
        };
      }

      const tierInfo = await this.getUserTierInfo(userId);

      // Scenarios where GPT-5 provides meaningful value
      const gpt5Scenarios = [
        'creative_superproxy',     // Creative/poetic responses
        'first_message_welcome',   // Important first impression
        'profile_analysis',        // Deep personality analysis
        'complex_reasoning'        // Complex problem solving
      ];

      const shouldUseGpt5 = gpt5Scenarios.includes(queryType) && tierInfo.canUseGpt5;

      if (shouldUseGpt5) {
        // Attempt to use GPT-5
        const usageResult = await this.useGpt5(userId);
        
        if (usageResult.success) {
          return {
            model: 'openai/gpt-5',
            reason: `gpt5_${queryType}`,
            message: `Using GPT-5 for enhanced ${queryType.replace('_', ' ')} experience`,
            tierInfo: usageResult.tierInfo
          };
        } else {
          // Fall back to GPT-4o if limit reached
          return {
            model: 'openai/gpt-4o',
            reason: 'gpt5_limit_reached',
            message: usageResult.message,
            tierInfo: usageResult.tierInfo
          };
        }
      }

      // Default to GPT-4o for speed
      return {
        model: 'openai/gpt-4o',
        reason: 'default_fast',
        message: 'Using GPT-4o for fast response',
        tierInfo
      };
    } catch (error) {
      console.error('Error selecting model:', error);
      return {
        model: 'openai/gpt-4o',
        reason: 'error_fallback',
        message: 'Error selecting model, using GPT-4o fallback',
        tierInfo: null
      };
    }
  }

  /**
   * Get tier upgrade information
   * @param {string} currentTier - Current user tier
   * @returns {Object} Upgrade info
   */
  getTierUpgradeInfo(currentTier = 'Standard') {
    const tiers = {
      Standard: {
        name: 'Standard',
        gpt5Limit: this.limits.Standard,
        features: [
          '10 GPT-5 calls/month',
          'Unlimited GPT-4o (fast AI)',
          'Basic social proxy features',
          'Spotify integration'
        ],
        upgradePrompt: 'Upgrade to Legendary for 5x more GPT-5 calls!'
      },
      Legendary: {
        name: 'Legendary',
        gpt5Limit: this.limits.Legendary,
        features: [
          '50 GPT-5 calls/month (5x more)',
          'Unlimited GPT-4o',
          'Priority GPT-5 for creative responses',
          'Enhanced personality analysis',
          'Advanced social features'
        ],
        upgradePrompt: 'Upgrade to VIP for unlimited GPT-5!'
      },
      VIP: {
        name: 'VIP',
        gpt5Limit: 'Unlimited',
        features: [
          'Unlimited GPT-5 calls',
          'Unlimited GPT-4o',
          'Best AI for all interactions',
          'Priority processing',
          'Early access to new features',
          'Premium social proxy capabilities'
        ],
        upgradePrompt: 'You have the ultimate Aether experience!'
      }
    };

    return tiers[currentTier] || tiers.Standard;
  }

  /**
   * Upgrade user tier (admin function)
   * @param {string} userId - User ID
   * @param {string} newTier - New tier (free, pro, elite)
   * @returns {Object} Upgrade result
   */
  async upgradeTier(userId, newTier) {
    try {
      if (!['Standard', 'Legendary', 'VIP'].includes(newTier)) {
        throw new Error('Invalid tier');
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const oldTier = user.tier;
      user.tier = newTier;
      
      // Clean up invalid badges before saving
      if (user.badges && Array.isArray(user.badges)) {
        user.badges = user.badges.filter(badge => 
          badge && typeof badge === 'object' && badge.id && badge.badgeType
        );
      }
      
      await user.save();

      return {
        success: true,
        message: `User upgraded from ${oldTier} to ${newTier}`,
        oldTier,
        newTier,
        newLimits: this.limits[newTier]
      };
    } catch (error) {
      console.error('Error upgrading user tier:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }
}

export default new TierService();