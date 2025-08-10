/**
 * Vector utilities for embeddings, MMR, and similarity
 * With safe fallback when API keys are missing
 */

import 'dotenv/config';
import { env } from '../config/environment.js';

const OPENROUTER_API_KEY = env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
const OPENAI_API_KEY = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-3-small';  // Use small model - cheaper and OpenRouter compatible
const BACKUP_EMBEDDING_MODEL = 'text-embedding-3-large';

/**
 * Generate embedding for text with fallback
 */
export async function embed(text) {
  // Check if embeddings are disabled via env var
  if (process.env.RAG_EMBED_DISABLED === '1') {
    return cheapHashEmbedding(text, 1536);
  }

  // EMERGENCY FIX: Skip API calls - they're all failing and causing 6+ second delays
  // Use fast embedding immediately until APIs are stable
  console.log('[EMBED] Using fast embedding to avoid API delays');
  return cheapHashEmbedding(text, 1536);
}

/**
 * OpenRouter embedding with retry logic
 */
async function openRouterEmbeddingWithRetry(text, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await openRouterEmbedding(text);
      if (result) {
        console.log(`[EMBED] OpenRouter success on attempt ${attempt}`);
        return result;
      }
    } catch (error) {
      // Only log detailed errors on final attempt to reduce spam
      if (attempt === maxRetries) {
        console.error(`[EMBED] OpenRouter failed after ${maxRetries} attempts:`, error.message);
      } else {
        console.log(`[EMBED] OpenRouter attempt ${attempt}/${maxRetries} failed, retrying...`);
      }
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  console.error('[EMBED] OpenRouter failed after all retries');
  return null;
}

/**
 * Real OpenRouter embedding
 */
async function openRouterEmbedding(text) {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/text-embedding-3-small', // Fix: OpenRouter needs provider prefix
        input: text
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Check if OpenRouter is returning HTML (rate limit/maintenance page)
      if (errorText.includes('<!DOCTYPE') || errorText.includes('<html>')) {
        throw new Error(`OpenRouter API returning HTML (likely rate limited or maintenance): HTTP ${response.status}`);
      }
      console.error(`[EMBED] API error response: ${errorText.substring(0, 200)}...`);
      throw new Error(`Embedding failed: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    
    if (!json.data || !json.data[0] || !json.data[0].embedding) {
      throw new Error('Invalid embedding response structure');
    }

    return json.data[0].embedding;
  } catch (error) {
    console.error('[EMBED] OpenRouter error:', error.message);
    throw error; // Let retry logic handle this
  }
}

/**
 * OpenAI direct embedding backup
 */
async function openAIEmbedding(text) {
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: BACKUP_EMBEDDING_MODEL,
        input: text
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[EMBED] OpenAI API error response: ${errorText}`);
      throw new Error(`OpenAI embedding failed: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    
    if (!json.data || !json.data[0] || !json.data[0].embedding) {
      throw new Error('Invalid OpenAI embedding response structure');
    }

    console.log('[EMBED] OpenAI backup successful');
    return json.data[0].embedding;
  } catch (error) {
    console.error('[EMBED] OpenAI backup error:', error.message);
    return null;
  }
}

/**
 * Cheap hash-based embedding fallback
 */
function cheapHashEmbedding(text, dims = 512) {
  const v = new Array(dims).fill(0);
  const tokens = (text || '').toLowerCase().split(/\W+/).filter(Boolean);
  
  for (const token of tokens) {
    let hash = 2166136261; // FNV offset basis
    for (let i = 0; i < token.length; i++) {
      hash = (hash ^ token.charCodeAt(i)) * 16777619; // FNV prime
      hash = hash >>> 0; // Convert to 32-bit unsigned
    }
    v[hash % dims] += 1;
  }
  
  // L2 normalize
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map(x => x / norm);
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Score memories by cosine similarity
 */
export function scoreByCosine(memories, queryVec) {
  return memories.map(memory => ({
    memory,
    similarity: cosineSimilarity(queryVec, memory.embedding)
  })).sort((a, b) => b.similarity - a.similarity);
}

/**
 * Maximal Marginal Relevance for diversity
 */
export function mmr(candidates, queryVec, { k = 10, lambda = 0.7 } = {}) {
  if (candidates.length <= k) return candidates;
  
  const selected = [];
  const remaining = [...candidates];
  
  // Select most relevant first
  const first = remaining.splice(0, 1)[0];
  selected.push(first);
  
  // Iteratively select diverse items
  while (selected.length < k && remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const relevance = candidate.similarity;
      
      // Calculate max similarity to already selected
      const maxSim = Math.max(...selected.map(s => 
        cosineSimilarity(candidate.memory.embedding, s.memory.embedding)
      ));
      
      // MMR score: λ*relevance - (1-λ)*maxSimilarity
      const mmrScore = lambda * relevance - (1 - lambda) * maxSim;
      
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }
    
    selected.push(remaining.splice(bestIdx, 1)[0]);
  }
  
  return selected;
}

/**
 * Summarize text to target token count using GPT-5
 */
export async function summarize(text, maxTokens = 1000) {
  if (!OPENROUTER_API_KEY) {
    // Fallback: just truncate
    const maxChars = maxTokens * 4; // rough estimate
    return text.length > maxChars ? text.substring(0, maxChars) + '...' : text;
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Title': 'Aether Memory Compression'
      },
      body: JSON.stringify({
        model: 'openai/gpt-5-mini',
        messages: [{
          role: 'user',
          content: `Summarize this user memory context into key facts. Keep under ${maxTokens/4} words. Focus on preferences, projects, and stable traits:\n\n${text}`
        }],
        max_tokens: maxTokens,
        temperature: 0.3
      })
    });

    const data = await response.json();
    return data.choices[0]?.message?.content || text.substring(0, maxTokens * 4);
  } catch (error) {
    console.error('[SUMMARIZE] Error:', error);
    return text.substring(0, maxTokens * 4);
  }
}

/**
 * Format memory block for system message
 */
export function formatMemoryBlock(content) {
  return `<memory_context>\nGuidelines:\n- Use these facts only if relevant\n- Do NOT invent details not present\n\n${content}\n</memory_context>`;
}