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

**Expected Results:** GPT-5 should demonstrate perfect recall of conversation context, understand its role as Aether artist tracking companion, identify user correctly, and explain data usage appropriately.

---

## Current Status: ARTIST TRACKING & USER INSIGHTS PLATFORM 🔥

**Server Version**: AI-Powered Artist Discovery & User Analytics Platform  
**Status**: FULLY PIVOTED - Artist Tracking, Updates & User Statistics Platform  
**Entry Point**: `src/server.js`  
**Architecture**: Express.js + MongoDB + OpenRouter + Spotify + RAG Memory + Real-time Artist Updates

---

## 🔥 REVOLUTIONARY ARTIST TRACKING FEATURES

### ✅ AI-Powered Artist Discovery & Tracking
- **Smart Artist Discovery**: AI helps discover new artists based on your taste
- **Comprehensive Artist Following**: Track your favorite musicians, creators, and artists
- **Personalized Update Feeds**: Curated content from artists you care about
- **Release Notifications**: Never miss new music, albums, or content drops
- **Artist News Integration**: Stay updated on tours, announcements, and artist activities

### ✅ User Statistics & Analytics (NEW)
- **Detailed Listening Analytics**: Deep insights into your music consumption patterns
- **Artist Preference Tracking**: AI learns and remembers your favorite artists and genres
- **Engagement Statistics**: Track your interaction with different types of content
- **Personalized Insights**: Understand your music discovery patterns and trends
- **Recommendation Analytics**: See why certain artists were recommended to you

### ✅ RAG Memory System for Music Preferences
- **Artist Memory**: AI remembers your favorite artists, genres, and music preferences
- **Vector-based Music Taste**: Semantic understanding of your musical interests
- **Auto-Learning**: System automatically learns from your interactions and preferences
- **Contextual Recommendations**: AI uses your history to suggest relevant content
- **Preference Evolution Tracking**: Monitor how your taste changes over time

### ✅ Real-time Artist Update Streaming
- **Live Update Feeds**: Real-time notifications when followed artists post content
- **Release Alerts**: Instant notifications for new music releases
- **Tour & Event Notifications**: Get alerted about concerts and events
- **Social Media Integration**: Track artist updates across platforms
- **Content Categorization**: Organize updates by type (music, news, tours, social)

### ✅ Spotify Integration & Music Analytics
- **Deep Spotify Integration**: Enhanced music tracking and artist discovery
- **Listening History Analysis**: Detailed insights into your music consumption
- **Artist Discovery Pipeline**: Spotify data feeds artist recommendation engine
- **Music Taste Profiling**: Advanced analysis of your musical preferences
- **Playlist Analytics**: Track how your playlists evolve and influence recommendations

### ✅ Customizable Content Curation
- **Personalized Artist Feeds**: Curated updates from your followed artists
- **Content Filtering**: Choose what types of updates you want to see
- **Priority Artists**: Mark favorite artists for priority notifications
- **Content Categories**: Organize artist content by type and importance
- **Smart Filtering**: AI learns what content you engage with most

### ✅ Enhanced Authentication & User Management
- JWT-based authentication with username system
- User preference management and settings
- Privacy controls for data sharing and analytics
- Artist following and discovery management
- Personalized onboarding for music taste profiling

### ✅ User Badge System for Music Engagement
- **Music Discovery Badges**: Recognition for discovering new artists
- **Loyalty Badges**: Rewards for long-term artist following
- **Taste Maker Recognition**: Badges for users with excellent music recommendations
- **Engagement Rewards**: Recognition for active platform participation

### ✅ Intelligent AI Chat with Artist Focus
- **Artist-Focused Conversations**: AI specializes in music and artist discussions
- **Music Recommendation Chat**: Get personalized artist recommendations through conversation
- **Artist Information Queries**: Ask detailed questions about artists and get comprehensive answers
- **Music Discovery Assistance**: AI helps you find new music based on your preferences
- **User Statistics Discussions**: Chat about your listening patterns and music analytics

---

## Architecture Overview

### Database Models
- **User** (`src/models/User.js`) - User profiles with artist preferences, following lists, and analytics data
- **Artist** (`src/models/Artist.js`) - Artist information, metadata, and update feeds
- **Following** (`src/models/Following.js`) - User-artist relationship tracking with notification preferences
- **ArtistUpdate** (`src/models/ArtistUpdate.js`) - Artist content updates, releases, and news
- **UserAnalytics** (`src/models/UserAnalytics.js`) - User listening statistics and engagement data
- **Conversation** (`src/models/Conversation.js`) - AI conversations with music-focused context
- **UserMemory** (`src/models/UserMemory.js`) - RAG memory system with artist preference embeddings

