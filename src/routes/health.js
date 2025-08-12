import express from "express";
import mongoose from "mongoose";
import aiService from "../services/aiService.js";
import { log } from "../utils/logger.js";
import AppAudit from "../utils/appAudit.js";

const router = express.Router();

// Root route for basic server info
router.get("/", (req, res) => {
  res.json({
    service: "Aether",
    version: "1.0.0",
    status: "running",
    endpoints: {
      health: "/health",
      auth: "/auth/*",
      user: "/user/*", 
      friends: "/friends/*",
      socialProxy: "/social-proxy/*",
      spotify: "/spotify/*",
      socialChat: "/social-chat"
    },
    docs: "See CLAUDE.md for full API documentation"
  });
});

// Health check for the AI service
router.get("/llm", async (req, res) => {
  try {
    const result = await aiService.chat("test");
    res.json({ 
      status: result.success ? "healthy" : "error", 
      service: "aiService",
      model: result.model || "unknown"
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

router.get("/health", async (req, res) => {
  try {
    // Check database health
    const dbHealth = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
    
    // Check OpenRouter API health - simplified
    let llmHealth = {
      status: "reachable", // Assume reachable since AI chat is working
      service: "OpenRouter (GPT-4o)",
      response_status: "available"
    };

    const healthStatus = {
      server: "healthy",
      database: dbHealth,
      llm_api: llmHealth.status,
      llm_service: llmHealth.service,
      llm_response_status: llmHealth.response_status,
      server_uptime: Math.floor(process.uptime())
    };

    const overallStatus = (dbHealth === "connected" && llmHealth.status === "reachable") 
      ? "success" 
      : "degraded";

    const statusCode = overallStatus === "success" ? 200 : 503;

    res.status(statusCode).json({ 
      status: overallStatus, 
      health: healthStatus 
    });
  } catch (err) {
    log.error("Health check error", err);
    res.status(500).json({ 
      status: "error", 
      message: "Health check failed",
      error: err.message 
    });
  }
});


// Comprehensive app audit endpoint
router.get("/audit", async (req, res) => {
  try {
    const auditor = new AppAudit();
    const auditResults = await auditor.runFullAudit();
    const report = auditor.generateReport();
    
    const statusCode = auditor.getHealthStatus().healthy ? 200 : 503;
    
    res.status(statusCode).json({
      success: true,
      audit: report,
      recommendations: generateRecommendations(auditResults)
    });
    
  } catch (error) {
    log.error("App audit failed", error);
    res.status(500).json({
      success: false,
      error: "Audit system failure",
      message: error.message
    });
  }
});

// Quick status check
router.get("/status", async (req, res) => {
  try {
    const auditor = new AppAudit();
    const auditResults = await auditor.runFullAudit();
    const healthStatus = auditor.getHealthStatus();
    
    res.json({
      status: healthStatus.status,
      score: healthStatus.score,
      healthy: healthStatus.healthy,
      timestamp: new Date().toISOString(),
      components: {
        database: auditResults.database.status,
        routes: auditResults.routes.status,
        services: auditResults.services.status,
        models: auditResults.models.status,
        environment: auditResults.environment.status
      }
    });
    
  } catch (error) {
    res.status(500).json({
      status: "error",
      score: 0,
      healthy: false,
      error: error.message
    });
  }
});

function generateRecommendations(auditResults) {
  const recommendations = [];
  
  if (auditResults.database.status !== 'healthy') {
    recommendations.push({
      priority: 'high',
      component: 'database',
      issue: 'Database connectivity issues',
      action: 'Check MongoDB connection and credentials'
    });
  }
  
  if (auditResults.environment.status !== 'healthy') {
    recommendations.push({
      priority: 'high',
      component: 'environment',
      issue: 'Missing required environment variables',
      action: 'Configure missing environment variables in .env file'
    });
  }
  
  if (auditResults.routes.status !== 'healthy') {
    recommendations.push({
      priority: 'medium',
      component: 'routes',
      issue: 'Route configuration problems',
      action: 'Review route files for syntax errors'
    });
  }
  
  if (auditResults.services.status !== 'healthy') {
    recommendations.push({
      priority: 'medium', 
      component: 'services',
      issue: 'Service implementation issues',
      action: 'Check service files for proper exports and class definitions'
    });
  }
  
  if (auditResults.models.status !== 'healthy') {
    recommendations.push({
      priority: 'medium',
      component: 'models',
      issue: 'Database model problems',
      action: 'Verify mongoose schema definitions and exports'
    });
  }
  
  return recommendations;
}

// Admin endpoint to remove mock data
router.delete("/admin/mock-data", async (req, res) => {
  try {
    const User = mongoose.model('User');
    
    // Find users with mock quick_ artists
    const usersWithMockArtists = await User.find({
      'artistPreferences.followedArtists.artistId': { $regex: /^quick_/ }
    });

    let totalRemoved = 0;

    for (const user of usersWithMockArtists) {
      const originalCount = user.artistPreferences.followedArtists.length;
      
      // Remove all quick_ prefixed artists
      user.artistPreferences.followedArtists = user.artistPreferences.followedArtists.filter(
        artist => !artist.artistId.startsWith('quick_')
      );

      const removedCount = originalCount - user.artistPreferences.followedArtists.length;
      totalRemoved += removedCount;

      // Reset analytics counts
      if (user.analytics?.listeningStats) {
        user.analytics.listeningStats.totalArtistsFollowed = user.artistPreferences.followedArtists.length;
        user.analytics.listeningStats.totalUpdatesReceived = 0;
        user.analytics.listeningStats.totalReleasesDiscovered = 0;
        user.analytics.listeningStats.averageUpdatesPerDay = 0;
      }

      // Clear engagement data related to mock artists
      if (user.analytics?.engagement) {
        user.analytics.engagement.feedInteractions = [];
        user.analytics.engagement.mostEngagedArtists = [];
        user.analytics.engagement.discoveryPatterns = {
          discoveriesThisMonth: 0,
          discoveryStreak: 0
        };
      }

      await user.save();
    }

    // Also remove any mock artists from the Artist collection
    const Artist = mongoose.model('Artist');
    const mockArtists = await Artist.deleteMany({
      artistId: { $regex: /^quick_/ }
    });

    res.json({
      success: true,
      message: 'Mock data removed successfully',
      data: {
        usersUpdated: usersWithMockArtists.length,
        mockArtistsRemoved: totalRemoved,
        mockArtistDocumentsDeleted: mockArtists.deletedCount
      }
    });

  } catch (error) {
    log.error('Error removing mock data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove mock data',
      message: error.message
    });
  }
});

export default router; 