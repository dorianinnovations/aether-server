# Aether AI Server Documentation

## 🧪 CRITICAL GPT-5 MEMORY & CONTEXT TESTS
**Run these tests to verify AI memory, context awareness, and conversation continuity:**

### Essential Memory Tests:
1. **"What did I just say?"** - Test immediate memory of last user message
2. **"Who are you?"** - Test identity awareness and platform understanding  
3. **"What do you do?"** - Test role comprehension and feature explanation
4. **"What is this platform?"** - Test broader system understanding
5. **"What is this?"** - Test contextual awareness of current conversation
6. **"Who am I?"** - Test user identification and profile recall
7. **"What's my info?"** - Test access to user data and context
8. **"What can we do with my info you have on me?"** - Test data usage understanding

**Expected Results:** GPT-5 should demonstrate perfect recall of conversation context, understand its role as Aether social proxy, identify user correctly, and explain data usage appropriately.

---

## Current Status: SOCIAL PROXY PLATFORM 🔥

**Server Version**: AI-Powered Social Proxy with RAG Memory & Friend Messaging  
**Status**: FULLY PIVOTED - Personal AI Social Proxy for Friends & Family  
**Entry Point**: `src/server.js`  
**Architecture**: Express.js + MongoDB + OpenRouter + Spotify + RAG Memory + Real-time Messaging

---

## 🔥 REVOLUTIONARY SOCIAL PROXY FEATURES

### ✅ AI-Powered Social Proxy System
- **Living Digital Extension**: AI represents you when you're not online
- **Dynamic Status Updates**: Current mood, plans, and activities
- **Personalized AI Personality**: Learns your communication style and interests
- **Friend/Family Access**: Close connections can check your proxy for updates
- **Privacy-First**: You control what your proxy shares and with whom

### ✅ RAG Memory System (NEW)
- **Persistent Memory**: AI remembers facts, preferences, and context across conversations
- **Vector Embeddings**: Semantic search through conversation history
- **Auto-Distillation**: Key facts automatically extracted and stored
- **Memory Types**: Profile, preferences, projects, facts, tasks, contacts, custom
- **Salience Scoring**: Important memories weighted higher

### ✅ Real-time Friend Messaging (NEW)
- **Direct Friend Chat**: Send messages directly to friends
- **GitHub-style Heat Map**: Track daily conversation activity
- **Conversation Streaks**: Monitor active communication patterns
- **Message History**: Store last 50 messages per friendship
- **Read/Delivery Status**: Track message delivery and read receipts

### ✅ Spotify Integration & Music Sharing
- **Real-Time Music Status**: Currently playing tracks visible to friends
- **Musical Taste Profile**: Recent favorites and top tracks
- **Social Music Discovery**: Share favorite songs with context
- **Automatic Updates**: Spotify data refreshes to keep proxy current
- **Activity Timeline**: Music discoveries appear in friend feeds

### ✅ Living Social Timeline  
- **Friend Activity Feed**: See real updates from friends' proxies
- **Authentic Updates**: Status changes, new music, mood updates
- **Social Engagement**: React and comment on friends' activities
- **Non-Performative**: Genuine social connection, not social media theater

### ✅ Enhanced Authentication & Friends
- JWT-based authentication with username system
- Friend connections for family and close friends
- Privacy controls for proxy visibility
- Username-based friend discovery and management
- Onboarding flow with welcome system

### ✅ User Badge System (NEW)
- **Achievement Badges**: Founder, OG, and other special recognition
- **Visibility Control**: Users can show/hide badges
- **Admin Management**: Badge awarding and statistics

### ✅ Intelligent AI Chat with Context
- **Contextual Conversations**: AI knows your current status and interests
- **Social Proxy Mode**: AI can represent you to friends authentically
- **Smart Personalization**: Adapts to your communication style
- **Web Search Integration**: AI stays current with real-world information
- **File Upload Support**: Images, PDFs, documents in conversations

---

## Architecture Overview

