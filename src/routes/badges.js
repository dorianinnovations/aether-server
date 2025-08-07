import express from 'express';
import { protect } from '../middleware/auth.js';
import UserBadge from '../models/UserBadge.js';
import User from '../models/User.js';
import { HTTP_STATUS } from '../config/constants.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Get user's badges by user ID
router.get('/user/:userId', protect, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    const badges = await UserBadge.getUserBadges(userId);
    const badgeData = badges.map(badge => badge.toAPIResponse());

    res.json({
      success: true,
      data: {
        badges: badgeData
      }
    });
  } catch (error) {
    logger.error('Error fetching user badges:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to fetch user badges'
    });
  }
});

// Get current user's badges
router.get('/my-badges', protect, async (req, res) => {
  try {
    const badges = await UserBadge.getUserBadges(req.user.id);
    const badgeData = badges.map(badge => badge.toAPIResponse());

    res.json({
      success: true,
      data: {
        badges: badgeData
      }
    });
  } catch (error) {
    logger.error('Error fetching my badges:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to fetch badges'
    });
  }
});

// Award a badge to a user (admin only for now - we'll add proper admin middleware later)
router.post('/user/:userId/award', protect, async (req, res) => {
  try {
    const { userId } = req.params;
    const { badgeType, metadata = {} } = req.body;

    if (!badgeType) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Badge type is required'
      });
    }

    if (!['founder', 'og'].includes(badgeType)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Invalid badge type'
      });
    }

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    const badge = await UserBadge.awardBadge(userId, badgeType, req.user.id, metadata);
    
    logger.info(`Badge awarded: ${badgeType} to user ${userId} by ${req.user.id}`);

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        badge: badge.toAPIResponse()
      },
      message: `${badgeType} badge awarded successfully`
    });
  } catch (error) {
    if (error.message.includes('already has')) {
      return res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        message: error.message
      });
    }
    
    logger.error('Error awarding badge:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to award badge'
    });
  }
});

// Remove a badge from a user
router.delete('/user/:userId/:badgeType', protect, async (req, res) => {
  try {
    const { userId, badgeType } = req.params;

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    const result = await UserBadge.deleteOne({ user: userId, badgeType });
    
    if (result.deletedCount === 0) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Badge not found'
      });
    }

    logger.info(`Badge removed: ${badgeType} from user ${userId} by ${req.user.id}`);

    res.json({
      success: true,
      message: `${badgeType} badge removed successfully`
    });
  } catch (error) {
    logger.error('Error removing badge:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to remove badge'
    });
  }
});

// Update badge visibility
router.put('/:badgeId/visibility', protect, async (req, res) => {
  try {
    const { badgeId } = req.params;
    const { isVisible } = req.body;

    if (typeof isVisible !== 'boolean') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'isVisible must be a boolean'
      });
    }

    const badge = await UserBadge.findOne({ 
      _id: badgeId, 
      user: req.user.id 
    });

    if (!badge) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Badge not found or not owned by user'
      });
    }

    badge.isVisible = isVisible;
    await badge.save();

    res.json({
      success: true,
      data: {
        badge: badge.toAPIResponse()
      },
      message: 'Badge visibility updated successfully'
    });
  } catch (error) {
    logger.error('Error updating badge visibility:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to update badge visibility'
    });
  }
});

// Admin: Get badge statistics
router.get('/admin/stats', protect, async (req, res) => {
  try {
    // For now, any authenticated user can view stats
    // In production, add proper admin middleware
    
    const stats = await UserBadge.aggregate([
      {
        $group: {
          _id: '$badgeType',
          count: { $sum: 1 },
          visible: { 
            $sum: { $cond: ['$isVisible', 1, 0] } 
          }
        }
      },
      {
        $project: {
          badgeType: '$_id',
          total: '$count',
          visible: '$visible',
          hidden: { $subtract: ['$count', '$visible'] }
        }
      }
    ]);

    const totalUsers = await User.countDocuments();
    const usersWithBadges = await UserBadge.distinct('user').then(users => users.length);

    res.json({
      success: true,
      data: {
        badgeStats: stats,
        totalUsers,
        usersWithBadges,
        usersWithoutBadges: totalUsers - usersWithBadges
      }
    });
  } catch (error) {
    logger.error('Error fetching badge stats:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to fetch badge statistics'
    });
  }
});

// Admin: Bulk award badges
router.post('/admin/bulk-award', protect, async (req, res) => {
  try {
    const { userIds, badgeType, metadata = {} } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'userIds must be a non-empty array'
      });
    }

    if (!['founder', 'og'].includes(badgeType)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Invalid badge type'
      });
    }

    const results = {
      awarded: [],
      failed: [],
      alreadyHad: []
    };

    for (const userId of userIds) {
      try {
        const badge = await UserBadge.awardBadge(userId, badgeType, req.user.id, metadata);
        results.awarded.push({
          userId,
          badge: badge.toAPIResponse()
        });
      } catch (error) {
        if (error.message.includes('already has')) {
          results.alreadyHad.push({ userId, error: error.message });
        } else {
          results.failed.push({ userId, error: error.message });
        }
      }
    }

    logger.info(`Bulk badge operation completed: ${results.awarded.length} awarded, ${results.failed.length} failed, ${results.alreadyHad.length} already had badge`);

    res.json({
      success: true,
      data: results,
      message: `Bulk award completed: ${results.awarded.length} badges awarded`
    });
  } catch (error) {
    logger.error('Error in bulk badge award:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to bulk award badges'
    });
  }
});

export default router;