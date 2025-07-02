import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { body, validationResult } from "express-validator";
import bcrypt from "bcrypt";
import axios from "axios";
import https from "https";

const app = express();
dotenv.config(); // Load environment variables

// --- Security and Middleware Configuration ---

// CORS configuration for production readiness
const allowedOrigins = [
  "https://leafy-centaur-370c2f.netlify.app", // Your Netlify production frontend
  "http://localhost:5173", // Frontend development
  "http://localhost:5000", // Backend development (if applicable)
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        const msg = `The CORS policy for this site does not allow access from the specified Origin.`;
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Explicitly list allowed methods
  })
);

app.use(express.json()); // Parse JSON request bodies
app.use(helmet()); // Apply security headers

// Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 requests per 15 minutes per IP
  message: "Too many requests from this IP, please try again after 15 minutes",
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
app.use(limiter);

// --- Database Connection ---
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✓MongoDB connected successfully."))
  .catch((err) => {
    console.error("✗ MongoDB connection error:", err);
    process.exit(1); // Exit process if DB connection fails
  });

// --- Mongoose Schemas and Models ---

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: { type: String, required: true, minlength: 8 },
  profile: {
    type: Map,
    of: String,
    default: {},
  },
  emotionalLog: [
    {
      emotion: { type: String, required: true, trim: true },
      intensity: { type: Number, min: 1, max: 10, required: false },
      context: { type: String, required: false, trim: true },
      timestamp: { type: Date, default: Date.now },
    },
  ],
});

// Pre-save hook to hash password
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Method to compare passwords
userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

const User = mongoose.model("User", userSchema);
console.log("✓User schema and model defined.");

const shortTermMemorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  conversationId: { type: String, required: false, index: true }, // Add index for faster lookups
  timestamp: { type: Date, default: Date.now, expires: "24h" }, // TTL index for 24 hours
  content: { type: String, required: true },
  role: { type: String, enum: ["user", "assistant"], required: true },
});
const ShortTermMemory = mongoose.model(
  "ShortTermMemory",
  shortTermMemorySchema
);
console.log("✓ShortTermMemory schema and model defined.");

const taskSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  taskType: { type: String, required: true, trim: true },
  status: {
    type: String,
    enum: ["queued", "processing", "completed", "failed"],
    default: "queued",
  },
  createdAt: { type: Date, default: Date.now },
  runAt: { type: Date, default: Date.now },
  parameters: { type: Map, of: String }, // Use Mixed type if parameters can be complex objects
  result: { type: String },
  priority: { type: Number, default: 0, min: 0, max: 10 }, // Example priority range
});

taskSchema.index({ runAt: 1, status: 1, priority: -1 }); // Compound index for efficient task retrieval
const Task = mongoose.model("Task", taskSchema);
console.log("✓Task schema and model defined.");

// --- JWT Authentication Utilities ---
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "1d", // Default to 1 day
  });
console.log("✓JWT signing function ready.");

// Middleware to protect routes
const protect = (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res
      .status(401)
      .json({ message: "You are not logged in! Please log in to get access." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach user ID to request object
    next();
  } catch (error) {
    console.error("JWT verification error:", error);
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};

// --- Authentication Routes ---

app.post(
  "/signup",
  [
    body("email").isEmail().withMessage("Valid email required."),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters long."),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { email, password } = req.body;
    try {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(409).json({ message: "Email already in use." });
      }
      const user = await User.create({ email, password });
      console.log("New user created:", user.email);

      res.status(201).json({
        status: "success",
        token: signToken(user._id),
        data: { user: { id: user._id, email: user.email } },
      });
    } catch (err) {
      console.error("Signup error:", err);
      res
        .status(500)
        .json({ status: "error", message: "Failed to create user." });
    }
  }
);

app.post(
  "/login",
  [body("email").isEmail(), body("password").notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    console.log("Login attempt for:", email);

    try {
      const user = await User.findOne({ email }).select("+password"); // Select password for comparison
      if (!user || !(await user.correctPassword(password, user.password))) {
        return res
          .status(401)
          .json({ message: "Incorrect email or password." });
      }

      res.json({
        status: "success",
        token: signToken(user._id),
        data: { user: { id: user._id, email: user.email } },
      });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ status: "error", message: "Login failed." });
    }
  }
);

// --- User Profile Route ---
app.get("/profile", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -__v"); // Exclude sensitive fields
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    res.json({ status: "success", data: { user } });
  } catch (err) {
    console.error("Error fetching user profile:", err);
    res
      .status(500)
      .json({ status: "error", message: "Failed to fetch profile." });
  }
});

