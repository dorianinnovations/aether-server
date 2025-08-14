# Aether Server API Endpoints

**Base URL:** `https://aether-server-j5kh.onrender.com`

All authenticated endpoints require `Authorization: Bearer {token}` header.

## 🎵 Music Discovery & Preferences

### Core Discovery

#### Discover Personalized Music
```http
POST /music-preferences/discover
Authorization: Bearer {token}
Content-Type: application/json

{
  "preferences": {
    "danceability": 0.7,
    "energy": 0.8,
    "valence": 0.6
  },
  "count": 20,
  "strategy": "custom_prediction"
}
```

#### Rank User-Provided Tracks
```http
POST /music-preferences/rank-tracks
Authorization: Bearer {token}
Content-Type: application/json

{
  "tracks": [
    {
      "id": "spotify_track_id",
      "name": "Song Name",
      "artist": "Artist Name"
    }
  ]
}
```

### User Settings & Customization

#### Get Current Settings
```http
GET /music-preferences/settings
Authorization: Bearer {token}
```

#### Update Audio Feature Weights
```http
PUT /music-preferences/weights
Authorization: Bearer {token}
Content-Type: application/json

{
  "danceability": 0.2,
  "energy": 0.18,
  "valence": 0.15,
  "tempo": 0.12,
  "acousticness": 0.1
}
```

#### Set Preferred Feature Ranges
```http
PUT /music-preferences/ranges
Authorization: Bearer {token}
Content-Type: application/json

{
  "danceability": { "min": 0.3, "max": 0.9, "strict": false },
  "energy": { "min": 0.5, "max": 1.0, "strict": true }
}
```

#### Update Prediction Preferences
```http
PUT /music-preferences/preferences
Authorization: Bearer {token}
Content-Type: application/json

{
  "adaptiveLearning": true,
  "explorationFactor": 0.3,
  "diversityBoost": 0.15
}
```

### Learning & Feedback

#### Submit Song Feedback
```http
POST /music-preferences/feedback
Authorization: Bearer {token}
Content-Type: application/json

{
  "trackId": "spotify_track_id",
  "rating": 0.8,
  "feedback": "loved_it"
}
```

#### Get Personalized Music Profile
```http
GET /music-preferences/profile
Authorization: Bearer {token}
```

## 🔐 Authentication

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password"
}
```

#### Register
```http
POST /auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password",
  "username": "unique_username",
  "name": "Display Name"
}
```

#### Logout
```http
POST /auth/logout
Authorization: Bearer {token}
```

#### Get Current User
```http
GET /auth/me
Authorization: Bearer {token}
```

## 👤 User Management

#### Get User Profile
```http
GET /user/profile
Authorization: Bearer {token}
```

#### Update User Profile
```http
PUT /user/profile
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "New Name",
  "bio": "Updated bio",
  "location": "City, State"
}
```

#### Update User Settings
```http
PUT /user/settings
Authorization: Bearer {token}
Content-Type: application/json

{
  "notifications": true,
  "privacy": "public"
}
```

## 🎧 Spotify Integration

#### Connect Spotify Account
```http
GET /spotify/connect
Authorization: Bearer {token}
```

#### Spotify OAuth Callback
```http
GET /spotify/callback?code={auth_code}
Authorization: Bearer {token}
```

#### Get Currently Playing Track
```http
GET /spotify/current-track
Authorization: Bearer {token}
```

#### Get Recent Tracks
```http
GET /spotify/recent-tracks
Authorization: Bearer {token}
```

#### Get Top Tracks
```http
GET /spotify/top-tracks
Authorization: Bearer {token}
```

## 👥 Friends & Social

#### Get Friends List
```http
GET /friends
Authorization: Bearer {token}
```

#### Add Friend
```http
POST /friends/add
Authorization: Bearer {token}
Content-Type: application/json

{
  "username": "friend_username"
}
```

#### Remove Friend
```http
DELETE /friends/{friendId}
Authorization: Bearer {token}
```

#### Get Friend Profile
```http
GET /friends/{friendId}/profile
Authorization: Bearer {token}
```

## 💬 Social Chat

#### Get Conversations
```http
GET /social-chat/conversations
Authorization: Bearer {token}
```

#### Send Message
```http
POST /social-chat/conversations/{conversationId}/messages
Authorization: Bearer {token}
Content-Type: application/json

{
  "message": "Hello friend!",
  "type": "text"
}
```

#### Get Messages
```http
GET /social-chat/conversations/{conversationId}/messages
Authorization: Bearer {token}
```

## 🔍 Social Proxy (Cross-platform)

#### Get Instagram Profile
```http
GET /social-proxy/instagram/{username}
Authorization: Bearer {token}
```

#### Get Twitter Profile
```http
GET /social-proxy/twitter/{username}
Authorization: Bearer {token}
```

## ⚡ Utility

#### Health Check
```http
GET /health
```

#### Service Info
```http
GET /
```

## 📊 Usage Examples

### Full Music Discovery Flow
1. `POST /auth/login` → get authentication token
2. `GET /music-preferences/settings` → view current prediction settings
3. `PUT /music-preferences/weights` → customize audio feature weights
4. `POST /music-preferences/discover` → get personalized song recommendations
5. `POST /music-preferences/feedback` → rate songs to improve future predictions

### User Setup Flow
1. `POST /auth/register` → create new account
2. `GET /spotify/connect` → connect Spotify account
3. `PUT /user/profile` → set up user profile
4. `POST /friends/add` → add friends to network

### Customization Flow
1. `GET /music-preferences/settings` → see current weights and settings
2. `PUT /music-preferences/weights` → adjust how much each audio feature matters
3. `PUT /music-preferences/ranges` → set preferred ranges for features
4. `PUT /music-preferences/preferences` → configure adaptive learning settings

## 🎯 Audio Features Explained

The music prediction system uses these Spotify audio features:

- **danceability** (0-1): How suitable a track is for dancing
- **energy** (0-1): Perceptual measure of intensity and power
- **valence** (0-1): Musical positivity/happiness conveyed
- **tempo** (BPM): Overall estimated tempo
- **speechiness** (0-1): Presence of spoken words
- **acousticness** (0-1): Confidence measure of acoustic-ness
- **instrumentalness** (0-1): Predicts whether track contains vocals
- **liveness** (0-1): Detects presence of audience in recording
- **loudness** (dB): Overall loudness of track

## 🔑 Authentication

All protected endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Tokens are obtained through the `/auth/login` endpoint and expire after a configured period.