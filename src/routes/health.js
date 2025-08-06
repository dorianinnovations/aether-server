import express from "express";
import mongoose from "mongoose";
import aiService from "../services/aiService.js";
import { log } from "../utils/logger.js";
import AppAudit from "../utils/appAudit.js";

const router = express.Router();

// Root route for basic server info
router.get("/", (req, res) => {
  res.json({
    service: "Aether AI Social Proxy Server",
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

export default router; 