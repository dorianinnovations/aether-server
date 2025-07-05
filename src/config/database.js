import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// Database Connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      // Add optimization options for MongoDB connection
      maxPoolSize: 10, // Connection pool size for better concurrency
      serverSelectionTimeoutMS: 5000, // Faster server selection timeout
      socketTimeoutMS: 45000, // Socket timeout
      family: 4, // Use IPv4, avoid slow IPv6 lookups
    });
    console.log("✓MongoDB connected successfully.");
  } catch (err) {
    console.error("✗ MongoDB connection error:", err);
    process.exit(1); // Exit process if DB connection fails
  }
};

export default connectDB; 