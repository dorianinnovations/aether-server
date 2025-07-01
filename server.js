import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { body, validationResult } from "express-validator";
import bcrypt from "bcrypt";

import fetch from "node-fetch";

const app = express();
dotenv.config();

// ── 1.  Global middleware
app.use(
  cors({
    origin: function (origin, callback) {
      const allowedOrigins = [
        "https://leafy-centaur-370c2f.netlify.app",
        "http://localhost:5173",
        "http://localhost:5000",
      ];
      console.log("CORS origin:", origin);
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use(helmet());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 100, // 100 requests / window / IP
  })
);

// ── 2.  DB & user model
await mongoose.connect(process.env.MONGO_URI);
console.log("✓MongoDB connected");

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 8 },
  profile: {
    type: Map,
    of: String,
    default: {},
  },
});
const User = mongoose.model("User", userSchema);

// --- Short-Term Memory Schema  ---
const shortTermMemorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  conversationId: { type: String, required: false }, // To segment memory by conversation
  timestamp: { type: Date, default: Date.now, expires: "24h" }, // TTL index for short-term memory
  content: { type: String, required: true },
  role: { type: String, enum: ["user", "assistant"], required: true },
});
const ShortTermMemory = mongoose.model(
  "ShortTermMemory",
  shortTermMemorySchema
);

// --- Task Queue Schema ---
const taskSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  taskType: { type: String, required: true }, // e.g., 'summarize_emails', 'weekly_expense_report'
  status: {
    type: String,
    enum: ["queued", "processing", "completed", "failed"],
    default: "queued",
  },
  createdAt: { type: Date, default: Date.now },
  runAt: { type: Date, default: Date.now }, // For scheduled tasks
  parameters: { type: Map, of: String }, // Any parameters for the task
  result: { type: String }, // Store task results
  priority: { type: Number, default: 0 }, // Optional: for task prioritization
});
// Index for efficient polling by workers
taskSchema.index({ runAt: 1, status: 1 });
const Task = mongoose.model("Task", taskSchema);

// ── 3.  Helper: create JWT
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES,
  });

