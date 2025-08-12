# Aether Server

## Developer Workflow & Testing

### How Darrel Works
- **Live Deploy**: https://aether-server-j5kh.onrender.com
- **Local Dev**: Sometimes uses localhost:5000 for rapid iterative development
- **Preferred Testing**: Render production after committing and pushing changes
- **Deploy Process**: Code changes → git push → Render auto-deploys → test live
- **API Testing**: Uses curl directly against endpoints (local or production)
- **Production-First**: Render is the primary testing environment

### Test Account (Use This for All Testing)
- **Username**: ClaudeCodeTestAcc
- **Password**: ClaudeCodeCLITester123  
- **Email**: claude@test.dev
- **User ID**: 689a4de87843a581a5470f66
- **Token**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI2ODlhNGRlODc4NDNhNTgxYTU0NzBmNjYiLCJpYXQiOjE3NTQ5NDI5NTMsImV4cCI6MTc1NTIwMjE1M30.iAjeNY1XCzVI7Eo1tQvtwfUtz6mu_mhrCZQOQ1nS6z8`

### Quick Tests
```bash
# Health check (local or production)
curl localhost:5000/health
curl https://aether-server-j5kh.onrender.com/health

# Login with test account
curl -X POST https://aether-server-j5kh.onrender.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"ClaudeCodeTestAcc","password":"ClaudeCodeCLITester123"}'

# Test chat with test account
curl -X POST https://aether-server-j5kh.onrender.com/chat \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI2ODlhNGRlODc4NDNhNTgxYTU0NzBmNjYiLCJpYXQiOjE3NTQ5NDI5NTMsImV4cCI6MTc1NTIwMjE1M30.iAjeNY1XCzVI7Eo1tQvtwfUtz6mu_mhrCZQOQ1nS6z8" \
  -H "Content-Type: application/json" \
  -d '{"message":"hello"}'
```

### Development Notes
- Code changes → push to git → Render auto-deploys
- Test immediately on live production URL
- No local development environment used
- Direct production debugging and iteration

### Important: Token Handling
**The token works fine!** New Claude agents often say "auth issues" but it's not an auth problem:
- Token: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4OWE0ZGU4Nzg0M2E1ODFhNTQ3MGY2NiIsImlhdCI6MTc1NDk0Mjk1MywiZXhwIjoxNzU1MjAyMTUzfQ.iAjeNY1XCzUI7Eo1tQvtwfUtz6mu_mhrCZQOQ1nS6z8`
- **Lasts 3 days** from creation (expires Jan 16, 2025)
- Use exactly as shown in curl examples
- If you get "auth error", you probably have a typo, not an auth issue
- Just reuse the same token for all tests - don't create new accounts

---

## Overview
Express.js + MongoDB + OpenRouter AI chat platform with Spotify integration and real-time features.

**Entry Point**: `src/server.js`  
**Architecture**: REST API + Socket.IO + AI Chat + File Processing

## Quick Start
```bash
npm start                    # Production
npm run dev                  # Development with nodemon
curl localhost:5000/health   # Health check
```

## Environment Variables
```bash
# Database
MONGO_URI=mongodb://localhost:27017/aether-ai

# Authentication  
JWT_SECRET=your-jwt-secret

# AI Service
OPENROUTER_API_KEY=your-openrouter-key

# Spotify Integration
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret
SPOTIFY_REDIRECT_URI=http://localhost:3000/spotify/callback

# Optional
PORT=5000
NODE_ENV=production
```

## Core Features
- **AI Chat**: OpenRouter-powered conversations with context memory
- **Spotify Integration**: Real-time track detection and music context
- **File Processing**: Image, PDF, code file analysis with GPT-4o vision
- **User Analytics**: Listening habits and interaction tracking
- **Real-time Messaging**: Socket.IO for live updates
- **Artist Discovery**: Music recommendation and artist following
- **RAG Memory**: Vector-based conversation memory and preferences

## API Routes

### Authentication
- `POST /auth/signup` - User registration
- `POST /auth/login` - User login
- `GET /auth/check-username/:username` - Check availability

### AI Chat
- `POST /chat` - Main AI conversation endpoint
- `POST /conversation` - Alternative chat interface
- `GET /conversation/:id` - Get conversation history
- `DELETE /conversation/:id` - Delete conversation

### User & Profile
- `GET /user/profile` - Get user profile
- `PUT /user/profile` - Update profile
- `POST /user/upload-avatar` - Profile image upload

### Spotify
- `GET /spotify/auth` - Spotify OAuth
- `GET /spotify/callback` - OAuth callback
- `GET /spotify/current-track` - Current playing track
- `POST /spotify/disconnect` - Disconnect account

### Artists & Music
- `GET /artists/search` - Search artists

### Analytics
- `GET /analytics/overview` - User statistics
- `GET /analytics/listening` - Music listening data

## Core Services

### AI & Conversation
- `aiService.js` - OpenRouter integration, prompt management
- `conversationService.js` - Chat history, context management  
- `ragMemoryService.js` - Vector memory, user preferences
- `llmService.js` - Low-level LLM operations

### Spotify & Music
- `spotifyService.js` - Spotify API integration
- `spotifyLiveService.js` - Real-time track monitoring
- `artistDiscoveryService.js` - Music recommendations
- `artistFeedService.js` - Artist update feeds

### File & Media
- `fileProcessingService.js` - Image/PDF processing for AI
- `fileValidationService.js` - Upload validation

### Analytics & Users  
- `userAnalyticsService.js` - Usage statistics
- `profileAnalyzer.js` - User behavior analysis
- `notificationService.js` - Real-time notifications

## Database Models
- `User.js` - User profiles, preferences, Spotify data
- `Conversation.js` - Chat history and context
- `UserMemory.js` - RAG memory storage
- `Artist.js` - Artist information and metadata
- `UserAnalytics.js` - Usage statistics

## Development Commands
```bash
npm run lint        # ESLint check
npm run test        # Run tests  
npm run dev         # Development server
```

## Key Features Detail

### Context System
- Conversation state tracking
- Music context from Spotify
- User preference learning
- File attachment context

### File Processing
- Images: GPT-4o vision analysis
- PDFs: Document processing
- Code: Syntax highlighting and analysis
- Size limits: 100MB per file

### Spotify Integration  
- Real-time track detection (30s polling)
- Music preference learning
- Artist recommendation context
- Listening history analysis

### AI Models
- Primary: GPT-4o (OpenRouter)
- Fallback: Claude 3.5 Sonnet
- Title generation: Llama 3.1 8B (cheap)
- Context-aware model selection

---

*Server handles AI chat, music integration, file processing, and real-time features*