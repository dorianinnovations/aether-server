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

# Deep link redirect Tue Aug  5 07:20:34 PM PDT 2025
