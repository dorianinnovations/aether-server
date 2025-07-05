# Numina Server

A modular Express.js server for the Numina AI assistant application.

## Project Structure

```
src/
├── config/
│   └── database.js          # MongoDB connection configuration
├── models/
│   ├── User.js             # User model with authentication
│   ├── ShortTermMemory.js  # Conversation memory model
│   └── Task.js             # Background task model
├── middleware/
│   ├── auth.js             # JWT authentication middleware
│   └── security.js         # CORS, rate limiting, and security headers
├── routes/
│   ├── auth.js             # Authentication routes (signup/login)
│   ├── user.js             # User profile routes
│   ├── health.js           # Health check endpoint
│   ├── completion.js       # LLM completion endpoint
│   └── tasks.js            # Background task processing
├── services/
│   └── llmService.js       # LLM API service
├── utils/
│   ├── sanitize.js         # Response sanitization utilities
│   └── cache.js            # In-memory caching and monitoring
└── server.js               # Main application entry point
```

## Features

- **Modular Architecture**: Clean separation of concerns with dedicated modules
- **Authentication**: JWT-based user authentication
- **LLM Integration**: Integration with external language model API
- **Memory Management**: Short-term conversation memory with TTL
- **Emotional Logging**: Track user emotions and context
- **Task Processing**: Background task queue system
- **Security**: CORS, rate limiting, and security headers
- **Performance**: Connection pooling, caching, and memory monitoring

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file with your configuration:
   ```env
   MONGO_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret
   LLAMA_CPP_API_URL=your_llm_api_url
   PORT=5000
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Start the production server:
   ```bash
   npm start
   ```

## API Endpoints

### Authentication
- `POST /signup` - User registration
- `POST /login` - User login

### User Management
- `GET /profile` - Get user profile (protected)

### LLM Integration
- `POST /completion` - Get AI completion (protected)

### System
- `GET /health` - Health check
- `GET /run-tasks` - Process background tasks (protected)

## Development

The application is now split into logical modules:

- **Models**: Database schemas and models
- **Middleware**: Authentication and security middleware
- **Routes**: API endpoint handlers
- **Services**: External service integrations
- **Utils**: Helper functions and utilities
- **Config**: Configuration files

This modular structure makes the codebase more maintainable and easier to test. 