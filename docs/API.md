# Aether AI Server - API Documentation

**Version**: 2.0  
**Updated**: January 2025  
**Platform**: Artist Tracking & Music Discovery

---

## Overview

Aether is an AI-powered artist tracking and music discovery platform that helps users:
- Discover new artists based on their taste
- Track updates from their favorite musicians
- Analyze their music listening patterns  
- Connect with friends who share similar music tastes
- Get personalized recommendations through AI chat

---

## Base URL

```
Production: https://aether-server-j5kh.onrender.com
Development: http://localhost:5000
```

---

## Authentication

All protected endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <token>
```

### Get Token
```bash
# Login to get token
curl -X POST /auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'

# Response
{
  "status": "success",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "username": "music_lover"
    }
  }
}
```

---

## API Endpoints

### 🎵 **Artist Discovery & Tracking**

#### Search Artists
```http
GET /artists/search?q={query}&limit={limit}&platforms={spotify,lastfm}
```

**Parameters:**
- `q` (required): Search query  
- `limit` (optional): Results limit (default: 20)
- `platforms` (optional): Comma-separated platforms

**Example:**
```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://api.aether.com/artists/search?q=taylor+swift&limit=10"
```

**Response:**
```json
{
  "success": true,
  "query": "taylor swift",
  "artists": [
    {
      "name": "Taylor Swift",
      "artistId": "taylor-swift",
      "externalIds": {
        "spotifyId": "06HL4z0CvFAxyc27GXpf02"
      },
      "genres": ["pop", "country"],
      "popularity": 99,
      "followers": {
        "spotify": 141096400
      },
      "images": {
        "large": "https://i.scdn.co/image/...",
        "medium": "https://i.scdn.co/image/...",
        "small": "https://i.scdn.co/image/..."
      },
      "socialLinks": {
        "spotify": "https://open.spotify.com/artist/..."
      },
      "source": "spotify"
    }
  ],
  "totalFound": 20,
  "platforms": ["spotify", "lastfm"]
}
```

#### Follow Artist
```http
POST /artists/follow
```

**Body:**
```json
{
  "artistId": "taylor-swift",
  "name": "Taylor Swift",
  "externalIds": {
    "spotifyId": "06HL4z0CvFAxyc27GXpf02"
  },
  "notificationPreferences": {
    "releases": true,
    "news": true,
    "tours": true,
    "social": false
  }
}
```

#### Get Following List
```http
GET /artists/following
```

#### Artist Feed Timeline
```http
GET /feed/timeline?limit={limit}&types={releases,news,tours}
```

**Response:**
```json
{
  "success": true,
  "timeline": [
    {
      "id": "update_12345",
      "artistId": "taylor-swift",
      "artistName": "Taylor Swift",
      "type": "release",
      "title": "New Album: Midnights (3am Edition)",
      "content": "Taylor Swift just released additional tracks...",
      "timestamp": "2024-01-15T10:30:00Z",
      "metadata": {
        "releaseType": "album",
        "trackCount": 23,
        "spotifyUrl": "https://open.spotify.com/album/..."
      }
    }
  ],
  "total": 45,
  "hasMore": true
}
```

### 📊 **Music Analytics**

#### User Analytics Overview
```http
GET /analytics/overview?period={week,month,year,all_time}
```

**Response:**
```json
{
  "success": true,
  "period": "month",
  "dateRange": {
    "start": "2024-12-01T00:00:00Z",
    "end": "2024-12-31T23:59:59Z"
  },
  "summary": {
    "artistsFollowed": 47,
    "newDiscoveries": 12,
    "engagementRate": 0.85,
    "listeningTime": 2847,
    "contentSatisfaction": 0.92,
    "topGenres": ["indie", "electronic", "pop"],
    "topArtists": ["Radiohead", "Aphex Twin", "Taylor Swift"],
    "insights": [
      "You discovered 3x more artists this month",
      "Your indie music engagement increased 40%"
    ]
  },
  "detailed": {
    "artistEngagement": {
      "artistsByPriority": {
        "high": 12,
        "medium": 23,
        "low": 12
      },
      "totalArtistsFollowed": 47,
      "topArtists": [
        {
          "name": "Radiohead",
          "engagementScore": 0.94,
          "updatesReceived": 8,
          "updatesViewed": 8
        }
      ],
      "newDiscoveries": [
        {
          "name": "Phoebe Bridgers",
          "discoveredAt": "2024-12-15T14:22:00Z",
          "source": "ai_recommendation"
        }
      ]
    }
  }
}
```

#### Detailed Analytics
```http
GET /analytics/artists    # Artist-specific analytics
GET /analytics/genres     # Genre preference analytics  
GET /analytics/discovery  # Music discovery patterns
GET /analytics/engagement # Platform engagement stats
```

### 👥 **Social Features**

#### Friends Management
```http
GET  /friends/my-username        # Get your username
GET  /friends/list              # Get friends list
GET  /friends/lookup/{username} # Look up user by username  
POST /friends/add               # Add friend by username
DELETE /friends/remove          # Remove friend
```

#### Friend Messaging
```http
GET  /friend-messaging/conversations           # All conversations
GET  /friend-messaging/conversation/{username} # Specific conversation
POST /friend-messaging/send                    # Send message
GET  /friend-messaging/heat-map/{username}     # GitHub-style activity heat map
GET  /friend-messaging/streaks                # Active messaging streaks
POST /friend-messaging/mark-read              # Mark messages as read
```

**Send Message Example:**
```json
{
  "toUsername": "music_friend", 
  "content": "Have you heard the new Radiohead album?"
}
```

### 🤖 **AI Chat System**

#### Chat with AI
```http
POST /chat
```

**Body:**
```json
{
  "message": "Recommend some indie rock artists similar to Arctic Monkeys",
  "stream": true,
  "conversationId": "optional-conversation-id"
}
```

**Streaming Response:**
```
data: {"content": "I'd"}
data: {"content": " recommend"}  
data: {"content": " checking"}
data: {"content": " out"}
data: {"content": " The"}
data: {"content": " Strokes"}
data: [DONE]
```

**AI Query Types** (automatically detected):
- `artist_discovery`: Music recommendations & discovery
- `artist_tracking`: Following artists & notifications
- `music_analysis`: Stats & listening insights  
- `music_activity`: Current listening & sharing
- `music_advice`: Music discovery help
- `music_conversation`: General music discussion
- `informational`: Platform features & help

#### Specialized Chat Endpoints
```http
POST /chat/artist-recommendations  # Get AI artist recommendations
POST /chat/music-discovery        # Chat about music discovery  
POST /chat/artist-info            # Ask about specific artists
POST /chat/stats-discussion       # Discuss music statistics
```

### 🎧 **Spotify Integration**

#### Connect Spotify
```http
GET /spotify/auth
```

**Response:**
```json
{
  "success": true,
  "authUrl": "https://accounts.spotify.com/authorize?...",
  "message": "Visit this URL to connect your Spotify account"
}
```

#### Enhanced Analytics
```http
POST /spotify/analyze              # Deep Spotify data analysis
GET  /spotify/artist-discovery     # Spotify-based recommendations  
GET  /spotify/listening-insights   # Detailed listening patterns
POST /spotify/sync-preferences     # Sync Spotify data to preferences
```

### 🔔 **Notifications**

#### Get Notifications
```http
GET /notifications/stream          # Real-time SSE stream
GET /notifications/stats           # Notification statistics  
POST /notifications/preferences    # Update preferences
POST /notifications/test           # Send test notification
```

### 💾 **Memory & Context**

#### RAG Memory System
```http
POST /memory/store                 # Store memory
POST /memory/search                # Search memories
GET  /memory/stats                 # Memory statistics
POST /memory/auto-store/{convId}   # Auto-store from conversation
```

---

## Error Handling

All endpoints return errors in this format:

```json
{
  "status": "error",
  "message": "Descriptive error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "validation details"
  }
}
```

**Common Error Codes:**
- `INVALID_TOKEN`: Authentication required or token expired
- `USER_NOT_FOUND`: User doesn't exist
- `ARTIST_NOT_FOUND`: Artist doesn't exist  
- `VALIDATION_ERROR`: Request validation failed
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `INTERNAL_ERROR`: Server error

---

## Rate Limits

- **AI Chat**: 60 requests per minute
- **Artist Search**: 100 requests per minute  
- **Analytics**: 30 requests per minute
- **General API**: 200 requests per minute

---

## SDKs & Examples

### JavaScript/Node.js
```javascript
const AetherClient = require('@aether/sdk');

