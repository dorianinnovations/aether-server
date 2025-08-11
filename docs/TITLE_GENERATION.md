# AI-Powered Conversation Title Generation

## Overview
Ultra-cheap AI-powered conversation titles using Llama 3.1 8B via OpenRouter (~$0.18/1M tokens).

## Architecture

### Backend Integration
- **LLM Service** (`src/services/llmService.js`): Core title generation using Llama 3.1 8B
- **Conversation Service** (`src/services/conversationService.js`): Auto-generation logic
- **API Endpoint** (`src/routes/conversation.js`): `POST /conversations/:id/generate-title`

### Frontend Integration
- **OpenRouter Service** (`src/services/openRouterService.ts`): Direct client-side generation
- **ChatAPI** (`src/services/apiModules/endpoints/chat.ts`): Backend title generation calls
- **React Hook** (`src/hooks/useConversationTitleGeneration.ts`): Easy integration

## How It Works

### Automatic Title Generation
1. User sends first message in conversation
2. Backend automatically queues title generation (background)
3. Llama 3.1 8B generates a 2-5 word title
4. Title is saved to conversation in database
5. Frontend shows updated title on next refresh

### Cost Analysis
- **Per title**: ~$0.000002 (basically free)
- **1000 titles**: ~$0.002 (less than a penny)
- **10,000 titles**: ~$0.02 (2 cents)

### Fallback Strategy
1. **Primary**: AI-generated title via Llama 3.1 8B
2. **Fallback**: First 40 characters of user message
3. **Final**: "New Chat" with timestamp

## API Usage

### Generate Title (Manual)
```bash
POST /conversations/:conversationId/generate-title
Authorization: Bearer <token>
Content-Type: application/json

{
  "firstMessage": "What's the weather like in San Francisco?"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "title": "San Francisco Weather",
    "conversationId": "...",
    "fallback": false,
    "model": "meta-llama/llama-3.1-8b-instruct",
    "usage": { "total_tokens": 45 }
  }
}
```

### Update Title (Manual)
```bash
PUT /conversations/:conversationId/title
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Custom Title"
}
```

## Frontend Usage

### React Hook
```typescript
import { useConversationTitleGeneration } from '../hooks';

const { generateTitleDebounced } = useConversationTitleGeneration();

// Auto-generate when first message sent
generateTitleDebounced(
  conversationId, 
  firstMessage, 
  (title) => {
    setConversationTitle(title);
  }
);
```

### Direct API Call
```typescript
import { ChatAPI } from '../services/apiModules/endpoints/chat';

const title = await ChatAPI.generateConversationTitle(firstMessage);
```

## Configuration

### Environment Variables
```env
# Required for title generation
OPENROUTER_API_KEY=your_openrouter_api_key
EXPO_PUBLIC_OPENROUTER_API_KEY=your_openrouter_api_key  # Frontend
```

### Model Configuration
- **Model**: `meta-llama/llama-3.1-8b-instruct`
- **Max Tokens**: 20
- **Temperature**: 0.3
- **Stop Sequences**: `['\n', '.', '!', '?']`

## Monitoring & Logging

### Backend Logs
- `🎯 Generating title for conversation {id}`
- `✨ Generated title: "{title}" (fallback)`
- `💰 Title generation: X tokens (~$Y.ZZZZZZ)`

### Error Handling
- API failures gracefully fall back to local generation
- Network errors don't block conversation creation
- All errors logged for monitoring

## Performance

### Automatic Generation
- Runs in background (non-blocking)
- Uses `setImmediate` for optimal performance
- Only triggers on first user message

### Client-Side Caching
- Titles cached locally to avoid regeneration
- Debounced requests prevent spam
- Graceful degradation when offline

## Future Enhancements

1. **Batch Generation**: Process multiple conversations at once
2. **Context-Aware Titles**: Use conversation history for better titles
3. **Personalization**: User-specific title styles
4. **Analytics**: Track title generation success rates
5. **A/B Testing**: Compare different prompting strategies

## Security

- API key stored securely in environment
- Rate limiting prevents abuse
- User authentication required for all endpoints
- Input validation on all requests

## Cost Optimization

- Ultra-cheap model selection (Llama 3.1 8B)
- Message truncation to 200 chars max
- Minimal token usage (avg 45 tokens per request)
- Fallback mechanisms reduce API calls
- Background processing prevents blocking

---

**Status**: ✅ Fully Integrated  
**Cost**: ~$0.000002 per title  
**Performance**: Non-blocking, auto-generated  
**Reliability**: Multiple fallback strategies