# 🚀 Aether - Social Discovery Platform

**Intelligent AI chat with smart user profiling and friend matching system**

Built by Isaiah Pappas - A social platform that connects people through natural conversation and shared interests.

---

## 🌟 What is Aether?

Aether is a **social discovery platform** that uses AI to understand users through their conversations and intelligently connect them with compatible people. Users chat naturally with an engaging AI, which builds their profile behind the scenes and suggests meaningful connections.

### Key Differentiators
- **Natural Profiling**: Build user profiles through conversation, not surveys
- **Smart Matching**: Connect users based on shared interests and communication styles  
- **Engaging AI**: Witty, curious AI personality that feels like talking to a friend
- **Simple Connections**: Username-based friend system (@username style)

---

## 🎯 Core Features

### 🤖 **Intelligent AI Chat**
- **Enhanced Personality**: Witty, curious AI that adapts to user energy
- **Streaming Responses**: Real-time Server-Sent Events for smooth conversations
- **Web Search Integration**: AI automatically searches for current information when needed
- **File Support**: Images, PDFs, and text files up to 10MB

### 👥 **Smart Friend System** 
- **Username-Based**: Simple @username sharing (e.g., `@cool_gamer_123`)
- **Instant Connections**: Mutual friend requests with one click
- **Interest Display**: See shared interests with friends
- **Privacy-First**: Only show what users want to share

### 🧠 **Intelligent User Profiling**
- **Conversation Analysis**: Extracts interests from natural chat ("I love gaming")
- **Style Detection**: Analyzes communication patterns (casual, energetic, analytical)
- **Confidence Scoring**: Interest strength that evolves over time
- **Scalable Processing**: Queue-based batch analysis

### 🎯 **Smart Matching System**
- **Interest Compatibility**: Finds users with shared passions
- **Style Matching**: Compatible communication patterns
- **Match Explanations**: "Both interested in: gaming, programming"
- **Compatibility Scoring**: Multi-dimensional compatibility analysis

---

## 🏗️ Architecture

### **Tech Stack**
- **Backend**: Node.js + Express.js + MongoDB
- **AI**: OpenRouter (GPT-4o) with custom personality prompts
- **Authentication**: JWT with bcrypt password hashing
- **Real-time**: Server-Sent Events for streaming
- **Search**: SerpAPI + Google Custom Search integration
- **Processing**: Queue-based message analysis system

### **Project Structure**
```
aether-server/
├── src/
│   ├── models/
│   │   ├── User.js              # Users with friends & profiles
│   │   ├── Message.js           # Chat message storage
│   │   └── Conversation.js      # Conversation context
│   ├── routes/
│   │   ├── auth.js              # Authentication & username validation
│   │   ├── friends.js           # Friend management system
│   │   ├── matching.js          # User matching & profiling
│   │   ├── ai.js               # Standard AI chat
│   │   └── health.js           # System monitoring
│   ├── services/
│   │   ├── profileAnalyzer.js   # Interest & style extraction
│   │   ├── analysisQueue.js     # Scalable message processing
│   │   ├── matchingService.js   # Compatibility scoring
│   │   ├── aiService.js         # Enhanced AI personality
│   │   └── messageService.js    # Message persistence + queuing
│   ├── tools/
│   │   └── webSearchTool.js     # Intelligent web search
│   └── server-clean.js          # Main server entry point
├── CLAUDE.md                    # Technical documentation
└── README.md                    # This file
```

---

## 🚀 Quick Start

### **Prerequisites**
- Node.js 18+
- MongoDB (local or Atlas)
- OpenRouter API key

### **Installation**
```bash
git clone https://github.com/dorianinnovations/aether-server.git
cd aether-server
npm install
cp .env.example .env  # Configure your environment
npm run dev
```

### **Environment Setup**
```bash
# Required
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/aether
JWT_SECRET=your-super-secret-jwt-key
OPENROUTER_API_KEY=your-openrouter-api-key

# Optional (for web search)
SERPAPI_API_KEY=your-serpapi-key
GOOGLE_SEARCH_API_KEY=your-google-api-key
GOOGLE_SEARCH_ENGINE_ID=your-search-engine-id

# Server
PORT=5000
NODE_ENV=development
```

### **Development Commands**
```bash
npm run dev          # Start with auto-reload
npm start            # Production server
npm run lint         # Code linting
npm test             # Run tests (when available)
```

---

## 📡 API Reference

### **🔐 Authentication**
```bash
# Sign up (username required)
POST /auth/signup
{
  "email": "user@example.com",
  "password": "password123", 
  "username": "cool_user_123",
  "name": "John Doe"  # optional
}

# Check username availability
GET /auth/check-username/desired_username

# Login
POST /auth/login
{
  "email": "user@example.com",
  "password": "password123"
}
```

### **💬 AI Chat**
```bash
# Streaming chat (recommended)
POST /social-chat
Authorization: Bearer <token>
{
  "message": "I love gaming and programming!",
  "stream": true
}
# Returns: Server-Sent Events stream

# Standard chat
POST /ai/chat
Authorization: Bearer <token>
{
  "message": "Hello there!",
  "stream": false  
}
```

### **👥 Friends System**
```bash
# Get my username (shareable friend ID)
GET /friends/my-id
Authorization: Bearer <token>

# Look up a user
GET /friends/lookup/friend_username
Authorization: Bearer <token>

# Add friend by username
POST /friends/add
Authorization: Bearer <token>
{
  "username": "friend_username"
}

# Get friends list with interests
GET /friends/list
Authorization: Bearer <token>

# Remove friend
DELETE /friends/remove
Authorization: Bearer <token>
{
  "username": "friend_username"
}
```