### Database Models
- **User** (`src/models/User.js`) - Complete social proxy profile with Spotify, friends, messaging history
- **Conversation** (`src/models/Conversation.js`) - AI conversations with embedded messages and auto-distillation
- **Activity** (`src/models/Activity.js`) - Social timeline events, reactions, and engagement
- **UserMemory** (`src/models/UserMemory.js`) - RAG memory system with vector embeddings
- **UserBadge** (`src/models/UserBadge.js`) - User achievement and recognition system

### API Routes
- **Authentication** (`src/routes/auth.js`) - User signup/login with username system and onboarding
- **Conversation** (`src/routes/conversation.js`) - AI conversation management and history
- **Social Proxy** (`src/routes/socialProxy.js`) - Profile updates, timeline, friend viewing
- **Spotify Integration** (`src/routes/spotify.js`) - Music connection and sharing
- **Social Chat** (`src/routes/socialChat.js`) - AI proxy conversations with context
- **Friends Management** (`src/routes/friends.js`) - Friend connections and discovery
- **Friend Messaging** (`src/routes/friendMessaging.js`) - Direct friend-to-friend messaging
- **Memory** (`src/routes/memory.js`) - RAG memory storage and retrieval
- **User Management** (`src/routes/user.js`) - Profile, settings, and image management
- **Badges** (`src/routes/badges.js`) - User badge management and admin controls
- **Notifications** (`src/routes/notifications.js`) - Real-time notification streaming
- **Health & Monitoring** (`src/routes/health.js`) - System status endpoints
- **Preview** (`src/routes/preview.js`) - Image preview generation

### Core Services
- **AI Service** (`src/services/aiService.js`) - Contextual social proxy AI personality
- **Conversation Service** (`src/services/conversationService.js`) - Conversation management and persistence
- **RAG Memory Service** (`src/services/ragMemoryService.js`) - Vector-based memory storage and retrieval
- **Friend Messaging Service** (`src/services/friendMessagingService.js`) - Friend-to-friend messaging with activity tracking
- **Spotify Service** (`src/services/spotifyService.js`) - Music integration and data sync
- **Spotify Live Service** (`src/services/spotifyLiveService.js`) - Real-time music status updates
- **Profile Analyzer** (`src/services/profileAnalyzer.js`) - Personality learning from conversations
- **Analysis Queue** (`src/services/analysisQueue.js`) - Background personality analysis
- **LLM Service** (`src/services/llmService.js`) - OpenRouter API integration
- **Real-time Messaging** (`src/services/realTimeMessaging.js`) - WebSocket message delivery
- **Notification Service** (`src/services/notificationService.js`) - Real-time notifications via SSE
- **File Processing** (`src/services/fileProcessingService.js`) - File upload and processing
- **File Validation** (`src/services/fileValidationService.js`) - Upload validation and security
- **Redis Service** (`src/services/redisService.js`) - Caching and session management

### Tools & Integrations
- **Web Search** (`src/tools/webSearchTool.js`) - Real-time information for AI conversations
- **Spotify API** - Music taste and current listening integration

---

## 🧠 Social Proxy Intelligence System

### Living Profile Learning
1. **Conversation Analysis**: Every chat message builds your AI proxy's understanding
2. **Interest Detection**: Learns what you're passionate about through natural conversation
3. **Communication Style**: Adapts to match your casual/formal, energetic/chill personality
4. **Music Integration**: Spotify data adds another dimension to your social personality
5. **Real-Time Updates**: Status and mood changes keep your proxy current

### RAG Memory Integration
```javascript
// User chats with AI → learns personality and stores memories
await conversationService.addMessage(conversationId, userMessage);
// → AI analyzes and responds with context
// → Auto-distillation extracts key facts to RAG memory
// → Memory searchable via vector embeddings
// → AI uses memories in future conversations
```

### Authentic Social Representation
- **Personality Mirroring**: AI represents your actual communication style
- **Interest Sharing**: Friends see what you're genuinely interested in
- **Music Taste**: Current listening habits visible to connections
- **Status Updates**: Real-time mood and activity sharing
- **Privacy Control**: You decide what your proxy shares and with whom

---

## Environment Configuration

