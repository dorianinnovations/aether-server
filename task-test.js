// Test script for task inference and processing functionality
import axios from 'axios';
import readline from 'readline';

// Constants
const BASE_URL = 'http://localhost:5000';
let token = '';

// Create readline interface for interactive testing
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Utility to prompt user for input
const askQuestion = (question) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
};

// Login function to get a JWT token
const login = async (email, password) => {
  try {
    const response = await axios.post(`${BASE_URL}/login`, {
      email,
      password
    });
    
    if (response.data && response.data.token) {
      console.log('✅ Login successful');
      return response.data.token;
    } else {
      console.error('❌ Login failed: No token received');
      return null;
    }
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data?.message || error.message);
    return null;
  }
};

// Function to send a prompt to the completion endpoint
const sendPrompt = async (prompt) => {
  try {
    const response = await axios.post(
      `${BASE_URL}/completion`,
      { prompt },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    console.log('\n==== ASSISTANT RESPONSE ====');
    console.log(response.data.content);
    console.log('============================\n');
    return response.data;
  } catch (error) {
    console.error('❌ Completion failed:', error.response?.data?.message || error.message);
    return null;
  }
};

// Function to check for queued tasks
const checkTasks = async () => {
  try {
    const response = await axios.get(
      `${BASE_URL}/run-tasks`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    
    console.log('\n==== TASK CHECK RESULTS ====');
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
    console.log('============================\n');
    return response.data;
  } catch (error) {
    console.error('❌ Task check failed:', error.response?.data?.message || error.message);
    return null;
  }
};

// Main test function
const runTest = async () => {
  console.log('🧪 NUMINA TASK SYSTEM TEST');
  console.log('=========================\n');
  
  // Get user credentials
  const email = await askQuestion('Enter your email: ');
  const password = await askQuestion('Enter your password: ');
  
  // Login
  token = await login(email, password);
  if (!token) {
    console.log('❌ Test aborted: Cannot proceed without authentication');
    rl.close();
    return;
  }
  
  let running = true;
  while (running) {
    console.log('\n📝 Choose an action:');
    console.log('1. Send a prompt that should trigger task inference');
    console.log('2. Check for queued tasks');
    console.log('3. Exit');
    
    const choice = await askQuestion('\nYour choice (1-3): ');
    
    switch (choice) {
      case '1':
        console.log('\n✏️ Enter a prompt that should trigger task inference.');
        console.log('Suggestions:');
        console.log('- "Can you remind me to call John tomorrow at 3pm?"');
        console.log('- "I\'ve been feeling sad lately, can you analyze my emotions?"');
        console.log('- "Summarize my recent emotional state."');
        
        const prompt = await askQuestion('\nYour prompt: ');
        await sendPrompt(prompt);
        break;
        
      case '2':
        await checkTasks();
        break;
        
      case '3':
        console.log('\n👋 Exiting test.');
        running = false;
        break;
        
      default:
        console.log('\n❌ Invalid choice. Please enter 1, 2, or 3.');
    }
  }
  
  rl.close();
};

// Run the test
runTest().catch(error => {
  console.error('Unhandled error:', error);
  rl.close();
});
