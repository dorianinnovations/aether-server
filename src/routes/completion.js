import express from "express";
import { protect } from "../middleware/auth.js";
import User from "../models/User.js";
import ShortTermMemory from "../models/ShortTermMemory.js";
import Task from "../models/Task.js";
import { createLLMService } from "../services/llmService.js";
import { sanitizeResponse } from "../utils/sanitize.js";
import axios from "axios";

const router = express.Router();
const llmService = createLLMService();

router.post("/completion", protect, async (req, res) => {
  const userId = req.user.id;
  const userPrompt = req.body.prompt;
  const stream = req.body.stream === true;
  // Sensible defaults fr LLM parameters
  const stop = req.body.stop || ["<|im_end|>", "\n<|im_start|>"];
  const n_predict = req.body.n_predict || 1024;
  const temperature = req.body.temperature || 0.7;

  if (!userPrompt || typeof userPrompt !== "string") {
    return res.status(400).json({ message: "Invalid or missing prompt." });
  }

  if (stream) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }
      const userProfile = user.profile ? JSON.stringify(user.profile) : "{}";
      const recentEmotionalLogEntries = user.emotionalLog
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 3);
      const formattedEmotionalLog = recentEmotionalLogEntries
        .map((entry) => {
          const date = entry.timestamp.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          });
          return `On ${date}, you expressed feeling ${entry.emotion}${
            entry.intensity ? ` (intensity ${entry.intensity})` : ""
          } because: ${entry.context || "no specific context provided"}.`;
        })
        .join("\n");
      const [recentMemory] = await Promise.all([
        ShortTermMemory.find(
          { userId },
          { role: 1, content: 1, _id: 0 }
        )
          .sort({ timestamp: -1 })
          .limit(6)
          .lean(),
      ]);
      recentMemory.reverse();
      const historyBuilder = [];
      for (const mem of recentMemory) {
        historyBuilder.push(
          `${mem.role === "user" ? "user" : "assistant"}\n${mem.content}`
        );
      }
      const conversationHistory = historyBuilder.join("\n");
      const promptParts = [
        `You are Numina, an empathetic and concise AI assistant. Your goal is to provide helpful responses, acknowledge user emotions, and proactively identify tasks.`,
        `**User Profile:** ${userProfile}`,
      ];
      if (conversationHistory.length > 0) {
        promptParts.push(`**Recent Conversation:**\n${conversationHistory}`);
      }
      if (formattedEmotionalLog.length > 0) {
        promptParts.push(
          `**Your Emotional History Summary (Top 3 Recent):**\n${formattedEmotionalLog}`
        );
      }
      promptParts.push(`Instructions for your response:
- Be direct and concise, but warm, sweet, witty, and playful.
- Do not echo user's prompt or instructions.
- Emotional Logging: If the user expresses a clear emotion, identify it and the context. Format strictly as: EMOTION_LOG: {"emotion": "happy", "intensity": 7, "context": "promotion"}
- Summarizing Past Emotions: Use human-readable format, not raw JSON.
- Task Inference: If the user implies a task, format strictly as: TASK_INFERENCE: {"taskType": "summarize_emotions", "parameters": {"period": "last week"}}
- Your primary conversational response should follow any EMOTION_LOG or TASK_INFERENCE output.`);
      promptParts.push(
        `<|im_start|>user\n${userPrompt}\n<|im_end|>\n<|im_start|>assistant`
      );
      const fullPrompt = promptParts.join("\n\n");

      // Make streaming request to llama.cpp
      const llamaRes = await axios({
        method: "POST",
        url: process.env.LLAMA_CPP_API_URL || "http://localhost:8000/completion",
        data: {
          prompt: fullPrompt,
          stop,
          n_predict,
          temperature,
          stream: true,
        },
        responseType: "stream",
        timeout: 30000, // 30 second timeout
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        }
      });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "Cache-Control");
      res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

      // Handle streaming data chunk by chunk
      llamaRes.data.on('data', (chunk) => {
        res.write(chunk);
        res.flush && res.flush(); // Ensure immediate sending
      });
      llamaRes.data.on("end", () => {
        res.end();
      });
      llamaRes.data.on("error", (err) => {
        console.error("Stream error:", err.message);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
        }
        res.write(`data: {"error": "${err.message}"}\n\n`);
        res.end();
      });
    } catch (err) {
      console.error("Streaming request failed:", err.message);
      res.status(500).json({ 
        status: "error", 
        message: "Streaming failed: " + err.message
      });
    }
    return;
  }

  // --- Non-streaming mode (existing logic) ---
  try {
    console.log(`✓Completion request received for user ${userId}.`);
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const userProfile = user.profile ? JSON.stringify(user.profile) : "{}";

    // Limit emotional log to a relevant number of recent entries to keep prompt concise
    const recentEmotionalLogEntries = user.emotionalLog
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 3); // Get most recent 3 entries

    const formattedEmotionalLog = recentEmotionalLogEntries
      .map((entry) => {
        const date = entry.timestamp.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
        return `On ${date}, you expressed feeling ${entry.emotion}${
          entry.intensity ? ` (intensity ${entry.intensity})` : ""
        } because: ${entry.context || "no specific context provided"}.`;
      })
      .join("\n");

    // Use memory and user data in parallel with Promise.all for efficiency
    const [recentMemory] = await Promise.all([
      ShortTermMemory.find(
        { userId },
        { role: 1, content: 1, _id: 0 } // Project only needed fields
      )
        .sort({ timestamp: -1 })
        .limit(6)
        .lean(),
    ]);

    // Process in reverse chronological order without another array operation
    recentMemory.reverse();

    // Pre-allocate approximate size for string builder pattern (more efficient than join)
    const historyBuilder = [];
    for (const mem of recentMemory) {
      historyBuilder.push(
        `${mem.role === "user" ? "user" : "assistant"}\n${mem.content}`
      );
    }
    const conversationHistory = historyBuilder.join("\n");

    // --- Streamlined LLM Prompt ---
    // Optimize by constructing prompt conditionally - only include what's needed
    const promptParts = [
      `You are Numina, an empathetic and concise AI assistant. Your goal is to provide helpful responses, acknowledge user emotions, and proactively identify tasks.`,
      `**User Profile:** ${userProfile}`,
    ];

    // Only include conversation history if it exists
    if (conversationHistory.length > 0) {
      promptParts.push(`**Recent Conversation:**\n${conversationHistory}`);
    }

    // Only include emotional log if it exists
    if (formattedEmotionalLog.length > 0) {
      promptParts.push(
        `**Your Emotional History Summary (Top 3 Recent):**\n${formattedEmotionalLog}`
      );
    }

    // Add instructions - using a more compact format
    promptParts.push(`Instructions for your response:
- Be direct and concise, but warm, sweet, witty, and playful.
- Do not echo user's prompt or instructions.
- Emotional Logging: If the user expresses a clear emotion, identify it and the context. Format strictly as: EMOTION_LOG: {"emotion": "happy", "intensity": 7, "context": "promotion"}
- Summarizing Past Emotions: Use human-readable format, not raw JSON.
- Task Inference: If the user implies a task, format strictly as: TASK_INFERENCE: {"taskType": "summarize_emotions", "parameters": {"period": "last week"}}
- Your primary conversational response should follow any EMOTION_LOG or TASK_INFERENCE output.`);

    // Add user query
    promptParts.push(
      `<|im_start|>user\n${userPrompt}\n<|im_end|>\n<|im_start|>assistant`
    );

    // Join with newlines for better token efficiency
    const fullPrompt = promptParts.join("\n\n");

    // Make LLM request
    const llmData = await llmService.makeLLMRequest(fullPrompt, {
      stop,
      n_predict,
      temperature,
    });

    let botReplyContent = llmData.content || ""; // Initialize as empty string

    // --- Begin Robust Parsing and Cleaning ---

    // Declare variables to store parsed information
    let inferredTask = null;
    let inferredEmotion = null;

    // Helper function for JSON extraction with error handling
    const extractJsonPattern = (regex, content, logType) => {
      const match = content.match(regex);
      if (!match || !match[1]) {
        return [null, content];
      }

      try {
        // Extract JSON and remove the match from content
        const jsonString = match[1].trim();
        const parsed = JSON.parse(jsonString);
        // Remove the entire pattern (marker + JSON)
        const newContent = content.replace(match[0], "");

        return [parsed, newContent];
      } catch (jsonError) {
        console.error(`Failed to parse ${logType} JSON:`, jsonError.message);
        return [null, content];
      }
    };

    // Extract and remove patterns with comprehensive patterns to catch all variations
    const taskInferenceRegex = /TASK_INFERENCE:?\s*(\{[\s\S]*?\})\s*?/g;
    const emotionLogRegex = /EMOTION_LOG:?\s*(\{[\s\S]*?\})\s*?/g;

    // Process emotion first - use the first match if multiple exist
    [inferredEmotion, botReplyContent] = extractJsonPattern(
      emotionLogRegex,
      botReplyContent,
      "emotion log"
    );

    // Then process task - use the first match if multiple exist
    [inferredTask, botReplyContent] = extractJsonPattern(
      taskInferenceRegex,
      botReplyContent,
      "task inference"
    );

    // Ensure ALL marker patterns are completely removed, even if parsing failed
    // This is a more aggressive approach to ensure no markers leak to the UI
    botReplyContent = botReplyContent
      // Remove model tokens
      .replace(/<\|im_(start|end)\|>(assistant|user)?\n?/g, "")
      // Aggressively remove any marker patterns, even incomplete ones
      .replace(/TASK_INFERENCE:?\s*(\{[\s\S]*?\})?\s*?/g, "")
      .replace(/EMOTION_LOG:?\s*(\{[\s\S]*?\})?\s*?/g, "")
      // Remove even just the marker names without JSON
      .replace(/TASK_INFERENCE:?/g, "")
      .replace(/EMOTION_LOG:?/g, "")
      // Remove code blocks that might contain markers
      .replace(/```json[\s\S]*?```/g, "")
      // Normalize newlines
      .replace(/(\r?\n){2,}/g, "\n")
      .trim();

    // Double check for any remaining marker patterns
    if (
      botReplyContent.includes("TASK_INFERENCE") ||
      botReplyContent.includes("EMOTION_LOG")
    ) {
      console.warn("Markers detected - applying emergency cleanup");
      // Emergency fallback: split by lines and filter out any line containing markers
      botReplyContent = botReplyContent
        .split("\n")
        .filter(
          (line) =>
            !line.includes("TASK_INFERENCE") && !line.includes("EMOTION_LOG")
        )
        .join("\n")
        .trim();
    }

    // Use the dedicated sanitizer for a final pass
    botReplyContent = sanitizeResponse(botReplyContent);
    // --- End Robust Parsing and Cleaning ---

    // Prepare database operations to be executed in parallel
    const dbOperations = [];

    // Memory storage operations (both user and assistant messages)
    dbOperations.push(
      ShortTermMemory.insertMany([
        { userId, content: userPrompt, role: "user" },
        // Ensure content is never empty for the assistant's response
        {
          userId,
          content:
            botReplyContent ||
            "I'm sorry, I wasn't able to provide a proper response.",
          role: "assistant",
        },
      ])
    );

    // Process inferred emotion if present
    if (inferredEmotion && inferredEmotion.emotion) {
      const emotionToLog = {
        emotion: inferredEmotion.emotion,
        context: inferredEmotion.context || userPrompt,
      };

      // Add intensity if valid
      if (inferredEmotion.intensity >= 1 && inferredEmotion.intensity <= 10) {
        emotionToLog.intensity = inferredEmotion.intensity;
      }

      // Queue the emotion update
      dbOperations.push(
        User.findByIdAndUpdate(userId, {
          $push: { emotionalLog: emotionToLog },
        })
      );
    }

    // Process inferred task if present
    if (inferredTask && inferredTask.taskType) {
      const taskParameters =
        typeof inferredTask.parameters === "object"
          ? inferredTask.parameters
          : {};

      // Queue the task creation
      dbOperations.push(
        Task.create({
          userId,
          taskType: inferredTask.taskType,
          parameters: taskParameters,
          status: "queued",
        })
      );
    }

    // Execute all database operations in parallel
    await Promise.all(dbOperations);

    // Database operations completed successfully

    // Final safety check before sending response to client
    botReplyContent = sanitizeResponse(botReplyContent);

    // Validate that sanitization was successful
    if (
      botReplyContent.includes("TASK_INFERENCE") ||
      botReplyContent.includes("EMOTION_LOG")
    ) {
      console.error("Response sanitization failed - markers still present");
      botReplyContent =
        "I'm sorry, I wasn't able to provide a proper response. Please try again.";
    }

    res.json({ content: botReplyContent });
  } catch (err) {
    console.error("Error in /completion endpoint:", err);
    res.status(500).json({
      status: "error",
      message: "Error processing LLM request. Please try again.",
    });
  }
});

export default router; 