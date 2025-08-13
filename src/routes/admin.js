import express from 'express';
import { protect } from '../middleware/auth.js';
import tierService from '../services/tierService.js';
import { log } from '../utils/logger.js';

const router = express.Router();

// Test endpoint to manually upgrade user tier (for testing)
router.post('/test-upgrade', protect, async (req, res) => {
  try {
    const { tier } = req.body;
    const userId = req.user.id;
    
    // Only allow for specific test user (your account)
    const testUserId = '689bb95fb2c1bf61b68e6521'; // Your user ID from logs
    if (userId !== testUserId) {
      return res.status(403).json({ error: 'Not authorized for testing' });
    }

    if (!['Standard', 'Legend', 'VIP'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    const result = await tierService.upgradeTier(userId, tier);
    
    log.info('Test tier upgrade', { userId, tier, result });
    
    res.json({
      success: true,
      message: `Successfully upgraded to ${tier} tier`,
      oldTier: result.oldTier,
      newTier: result.newTier
    });
  } catch (error) {
    log.error('Error with test upgrade', error);
    res.status(500).json({ error: 'Failed to upgrade tier' });
  }
});

export default router;