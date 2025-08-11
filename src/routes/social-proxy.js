import express from 'express';
import { protect } from '../middleware/auth.js';
import User from '../models/User.js';
import { log } from '../utils/logger.js';

const router = express.Router();

// Get user's social proxy profile
router.get('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('username musicProfile artistPreferences analytics');
    
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    // Create a social proxy profile from the current user data
    const profile = {
      username: user.username,
      currentStatus: user.musicProfile?.currentStatus || '',
      mood: user.musicProfile?.mood || '',
      spotify: user.musicProfile?.spotify || { connected: false },
      artistPreferences: {
        followedArtistsCount: user.artistPreferences?.followedArtists?.length || 0,
        favoriteGenres: user.artistPreferences?.musicTaste?.favoriteGenres || [],
        discoveryPreferences: user.artistPreferences?.musicTaste?.discoveryPreferences || {}
      },
      analytics: {
        totalArtistsFollowed: user.analytics?.listeningStats?.totalArtistsFollowed || 0,
        totalUpdatesReceived: user.analytics?.listeningStats?.totalUpdatesReceived || 0
      },
      lastUpdated: user.musicProfile?.lastUpdated || new Date()
    };

    res.json({
      success: true,
      profile
    });

  } catch (error) {
    log.error('Get social proxy profile error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get profile',
      message: error.message 
    });
  }
});

// Update social proxy status
router.post('/status', protect, async (req, res) => {
  try {
    const { currentStatus, currentPlans, mood } = req.body;
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    // Initialize musicProfile if it doesn't exist
    if (!user.musicProfile) {
      user.musicProfile = {};
    }

    // Update the status fields
    if (currentStatus !== undefined) {
      user.musicProfile.currentStatus = currentStatus;
    }
    if (mood !== undefined) {
      user.musicProfile.mood = mood;
    }
    user.musicProfile.lastUpdated = new Date();

    await user.save();

    res.json({
      success: true,
      message: 'Status updated successfully',
      profile: {
        currentStatus: user.musicProfile.currentStatus,
        mood: user.musicProfile.mood,
        lastUpdated: user.musicProfile.lastUpdated
      }
    });

  } catch (error) {
    log.error('Update social proxy status error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to update status',
      message: error.message 
    });
  }
});


export default router;