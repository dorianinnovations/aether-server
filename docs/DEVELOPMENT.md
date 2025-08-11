# 🛠️ Aether Development Guide

**Version**: 2.0  
**Last Updated**: January 2025

---

## 🚀 **Quick Setup**

### **Prerequisites**
- **Node.js** 18+ (recommended: 20+)
- **MongoDB** 6.0+ (or MongoDB Atlas account)
- **Git** for version control
- **Code Editor** (VS Code recommended)

### **Required API Keys**
Before starting, you'll need these API keys:

| Service | Required | Purpose | Where to Get |
|---------|----------|---------|--------------|
| **OpenRouter** | ✅ Yes | AI chat functionality | [openrouter.ai](https://openrouter.ai) |
| **Spotify** | ✅ Yes | Music data & search | [developer.spotify.com](https://developer.spotify.com) |
| **SerpAPI** | 🟡 Optional | Artist news search | [serpapi.com](https://serpapi.com) |
| **Last.fm** | 🟡 Optional | Extended music metadata | [last.fm/api](https://www.last.fm/api) |

### **Installation Steps**

1. **Clone & Install**
```bash
git clone https://github.com/your-org/aether-server.git
cd aether-server
npm install
```

2. **Environment Setup**
```bash
cp .env.example .env
```

3. **Configure .env File**
```bash
# Database
MONGO_URI=mongodb://localhost:27017/aether-ai

# Authentication
JWT_SECRET=your-super-secure-random-string-here

# AI Service (Required)
OPENROUTER_API_KEY=sk-or-v1-your-key-here

# Spotify Integration (Required)
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret
SPOTIFY_REDIRECT_URI=http://localhost:5000/spotify/callback

# Optional APIs
SERPAPI_API_KEY=your-serpapi-key
LASTFM_API_KEY=your-lastfm-key
MUSICBRAINZ_USER_AGENT=aether-server/1.0

# Server Config
PORT=5000
NODE_ENV=development
```

4. **Start Development Server**
```bash
npm run dev
```

5. **Verify Setup**
```bash
curl http://localhost:5000/health
```

Expected response:
```json
{
  "status": "success",
  "health": {
    "server": "healthy",
    "database": "connected",
    "llm_api": "reachable",
    "llm_service": "OpenRouter (GPT-4o)",
    "llm_response_status": "available"
  }
}
```

---

## 📁 **Project Architecture**

### **Directory Structure**
```
src/
├── config/
│   ├── database.js          # MongoDB connection
│   ├── environment.js       # Environment variable validation
│   └── index.js             # Config exports
├── middleware/
│   ├── auth.js              # JWT authentication
│   ├── fileUpload.js        # Multer file handling
│   ├── security.js          # CORS & security headers
│   └── validation.js        # Request validation
├── models/                  # MongoDB schemas
├── routes/                  # Express route handlers
├── services/                # Business logic
├── tools/                   # External integrations
├── utils/                   # Helper functions
└── server.js               # Application entry point
```

### **Key Services**

| Service | Purpose | Key Methods |
|---------|---------|-------------|
| **aiService** | AI chat with music specialization | `chat()`, `classifyQuery()`, `buildSystemPrompt()` |
| **artistDiscoveryService** | Artist search & recommendations | `searchArtists()`, `getRecommendations()` |
| **userAnalyticsService** | Music analytics & insights | `generateOverview()`, `trackActivity()` |
| **ragMemoryService** | Vector memory & learning | `storeMemory()`, `searchMemories()` |
| **friendMessagingService** | Social messaging | `sendMessage()`, `getConversationHistory()` |

---

## 🗄️ **Database Schema**

### **Core Models**

#### **User Model**
```javascript
{
  email: String,           // Unique user email
  password: String,        // Bcrypt hashed password
  username: String,        // Unique @username
  name: String,           // Display name
  
  // Music preferences
  musicPersonality: {
    musicInterests: [{ 
      genre: String, 
      confidence: Number,
      lastMentioned: Date 
    }],
    discoveryStyle: {
      adventurous: Number,   // 0-1 scale
      social: Number,
      algorithmic: Number
    }
  },
  
  // Social features
  friends: [{ 
    user: ObjectId, 
    addedAt: Date,
    messagingHistory: { ... }
  }],
  
  // Artist tracking
  followedArtists: [{
    artist: ObjectId,
    followedAt: Date,
    notificationPreferences: {
      releases: Boolean,
      tours: Boolean,
      news: Boolean
    }
  }]
}
```

#### **Artist Model**
```javascript
{
  artistId: String,        // Unique identifier
  name: String,           // Artist name
  externalIds: {
    spotifyId: String,
    lastfmId: String
  },
  genres: [String],
  popularity: Number,
  followers: {
    spotify: Number,
    lastfm: Number
  },
  images: {
    large: String,
    medium: String,
    small: String
  },
  lastUpdated: Date
}
```

---

## 🎯 **API Development**

### **Route Structure**
```javascript
// routes/example.js
import express from 'express';
import { protect } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validation.js';
import exampleService from '../services/exampleService.js';

const router = express.Router();

router.get('/', protect, async (req, res) => {
  try {
    const result = await exampleService.getData(req.user.id);
    res.json({
      status: 'success',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

export default router;
```

### **Error Handling Pattern**
```javascript
// Consistent error response format
const sendError = (res, statusCode, message, details = null) => {
  res.status(statusCode).json({
    status: 'error',
    message,
    ...(details && { details })
  });
};

// Usage
if (!user) {
  return sendError(res, 404, 'User not found');
}
```

### **Authentication Middleware**
```javascript
// All protected routes require JWT
app.use('/protected-route', protect, routeHandler);

// The protect middleware:
// 1. Extracts token from Authorization header
// 2. Verifies JWT signature
// 3. Adds req.user with user data
// 4. Returns 401 if invalid
```

---

## 🤖 **AI System Development**

### **Query Classification**
The AI system automatically classifies user messages:

```javascript
// aiService.js - classifyQuery method
const queryType = this.classifyQuery(message);
// Returns: 'artist_discovery', 'music_analysis', 'conversational', etc.

const systemPrompt = this.buildSystemPrompt(userContext, queryType);
// Gets specialized prompt for the detected intent
```

### **Adding New Query Types**

1. **Add Pattern Recognition**
```javascript
// In classifyQuery method
const newFeaturePatterns = [
  /concert|live music|festival|venue/,
  /tickets|tour dates|shows/
];

for (const pattern of newFeaturePatterns) {
  if (pattern.test(lowerMessage)) {
    return 'concert_discovery';
  }
}
```

2. **Create Specialized Prompt**
```javascript
getConcertDiscoveryPrompt(userContext = null) {
  const username = this.safeDisplayName(userContext?.username);
  return `You are Aether, specialized in live music and concert discovery.
  
  Focus on:
  - Finding concerts and festivals for artists they follow
  - Recommending live venues and events
  - Ticket availability and purchasing guidance
  - Live music discovery in their area
  
  ${username ? `Help ${username} discover amazing live music experiences!` : ''}`;
}
```

3. **Wire Up in buildSystemPrompt**
```javascript
if (queryType === 'concert_discovery') {
  return this.getConcertDiscoveryPrompt(userContext);
}
```

### **Memory System Integration**
```javascript
// Store user preferences in vector memory
await ragMemoryService.storeMemory(userId, {
  content: "User loves indie rock and electronic music",
  metadata: {
    type: 'music_preference',
    genres: ['indie rock', 'electronic'],
    confidence: 0.9
  }
});

// Retrieve relevant memories for context
const relevantMemories = await ragMemoryService.searchMemories(
  userId, 
  userMessage, 
  { limit: 5 }
);
```

---

## 🎵 **Music API Integration**

### **Spotify Integration**
```javascript
// services/spotifyService.js
class SpotifyService {
  async searchArtists(query, limit = 20) {
    const response = await fetch('https://api.spotify.com/v1/search', {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      },
      params: {
        q: query,
        type: 'artist',
        limit
      }
    });
    
    return this.formatArtistData(response.artists.items);
  }
  
  formatArtistData(spotifyArtists) {
    return spotifyArtists.map(artist => ({
      artistId: this.generateArtistId(artist.name),
      name: artist.name,
      externalIds: { spotifyId: artist.id },
      genres: artist.genres,
      popularity: artist.popularity,
      followers: { spotify: artist.followers.total },
      images: this.formatImages(artist.images),
      socialLinks: { spotify: artist.external_urls.spotify },
      source: 'spotify'
    }));
  }
}
```

### **Adding New Music APIs**

1. **Create Service Class**
```javascript
// services/newMusicApiService.js
class NewMusicApiService {
  constructor() {
    this.apiKey = process.env.NEW_MUSIC_API_KEY;
    this.baseUrl = 'https://api.newmusicservice.com/v1';
  }
  
  async searchArtists(query) {
    // Implementation
  }
  
  formatArtistData(artists) {
    // Convert to standard format
  }
}
```

2. **Integrate in Discovery Service**
```javascript
// services/artistDiscoveryService.js
async searchArtists(query, platforms = ['spotify', 'lastfm']) {
  const results = [];
  
  if (platforms.includes('spotify')) {
    const spotifyResults = await spotifyService.searchArtists(query);
    results.push(...spotifyResults);
  }
  
  if (platforms.includes('newapi')) {
    const newApiResults = await newMusicApiService.searchArtists(query);
    results.push(...newApiResults);
  }
  
  return this.deduplicateAndRank(results);
}
```

---

## 📊 **Analytics System**

### **Adding Custom Metrics**

1. **Define Metric Schema**
```javascript
// In UserAnalytics model
newMetric: {
  totalValue: { type: Number, default: 0 },
  dailyBreakdown: [{
    date: String,
    value: Number
  }],
  lastUpdated: Date
}
```

2. **Track Metric Events**
```javascript
// services/userAnalyticsService.js
async trackCustomMetric(userId, metricName, value, metadata = {}) {
  const analytics = await UserAnalytics.findOne({ userId });
  
  analytics.metrics[metricName].totalValue += value;
  analytics.metrics[metricName].dailyBreakdown.push({
    date: new Date().toISOString().split('T')[0],
    value,
    metadata
  });
  
  await analytics.save();
}
```

3. **Include in Overview**
```javascript
async generateOverview(userId, period) {
  const analytics = await UserAnalytics.findOne({ userId });
  
  return {
    summary: {
      // existing metrics...
      customMetric: analytics.metrics.newMetric.totalValue
    },
    detailed: {
      customAnalysis: this.analyzeCustomMetric(analytics.metrics.newMetric)
    }
  };
}
```

---

## 🧪 **Testing**

### **Test Structure**
```
tests/
├── unit/
│   ├── services/
│   ├── models/
│   └── utils/
├── integration/
│   ├── routes/
│   └── database/
└── e2e/
    ├── auth.test.js
    ├── artists.test.js
    └── chat.test.js
```

### **Example Test**
```javascript
// tests/unit/services/aiService.test.js
import aiService from '../../../src/services/aiService.js';

describe('AIService', () => {
  describe('classifyQuery', () => {
    it('should detect artist discovery queries', () => {
      const result = aiService.classifyQuery('recommend some indie artists');
      expect(result).toBe('artist_discovery');
    });
    
    it('should detect music analysis queries', () => {
      const result = aiService.classifyQuery('show me my music stats');
      expect(result).toBe('music_analysis');
    });
  });
});
```

### **Running Tests**
```bash
npm test                 # Run all tests
npm run test:unit       # Unit tests only
npm run test:integration # Integration tests
npm run test:e2e        # End-to-end tests
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage report
```

---

## 🚀 **Performance Optimization**

### **Database Optimization**

1. **Indexing Strategy**
```javascript
// User model indexes
UserSchema.index({ email: 1 });
UserSchema.index({ username: 1 });
UserSchema.index({ 'followedArtists.artist': 1 });

// Artist model indexes  
ArtistSchema.index({ artistId: 1 });
ArtistSchema.index({ 'externalIds.spotifyId': 1 });
ArtistSchema.index({ name: 'text' }); // Text search
```

2. **Query Optimization**
```javascript
// Efficient pagination
const artists = await Artist.find(query)
  .sort({ popularity: -1 })
  .limit(limit)
  .skip(offset)
  .select('name artistId images genres'); // Only needed fields
```

### **Caching Strategy**
```javascript
// services/cacheService.js
class CacheService {
  async get(key) {
    // Redis or in-memory cache
  }
  
  async set(key, value, ttl = 300) {
    // Cache with TTL
  }
}

// Usage in artist search
async searchArtists(query) {
  const cacheKey = `search:${query}`;
  const cached = await cache.get(cacheKey);
  
  if (cached) return cached;
  
  const results = await this.performSearch(query);
  await cache.set(cacheKey, results, 600); // 10 min TTL
  
  return results;
}
```

### **Rate Limiting**
```javascript
// middleware/rateLimit.js
import rateLimit from 'express-rate-limit';

export const chatRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: {
    status: 'error',
    message: 'Too many chat requests, please try again later'
  }
});

// Apply to routes
app.use('/chat', chatRateLimit, chatRoutes);
```

---

## 🔧 **Development Tools**

### **Useful Scripts**
```bash
# Development
npm run dev              # Start with nodemon
npm run dev:debug        # Start with debugger
npm run dev:inspect      # Start with Node inspector

# Database
npm run db:migrate       # Run migrations
npm run db:seed          # Seed test data
npm run db:reset         # Reset database

# Code Quality
npm run lint             # ESLint
npm run lint:fix         # Auto-fix linting issues
npm run format           # Prettier formatting
npm run type-check       # TypeScript checking

# Production
npm run build            # Build for production
npm run start:prod       # Start production server
```

### **VS Code Configuration**
Create `.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "eslint.autoFixOnSave": true,
  "files.exclude": {
    "node_modules": true,
    "dist": true
  }
}
```

### **Debugging**
```bash
# Start with debugger
npm run dev:debug

# VS Code launch.json
{
  "name": "Debug Aether Server",
  "type": "node",
  "request": "launch",
  "program": "${workspaceFolder}/src/server.js",
  "env": {
    "NODE_ENV": "development"
  },
  "console": "integratedTerminal"
}
```

---

## 🐛 **Common Issues & Solutions**

### **MongoDB Connection Issues**
```bash
# Check MongoDB status
sudo systemctl status mongod

# Start MongoDB
sudo systemctl start mongod

# Check connection string in .env
MONGO_URI=mongodb://localhost:27017/aether-ai
```

### **API Rate Limits**
```javascript
// Implement exponential backoff
async function retryWithBackoff(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429 && i < retries - 1) {
        await new Promise(resolve => 
          setTimeout(resolve, Math.pow(2, i) * 1000)
        );
        continue;
      }
      throw error;
    }
  }
}
```

### **Memory Issues**
```bash
# Monitor memory usage
node --max-old-space-size=4096 src/server.js

# Check for memory leaks
npm install -g clinic
clinic doctor -- node src/server.js
```

---

## 🚀 **Deployment Guide**

### **Production Checklist**
- [ ] Environment variables configured
- [ ] Database indexes created
- [ ] SSL certificates installed
- [ ] Logging configured
- [ ] Monitoring setup
- [ ] Backup strategy implemented
- [ ] Rate limiting configured
- [ ] Error tracking enabled

### **Environment Variables**
```bash
# Production .env
NODE_ENV=production
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/aether
JWT_SECRET=super-secure-production-secret
OPENROUTER_API_KEY=prod-key
SPOTIFY_CLIENT_ID=prod-spotify-id
SPOTIFY_CLIENT_SECRET=prod-spotify-secret
```

### **PM2 Configuration**
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'aether-server',
    script: 'src/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log'
  }]
};
```

---

## 📞 **Support**

### **Getting Help**
- **Documentation**: Check [API.md](API.md) for API details
- **Issues**: GitHub Issues for bugs and feature requests
- **Discord**: [Development Chat](https://discord.gg/aether-dev)

### **Contributing**
1. Read the contribution guidelines
2. Fork and create feature branch
3. Add tests for new features
4. Submit pull request

---

**Happy coding! 🎵**

*Last updated: January 2025*