// --- Health Check Endpoint ---
app.get("/health", async (req, res) => {
  try {
    const llamaCppApiUrl = process.env.LLAMA_CPP_API_URL || 
      "https://1c19-2603-8000-e602-bfd4-ccb5-8ca5-46f0-1dbf.ngrok-free.app/completion";
    
    // Create custom HTTPS agent for ngrok compatibility
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false, // For ngrok certificates
      timeout: 10000
    });
    
    try {
      const testRes = await axios({
        method: 'POST',
        url: llamaCppApiUrl,
        headers: { 
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true"
        },
        data: {
          prompt: "Hello",
          n_predict: 5,
          temperature: 0.1
        },
        httpsAgent: httpsAgent,
        timeout: 10000
      });
      
      const healthStatus = {
        server: "healthy",
        database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        llm_api: "accessible",
        llm_api_url: llamaCppApiUrl,
        llm_response_status: testRes.status
      };
      
      res.json({ status: "success", health: healthStatus });
    } catch (testError) {
      console.error("Health check LLM test failed:", testError.message);
      res.status(503).json({ 
        status: "degraded", 
        health: {
          server: "healthy",
          database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
          llm_api: "unreachable",
          llm_api_url: llamaCppApiUrl,
          error: testError.message
        }
      });
    }
  } catch (err) {
    console.error("Health check error:", err);
    res.status(500).json({ status: "error", message: "Health check failed" });
  }
});

