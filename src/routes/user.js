import express from "express";
import { protect } from "../middleware/auth.js";
import { uploadProfilePhoto, uploadBannerImage, handleProfileImageError, validateProfileImage } from "../middleware/profileImageUpload.js";
import User from "../models/User.js";
import UserBadge from "../models/UserBadge.js";
import { HTTP_STATUS, MESSAGES } from "../config/constants.js";
import logger from "../utils/logger.js";

const router = express.Router();

// Get other user's public profile
router.get("/:username/profile", protect, async (req, res) => {
  try {
    const { username } = req.params;
    
    // Find user by username - search with case insensitive username
    const user = await User.findOne({ 
      username: { $regex: new RegExp(`^${username}$`, 'i') }
    }).select("-password -__v -musicProfile.spotify.accessToken -musicProfile.spotify.refreshToken");
    
    if (!user) {
      logger.warn(`Profile request failed for username: ${username}`);
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        status: MESSAGES.ERROR,
        error: `User '${username}' not found`,
        message: "The requested user profile does not exist"
      });
    }
    
    // Get user badges
    const badges = await UserBadge.getUserBadges(user._id);
    const badgeData = badges.map(badge => badge.toAPIResponse());
    
    // Build public profile response
    const publicProfile = {
      email: user.email,
      username: user.username,
      displayName: user.displayName || user.name || user.username,
      bio: user.bio || "",
      location: user.location || "",
      website: user.website || "",
      socialLinks: {
        instagram: user.socialLinks?.instagram || "",
        x: user.socialLinks?.x || "",
        spotify: user.socialLinks?.spotify || "",
        facebook: user.socialLinks?.facebook || "",
        website: user.socialLinks?.website || ""
      },
      badges: badgeData.filter(badge => badge.isVisible)
    };
    
    // Add profile images if they exist
    let profilePicture = null;
    let bannerImage = null;
    
    if (user.profilePhoto?.url) {
      profilePicture = user.profilePhoto.url;
    }
    
    if (user.bannerImage?.url) {
      bannerImage = user.bannerImage.url;
    }
    
    // Get live Spotify data if user has Spotify connected
    let spotifyData = {
      connected: user.musicProfile?.spotify?.connected || false,
      currentTrack: user.musicProfile?.spotify?.currentTrack || null
    };

    // If user has Spotify connected, try to get fresh live status
    if (user.musicProfile?.spotify?.connected) {
      try {
        // Import spotify service to get live data
        const spotifyService = await import('../services/spotifyService.js').then(m => m.default);
        const updateSuccess = await spotifyService.updateUserSpotifyData(user);
        
        if (updateSuccess && user.musicProfile?.spotify?.currentTrack) {
          const currentTrack = user.musicProfile.spotify.currentTrack;
          spotifyData = {
            connected: true,
            currentTrack: {
              name: currentTrack.name,
              artist: currentTrack.artist,
              album: currentTrack.album,
              imageUrl: currentTrack.imageUrl,
              spotifyUrl: currentTrack.spotifyUrl,
              isPlaying: currentTrack.isPlaying,
              progressMs: currentTrack.progressMs,
              durationMs: currentTrack.durationMs,
              lastPlayed: currentTrack.lastPlayed
            }
          };
        }
      } catch (error) {
        logger.warn(`Failed to get live Spotify data for ${username}:`, error.message);
        // Fall back to cached data
      }
    }

    // Build social profile with live Spotify data
    const socialProfile = {
      currentStatus: user.musicProfile?.currentStatus || "",
      friendsCount: user.friends?.length || 0,
      followersCount: user.analytics?.listeningStats?.totalArtistsFollowed || 0,
      grails: user.musicProfile?.spotify?.grails || { topTracks: [], topAlbums: [] },
      spotify: spotifyData
    };
    
    res.json({
      status: MESSAGES.SUCCESS,
      data: {
        user: publicProfile,
        profilePicture,
        bannerImage,
        socialProfile,
        badges: badgeData.filter(badge => badge.isVisible)
      }
    });
    
  } catch (err) {
    logger.error("Error fetching public user profile:", err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      status: MESSAGES.ERROR,
      message: "Failed to fetch user profile"
    });
  }
});

