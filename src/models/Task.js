import mongoose from "mongoose";

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

export default Task; 