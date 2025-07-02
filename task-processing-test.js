// Test script for task processing functionality directly
import axios from 'axios';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

// Constants
const BASE_URL = 'http://localhost:5000';

// Connect to MongoDB
const connectToMongo = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');
    return true;
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    return false;
  }
};

// Create Task schema
const taskSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  taskType: { type: String, required: true, trim: true },
  status: {
    type: String,
    enum: ['queued', 'processing', 'completed', 'failed'],
    default: 'queued',
  },
  createdAt: { type: Date, default: Date.now },
  runAt: { type: Date, default: Date.now },
  parameters: { type: Map, of: String },
  result: { type: String },
  priority: { type: Number, default: 0, min: 0, max: 10 },
});
const Task = mongoose.model('Task', taskSchema);

// Create User schema (simplified, just for testing)
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  emotionalLog: [
    {
      emotion: { type: String, required: true },
      intensity: { type: Number, min: 1, max: 10 },
      context: { type: String },
      timestamp: { type: Date, default: Date.now },
    },
  ],
});
const User = mongoose.model('User', userSchema);

// Get a valid user from DB
const getTestUser = async () => {
  try {
    const user = await User.findOne().sort({ _id: 1 }).limit(1);
    if (!user) {
      console.error('❌ No users found in database');
      return null;
    }
    console.log(`✅ Found test user: ${user._id} (${user.email})`);
    return user;
  } catch (error) {
    console.error('❌ Failed to find test user:', error.message);
    return null;
  }
};

// Create test tasks
const createTestTasks = async (userId) => {
  try {
    // Clear any existing test tasks
    await Task.deleteMany({ 
      userId,
      taskType: { $in: ['test_task_1', 'test_task_2', 'test_task_3'] }
    });
    
    const tasks = [
      {
        userId,
        taskType: 'test_task_1',
        status: 'queued',
        runAt: new Date(),
        parameters: new Map([['param1', 'value1']]),
        priority: 5,
      },
      {
        userId,
        taskType: 'test_task_2',
        status: 'queued',
        runAt: new Date(),
        parameters: new Map([['param2', 'value2']]),
        priority: 8,
      },
      {
        userId,
        taskType: 'test_task_3',
        status: 'queued',
        runAt: new Date(),
        parameters: new Map([['param3', 'value3']]),
        priority: 3,
      },
    ];
    
    const createdTasks = await Task.insertMany(tasks);
    console.log(`✅ Created ${createdTasks.length} test tasks`);
    return createdTasks;
  } catch (error) {
    console.error('❌ Failed to create test tasks:', error.message);
    return [];
  }
};

// Get JWT token
const getAuthToken = async (userId) => {
  // For test purposes, we're using a direct call to the server's signToken function
  // In a real scenario, you would use the login endpoint
  const jwt = await import('jsonwebtoken');
  return jwt.default.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
};

// Run the task processing endpoint
const runTaskProcessor = async (token) => {
  try {
    const response = await axios.get(`${BASE_URL}/run-tasks`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('\n==== TASK PROCESSING RESULTS ====');
    console.log('Status:', response.data.status);
    console.log('Message:', response.data.message);
    
    if (response.data.results && response.data.results.length > 0) {
      console.log('\nTasks processed:');
      response.data.results.forEach((task, index) => {
        console.log(`\n[Task ${index + 1}]`);
        console.log(`- ID: ${task.taskId}`);
        console.log(`- Type: ${task.taskType}`);
        console.log(`- Status: ${task.status}`);
        console.log(`- Result: ${task.result}`);
      });
    }
    console.log('================================\n');
    
    return response.data;
  } catch (error) {
    console.error('❌ Task processing failed:', error.response?.data || error.message);
    return null;
  }
};

// Main test function
const runTest = async () => {
  console.log('🧪 NUMINA TASK PROCESSING SYSTEM TEST');
  console.log('===================================\n');
  
  // Connect to MongoDB
  const connected = await connectToMongo();
  if (!connected) {
    console.error('❌ Test aborted: Cannot proceed without database connection');
    return;
  }
  
  // Get a test user
  const user = await getTestUser();
  if (!user) {
    console.error('❌ Test aborted: Cannot proceed without a test user');
    await mongoose.disconnect();
    return;
  }
  
  // Create test tasks
  const tasks = await createTestTasks(user._id);
  if (tasks.length === 0) {
    console.error('❌ Test aborted: Failed to create test tasks');
    await mongoose.disconnect();
    return;
  }
  
  // Get auth token
  const token = await getAuthToken(user._id);
  if (!token) {
    console.error('❌ Test aborted: Failed to generate authentication token');
    await mongoose.disconnect();
    return;
  }
  
  // Run task processor
  await runTaskProcessor(token);
  
  // Verify task statuses
  const updatedTasks = await Task.find({
    _id: { $in: tasks.map(t => t._id) }
  });
  
  console.log('\n==== TASK STATUS VERIFICATION ====');
  updatedTasks.forEach(task => {
    console.log(`Task ${task._id} (${task.taskType}): ${task.status}`);
    if (task.result) {
      console.log(`Result: ${task.result}`);
    }
  });
  console.log('=================================\n');
  
  // Cleanup
  await mongoose.disconnect();
  console.log('✅ Test completed, database connection closed');
};

// Run the test
runTest().catch(error => {
  console.error('Unhandled error:', error);
  mongoose.disconnect();
});