### **🎯 Matching & Profiling**
```bash
# Find compatible users
GET /matching/find
Authorization: Bearer <token>

# View my analyzed profile
GET /matching/profile
Authorization: Bearer <token>

# Test profile analysis (debug)
POST /matching/test-analysis
Authorization: Bearer <token>
{
  "message": "I love gaming and coding"
}
```

### **🩺 Health Monitoring**
```bash
# Health check
GET /health

# Basic status
GET /
```

---

## 🧪 Testing the System

### **Complete Workflow Test**
```bash
# 1. Create user
TOKEN=$(curl -s -X POST http://localhost:5000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","username":"test_user"}' | \
  jq -r '.token')

# 2. Chat with interests (builds profile)
curl -s -X POST http://localhost:5000/social-chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"I love gaming and programming!","stream":true}'

# 3. Check generated profile
curl -s http://localhost:5000/matching/profile \
  -H "Authorization: Bearer $TOKEN" | jq .

# 4. Find matches
curl -s http://localhost:5000/matching/find \
  -H "Authorization: Bearer $TOKEN" | jq .

# 5. Get shareable username
curl -s http://localhost:5000/friends/my-id \
  -H "Authorization: Bearer $TOKEN" | jq .
```

---

## 🗄️ Database Schema

### **Users Collection**
```javascript
{
  _id: ObjectId,
  email: String (required, unique),
  password: String (hashed with bcrypt),
  username: String (required, unique, 3-30 chars),
  name: String (optional),
  isActive: Boolean (default: true),
  
  // Friends system
  friends: [{
    user: ObjectId (ref: User),
    addedAt: Date,
    status: String (enum: ['accepted'])
  }],
  
  // AI-generated profile
  profile: {
    interests: [{
      topic: String,
      confidence: Number (0-1 score),
      lastMentioned: Date
    }],
    communicationStyle: {
      casual: Number (0-1),
      energetic: Number (0-1),
      analytical: Number (0-1), 
      social: Number (0-1),
      humor: Number (0-1)
    },
    totalMessages: Number,
    lastAnalyzed: Date,
    compatibilityTags: [String],
    analysisVersion: String
  },
  
  createdAt: Date,
  updatedAt: Date
}
```

### **Messages Collection**
```javascript
{
  _id: ObjectId,
  user: ObjectId (ref: User),
  content: String (required),
  type: String (enum: ['user', 'ai']),
  aiModel: String (default: 'gpt-4o'),
  createdAt: Date,
  updatedAt: Date
}
```

---

## 🎨 How It Works

### **1. Natural Conversation**
Users chat with Aether's AI, which has an engaging personality designed to feel like talking to a witty, curious friend rather than a corporate chatbot.

### **2. Invisible Profiling** 
As users chat, the system analyzes their messages for:
- **Interests**: "I love gaming", "obsessed with music", "really into coding"
- **Communication Style**: Casual vs formal, energy level, humor usage
- **Social Patterns**: Question-asking, engagement level, conversation depth

### **3. Smart Matching**
The matching algorithm finds compatible users based on:
- **Interest Overlap**: Shared hobbies and passions
- **Style Compatibility**: Similar communication patterns
- **Engagement Level**: Compatible social energy

### **4. Meaningful Connections**
Instead of superficial matching, users get explanations like:
- "Both interested in: gaming, programming, music"
- "Similar communication style: casual and social"
- "Compatible energy levels for great conversations"

---

## 🚀 Deployment

### **Supported Platforms**
- **Render** (recommended): `render.yaml` configuration included
- **Railway**: `railway.json` configuration included  
- **Heroku**: `Procfile` configuration included
- **Self-hosted**: Docker support available

### **Environment Variables**
Set these in your deployment platform:
- `MONGO_URI`: MongoDB connection string
- `JWT_SECRET`: Secret key for JWT tokens
- `OPENROUTER_API_KEY`: OpenRouter API key for AI
- `PORT`: Server port (automatically set on most platforms)

---

## 🔒 Security & Privacy

### **Security Features**
- JWT authentication with secure token handling
- Password hashing with bcrypt (12 rounds)
- Rate limiting to prevent abuse
- Input validation and sanitization
- CORS configuration for web security
- Security headers via Helmet.js

### **Privacy Approach**
- **No Personal Data Mining**: Only analyzes public conversation patterns
- **User Control**: Users can see exactly what's in their profile
- **Interest-Based Only**: No invasive personal information collection
- **Transparent Matching**: Clear explanations for why users are matched

---

## 🛠️ Development

### **Key Design Principles**
1. **Privacy-First**: Build profiles through natural conversation, not invasive data collection
2. **Scalable**: Queue-based processing that grows with user base
3. **Engaging**: AI personality that makes conversations enjoyable
4. **Simple**: Username-based connections everyone understands

### **Contributing**
This is a personal project by Isaiah Pappas. Feel free to fork and create your own version!

### **Architecture Decisions**
- **Unified Identifiers**: Username serves as both username and friend ID
- **Batch Processing**: Async message analysis for scalability  
- **Confidence Scoring**: Interest strength that decays over time for relevance
- **Streaming First**: Real-time responses for better user experience

---

## 📈 Roadmap

### **Current Status: MVP Complete**
✅ AI Chat with personality  
✅ User profiling system  
✅ Friend connections  
✅ Smart matching algorithm  
✅ Username-based identity  

### **Future Enhancements**
- 🔄 Real-time notifications
- 💬 Direct messaging between friends
- 🎨 User customizable profiles
- 📊 Advanced analytics dashboard
- 🌍 Interest-based communities
- 📱 Mobile app development

---

## 📞 Contact & Support

**Developer**: Isaiah Pappas  
**Project**: Aether Social Discovery Platform  
**Focus**: Connecting people through intelligent conversation

---

*Built with ❤️ to create meaningful connections in a digital world*