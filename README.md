# 🎵 Aether - AI-Powered Artist Tracking Platform

> **Never miss updates from the artists you care about most.**

Aether is an intelligent music discovery and artist tracking platform that combines AI-powered recommendations with comprehensive artist monitoring. Built to help music lovers discover new artists, track their favorites, and stay connected through shared musical interests.

---

## ✨ **What Makes Aether Special**

### 🤖 **AI Music Companion**
- **Smart Recommendations**: Personalized artist suggestions based on your taste
- **Conversational Interface**: Natural chat with music-focused AI assistant
- **Context-Aware**: Remembers your preferences and music history
- **Real-time Streaming**: Instant AI responses via Server-Sent Events

### 🎯 **Comprehensive Artist Tracking**
- **Multi-Platform Search**: Discover artists across Spotify, Last.fm, and more
- **Custom Notifications**: Choose what updates you want (releases, tours, news)
- **Personalized Feeds**: Curated timeline of updates from followed artists
- **Rich Metadata**: Detailed artist info, images, social links, and statistics

### 📊 **Advanced Music Analytics**
- **Listening Insights**: Deep analysis of your music consumption patterns
- **Discovery Tracking**: Monitor how your taste evolves over time
- **Engagement Statistics**: Understand your interaction with different artists
- **Trend Analysis**: See your music preference patterns and recommendations

### 👥 **Social Music Discovery**
- **Friends System**: Connect with others who share your musical taste
- **Heat Map Messaging**: GitHub-style activity tracking for friend conversations
- **Streak Tracking**: Maintain conversation streaks with music friends
- **Shared Discovery**: Discover music through your social network

---

## 🚀 **Key Features**

| Feature | Description |
|---------|-------------|
| **Artist Discovery** | AI-powered recommendations based on your taste |
| **Smart Following** | Track artists with customizable notification preferences |
| **Real-time Updates** | Live feed of releases, tours, and news from followed artists |
| **Music Analytics** | Comprehensive insights into listening habits and preferences |
| **Spotify Integration** | Deep integration with Spotify data and recommendations |
| **Friend Connections** | Social features for music discovery and sharing |
| **Intelligent Chat** | Conversational AI specialized in music and artist discussions |
| **Memory System** | RAG-powered memory that learns your musical preferences |

---

## 🏗️ **Technical Architecture**

### **Modern Tech Stack**
- **Backend**: Node.js + Express.js + MongoDB
- **AI**: OpenRouter (GPT-4o) with specialized music prompts
- **Authentication**: JWT with bcrypt security
- **Real-time**: Server-Sent Events + Socket.IO
- **Music APIs**: Spotify Web API, Last.fm, MusicBrainz
- **Search**: Intelligent web scraping for artist news and updates
- **Analytics**: Custom analytics engine with trend analysis

### **Scalable Design**
- **Microservices Architecture**: Modular service design
- **Queue-Based Processing**: Scalable background job processing  
- **Advanced Caching**: Optimized data retrieval and storage
- **Real-time Notifications**: Live updates and streaming
- **Vector Memory**: Semantic search and recommendation engine

---

## 📁 **Project Structure**

```
aether-server/
├── src/
│   ├── models/
│   │   ├── User.js              # User profiles with music preferences
│   │   ├── Artist.js            # Artist information and metadata
│   │   ├── ArtistUpdate.js      # Artist content updates and news
│   │   ├── UserAnalytics.js     # User listening analytics
│   │   ├── Activity.js          # Social activity feed
│   │   ├── Conversation.js      # AI conversation history
│   │   └── UserMemory.js        # RAG memory system
│   ├── routes/
│   │   ├── auth.js              # Authentication & user management
│   │   ├── artists.js           # Artist discovery and following
│   │   ├── feed.js              # Personalized artist feeds
│   │   ├── analytics.js         # Music analytics and insights
│   │   ├── chat.js              # AI conversation interface
│   │   ├── friends.js           # Social friend management
│   │   ├── friendMessaging.js   # Friend-to-friend messaging
│   │   ├── spotify.js           # Enhanced Spotify integration
│   │   ├── notifications.js     # Real-time notification system
│   │   └── memory.js            # RAG memory management
│   ├── services/
│   │   ├── aiService.js         # AI chat with music specialization
│   │   ├── artistDiscoveryService.js    # Artist search and recommendations
│   │   ├── artistFeedService.js         # Curated artist content feeds
│   │   ├── userAnalyticsService.js      # Music analytics and insights
│   │   ├── friendMessagingService.js    # Social messaging with heat maps
│   │   ├── ragMemoryService.js          # Vector memory and learning
│   │   ├── spotifyLiveService.js        # Live Spotify data integration
│   │   ├── analysisQueue.js             # Background processing queue
│   │   └── notificationService.js       # Real-time notification delivery
│   ├── tools/
│   │   └── webSearchTool.js     # Intelligent artist news discovery
│   ├── middleware/
│   │   ├── auth.js              # JWT authentication middleware
│   │   ├── fileUpload.js        # File processing middleware
│   │   └── security.js          # Security headers and CORS
│   └── server.js                # Main server entry point
├── API.md                       # Comprehensive API documentation
├── DEVELOPMENT.md               # Development setup guide
├── CLAUDE.md                    # Technical specifications
└── README.md                    # This file
```

---

## 🛠️ **Quick Start**

### **Prerequisites**
- Node.js 18+
- MongoDB 6.0+
- OpenRouter API Key
- Spotify Developer Account

