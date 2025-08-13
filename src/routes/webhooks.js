import express from 'express';
import Stripe from 'stripe';
import stripeService from '../services/stripeService.js';
import { log } from '../utils/logger.js';

const router = express.Router();

// Raw body parser for Stripe webhooks
router.use('/stripe', express.raw({ type: 'application/json' }));

/**
 * Stripe webhook handler
 */
router.post('/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!endpointSecret) {
    log.error('Stripe webhook secret not configured');
    return res.status(400).send('Webhook secret not configured');
  }

  let event;

  try {
    // Verify webhook signature
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (error) {
    log.error('Webhook signature verification failed', error);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
        
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
        
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
        
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
        
      default:
        log.info('Unhandled webhook event type', { type: event.type });
    }

    res.json({ received: true });
  } catch (error) {
    log.error('Error processing webhook', error, { eventType: event.type });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Handle successful checkout completion
 */
async function handleCheckoutCompleted(session) {
  log.info('Checkout session completed', { sessionId: session.id });
  
  if (session.mode === 'subscription' && session.subscription) {
    await stripeService.handleSubscriptionSuccess(
      session.subscription,
      session.customer
    );
  }
}

/**
 * Handle subscription updates
 */
async function handleSubscriptionUpdated(subscription) {
  log.info('Subscription updated', { 
    subscriptionId: subscription.id,
    status: subscription.status 
  });
  
  if (subscription.status === 'active') {
    await stripeService.handleSubscriptionSuccess(
      subscription.id,
      subscription.customer
    );
  }
}

/**
 * Handle subscription deletion/cancellation
 */
async function handleSubscriptionDeleted(subscription) {
  log.info('Subscription deleted', { subscriptionId: subscription.id });
  
  await stripeService.handleSubscriptionCanceled(subscription.id);
}

/**
 * Handle failed payments
 */
async function handlePaymentFailed(invoice) {
  log.warn('Payment failed', { 
    invoiceId: invoice.id,
    customerId: invoice.customer,
    subscriptionId: invoice.subscription 
  });
  
  // Could implement email notifications or grace period logic here
}

export default router;