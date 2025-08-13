import express from 'express';
import { protect } from '../middleware/auth.js';
import stripeService from '../services/stripeService.js';
import tierService from '../services/tierService.js';
import { log } from '../utils/logger.js';

const router = express.Router();

/**
 * Get user's current usage and tier info
 */
router.get('/usage', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get response usage info
    const responseUsage = await tierService.getResponseUsageInfo(userId);
    
    // Get GPT-5 usage info  
    const gpt5Usage = await tierService.getUserTierInfo(userId);
    
    // Get subscription info
    const subscription = await stripeService.getUserSubscription(userId);

    const response = {
      tier: responseUsage.tier,
      responseUsage: {
        used: responseUsage.used,
        limit: responseUsage.limit,
        remaining: responseUsage.remaining,
        isUnlimited: responseUsage.isUnlimited,
        periodStart: responseUsage.periodStart,
        periodEnd: responseUsage.periodEnd
      },
      gpt5Usage: {
        used: gpt5Usage.used,
        limit: gpt5Usage.limit,
        remaining: gpt5Usage.remaining,
        isUnlimited: gpt5Usage.isUnlimited
      },
      subscription: subscription ? {
        status: subscription.status,
        tier: subscription.tier,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd
      } : null,
      upgradeRecommended: responseUsage.remaining < 20 && responseUsage.tier === 'Standard'
    };

    res.json(response);
  } catch (error) {
    log.error('Error getting usage info', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to get usage information' });
  }
});

/**
 * Get available tiers with pricing
 */
router.get('/tiers', async (req, res) => {
  try {
    const tiers = [
      {
        name: 'Standard',
        price: 0,
        interval: 'free',
        features: [
          '150 responses every 2 weeks',
          '10 GPT-5 calls per month',
          'Basic chat features',
          'Spotify integration'
        ],
        limits: {
          responses: 150,
          gpt5: 10
        }
      },
      {
        name: 'Legend',
        price: 12,
        interval: 'month',
        features: [
          '3,000 responses every 2 weeks (20x more)',
          '50 GPT-5 calls per month (5x more)',
          'Priority support',
          'Enhanced AI features'
        ],
        limits: {
          responses: 3000,
          gpt5: 50
        },
        popular: false
      },
      {
        name: 'VIP',
        price: 20,
        interval: 'month',
        features: [
          'Unlimited responses',
          'Unlimited GPT-5 calls',
          'Priority processing',
          'Early access to new features',
          'Premium support'
        ],
        limits: {
          responses: 'unlimited',
          gpt5: 'unlimited'
        },
        popular: true
      }
    ];

    res.json({ tiers });
  } catch (error) {
    log.error('Error getting tiers', error);
    res.status(500).json({ error: 'Failed to get tier information' });
  }
});

/**
 * Create checkout session for tier upgrade
 */
router.post('/checkout', protect, async (req, res) => {
  try {
    const { tier } = req.body;
    const userId = req.user.id;

    log.info('Checkout request received', { userId, tier });

    if (!['Legend', 'VIP'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    // Create checkout session
    const session = await stripeService.createCheckoutSession(
      userId,
      tier,
      `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      `${process.env.FRONTEND_URL}/subscription/cancel`
    );

    log.info('Checkout session created successfully', { 
      userId, 
      tier, 
      sessionId: session.id 
    });

    res.json({ 
      checkoutUrl: session.url,
      sessionId: session.id 
    });
  } catch (error) {
    log.error('Error creating checkout session', error, { 
      userId: req.user?.id,
      tier: req.body?.tier,
      errorMessage: error.message,
      errorStack: error.stack
    });
    res.status(500).json({ 
      error: 'Failed to create checkout session',
      details: error.message 
    });
  }
});

/**
 * Get subscription details
 */
router.get('/details', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const subscription = await stripeService.getUserSubscription(userId);
    
    if (!subscription) {
      return res.json({ subscription: null });
    }

    res.json({ subscription });
  } catch (error) {
    log.error('Error getting subscription details', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to get subscription details' });
  }
});

/**
 * Cancel subscription
 */
router.post('/cancel', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await stripeService.cancelSubscription(userId);
    
    res.json(result);
  } catch (error) {
    log.error('Error canceling subscription', error, { userId: req.user?.id });
    res.status(500).json({ error: error.message });
  }
});

export default router;