// Get user profile
router.get("/profile", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -__v");
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ 
        status: MESSAGES.ERROR,
        message: MESSAGES.USER_NOT_FOUND 
      });
    }
    
    // Get user badges
    const badges = await UserBadge.getUserBadges(req.user.id);
    const badgeData = badges.map(badge => badge.toAPIResponse());
    
    res.json({ 
      status: MESSAGES.SUCCESS, 
      data: { 
        user,
        badges: badgeData
      }
    });
  } catch (err) {
    console.error("Error fetching user profile:", err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
      status: MESSAGES.ERROR, 
      message: MESSAGES.PROFILE_FETCH_FAILED 
    });
  }
});

// Update user profile
router.put("/profile", protect, async (req, res) => {
  try {
    const { name, displayName, bio, location, website, dateOfBirth, socialLinks } = req.body;
    
    // Build update object with only provided fields
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (displayName !== undefined) updateData.displayName = displayName;
    if (bio !== undefined) updateData.bio = bio;
    if (location !== undefined) updateData.location = location;
    if (website !== undefined) updateData.website = website;
    if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth;
    if (socialLinks !== undefined) updateData.socialLinks = socialLinks;
    
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateData },
      { new: true, select: "-password -__v" }
    );
    
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        status: MESSAGES.ERROR,
        message: MESSAGES.USER_NOT_FOUND
      });
    }
    
    logger.info('User profile updated', {
      userId: req.user.id,
      updatedFields: Object.keys(updateData)
    });
    
    res.json({
      status: MESSAGES.SUCCESS,
      message: "Profile updated successfully",
      data: { user }
    });
    
  } catch (err) {
    logger.error("Error updating user profile:", err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      status: MESSAGES.ERROR,
      message: "Failed to update profile"
    });
  }
});

// User settings routes
router.get("/settings", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("settings preferences -_id");
    
    res.json({
      success: true,
      data: {
        settings: user?.settings || {},
        preferences: user?.preferences || {}
      }
    });
  } catch (error) {
    logger.error("Error fetching user settings:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: "Failed to fetch user settings"
    });
  }
});

router.post("/settings", protect, async (req, res) => {
  try {
    const { settings, preferences } = req.body;
    
    const updateData = {};
    if (settings) updateData.settings = settings;
    if (preferences) updateData.preferences = preferences;
    
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateData },
      { new: true, select: "settings preferences -_id" }
    );
    
    res.json({
      success: true,
      data: {
        settings: user?.settings || {},
        preferences: user?.preferences || {}
      },
      message: "Settings updated successfully"
    });
  } catch (error) {
    logger.error("Error updating user settings:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: "Failed to update user settings"
    });
  }
});

// User preferences routes (separate from settings)
router.get("/preferences", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("preferences -_id");
    
    res.json({
      success: true,
      data: {
        preferences: user?.preferences || {}
      }
    });
  } catch (error) {
    logger.error("Error fetching user preferences:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: "Failed to fetch user preferences"
    });
  }
});

router.post("/preferences", protect, async (req, res) => {
  try {
    const { preferences } = req.body;
    
    if (!preferences) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: "Preferences data is required"
      });
    }
    
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { preferences } },
      { new: true, select: "preferences -_id" }
    );
    
    res.json({
      success: true,
      data: {
        preferences: user?.preferences || {}
      },
      message: "Preferences updated successfully"
    });
  } catch (error) {
    logger.error("Error updating user preferences:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: "Failed to update user preferences"
    });
  }
});