### Required Environment Variables
```bash
# Database
MONGO_URI=mongodb://localhost:27017/aether-ai

# Authentication
JWT_SECRET=your-jwt-secret

# AI Service
OPENROUTER_API_KEY=your-openrouter-api-key

# Web Search (Optional)
SERPAPI_API_KEY=your-serpapi-key
GOOGLE_SEARCH_API_KEY=your-google-api-key
GOOGLE_SEARCH_ENGINE_ID=your-search-engine-id

# Spotify Integration (CORE FEATURE)
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret
SPOTIFY_REDIRECT_URI=http://localhost:3000/spotify/callback

# Server
PORT=5000
NODE_ENV=production
```

---

## 🚀 API Endpoints

### Authentication & Onboarding
- `POST /auth/signup` - User registration with username
- `POST /auth/login` - User authentication  
- `GET /auth/check-username/:username` - Check username availability
- `POST /auth/onboarding/mark-welcome-seen` - Mark welcome as seen
- `POST /auth/onboarding/complete` - Complete onboarding
- `GET /auth/onboarding/status` - Get onboarding status

### Conversation Management
- `GET /conversation/conversations/recent` - Get recent conversations
- `GET /conversation/conversations/:id` - Get specific conversation
- `POST /conversation/conversations` - Create new conversation
- `POST /conversation/conversations/:id/messages` - Add message to conversation
- `DELETE /conversation/conversations/:id` - Delete conversation
- `PUT /conversation/conversations/:id/title` - Update conversation title

### Social Proxy System
- `GET /social-proxy/profile` - Get your social proxy profile
- `POST /social-proxy/status` - Update status, plans, and mood
- `GET /social-proxy/timeline` - Get friend activity timeline
- `GET /social-proxy/friend/:username` - View friend's social proxy
- `POST /social-proxy/activity/:id/react` - React to friend activities
- `POST /social-proxy/activity/:id/comment` - Comment on activities
- `POST /social-proxy/posts` - Create social posts

### Spotify Integration
- `GET /spotify/auth` - Get Spotify authorization URL
- `GET /spotify/callback` - Handle Spotify OAuth callback
- `POST /spotify/mobile-callback` - Handle mobile Spotify auth
- `POST /spotify/disconnect` - Disconnect Spotify account
- `GET /spotify/status` - Get current Spotify connection status
- `POST /spotify/refresh` - Manually refresh Spotify data
- `POST /spotify/share-track` - Share a specific track with friends
- `GET /spotify/live-status/:username` - Get friend's live music status

### AI Chat (Context-Aware)
- `POST /social-chat` - AI chat with social proxy context and file support
  - Knows your current status and music
  - Adapts to your communication style
  - Can represent you to friends authentically
  - Supports file uploads (images, PDFs, documents)

### Friends System
- `GET /friends/my-username` - Get your username
- `GET /friends/my-id` - Get your user ID
- `GET /friends/lookup/:username` - Find friends by username
- `POST /friends/add` - Add friend connections
- `GET /friends/list` - Get friends list
- `DELETE /friends/remove` - Remove friend
- `GET /friends/requests` - Get friend requests

### Friend Messaging
- `POST /friend-messaging/send` - Send message to friend
- `GET /friend-messaging/conversation/:username` - Get conversation with friend
- `GET /friend-messaging/conversations` - Get all conversations
- `GET /friend-messaging/heat-map/:username` - Get messaging heat map
- `GET /friend-messaging/stats/:username` - Get messaging statistics
- `POST /friend-messaging/mark-read` - Mark messages as read
- `GET /friend-messaging/streaks` - Get conversation streaks

### Memory System
- `POST /memory/store` - Store memory manually
- `POST /memory/search` - Search memories
- `GET /memory/stats` - Get memory statistics
- `DELETE /memory/clear` - Clear all memories
- `POST /memory/auto-store/:conversationId` - Auto-store from conversation

### User Management
- `GET /user/profile` - Get user profile
- `PUT /user/profile` - Update user profile
- `GET /user/settings` - Get user settings
- `POST /user/settings` - Update user settings
- `POST /user/profile-photo` - Upload profile photo
- `POST /user/banner-image` - Upload banner image
- `GET /user/images` - Get user images
- `DELETE /user/profile-photo` - Delete profile photo
- `DELETE /user/banner-image` - Delete banner image