const client = new AetherClient({
  apiKey: 'your-api-key',
  baseURL: 'https://api.aether.com'
});

// Search artists
const artists = await client.artists.search('radiohead');

// Follow artist
await client.artists.follow({
  artistId: 'radiohead',
  name: 'Radiohead',
  notifications: { releases: true, tours: true }
});

// Get recommendations
const recommendations = await client.chat.send({
  message: 'Recommend artists similar to Radiohead'
});
```

### cURL Examples
```bash
# Complete workflow
TOKEN=$(curl -s -X POST https://api.aether.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}' | \
  jq -r '.token')

# Search for artists
curl -H "Authorization: Bearer $TOKEN" \
  "https://api.aether.com/artists/search?q=thom+yorke"

# Get personalized feed
curl -H "Authorization: Bearer $TOKEN" \
  "https://api.aether.com/feed/timeline"

# Chat with AI
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"What are some good electronic artists?"}' \
  "https://api.aether.com/chat"
```

---

## WebSocket Events

Real-time updates via Socket.IO:

```javascript
socket.on('artist:new_release', (data) => {
  console.log(`New release from ${data.artistName}: ${data.title}`);
});

socket.on('friend:message', (data) => {
  console.log(`Message from ${data.from}: ${data.content}`);
});

socket.on('notification:update', (data) => {
  console.log(`Notification: ${data.message}`);
});
```

---

## Data Models

### Artist
```typescript
interface Artist {
  artistId: string;
  name: string;
  externalIds: {
    spotifyId?: string;
    lastfmId?: string;
  };
  genres: string[];
  popularity: number;
  followers: {
    spotify?: number;
    lastfm?: number;
  };
  images: {
    large?: string;
    medium?: string;  
    small?: string;
  };
  socialLinks: {
    spotify?: string;
    website?: string;
    twitter?: string;
  };
  source: 'spotify' | 'lastfm';
}
```

### User Analytics
```typescript
interface UserAnalytics {
  userId: string;
  period: 'week' | 'month' | 'year' | 'all_time';
  summary: {
    artistsFollowed: number;
    newDiscoveries: number;
    engagementRate: number;
    listeningTime: number;
    topGenres: string[];
    topArtists: string[];
  };
  detailed: {
    artistEngagement: ArtistEngagementData;
    contentConsumption: ContentConsumptionData;
    discovery: DiscoveryData;
    listeningBehavior: ListeningBehaviorData;
  };
}
```

---

For questions or support, contact: [support@aether.com](mailto:support@aether.com)