// ACCOUNT DELETION - Complete data removal
router.delete("/delete", protect, async (req, res) => {
  try {
    const userId = req.user.id;

    logger.info(`Account deletion requested for user: ${userId}`);

    // Find user before deletion
    const user = await User.findById(userId);
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        status: MESSAGES.ERROR,
        message: MESSAGES.USER_NOT_FOUND
      });
    }

    // Delete user badges first
    await UserBadge.deleteMany({ user: userId });

    // Delete the user account
    await User.findByIdAndDelete(userId);

    logger.info(`Account successfully deleted for user: ${userId}`, {
      userEmail: user.email,
      username: user.username
    });

    res.json({
      success: true,
      status: MESSAGES.SUCCESS,
      message: "Account and all associated data have been permanently deleted"
    });

  } catch (error) {
    logger.error("Account deletion error:", error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      status: MESSAGES.ERROR,
      message: "Failed to delete account. Please try again or contact support."
    });
  }
});

// User badge endpoints
router.get("/:userId/badges", protect, async (req, res) => {
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

router.post("/:userId/badges", protect, async (req, res) => {
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

router.delete("/:userId/badges/:badgeType", protect, async (req, res) => {
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

router.put("/badges/:badgeId", protect, async (req, res) => {
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

// Profile Photo Upload
router.post("/profile-photo", protect, uploadProfilePhoto, handleProfileImageError, validateProfileImage, async (req, res) => {
  try {
    const userId = req.user.id;
    const imageData = req.validatedImage;

    // Create base64 data URL for storage
    const base64Data = imageData.buffer.toString('base64');
    const dataUrl = `data:${imageData.mimetype};base64,${base64Data}`;

    // Update user profile photo
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          profilePhoto: {
            url: dataUrl,
            filename: imageData.sanitizedName,
            size: imageData.size,
            mimeType: imageData.mimetype,
            uploadedAt: new Date()
          }
        }
      },
      { new: true, select: 'profilePhoto' }
    );

    logger.info('Profile photo updated', {
      userId,
      filename: imageData.sanitizedName,
      size: imageData.size
    });

    res.json({
      success: true,
      message: 'Profile photo updated successfully',
      data: {
        profilePhoto: user.profilePhoto
      }
    });

  } catch (error) {
    logger.error('Error updating profile photo:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to update profile photo'
    });
  }
});

// Banner Image Upload  
router.post("/banner-image", protect, uploadBannerImage, handleProfileImageError, validateProfileImage, async (req, res) => {
  try {
    const userId = req.user.id;
    const imageData = req.validatedImage;

    // Create base64 data URL for storage
    const base64Data = imageData.buffer.toString('base64');
    const dataUrl = `data:${imageData.mimetype};base64,${base64Data}`;

    // Update user banner image
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          bannerImage: {
            url: dataUrl,
            filename: imageData.sanitizedName,
            size: imageData.size,
            mimeType: imageData.mimetype,
            uploadedAt: new Date()
          }
        }
      },
      { new: true, select: 'bannerImage' }
    );

    logger.info('Banner image updated', {
      userId,
      filename: imageData.sanitizedName,
      size: imageData.size
    });

    res.json({
      success: true,
      message: 'Banner image updated successfully',
      data: {
        bannerImage: user.bannerImage
      }
    });

  } catch (error) {
    logger.error('Error updating banner image:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to update banner image'
    });
  }
});

// Get Profile Images
router.get("/images", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('profilePhoto bannerImage');
    
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        profilePhoto: user.profilePhoto || null,
        bannerImage: user.bannerImage || null
      }
    });

  } catch (error) {
    logger.error('Error fetching profile images:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to fetch profile images'
    });
  }
});

// Delete Profile Photo
router.delete("/profile-photo", protect, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $unset: { profilePhoto: 1 } },
      { new: true, select: 'profilePhoto' }
    );

    logger.info('Profile photo deleted', { userId: req.user.id });

    res.json({
      success: true,
      message: 'Profile photo deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting profile photo:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to delete profile photo'
    });
  }
});

// Delete Banner Image
router.delete("/banner-image", protect, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $unset: { bannerImage: 1 } },
      { new: true, select: 'bannerImage' }
    );

    logger.info('Banner image deleted', { userId: req.user.id });

    res.json({
      success: true,
      message: 'Banner image deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting banner image:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to delete banner image'
    });
  }
});

export default router; 