### Badge System
- `GET /badges/user/:userId` - Get user's badges
- `GET /badges/my-badges` - Get current user's badges
- `POST /badges/user/:userId/award` - Award badge to user
- `DELETE /badges/user/:userId/:badgeType` - Remove badge from user
- `PUT /badges/:badgeId/visibility` - Update badge visibility

### Notifications
- `GET /notifications/stream` - SSE notification stream
- `GET /notifications/stats` - Get notification stats
- `POST /notifications/test` - Send test notification

### Health & Monitoring
- `GET /health` - System health check
- `GET /health/llm` - LLM service health
- `GET /health/audit` - System audit
- `GET /health/status` - Detailed status
- `GET /` - Basic server status

---

## Testing & Development

### Quick Health Check
```bash
curl -s http://localhost:5000/health | jq .
```

### Complete System Test
```bash
# Create user with username
TOKEN=$(curl -s -X POST http://localhost:5000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","username":"test_user"}' | \
  jq -r '.token')

# Test AI chat with context
curl -s -X POST http://localhost:5000/social-chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"I love gaming and programming!","stream":true}'

# Get social proxy profile
curl -s http://localhost:5000/social-proxy/profile \
  -H "Authorization: Bearer $TOKEN"

# Get friend ID
curl -s http://localhost:5000/friends/my-username \
  -H "Authorization: Bearer $TOKEN"

# Search memories
curl -s -X POST http://localhost:5000/memory/search \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"gaming"}'
```

### Development Commands
```bash
# Start development server
npm run dev

# Start production server  
npm start

# Run linting
npm run lint

# Run tests
npm test
```

---

## Key Features

### Memory & Context System
- **RAG Memory**: Vector-based semantic memory with auto-distillation
- **Conversation Context**: Full conversation history with message persistence
- **Profile Learning**: Dynamic personality analysis and adaptation
- **Contextual AI**: AI responses informed by user history and preferences

### Social Features
- **Friend Messaging**: Direct messaging with activity tracking and streaks
- **Social Timeline**: Activity feeds with reactions and comments
- **Music Sharing**: Spotify integration with real-time status
- **Badge System**: Achievement recognition and social status

### File & Media Support
- Support for images (JPEG, PNG, WebP, GIF)
- PDF and text file processing
- 10MB per file limit, 5 files per request
- Base64 encoding for images
- Sharp-based image processing

### Web Search Integration
- Automatic query analysis to determine when search is needed
- SerpAPI and Google Custom Search fallbacks
- Content extraction from search results
- Smart context filtering to avoid unnecessary searches

---

## Architecture Notes

### Current Implementation Strengths:
1. **RAG Memory System**: Sophisticated vector-based memory with auto-distillation
2. **Real-time Messaging**: Full friend messaging with activity tracking
3. **Comprehensive API**: Complete REST API with proper authentication
4. **File Upload Support**: Multi-format file processing and validation
5. **Social Features**: Timeline, reactions, comments, and engagement tracking

### Database Schema

#### Key Collections:
- **Users**: Complete social profiles with embedded friend messaging history
- **Conversations**: AI chat history with embedded messages and auto-distillation hooks
- **Activities**: Social timeline events with reactions and comments
- **UserMemory**: Vector-based memories with embeddings and salience scoring
- **UserBadge**: Achievement system with admin controls

#### Notable Schema Features:
- **No separate Messages collection** - messages embedded in conversations
- **Friend messaging data embedded in User model** - with heat map tracking
- **Vector embeddings** in UserMemory for semantic search
- **Auto-distillation hooks** in Conversation model

---

## Deployment

The server is configured for deployment on various platforms:
- Railway (`railway.json`)
- Render (`render.yaml`) 
- Heroku (`Procfile`)

**Main entry point**: `src/server.js`  
**Port**: Environment variable `PORT` or default 5000

---

*Last Updated: January 2025 - Comprehensive Social Proxy Platform with RAG Memory*