### API Routes
- **Authentication** (`src/routes/auth.js`) - User signup/login with music preference onboarding
- **Artist Discovery** (`src/routes/artists.js`) - Artist search, following, and discovery
- **Artist Feed** (`src/routes/feed.js`) - Personalized artist update feeds
- **User Analytics** (`src/routes/analytics.js`) - User statistics and listening insights
- **Conversation** (`src/routes/conversation.js`) - AI conversations with artist focus
- **Spotify Integration** (`src/routes/spotify.js`) - Enhanced music tracking and artist discovery
- **Notifications** (`src/routes/notifications.js`) - Artist update notifications and alerts
- **Memory** (`src/routes/memory.js`) - Music preference memory and learning
- **User Management** (`src/routes/user.js`) - Profile and preference management

### Core Services
- **Artist Discovery Service** (`src/services/artistDiscoveryService.js`) - Artist search and recommendation engine
- **Artist Feed Service** (`src/services/artistFeedService.js`) - Curated artist update feeds
- **User Analytics Service** (`src/services/userAnalyticsService.js`) - User statistics and insights
- **AI Service** (`src/services/aiService.js`) - Artist-focused AI conversations and recommendations
- **Spotify Enhanced Service** (`src/services/spotifyEnhancedService.js`) - Advanced music tracking and analysis
- **Content Curation Service** (`src/services/contentCurationService.js`) - Personalized content filtering
- **RAG Memory Service** (`src/services/ragMemoryService.js`) - Music preference learning and memory
- **Notification Service** (`src/services/notificationService.js`) - Artist update notifications
- **Artist Update Service** (`src/services/artistUpdateService.js`) - Artist content aggregation and processing

### Tools & Integrations
- **Music Database APIs** - Last.fm, MusicBrainz, Spotify Web API integration
- **Social Media Scraping** - Artist social media update aggregation
- **Web Search** (`src/tools/webSearchTool.js`) - Artist news and information discovery
- **Content Analysis** - AI-powered artist content categorization and filtering

---

## 🧠 Artist Intelligence & User Analytics System

### Artist Discovery Engine
1. **Taste Analysis**: AI analyzes your music preferences from Spotify and conversations
2. **Smart Recommendations**: Algorithm suggests artists based on your listening patterns
3. **Genre Exploration**: Discover new genres through guided artist recommendations
4. **Social Discovery**: Find artists through similar users' preferences
5. **Trending Analysis**: Stay updated on emerging artists in your favorite genres

### User Statistics & Insights
```javascript
// User interacts with artists → system tracks preferences
await userAnalyticsService.trackInteraction(userId, artistId, interactionType);
// → AI analyzes patterns and updates recommendations
// → User statistics updated with new insights
// → Personalized artist feed refined based on engagement
```

### Personalized Content Curation
- **Smart Filtering**: AI learns what artist content you engage with most
- **Priority Ranking**: Important updates from favorite artists surface first
- **Content Categorization**: Automatic sorting of music, news, tour, and social updates
- **Engagement Prediction**: AI predicts what content you'll be most interested in
- **Discovery Integration**: New artist suggestions mixed into your personalized feed

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

# Web Search (Required for artist news)
SERPAPI_API_KEY=your-serpapi-key
GOOGLE_SEARCH_API_KEY=your-google-api-key
GOOGLE_SEARCH_ENGINE_ID=your-search-engine-id

# Spotify Integration (CORE FEATURE)
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret
SPOTIFY_REDIRECT_URI=http://localhost:3000/spotify/callback

# Music Database APIs
LASTFM_API_KEY=your-lastfm-api-key
MUSICBRAINZ_USER_AGENT=your-app-name/version