// ── 4.  Auth routes
app.post(
  "/signup",
  [
    body("email").isEmail().withMessage("Valid e-mail required"),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password ≥ 8 chars required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });
    // destructure input
    const { email, password } = req.body;
    // check if user already exists
    try {
      if (await User.findOne({ email }))
        return res.status(409).json({ message: "Email already used" });
      // hash password
      const hashed = await bcrypt.hash(password, 12);
      const user = await User.create({ email, password: hashed });

      // respond with JWT
      res.status(201).json({ token: signToken(user._id) });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

app.post(
  "/login",
  [body("email").isEmail(), body("password").notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;

    try {
      const user = await User.findOne({ email });
      if (!user || !(await bcrypt.compare(password, user.password)))
        return res.status(401).json({ message: "Invalid credentials" });

      res.json({ token: signToken(user._id) });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// ── 5.  Auth-guard middleware & protected demo route
const protect = (req, res, next) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ message: "No token" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

app.get("/profile", protect, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json(user);
});

// ---  LLM Completion and Task Inference Endpoint ---
app.post("/completion", protect, async (req, res) => {
  const userId = req.user.id;
  const userPrompt = req.body.prompt;
  const stop = req.body.stop || ["<|im_end|>"];
  const n_predict = req.body.n_predict || 2048;
  const temperature = req.body.temperature || 0.8;

  try {
    // 1. Fetch user's profile and relevant long-term memory
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    const userProfile = user.profile ? JSON.stringify(user.profile) : "{}";

    // 2. Fetch recent short-term memory (conversation history) for context
    const recentMemory = await ShortTermMemory.find({ userId })
      .sort({ timestamp: 1 })
      .limit(10) // Adjust as needed to manage context window [cite: 2]
      .lean();

    const conversationHistory = recentMemory
      .map((mem) => `${mem.role}\n${mem.content}`)
      .join("\n");

    // 3. Construct the LLM prompt with memory and user intent inference instructions
    const fullPrompt = `
    You are Numina, an AI assistant focused on understanding user emotions and automating tasks.
    User Profile: ${userProfile}
    Conversation History:
    ${conversationHistory}

    Based on the user's input, perform the following:
    1. Respond to the user's message with a warm friendly greeting.
    2. Identify if the user is asking for a specific task to be performed (e.g., "summarize my expenses", "send me my weekly report", "check my unread emails").
    3. If a task is inferred, output a JSON object in a separate line at the end of your response, starting with "TASK_INFERENCE:".
       The JSON should have a "taskType" and "parameters" field.
       Example: {"taskType": "summarize_expenses", "parameters": {"period": "weekly"}}
       Example: {"taskType": "send_email_summary", "parameters": {"filter": "unread", "category": "important"}}

    <|im_start|>user
    ${userPrompt}
    <|im_end|>
    <|im_start|>assistant
    `;

    // 4. Send request to llama.cpp backend
    const llamaCppApiUrl =
      process.env.LLAMA_CPP_API_URL || "http://localhost:8000/completion";
    const llmRes = await fetch(llamaCppApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: fullPrompt,
        stop: stop,
        n_predict: n_predict,
        temperature: temperature,
        // This is where to can place other llama.cpp parameters as necessary, e.g., top_k, top_p, repeat_penalty
      }),
    });

    const llmData = await llmRes.json();
    let botReplyContent = llmData.content || "[No response from model]";

    // 5. Save user message to short-term memory
    await ShortTermMemory.create({
      userId,
      content: userPrompt,
      role: "user",
      // conversationId: 'some_id_if_needed'
    });

    // 6. Extract potential task inference from the LLM's response
    let inferredTask = null;
    const taskInferenceRegex = /TASK_INFERENCE:(\{.*\})/;
    const match = botReplyContent.match(taskInferenceRegex);

    if (match && match[1]) {
      try {
        inferredTask = JSON.parse(match[1]);
        // Remove the task inference string from the bot's reply
        botReplyContent = botReplyContent
          .replace(taskInferenceRegex, "")
          .trim();
      } catch (jsonError) {
        console.error("Failed to parse LLM's task inference JSON:", jsonError);
      }
    }

    // 7. Save assistant reply to short-term memory
    await ShortTermMemory.create({
      userId,
      content: botReplyContent,
      role: "assistant",
      // conversationId: 'some_id_if_needed'
    });

    // 8. If a task was inferred, queue it in the Task collection
    if (inferredTask && inferredTask.taskType) {
      await Task.create({
        userId,
        taskType: inferredTask.taskType,
        parameters: inferredTask.parameters,
        status: "queued", // Set initial status
        // runAt: new Date(Date.now() + 5000) // Example: schedule for 5 seconds later
      });
      console.log(`Task "${inferredTask.taskType}" queued for user ${userId}.`);
    }

    // 9. Send the clean bot reply to the frontend
    res.json({ content: botReplyContent });
  } catch (err) {
    console.error("Error in /completion endpoint:", err);
    res.status(500).json({ message: "Error processing LLM request." });
  }
});

app.get("/run-tasks", protect, async (req, res) => {
  const userId = req.user.id;
  try {
    // Find queued tasks for the user
    const tasksToProcess = await Task.find({
      userId,
      status: "queued",
      runAt: { $lte: new Date() }, // Tasks ready to be run
    }).sort({ priority: -1, createdAt: 1 });

    if (tasksToProcess.length === 0) {
      return res.status(200).json({ message: "No tasks to process." });
    }

    const results = [];
    for (const task of tasksToProcess) {
      const updatedTask = await Task.findOneAndUpdate(
        { _id: task._id, status: "queued" },
        { $set: { status: "processing" } },
        { new: true }
      );

      if (!updatedTask) {
        continue;
      }

      console.log(
        `Processing task: ${updatedTask.taskType} for user ${userId}`
      );
      let taskResult = "Task completed successfully.";
      let taskStatus = "completed";

      try {
        // --- Simulate Task Execution ---
        if (updatedTask.taskType === "summarize_expenses") {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          taskResult = `Your weekly expenses summary: Groceries $150, Utilities $80, Entertainment $50.`;
        } else if (updatedTask.taskType === "send_email_summary") {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          taskResult = `Summary of important unread emails: Meeting reminder from John, Project update from Sarah.`;
        } else {
          taskResult = `Unknown task type: ${updatedTask.taskType}.`;
          taskStatus = "failed";
        }
        // --- End Simulation ---
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
        `Task ${updatedTask.taskType} completed. Result: ${taskResult}`
      );
    }

    res.status(200).json({ message: "Tasks processed.", results });
  } catch (err) {
    console.error("Error in /run-tasks endpoint:", err);
    res.status(500).json({ message: "Error running background tasks." });
  }
});

// ── 6.  Start server
app.listen(process.env.PORT, () =>
  console.log(`API running → http://localhost:${process.env.PORT}`)
);
