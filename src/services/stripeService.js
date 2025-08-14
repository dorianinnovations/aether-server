import Stripe from 'stripe';
import User from '../models/User.js';
import tierService from './tierService.js';
import { log } from '../utils/logger.js';

class StripeService {
  constructor() {
    this.stripe = null;
    this.init();
  }

  init() {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    log.debug('Stripe initialization check', { 
      hasSecretKey: !!secretKey
    });
    
    if (!secretKey) {
      log.warn('Stripe secret key not found - payments disabled');
      return;
    }
    
    try {
      this.stripe = new Stripe(secretKey);
      log.info('Stripe service initialized successfully');
    } catch (error) {
      log.error('Failed to initialize Stripe', error);
    }
  }

  /**
   * Create Stripe customer for user
   */
  async createCustomer(user) {
    if (!this.stripe) throw new Error('Stripe not initialized');

    const customer = await this.stripe.customers.create({
      email: user.email,
      name: user.username || user.email,
      metadata: {
        userId: user._id.toString(),
        tier: user.tier
      }
    });

    // Save Stripe customer ID to user
    user.stripeCustomerId = customer.id;
    await user.save();

    return customer;
  }

  /**
   * Create subscription checkout session
   */
  async createCheckoutSession(userId, tier, successUrl, cancelUrl) {
    if (!this.stripe) throw new Error('Stripe not initialized');

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // Ensure user has Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await this.createCustomer(user);
      customerId = customer.id;
    }

    // Get price ID for tier
    const priceId = this.getTierPriceId(tier);
    if (!priceId) throw new Error(`Invalid tier: ${tier}`);

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId: userId,
        tier: tier
      }
    });

    return session;
  }

  /**
   * Get price IDs for tiers (set these in your Stripe dashboard)
   */
  getTierPriceId(tier) {
    const priceIds = {
      Legend: process.env.STRIPE_LEGEND_PRICE_ID, // $12/month
      VIP: process.env.STRIPE_VIP_PRICE_ID        // $20/month
    };
    return priceIds[tier];
  }

  /**
   * Handle successful subscription
   */
  async handleSubscriptionSuccess(subscriptionId, customerId) {
    if (!this.stripe) throw new Error('Stripe not initialized');

    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    const customer = await this.stripe.customers.retrieve(customerId);
    
    const userId = customer.metadata.userId;
    if (!userId) {
      log.error('No userId in customer metadata', { customerId });
      return;
    }

    // Determine tier from price ID
    const priceId = subscription.items.data[0].price.id;
    const tier = this.getTierFromPriceId(priceId);
    
    if (!tier) {
      log.error('Could not determine tier from price ID', { priceId });
      return;
    }

    // Upgrade user tier
    const result = await tierService.upgradeTier(userId, tier);
    if (result.success) {
      log.info('User tier upgraded via Stripe', { 
        userId, 
        oldTier: result.oldTier, 
        newTier: result.newTier,
        subscriptionId 
      });

      // Update user with subscription info
      await User.findByIdAndUpdate(userId, {
        stripeSubscriptionId: subscriptionId,
        subscriptionStatus: 'active'
      });
    }

    return { success: true, tier };
  }

  /**
   * Handle subscription cancellation
   */
  async handleSubscriptionCanceled(subscriptionId) {
    if (!this.stripe) throw new Error('Stripe not initialized');

    const user = await User.findOne({ stripeSubscriptionId: subscriptionId });
    if (!user) {
      log.error('User not found for canceled subscription', { subscriptionId });
      return;
    }

    // Downgrade to Standard tier
    await tierService.upgradeTier(user._id, 'Standard');
    
    // Update subscription status
    user.subscriptionStatus = 'canceled';
    user.stripeSubscriptionId = null;
    await user.save();

    log.info('User downgraded due to subscription cancellation', { 
      userId: user._id, 
      subscriptionId 
    });

    return { success: true };
  }

  /**
   * Get tier from price ID
   */
  getTierFromPriceId(priceId) {
    const priceTiers = {
      [process.env.STRIPE_LEGEND_PRICE_ID]: 'Legend',
      [process.env.STRIPE_VIP_PRICE_ID]: 'VIP'
    };
    return priceTiers[priceId];
  }

  /**
   * Get user's subscription info
   */
  async getUserSubscription(userId) {
    if (!this.stripe) return null;

    const user = await User.findById(userId);
    if (!user?.stripeSubscriptionId) return null;

    try {
      const subscription = await this.stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      return {
        id: subscription.id,
        status: subscription.status,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        tier: this.getTierFromPriceId(subscription.items.data[0].price.id)
      };
    } catch (error) {
      log.error('Error retrieving subscription', error, { userId });
      return null;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(userId) {
    if (!this.stripe) throw new Error('Stripe not initialized');

    const user = await User.findById(userId);
    if (!user?.stripeSubscriptionId) {
      throw new Error('No active subscription found');
    }

    const subscription = await this.stripe.subscriptions.update(
      user.stripeSubscriptionId,
      { cancel_at_period_end: true }
    );

    return {
      success: true,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000)
    };
  }
}

export default new StripeService();