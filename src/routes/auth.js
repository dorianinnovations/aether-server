import express from "express";
import { body, validationResult } from "express-validator";
import User from "../models/User.js";
import { signToken, protect, protectRefresh } from "../middleware/auth.js";
import { HTTP_STATUS, MESSAGES, SECURITY_CONFIG as _SECURITY_CONFIG } from "../config/constants.js";
import { log } from "../utils/logger.js";
// import { catchAsync, ValidationError, AuthenticationError } from "../utils/index.js";
// import emailService from "../services/emailService.js"; // Removed - no email service

const router = express.Router();

// Check username availability
router.get("/check-username/:username", async (req, res) => {
  try {
    const { username } = req.params;
    
    // Basic validation
    if (!username || username.length < 3 || username.length > 30) {
      return res.json({
        available: false,
        message: "Username must be between 3 and 30 characters"
      });
    }
    
    // Format validation
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.json({
        available: false,
        message: "Username can only contain letters, numbers, and underscores"
      });
    }
    
    // Reserved check
    const reserved = ['admin', 'root', 'api', 'www', 'mail', 'ftp', 'support', 'help', 'aether', 'system'];
    if (reserved.includes(username.toLowerCase())) {
      return res.json({
        available: false,
        message: "Username is reserved"
      });
    }
    
    // Check if taken
    const existingUser = await User.findOne({ username: username.toLowerCase() });
    
    res.json({
      available: !existingUser,
      message: existingUser ? "Username is already taken" : "Username is available"
    });
    
  } catch (error) {
    log.error('Username availability check failed', error);
    res.status(500).json({
      available: false,
      message: "Error checking username availability"
    });
  }
});

// Signup Route
router.post(
  "/signup",
  [
    body("email").isEmail().withMessage("Valid email required."),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters long."),
    body("username")
      .isLength({ min: 3, max: 30 })
      .withMessage("Username must be between 3 and 30 characters.")
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage("Username can only contain letters, numbers, and underscores.")
      .custom(value => {
        const reserved = ['admin', 'root', 'api', 'www', 'mail', 'ftp', 'support', 'help', 'aether', 'system'];
        if (reserved.includes(value.toLowerCase())) {
          throw new Error('Username is reserved.');
        }
        return true;
      }),
    body("name")
      .optional()
      .isLength({ min: 1, max: 100 })
      .withMessage("Name must be between 1 and 100 characters."),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        status: MESSAGES.ERROR,
        message: MESSAGES.VALIDATION_ERROR,
        errors: errors.array() 
      });
    }

    const { email, password, username, name } = req.body;
    try {
      // Check for existing email
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(HTTP_STATUS.CONFLICT).json({ 
          status: MESSAGES.ERROR,
          message: MESSAGES.EMAIL_IN_USE 
        });
      }

      // Check for existing username
      const existingUsername = await User.findOne({ username: username.toLowerCase() });
      if (existingUsername) {
        return res.status(HTTP_STATUS.CONFLICT).json({ 
          status: MESSAGES.ERROR,
          message: "Username is already taken" 
        });
      }

      const userData = { email, password, username: username.toLowerCase() };
      if (name && name.trim()) {
        userData.name = name.trim();
      }

      const user = await User.create(userData);
      log.info('User registration successful', { email: user.email, username: user.username });

      res.status(HTTP_STATUS.CREATED).json({
        status: MESSAGES.SUCCESS,
        token: signToken(user._id),
        data: { 
          user: { 
            id: user._id, 
            email: user.email,
            ...(user.name && { name: user.name })
          } 
        }
      });
    } catch (err) {
      log.error('User signup failed', err);
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
        status: MESSAGES.ERROR, 
        message: MESSAGES.SIGNUP_FAILED 
      });
    }
  }
);

// Login info endpoint (GET)
router.get("/login", (req, res) => {
  res.json({
    message: "Login endpoint",
    method: "POST",
    endpoint: "/auth/login",
    requiredFields: ["email", "password"],
    description: "Use POST method to authenticate with email/username and password. If the email field contains '@', it will search by email. Otherwise, it will search by username."
  });
});

// Login Route
router.post(
  "/login",
  [
    body("email").notEmpty().withMessage("Email or username is required."),
    body("password").notEmpty().withMessage("Password is required.")
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({ 
        status: MESSAGES.ERROR,
        message: MESSAGES.VALIDATION_ERROR,
        errors: errors.array() 
      });
    }

    const { email, password } = req.body;
    log.info('Login attempt', { email });

    try {
      // Check if input contains "@" to determine if it's email or username
      let user;
      if (email.includes("@")) {
        // Search by email
        user = await User.findOne({ email }).select("+password");
      } else {
        // Search by username
        user = await User.findOne({ username: email.toLowerCase() }).select("+password");
      }

      if (!user || !(await user.comparePassword(password))) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({ 
          status: MESSAGES.ERROR,
          message: MESSAGES.INVALID_CREDENTIALS 
        });
      }

      res.json({
        status: MESSAGES.SUCCESS,
        token: signToken(user._id),
        data: { 
          user: { 
            id: user._id, 
            email: user.email,
            username: user.username,
            ...(user.name && { name: user.name })
          } 
        },
      });
    } catch (err) {
      log.error('User login failed', err, { email });
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ 
        status: MESSAGES.ERROR, 
        message: MESSAGES.LOGIN_FAILED 
      });
    }
  }
);