# Server
PORT=5000
NODE_ENV=production
```

---

## 🚀 API Endpoints

### Authentication & Onboarding
- `POST /auth/signup` - User registration with music preference setup
- `POST /auth/login` - User authentication  
- `GET /auth/check-username/:username` - Check username availability
- `POST /auth/onboarding/music-preferences` - Set initial music preferences
- `POST /auth/onboarding/complete` - Complete onboarding flow

### Artist Discovery & Management
- `GET /artists/search` - Search for artists across platforms
- `POST /artists/follow` - Follow an artist for updates
- `DELETE /artists/unfollow` - Unfollow an artist
- `GET /artists/following` - Get list of followed artists
- `GET /artists/discover` - Get personalized artist recommendations
- `GET /artists/:id/details` - Get detailed artist information
- `GET /artists/:id/updates` - Get recent updates from specific artist

### Personalized Artist Feed
- `GET /feed/timeline` - Get personalized artist update timeline
- `GET /feed/releases` - Get new music releases from followed artists
- `GET /feed/news` - Get news updates from followed artists
- `GET /feed/tours` - Get tour and event announcements
- `POST /feed/preferences` - Update feed content preferences

### User Analytics & Statistics
- `GET /analytics/overview` - Get user listening statistics overview
- `GET /analytics/artists` - Get detailed artist listening analytics
- `GET /analytics/genres` - Get genre preference analytics
- `GET /analytics/discovery` - Get music discovery patterns
- `GET /analytics/engagement` - Get platform engagement statistics
- `POST /analytics/export` - Export user analytics data

### AI Chat (Artist-Focused)
- `POST /chat/artist-recommendations` - Get AI artist recommendations
- `POST /chat/music-discovery` - Chat about music discovery
- `POST /chat/artist-info` - Ask questions about specific artists
- `POST /chat/stats-discussion` - Discuss your music statistics with AI

### Enhanced Spotify Integration
- `GET /spotify/auth` - Enhanced Spotify authorization
- `POST /spotify/analyze` - Deep analysis of Spotify listening data
- `GET /spotify/artist-discovery` - Spotify-based artist recommendations
- `GET /spotify/listening-insights` - Detailed listening pattern insights
- `POST /spotify/sync-preferences` - Sync Spotify data to artist preferences

### Notification Management
- `GET /notifications/artist-updates` - Get artist update notifications
- `POST /notifications/preferences` - Set notification preferences
- `GET /notifications/stream` - Real-time notification stream
- `POST /notifications/mark-read` - Mark notifications as read

### Memory & Preferences
- `POST /memory/store-preference` - Store music preference
- `GET /memory/music-taste` - Get learned music taste profile
- `POST /memory/search-artists` - Search memories for artist preferences
- `GET /memory/recommendation-history` - Get AI recommendation history

---

## Testing & Development

### Quick Health Check
```bash
curl -s http://localhost:5000/health | jq .
```

### Artist Platform Test
```bash
# Create user account
TOKEN=$(curl -s -X POST http://localhost:5000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","username":"music_lover"}' | \
  jq -r '.token')

# Search for artists
curl -s -X GET "http://localhost:5000/artists/search?q=taylor+swift" \
  -H "Authorization: Bearer $TOKEN"

# Follow an artist
curl -s -X POST http://localhost:5000/artists/follow \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"artistId":"taylor-swift","notificationPreferences":{"releases":true,"news":true}}'

# Get personalized feed
curl -s http://localhost:5000/feed/timeline \
  -H "Authorization: Bearer $TOKEN"

# Get user analytics
curl -s http://localhost:5000/analytics/overview \
  -H "Authorization: Bearer $TOKEN"

# Chat with AI about music
curl -s -X POST http://localhost:5000/chat/artist-recommendations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"I love indie rock, recommend some new artists"}'
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

# Seed artist database
npm run seed-artists
```

---

## Key Features

### Artist Discovery & Tracking
- **Multi-Platform Artist Search**: Search across Spotify, Last.fm, and other music databases
- **Smart Following System**: Follow artists with customizable notification preferences
- **Release Tracking**: Automatic detection and notification of new music releases
- **Tour & Event Alerts**: Real-time notifications for concerts and artist events

### User Analytics & Insights
- **Comprehensive Statistics**: Detailed analytics on listening habits and preferences
- **Preference Evolution**: Track how your music taste changes over time
- **Discovery Patterns**: Insights into how you discover new music
- **Engagement Analytics**: Understand your interaction patterns with different artists

### AI-Powered Recommendations
- **Contextual Suggestions**: AI recommendations based on conversation context
- **Taste Learning**: System learns your preferences through interactions
- **Discovery Assistance**: AI helps explore new genres and artists
- **Personalized Curation**: AI curates content based on your engagement patterns

### Content Aggregation
- **Multi-Source Updates**: Aggregate artist content from various platforms
- **Smart Categorization**: Automatic sorting of different content types
- **Relevance Filtering**: AI filters content based on your interests
- **Real-Time Processing**: Live updates and notifications from followed artists

---

## Architecture Notes

### Current Implementation Strengths:
1. **Artist-Focused Architecture**: Entire system designed around artist discovery and tracking
2. **Advanced Analytics**: Comprehensive user statistics and listening insights
3. **AI Integration**: Smart recommendations and music-focused conversations
4. **Multi-Platform Support**: Integration with various music databases and services
5. **Real-Time Updates**: Live artist content aggregation and notification system

### Database Schema

#### Key Collections:
- **Users**: User profiles with artist preferences and analytics data
- **Artists**: Comprehensive artist information and metadata
- **Following**: User-artist relationships with notification preferences
- **ArtistUpdates**: Aggregated artist content from multiple sources
- **UserAnalytics**: Detailed user statistics and engagement data
- **Conversations**: AI chat history with music and artist focus

#### Notable Schema Features:
- **Artist preference embeddings** for semantic music taste matching
- **Real-time update aggregation** from multiple content sources
- **Detailed analytics tracking** for user behavior insights
- **Flexible notification system** with granular preference controls

---

## Deployment

The server is configured for deployment on various platforms:
- Railway (`railway.json`)
- Render (`render.yaml`) 
- Heroku (`Procfile`)

**Main entry point**: `src/server.js`  
**Port**: Environment variable `PORT` or default 5000

---

*Last Updated: January 2025 - Artist Tracking & User Analytics Platform*