### **Installation**
```bash
# Clone repository
git clone https://github.com/your-org/aether-server.git
cd aether-server

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys and database URL

# Start development server
npm run dev
```

### **Environment Variables**
```bash
# Database
MONGO_URI=mongodb://localhost:27017/aether-ai

# Authentication  
JWT_SECRET=your-super-secure-jwt-secret

# AI Service
OPENROUTER_API_KEY=your-openrouter-api-key

# Spotify Integration (Core Feature)
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret
SPOTIFY_REDIRECT_URI=http://localhost:5000/spotify/callback

# Web Search (For Artist News)
SERPAPI_API_KEY=your-serpapi-key
GOOGLE_SEARCH_API_KEY=your-google-api-key
GOOGLE_SEARCH_ENGINE_ID=your-search-engine-id

# Music Database APIs
LASTFM_API_KEY=your-lastfm-api-key
MUSICBRAINZ_USER_AGENT=aether-server/1.0

# Server Configuration
PORT=5000
NODE_ENV=development
```

### **Development Commands**
```bash
npm run dev          # Start development server with hot reload
npm start            # Start production server
npm run lint         # Run ESLint
npm test             # Run test suite
npm run build        # Build for production
```

---

## 🎯 **API Quick Examples**

### **Authentication**
```bash
# Create account
curl -X POST http://localhost:5000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123","username":"music_lover"}'

# Login
TOKEN=$(curl -X POST http://localhost:5000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}' | jq -r '.token')
```

### **Artist Discovery**
```bash
# Search for artists
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/artists/search?q=radiohead"

# Follow an artist
curl -X POST http://localhost:5000/artists/follow \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "artistId": "radiohead",
    "name": "Radiohead",
    "notificationPreferences": {
      "releases": true,
      "tours": true,
      "news": true
    }
  }'

# Get personalized feed
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/feed/timeline"
```

### **AI Chat**
```bash
# Chat with AI about music
curl -X POST http://localhost:5000/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Recommend some indie rock artists similar to Arctic Monkeys"}'
```

### **Analytics**
```bash
# Get music analytics
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:5000/analytics/overview"
```

---

## 🎨 **AI Personalities by Query Type**

Aether's AI automatically detects the type of conversation and adapts:

| Query Type | Response Style | Example Queries |
|------------|---------------|-----------------|
| **Artist Discovery** | Enthusiastic recommendations | "Recommend indie artists", "Similar to Radiohead" |
| **Artist Tracking** | Helpful guidance | "How do I follow artists?", "Set up notifications" |
| **Music Analysis** | Insightful data interpretation | "Show my stats", "Analyze my taste" |
| **Music Activity** | Engaging conversation | "I'm listening to...", "Found a new band" |
| **Music Advice** | Encouraging support | "Help me discover music", "I'm bored with my playlist" |
| **Music Conversation** | Knowledgeable discussion | "Tell me about jazz", "Favorite guitar solos" |

---

## 🔧 **Configuration**

### **Spotify Integration Setup**
1. Create Spotify App at [developer.spotify.com](https://developer.spotify.com)
2. Add redirect URI: `http://localhost:5000/spotify/callback`
3. Copy Client ID and Secret to environment variables
4. Enable required scopes: `user-read-currently-playing`, `user-read-recently-played`, `user-top-read`

### **Database Schema**
The platform uses MongoDB with the following key collections:
- **users**: User profiles with music preferences and social connections
- **artists**: Artist metadata and tracking information
- **artistupdates**: Real-time artist content and news
- **useranalytics**: User listening statistics and insights
- **conversations**: AI chat history and context
- **usermemory**: RAG memory for personalized recommendations

---

## 🚢 **Deployment**

### **Production Ready**
- Railway deployment configuration (`railway.json`)
- Render deployment configuration (`render.yaml`)
- Heroku deployment support (`Procfile`)
- Docker containerization support
- Environment-based configuration
- Production logging and monitoring

### **Deployment Commands**
```bash
# Railway
railway up

# Render
git push origin main  # Auto-deploys via Git integration

# Heroku  
git push heroku main

# Docker
docker build -t aether-server .
docker run -p 5000:5000 aether-server
```

---

## 📈 **Monitoring & Analytics**

### **Built-in Monitoring**
- Health check endpoint: `/health`
- Real-time server metrics
- Database connection monitoring
- AI service availability tracking
- Rate limiting and usage analytics

### **Logging System**
- Structured JSON logging
- Request/response tracking
- Error monitoring and alerting
- Performance metrics
- User activity analytics

---

## 🤝 **Contributing**

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### **Development Workflow**
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Commit: `git commit -m 'Add amazing feature'`
5. Push: `git push origin feature/amazing-feature`  
6. Open a Pull Request

### **Code Standards**
- ESLint configuration enforced
- Prettier code formatting
- Jest testing framework
- Full test coverage required
- TypeScript definitions for models

---

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 **Acknowledgments**

- **OpenRouter** for GPT-4o AI integration
- **Spotify** for comprehensive music API
- **Last.fm** for music metadata and discovery
- **MongoDB** for flexible data storage
- **Express.js** community for robust framework

---

## 📞 **Support & Contact**

- **Documentation**: [API.md](API.md)
- **Development Guide**: [DEVELOPMENT.md](DEVELOPMENT.md)
- **Issues**: GitHub Issues
- **Email**: support@aether.com
- **Discord**: [Aether Community](https://discord.gg/aether)

---

**Built with ❤️ for music lovers everywhere.**

*Last updated: January 2025*