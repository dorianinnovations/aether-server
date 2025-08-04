# Aether AI Server

Simple, functional Express.js backend for AI chat with web search integration.

## Current Architecture

This is a minimal AI chat server with the following core components:

### Project Structure

```
aether-server/
├── src/
│   ├── config/
│   │   ├── constants.js        # HTTP status & messages
│   │   ├── database.js         # MongoDB connection
│   │   ├── environment.js      # Environment management
│   │   └── tiers.js           # User tier configuration
│   ├── models/
│   │   ├── User.js            # User accounts (email, password, username)
│   │   └── Message.js         # Chat messages storage
│   ├── routes/
│   │   ├── auth.js            # Authentication & Spotify integration
│   │   ├── user.js            # User management
│   │   ├── ai.js              # Main AI chat endpoint
│   │   ├── health.js          # Health check endpoints
│   │   ├── conversation.js    # Conversation management
│   │   ├── events.js          # Server events
│   │   └── posts.js           # Posts management
│   ├── services/
│   │   ├── llmService.js      # OpenRouter integration
│   │   ├── messageService.js  # Message persistence
│   │   ├── conversationService.js # Basic conversation management
│   │   └── aiService.js       # AI service utilities
│   ├── tools/
│   │   └── webSearchTool.js   # Web search with SerpAPI/Google
│   ├── middleware/
│   │   ├── auth.js            # JWT authentication
│   │   ├── security.js        # CORS & security headers
│   │   ├── performanceMiddleware.js # Performance monitoring
│   │   ├── cacheMiddleware.js # Response caching
│   │   ├── rateLimiter.js     # Rate limiting
│   │   └── tierLimiter.js     # Subscription limits
│   ├── utils/
│   │   ├── logger.js          # Winston logging
│   │   ├── errorHandler.js    # Error handling
│   │   ├── cache.js          # Caching utilities
│   │   └── appAudit.js       # Application auditing
│   ├── server.js             # Main server (full features)
│   └── server-clean.js       # Entry point (minimal)
├── scripts/                  # Database and utility scripts
├── package.json
├── CLAUDE.md                # Developer documentation
└── README.md               # This file
```

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB

### Installation
```bash
git clone <repository-url>
cd aether-server
npm install
cp .env.example .env  # Create and configure environment
npm run dev
```

### Environment Configuration
```bash
# Required
MONGO_URI=mongodb://localhost:27017/aether-ai
JWT_SECRET=your-jwt-secret-here
OPENROUTER_API_KEY=your-openrouter-api-key

# Optional (for web search)
SERPAPI_API_KEY=your-serpapi-key
GOOGLE_SEARCH_API_KEY=your-google-api-key
GOOGLE_SEARCH_ENGINE_ID=your-search-engine-id

# Optional (for Spotify integration)
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret

# Server
PORT=5000
NODE_ENV=development
```

## API Endpoints

### Authentication
- `POST /signup` - User registration
- `POST /login` - User authentication
- `POST /refresh` - JWT token refresh
- `POST /spotify/connect` - Connect Spotify account
- `POST /spotify/disconnect` - Disconnect Spotify account

### AI Chat
- `POST /ai/chat` - Main chat endpoint
  - Supports streaming and non-streaming responses
  - File upload support (images, PDFs, text files up to 10MB)
  - Automatic web search integration
  - Context from recent conversation history

### User Management
- `GET /profile` - User profile
- `POST /profile` - Update profile
- `DELETE /delete` - Delete account

### Health & Monitoring
- `GET /` - Basic server status
- `GET /health` - Comprehensive health check
- `GET /test` - Operation status

## Core Features

### Simple Authentication
- JWT-based authentication with 24-hour tokens
- Password hashing with bcrypt
- Basic user profiles with email and optional username

### AI Chat Engine
- OpenRouter integration (GPT-4o default)
- Streaming and non-streaming responses
- File upload processing (images, PDFs, text)
- Conversation context from recent messages (last 6 messages)

### Web Search Integration
- Automatic query analysis to determine when search is needed
- SerpAPI and Google Custom Search support
- Content extraction from search results
- Smart filtering to avoid unnecessary searches

### User Tiers
- **Core** (Free): 10k daily requests, 50/min, 8k tokens
- **Pro**: 50k daily requests, 100/min, 16k tokens
- **Aether**: Unlimited requests, 1000/min, 32k tokens

## Development Commands

```bash
npm run dev          # Start development server with nodemon
npm start           # Start production server (server-clean.js)
npm test            # Run tests
npm run lint        # Code linting
npm run lint:errors # Show only errors
```

## Context Management

The server uses a simple context system:

1. **Message Storage**: All chat messages stored in MongoDB
2. **Context Retrieval**: Last 6 messages loaded for each chat request
3. **No Advanced Memory**: No user behavior modeling or long-term memory
4. **Simple Persistence**: Basic message history by user ID

### Context Flow
```
User Request → Load Recent Messages → Add to Context → Send to AI → Save Response
```

## Testing

### Quick Health Check
```bash
curl -s http://localhost:5000/health | jq .
```

### Authentication Test
```bash
# Create user and get token
TOKEN=$(curl -s -X POST http://localhost:5000/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' | \
  jq -r '.token')

# Test AI chat
curl -s -X POST http://localhost:5000/ai/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello AI"}'
```

## Database Schema

### Users
```javascript
{
  email: String (required, unique),
  password: String (hashed),
  username: String (optional),
  isActive: Boolean,
  timestamps: true
}
```

### Messages
```javascript
{
  user: ObjectId (ref: User),
  content: String (required),
  type: String (enum: ['user', 'ai']),
  aiModel: String,
  timestamps: true
}
```

## Key Limitations

This is intentionally a minimal implementation:

- **Basic Context**: Only recent message history, no semantic memory
- **Simple Models**: Just User and Message models
- **No Advanced Features**: No behavior modeling, emotional analysis, or advanced personalization
- **Limited Memory**: No conversation summarization or long-term retention

## Technology Stack

- **Runtime**: Node.js 18+ with ES modules
- **Framework**: Express.js 4.21+
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT with bcrypt
- **AI**: OpenRouter API (multi-model support)
- **Search**: SerpAPI and Google Custom Search
- **File Processing**: Multer for uploads
- **Logging**: Winston
- **Development**: Nodemon, ESLint

## Deployment

The server is configured for deployment on:
- Railway (`railway.json`)
- Render (`render.yaml`)
- Heroku (`Procfile`)

**Entry Point**: `src/server-clean.js`

## Security Features

- JWT authentication with secure tokens
- Rate limiting for API protection
- CORS configuration
- Input validation and sanitization
- Security headers via Helmet.js
- Password hashing with bcrypt (12 rounds)

## Performance Features

- Response caching with Redis (optional)
- Memory monitoring and cleanup
- Request optimization
- Connection pooling for MongoDB
- Efficient file upload handling

---

**Entry Point**: `src/server-clean.js`  
**Main Port**: 5000 (configurable via PORT env var)

*This is a functional, minimal AI chat server focused on core features without complex advanced features.*