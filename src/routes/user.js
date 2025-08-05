import express from "express";
import { protect } from "../middleware/auth.js";
import User from "../models/User.js";
import { HTTP_STATUS, MESSAGES } from "../config/constants.js";
import logger from "../utils/logger.js";
import { getUserTier, getTierLimits } from "../config/tiers.js";

const router = express.Router();


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
    // Add tier information to user profile
    const userTier = getUserTier(user);
    const tierLimits = getTierLimits(user);
    
    res.json({ 
      status: MESSAGES.SUCCESS, 
      data: { 
        user,
        tierBadge: {
          tier: userTier,
          name: tierLimits.name,
          features: tierLimits.features
        }
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


export default router; 