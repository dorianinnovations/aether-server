import express from "express";
import mongoose from "mongoose";
import { createLLMService } from "../services/llmService.js";

const router = express.Router();
const llmService = createLLMService();

// Health Check Endpoint
router.get("/health", async (req, res) => {
  try {
    const llmHealth = await llmService.healthCheck();

    const healthStatus = {
      server: "healthy",
      database:
        mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      llm_api: llmHealth.status,
      llm_api_url: llmHealth.url,
      llm_response_status: llmHealth.responseStatus,
    };

    if (llmHealth.status === "accessible") {
      res.json({ status: "success", health: healthStatus });
    } else {
      res.status(503).json({
        status: "degraded",
        health: {
          ...healthStatus,
          error: llmHealth.error,
        },
      });
    }
  } catch (err) {
    console.error("Health check error:", err);
    res.status(500).json({ status: "error", message: "Health check failed" });
  }
});

export default router; 