// Spotify Connection Routes - Now Active
router.post('/spotify/connect', protect, async (req, res) => {
  try {
    const { 
      accessToken, 
      refreshToken, 
      spotifyUserId, 
      spotifyEmail, 
      spotifyDisplayName, 
      expiresIn 
    } = req.body;
    
    const userId = req.user.id;
    
    // Update user with Spotify connection data
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          'profile.spotifyAccessToken': accessToken,
          'profile.spotifyRefreshToken': refreshToken,
          'profile.spotifyUserId': spotifyUserId,
          'profile.spotifyEmail': spotifyEmail,
          'profile.spotifyDisplayName': spotifyDisplayName,
          'profile.spotifyConnectedAt': new Date(),
          'profile.spotifyTokenExpiresAt': new Date(Date.now() + (expiresIn * 1000))
        }
      },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    log.info('Spotify account connected', { userId, spotifyDisplayName });
    
    res.json({
      success: true,
      message: 'Spotify account connected successfully',
      data: {
        spotifyUserId,
        spotifyDisplayName,
        spotifyEmail,
        connectedAt: user.profile.spotifyConnectedAt
      }
    });
    
  } catch (error) {
    log.error('Spotify connection failed', error, { userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to connect Spotify account'
    });
  }
});

router.post('/spotify/disconnect', protect, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Remove Spotify data from user profile
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $unset: {
          'profile.spotifyAccessToken': '',
          'profile.spotifyRefreshToken': '',
          'profile.spotifyUserId': '',
          'profile.spotifyEmail': '',
          'profile.spotifyDisplayName': '',
          'profile.spotifyConnectedAt': '',
          'profile.spotifyTokenExpiresAt': ''
        }
      },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    log.info('Spotify account disconnected', { userId });
    
    res.json({
      success: true,
      message: 'Spotify account disconnected successfully'
    });
    
  } catch (error) {
    log.error('Spotify disconnection failed', error, { userId: req.user?.id });
    res.status(500).json({
      success: false,
      error: 'Failed to disconnect Spotify account'
    });
  }
});

// JWT Token Refresh Route
router.post("/refresh", protectRefresh, async (req, res) => {
  try {
    // User is already authenticated by protect middleware
    const userId = req.user.id;
    
    // Generate new token
    const newToken = signToken(userId);
    
    res.json({
      status: MESSAGES.SUCCESS,
      token: newToken,
      message: 'Token refreshed successfully'
    });
    
  } catch (error) {
    log.error('Token refresh failed', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      status: MESSAGES.ERROR,
      message: 'Failed to refresh token'
    });
  }
});

// Onboarding Management Routes
router.post("/onboarding/mark-welcome-seen", protect, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          'onboarding.hasSeenWelcome': true,
          'onboarding.welcomeShownAt': new Date()
        }
      },
      { new: true }
    );

    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        status: MESSAGES.ERROR,
        message: 'User not found'
      });
    }

    log.info('Welcome prompt marked as seen', { userId });

    res.json({
      status: MESSAGES.SUCCESS,
      message: 'Welcome status updated successfully',
      data: {
        hasSeenWelcome: user.onboarding.hasSeenWelcome,
        welcomeShownAt: user.onboarding.welcomeShownAt
      }
    });

  } catch (error) {
    log.error('Failed to mark welcome as seen', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      status: MESSAGES.ERROR,
      message: 'Failed to update welcome status'
    });
  }
});

router.post("/onboarding/complete", protect, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          'onboarding.hasSeenWelcome': true,
          'onboarding.onboardingCompletedAt': new Date(),
          'onboarding.skipWelcomePrompt': true
        }
      },
      { new: true }
    );

    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        status: MESSAGES.ERROR,
        message: 'User not found'
      });
    }

    log.info('Onboarding completed', { userId });

    res.json({
      status: MESSAGES.SUCCESS,
      message: 'Onboarding completed successfully',
      data: {
        onboardingCompletedAt: user.onboarding.onboardingCompletedAt,
        skipWelcomePrompt: user.onboarding.skipWelcomePrompt
      }
    });

  } catch (error) {
    log.error('Failed to complete onboarding', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      status: MESSAGES.ERROR,
      message: 'Failed to complete onboarding'
    });
  }
});

router.get("/onboarding/status", protect, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId).select('onboarding');
    
    if (!user) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        status: MESSAGES.ERROR,
        message: 'User not found'
      });
    }

    res.json({
      status: MESSAGES.SUCCESS,
      data: {
        hasSeenWelcome: user.onboarding?.hasSeenWelcome || false,
        onboardingCompletedAt: user.onboarding?.onboardingCompletedAt || null,
        skipWelcomePrompt: user.onboarding?.skipWelcomePrompt || false,
        welcomeShownAt: user.onboarding?.welcomeShownAt || null
      }
    });

  } catch (error) {
    log.error('Failed to get onboarding status', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      status: MESSAGES.ERROR,
      message: 'Failed to get onboarding status'
    });
  }
});

export default router; 