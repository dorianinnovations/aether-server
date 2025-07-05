import mongoose from "mongoose";

const shortTermMemorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  conversationId: { type: String, required: false, index: true },
  timestamp: { type: Date, default: Date.now, expires: "24h" }, 
  content: { type: String, required: true },
  role: { type: String, enum: ["user", "assistant"], required: true },
});

const ShortTermMemory = mongoose.model(
  "ShortTermMemory",
  shortTermMemorySchema
);
console.log("✓ShortTermMemory schema and model defined.");

export default ShortTermMemory; 