// --- LLM Completion Endpoint ---
app.post("/completion", protect, async (req, res) => {
  const userId = req.user.id;
  const userPrompt = req.body.prompt;
  // Sensible defaults for LLM parameters
  const stop = req.body.stop || ["<|im_end|>", "\n<|im_start|>"]; // Added common stop sequences
  const n_predict = req.body.n_predict || 200; // Slightly reduced default prediction length
  const temperature = req.body.temperature || 0.7; // Slightly reduced temperature for more focused responses

  if (!userPrompt || typeof userPrompt !== "string") {
    return res.status(400).json({ message: "Invalid or missing prompt." });
  }

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
      .slice(0, 5); // Get most recent 5 entries

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

    // Fetch and format recent conversation history (e.g., last 10 messages)
    const recentMemory = await ShortTermMemory.find({ userId })
      .sort({ timestamp: -1 }) // Sort by newest first
      .limit(10) // Fetch last 10 messages
      .lean()
      .then((mems) => mems.reverse()); // Reverse to get chronological order for prompt

    const conversationHistory = recentMemory
      .map(
        (mem) => `${mem.role === "user" ? "user" : "assistant"}\n${mem.content}`
      )
      .join("\n");

    // --- Refined and Simplified LLM Prompt ---
    const fullPrompt = `
You are Numina, an empathetic and concise AI assistant. Your goal is to provide helpful responses, acknowledge user emotions, and proactively identify tasks.

**User Profile:** ${userProfile}

**Recent Conversation:**
${
  conversationHistory.length > 0
    ? conversationHistory
    : "No recent conversation."
}

**Your Emotional History Summary (Top 5 Recent):**
${
  formattedEmotionalLog.length > 0
    ? formattedEmotionalLog
    : "You have no recorded emotional history yet."
}

Instructions for your response:
- Be direct and concise. Avoid conversational filler.
- Do not echo user's prompt or instructions.
- Emotional Logging: If the user expresses a clear emotion, identify it and the context. Format it strictly as a single JSON object on its own line, like:
  EMOTION_LOG: {"emotion": "happy", "intensity": 7, "context": "just got a promotion"}
  (emotion is mandatory. intensity (1-10) and context are optional.)
- Summarizing Past Emotions: If the user asks about their past emotions, summarize them in a human-readable, non-technical way. Do NOT output raw JSON.
- Task Inference: If the user implies a task (e.g., "summarize my week", "send an email"), infer the task and its parameters. Format it strictly as a single JSON object on its own line, like:
  TASK_INFERENCE: {"taskType": "summarize_emotions", "parameters": {"period": "last week"}}
  (taskType is mandatory. parameters is an object for relevant details.)
- Your primary conversational response should follow any EMOTION_LOG: or TASK_INFERENCE: output.

<|im_start|>user
${userPrompt}
<|im_end|>
<|im_start|>assistant
`;

    console.log("Full prompt constructed. Length:", fullPrompt.length);
    // console.log("Full prompt content:", fullPrompt); // Uncomment for debugging if needed

    const llamaCppApiUrl =
      process.env.LLAMA_CPP_API_URL ||
      "https://1c19-2603-8000-e602-bfd4-ccb5-8ca5-46f0-1dbf.ngrok-free.app/completion";
    
    console.log("Using LLAMA_CPP_API_URL:", llamaCppApiUrl);
    console.log("Environment LLAMA_CPP_API_URL:", process.env.LLAMA_CPP_API_URL);
    
    // Create custom HTTPS agent for ngrok compatibility
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false, // For ngrok certificates
      timeout: 30000
    });
    
    let llmRes;
    try {
      llmRes = await axios({
        method: 'POST',
        url: llamaCppApiUrl,
        headers: { 
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
          "User-Agent": "numina-server/1.0"
        },
        data: {
          prompt: fullPrompt,
          stop: stop,
          n_predict: n_predict,
          temperature: temperature,
          // Add other llama.cpp parameters as needed for better control
          // e.g., "top_k": 40, "top_p": 0.9, "repeat_penalty": 1.1
        },
        httpsAgent: httpsAgent,
        timeout: 30000
      });

      console.log("LLM API Response Status:", llmRes.status, llmRes.statusText);
    } catch (fetchError) {
      if (fetchError.code === 'ECONNABORTED') {
        console.error("LLM API request timed out after 30 seconds");
        throw new Error("LLM API request timed out. Please try again.");
      } else if (fetchError.response) {
        // Server responded with error status
        console.error("LLM API Response Error:", {
          status: fetchError.response.status,
          statusText: fetchError.response.statusText,
          data: fetchError.response.data
        });
        throw new Error(
          `LLM API error: ${fetchError.response.status} - ${fetchError.response.statusText} - ${fetchError.response.data}`
        );
      } else {
        console.error("Fetch error details:", {
          name: fetchError.name,
          message: fetchError.message,
          code: fetchError.code
        });
        throw fetchError;
      }
    }

    // Extract data from axios response
    const llmData = llmRes.data;
    
    let botReplyContent = llmData.content || ""; // Initialize as empty string

    console.log("Raw LLM Data Content (before cleaning):", botReplyContent);

    // --- Robust Parsing and Cleaning ---
    let inferredTask = null;
    let inferredEmotion = null;

    // Use more specific regex to capture the JSON within the markers, and make it non-greedy
    const taskInferenceRegex = /TASK_INFERENCE:\s*(\{[\s\S]*?\})\s*?/g;
    const emotionLogRegex = /EMOTION_LOG:\s*(\{[\s\S]*?\})\s*?/g;

    // Extract and remove emotion log
    const emotionMatch = emotionLogRegex.exec(botReplyContent);
    if (emotionMatch && emotionMatch[1]) {
      try {
        inferredEmotion = JSON.parse(emotionMatch[1]);
        console.log("Parsed Inferred Emotion:", inferredEmotion);
        // Remove the matched emotion log string from the content
        botReplyContent = botReplyContent.replace(emotionMatch[0], "");
      } catch (jsonError) {
        console.error(
          "Failed to parse LLM's emotion log JSON. Raw content:",
          emotionMatch[1],
          "Error:",
          jsonError
        );
      }
    }

    // Extract and remove task inference
    const taskMatch = taskInferenceRegex.exec(botReplyContent);
    if (taskMatch && taskMatch[1]) {
      try {
        inferredTask = JSON.parse(taskMatch[1]);
        console.log("Parsed Inferred Task:", inferredTask);
        // Remove the matched task inference string from the content
        botReplyContent = botReplyContent.replace(taskMatch[0], "");
      } catch (jsonError) {
        console.error(
          "Failed to parse LLM's task inference JSON. Raw content:",
          taskMatch[1],
          "Error:",
          jsonError
        );
      }
    }

    // Remove any remaining unwanted tokens or extra whitespace/newlines
    botReplyContent = botReplyContent
      .replace(/<\|im_start\|>assistant\n?/g, "") // Remove the assistant token and potential newline
      .replace(/<\|im_start\|>user\n?/g, "") // Remove user token if it appears
      .replace(/<\|im_end\|>/g, "") // Remove end tokens
      .replace(/```json[\s\S]*?```/g, "") // Remove any JSON code blocks (if LLM outputs them in error)
      .replace(/(\r\n|\n|\r){2,}/g, "\n") // Replace multiple newlines with a single newline
      .trim(); // Trim leading/trailing whitespace

    console.log("Cleaned Bot Reply Content (for display):", botReplyContent);
    // --- End Robust Parsing and Cleaning ---

    // Save user message to ShortTermMemory
    await ShortTermMemory.create({
      userId,
      content: userPrompt,
      role: "user",
    });
    console.log("User message saved to ShortTermMemory.");

    // Save assistant reply to ShortTermMemory (cleaned content)
    await ShortTermMemory.create({
      userId,
      content: botReplyContent,
      role: "assistant",
    });
    console.log("Assistant reply saved to ShortTermMemory.");

    // Process inferred emotion
    if (inferredEmotion && inferredEmotion.emotion) {
      // Basic validation for emotion data
      const emotionToLog = {
        emotion: inferredEmotion.emotion,
        context: inferredEmotion.context || userPrompt, // Default context to user prompt if not provided
      };
      if (
        inferredEmotion.intensity &&
        inferredEmotion.intensity >= 1 &&
        inferredEmotion.intensity <= 10
      ) {
        emotionToLog.intensity = inferredEmotion.intensity;
      }

      await User.findByIdAndUpdate(userId, {
        $push: { emotionalLog: emotionToLog },
      });
      console.log(
        `Emotion "${inferredEmotion.emotion}" logged for user ${userId}.`
      );
    } else {
      console.log("No valid emotion inferred or emotion data found.");
    }

    // Process inferred task
    if (inferredTask && inferredTask.taskType) {
      // Basic validation for task parameters (optional, could be more extensive)
      const taskParameters =
        typeof inferredTask.parameters === "object"
          ? inferredTask.parameters
          : {};

      await Task.create({
        userId,
        taskType: inferredTask.taskType,
        parameters: taskParameters,
        status: "queued",
      });
      console.log(`Task "${inferredTask.taskType}" queued for user ${userId}.`);
    } else {
      console.log("No task inferred or valid task data found.");
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

// --- Task Processing Endpoint ---
// This endpoint is designed to be called periodically (e.g., by a cron job or a frontend poll)
app.get("/run-tasks", protect, async (req, res) => {
  const userId = req.user.id;
  try {
    const tasksToProcess = await Task.find({
      userId,
      status: "queued",
      runAt: { $lte: new Date() },
    })
      .sort({ priority: -1, createdAt: 1 }) // Process high priority, then older tasks
      .limit(5); // Process a batch of tasks to avoid long-running requests

    if (tasksToProcess.length === 0) {
      return res
        .status(200)
        .json({ status: "success", message: "No tasks to process." });
    }

    const results = [];
    for (const task of tasksToProcess) {
      // Use findOneAndUpdate with status check to prevent race conditions
      const updatedTask = await Task.findOneAndUpdate(
        { _id: task._id, status: "queued" },
        { $set: { status: "processing" } },
        { new: true } // Return the updated document
      );

      if (!updatedTask) {
        // Task was already picked up by another process or updated
        console.log(`Task ${task._id} already processed or status changed.`);
        continue;
      }

      console.log(
        `Processing task: ${updatedTask.taskType} (ID: ${updatedTask._id}) for user ${userId}`
      );
      let taskResult = "Task completed successfully.";
      let taskStatus = "completed";

      try {
        // --- Task Execution Logic (Simulated) ---
        // In a real application, this would involve calling external services,
        // complex data processing, etc.
        switch (updatedTask.taskType) {
          case "summarize_expenses":
            await new Promise((resolve) => setTimeout(resolve, 1500)); // Simulate async work
            taskResult = `Your weekly expenses summary: Groceries $150, Utilities $80, Entertainment $50.`;
            break;
          case "send_email_summary":
            await new Promise((resolve) => setTimeout(resolve, 2500)); // Simulate async work
            taskResult = `Summary of important unread emails: Meeting reminder from John, Project update from Sarah.`;
            break;
          case "summarize_emotions":
            // Example: Fetch and summarize user's emotional log
            const userEmotions = await User.findById(userId).select(
              "emotionalLog"
            );
            if (userEmotions && userEmotions.emotionalLog.length > 0) {
              const summary = userEmotions.emotionalLog
                .slice(-5) // Last 5 emotions for example
                .map(
                  (e) => `${e.emotion} on ${e.timestamp.toLocaleDateString()}`
                )
                .join(", ");
              taskResult = `Your recent emotional trends include: ${summary}.`;
            } else {
              taskResult = "No emotional history to summarize.";
            }
            break;
          // Add more task types as your application grows
          default:
            taskResult = `Unknown task type: ${updatedTask.taskType}.`;
            taskStatus = "failed";
            console.warn(
              `Attempted to process unknown task type: ${updatedTask.taskType}`
            );
            break;
        }
        // --- End Task Execution Logic ---
      } catch (taskErr) {
        console.error(`Error processing task ${task._id}:`, taskErr);
        taskResult = `Error processing task: ${taskErr.message}`;
        taskStatus = "failed";
      }

      // Update task status and result
      await Task.updateOne(
        { _id: updatedTask._id },
        { $set: { status: taskStatus, result: taskResult } }
      );
      results.push({
        taskId: updatedTask._id,
        taskType: updatedTask.taskType,
        status: taskStatus,
        result: taskResult,
      });

      console.log(
        `Task ${updatedTask.taskType} (ID: ${updatedTask._id}) ${taskStatus}. Result: ${taskResult}`
      );
    }

    res
      .status(200)
      .json({ status: "success", message: "Tasks processed.", results });
  } catch (err) {
    console.error("Error in /run-tasks endpoint:", err);
    res
      .status(500)
      .json({ status: "error", message: "Error running background tasks." });
  }
});

// --- Server Start ---
const PORT = process.env.PORT || 5000; // Use port from .env or default to 5000
app.listen(PORT, () => console.log(`✓API running → http://localhost:${PORT}`));
