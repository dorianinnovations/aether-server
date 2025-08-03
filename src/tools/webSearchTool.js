/**
 * WEB SEARCH TOOL - Enhanced with GPT-4o Integration
 * Advanced web search with structured output, deep content analysis, and intelligent context filtering
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { createLLMService } from '../services/llmService.js';

const llmService = createLLMService();

// Context filtering patterns to prevent excessive web search calls
const SEARCH_TRIGGERS = [
  // Direct search requests
  /(?:search|find|look up|google|bing)\s+(?:for\s+)?(.+)/i,
  // Current events/news
  /(?:what'?s|latest|recent|current|news about|happening with)\s+(.+)/i,
  // Factual queries
  /(?:when|where|who|what|how|why)\s+(?:is|are|was|were|did|does|do)\s+(.+)/i,
  // Definitions
  /(?:what is|define|meaning of|explain)\s+(.+)/i,
  // Statistics/data
  /(?:statistics|data|numbers|facts about)\s+(.+)/i,
  // Comparisons
  /(?:compare|difference between|vs|versus)\s+(.+)/i
];

// Topics that should NOT trigger web search
const NO_SEARCH_PATTERNS = [
  /^(?:hello|hi|hey|thanks|thank you|ok|okay|yes|no|maybe)$/i,
  /^(?:how are you|good morning|good afternoon|good evening)$/i,
  /^(?:i think|i feel|i believe|in my opinion).*$/i,
  /^(?:can you help|could you|would you|please).*(?:with|me).*$/i
];

// Lightweight cache for search results (1 minute TTL, max 10 entries)
const searchCache = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute
const MAX_CACHE_SIZE = 10;

// Smart context filtering to determine if web search is needed
function shouldTriggerWebSearch(query, userContext) {
  // Skip search for simple conversational messages
  for (const pattern of NO_SEARCH_PATTERNS) {
    if (pattern.test(query.trim())) {
      return false;
    }
  }
  
  // Check for explicit search triggers
  for (const pattern of SEARCH_TRIGGERS) {
    if (pattern.test(query)) {
      return true;
    }
  }
  
  // Use GPT-4o to determine if web search would be helpful
  const searchKeywords = [
    'current', 'latest', 'recent', 'news', 'update', 'today', 'now',
    'price', 'cost', 'statistics', 'data', 'facts', 'compare', 'vs',
    'who is', 'what is', 'when did', 'where is', 'how to'
  ];
  
  const hasSearchKeywords = searchKeywords.some(keyword => 
    query.toLowerCase().includes(keyword)
  );
  
  return hasSearchKeywords;
}

export default async function webSearchTool(args, userContext) {
  const { query, forceSearch = false } = args;
  
  if (!query) {
    return { success: false, structure: { results: [] } };
  }

  // Context filtering - only search when truly needed
  if (!forceSearch && !shouldTriggerWebSearch(query, userContext)) {
    console.log(`🚫 Skipping web search for conversational query: "${query}"`);
    return { 
      success: false, 
      structure: { 
        results: [], 
        skipped: true, 
        reason: 'Query does not require web search' 
      } 
    };
  }

  console.log(`🔍 Web search triggered for: "${query}"`);
  
  // Try SerpAPI first if available
  if (process.env.SERPAPI_API_KEY) {
    try {
      console.log('📡 Using SerpAPI...');
      const response = await axios.get('https://serpapi.com/search', {
        params: {
          api_key: process.env.SERPAPI_API_KEY,
          engine: 'google',
          q: query,
          num: 5
        },
        timeout: 5000
      });

      console.log(`✅ SerpAPI returned ${response.data.organic_results?.length || 0} results`);
      
      if (response.data.organic_results) {
        return {
          success: true,
          structure: {
            query,
            results: response.data.organic_results.map((item, i) => ({
              title: item.title,
              snippet: item.snippet,
              link: item.link,
              position: i + 1
            })),
            analysis: `SerpAPI found ${response.data.organic_results.length} results for: ${query}`
          }
        };
      }
    } catch (error) {
      console.error('❌ SerpAPI failed:', error.message);
    }
  }

  // Try Google Custom Search as fallback
  if (process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_ENGINE_ID) {
    try {
      console.log('📡 Fallback to Google Custom Search...');
      const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          key: process.env.GOOGLE_SEARCH_API_KEY,
          cx: process.env.GOOGLE_SEARCH_ENGINE_ID,
          q: query,
          num: 5
        },
        timeout: 5000
      });

      console.log(`✅ Google Custom Search returned ${response.data.items?.length || 0} results`);

      if (response.data.items) {
        return {
          success: true,
          structure: {
            query,
            results: response.data.items.map((item, i) => ({
              title: item.title,
              snippet: item.snippet,
              link: item.link,
              position: i + 1
            })),
            analysis: `Google found ${response.data.items.length} results for: ${query}`
          }
        };
      }
    } catch (error) {
      console.error('❌ Google Custom Search failed:', error.message);
    }
  }

  // Fallback results
  return {
    success: true,
    structure: {
      query,
      results: [
        {
          title: `Search Results for: ${query}`,
          snippet: "Web search is currently unavailable. Please try again later or check your internet connection.",
          link: "https://google.com/search?q=" + encodeURIComponent(query),
          position: 1
        }
      ],
      analysis: `Search functionality temporarily limited for: ${query}`
    }
  };

  try {
    const searchStart = Date.now();
    console.log(`🔍 Searching: "${query}" | Depth: ${depth} | Format: ${format}`);

    // Step 1: Multi-source search
    const searchResults = await performAdvancedSearch(query, maxResults, realTime);
    
    if (!searchResults || searchResults.length === 0) {
      return {
        success: false,
        error: 'No search results found',
        structure: { 
          query, 
          results: [], 
          analysis: 'No relevant information found on the web for this query.',
          searchTime: Date.now() - searchStart
        }
      };
    }

    // Step 2: Deep content extraction (parallel processing)
    let contentData = [];
    if (depth === 'deep' || depth === 'insane') {
      const contentExtractionStart = Date.now();
      contentData = await extractDeepContent(searchResults.slice(0, 3)); // Reduced from 5 to 3 for speed
      console.log(`📄 Content extraction took ${Date.now() - contentExtractionStart}ms`);
    }

    // Step 3: Generate structured analysis
    const analysis = await generateStructuredAnalysis(query, searchResults, contentData, format, depth);

    const searchTime = Date.now() - searchStart;
    console.log(`✅ INSANE SEARCH completed in ${searchTime}ms`);

    return {
      success: true,
      structure: {
        query,
        searchTime,
        totalResults: searchResults.length,
        depth,
        format,
        results: searchResults.map(formatResult),
        deepContent: contentData.length > 0 ? contentData : null,
        analysis: analysis,
        metadata: {
          timestamp: new Date().toISOString(),
          sources: searchResults.length,
          contentExtracted: contentData.length,
          reliability: calculateReliability(searchResults)
        }
      }
    };

  } catch (error) {
    console.error('❌ INSANE WEB SEARCH ERROR:', error);
    return {
      success: false,
      error: error.message,
      structure: { 
        query, 
        results: [], 
        analysis: `Search failed: ${error.message}`,
        searchTime: 0
      }
    };
  }
}

async function performAdvancedSearch(query, maxResults, realTime) {
  // Check cache first (only for non-real-time searches)
  if (!realTime) {
    const cacheKey = `${query}:${maxResults}`;
    const cached = searchCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log(`💨 Cache hit for "${query}" - using cached results`);
      return cached.results;
    }
  }

  const results = [];
  
  console.log(`🔍 Starting search with SerpAPI for: "${query}"`);
  
  // Check if any search API keys are available
  console.log(`🔑 API Keys Check: SERPAPI=${!!process.env.SERPAPI_API_KEY}, GOOGLE=${!!process.env.GOOGLE_SEARCH_API_KEY}`);
  
  if (!process.env.SERPAPI_API_KEY && !process.env.GOOGLE_SEARCH_API_KEY) {
    console.error('⚠️ No search API keys configured - web search unavailable');
    throw new Error('Web search functionality requires API keys to be configured. Please set SERPAPI_API_KEY or GOOGLE_SEARCH_API_KEY environment variables.');
  }
  
  
  // Primary: Use SerpAPI (most reliable)
  if (process.env.SERPAPI_API_KEY) {
    try {
      const searchParams = {
        q: query,
        api_key: process.env.SERPAPI_API_KEY,
        engine: 'google',
        num: maxResults,
        gl: 'us', // Country
        hl: 'en'  // Language
      };

      // Add real-time news parameters
      if (realTime) {
        searchParams.tbm = 'nws'; // News search
        searchParams.tbs = 'qdr:w'; // Past week
      }

      console.log(`📡 SerpAPI request params:`, searchParams);

      const response = await axios.get('https://serpapi.com/search', {
        params: searchParams,
        timeout: 5000  // Fast timeout for better UX
      });

      console.log(`📊 SerpAPI response status: ${response.status}`);
      console.log(`📊 Organic results: ${response.data.organic_results?.length || 0}`);
      console.log(`📊 News results: ${response.data.news_results?.length || 0}`);

      // Process organic results
      if (response.data.organic_results) {
        results.push(...response.data.organic_results.map(result => ({
          title: result.title,
          link: result.link,
          snippet: result.snippet,
          position: result.position,
          source: 'google-organic',
          date: result.date || null,
          displayedLink: result.displayed_link
        })));
      }

      // Add news results if available
      if (response.data.news_results) {
        results.push(...response.data.news_results.slice(0, 3).map(result => ({
          title: result.title,
          link: result.link,
          snippet: result.snippet,
          source: 'google-news',
          date: result.date,
          thumbnail: result.thumbnail
        })));
      }

      // Add related questions if available
      if (response.data.related_questions) {
        console.log(`❓ Found ${response.data.related_questions.length} related questions`);
      }

      console.log(`✅ SerpAPI returned ${results.length} total results`);

    } catch (error) {
      console.error('❌ SerpAPI search failed:', error.response?.data || error.message);
      
      // Try Google Custom Search as fallback
      if (process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_ENGINE_ID) {
        try {
          console.log(`🔄 Falling back to Google Custom Search API`);
          
          const googleResponse = await axios.get('https://www.googleapis.com/customsearch/v1', {
            params: {
              key: process.env.GOOGLE_SEARCH_API_KEY,
              cx: process.env.GOOGLE_SEARCH_ENGINE_ID,
              q: query,
              num: Math.min(maxResults, 10) // Google allows max 10
            },
            timeout: 6000  // Reduced timeout for fallback
          });

          if (googleResponse.data.items) {
            results.push(...googleResponse.data.items.map((item, index) => ({
              title: item.title,
              link: item.link,
              snippet: item.snippet,
              position: index + 1,
              source: 'google-custom',
              date: null
            })));
            
            console.log(`✅ Google Custom Search returned ${results.length} results`);
          }

        } catch (googleError) {
          console.error('❌ Google Custom Search also failed:', googleError.message);
        }
      }
    }
  }

  if (results.length === 0) {
    console.warn('⚠️ All search APIs failed, returning fallback message');
    return [{
      title: "Web Search Currently Unavailable",
      link: "https://numina.ai",
      snippet: "Web search functionality is temporarily unavailable. This could be due to API limits or network issues. Please try again in a few minutes.",
      position: 1,
      source: 'system-fallback',
      date: new Date().toISOString()
    }];
  }

  const finalResults = results.slice(0, maxResults);

  // Lightweight caching with size limit
  if (!realTime && finalResults.length > 0) {
    const cacheKey = `${query}:${maxResults}`;
    
    // Remove expired entries and manage cache size
    if (searchCache.size >= MAX_CACHE_SIZE) {
      const oldestKey = searchCache.keys().next().value;
      searchCache.delete(oldestKey);
    }
    
    searchCache.set(cacheKey, {
      results: finalResults,
      timestamp: Date.now()
    });
  }

  return finalResults;
}

async function extractDeepContent(searchResults) {
  const contentPromises = searchResults.map(async (result) => {
    try {
      const response = await axios.get(result.link, {
        timeout: 5000,  // Reduced from 8s to 5s
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SearchBot/1.0)'
        }
      });

      const $ = cheerio.load(response.data);
      
      // Remove unwanted elements
      $('script, style, nav, footer, aside, .ad, .advertisement').remove();
      
      // Extract main content with better selectors
      let mainContent = '';
      
      // Try multiple content selectors in order of preference
      const contentSelectors = [
        'main article',
        'article',
        'main',
        '.content',
        '.post-content',
        '.entry-content',
        '.article-content',
        'div[role="main"]',
        '#content',
        '.main-content'
      ];
      
      for (const selector of contentSelectors) {
        const content = $(selector).first().text().trim();
        if (content && content.length > 200) {
          mainContent = content;
          break;
        }
      }
      
      // Fallback to body if no good content found
      if (!mainContent || mainContent.length < 100) {
        mainContent = $('body').text();
      }
      
      const cleanContent = mainContent
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, ' ')
        .trim()
        .substring(0, 2500); // Slightly reduced for better performance

      return {
        url: result.link,
        title: result.title,
        content: cleanContent,
        wordCount: cleanContent.split(' ').length,
        extracted: cleanContent.length > 200,
        contentQuality: cleanContent.length > 1000 ? 'high' : cleanContent.length > 500 ? 'medium' : 'low'
      };

    } catch (error) {
      console.warn(`Content extraction failed for ${result.link}:`, error.message);
      return {
        url: result.link,
        title: result.title,
        content: result.snippet || '',
        wordCount: 0,
        extracted: false,
        error: error.message
      };
    }
  });

  return Promise.all(contentPromises);
}

async function generateStructuredAnalysis(query, searchResults, contentData, format, depth) {
  const analysisPrompt = `You are an advanced search analyst. Analyze the following search results for the query: "${query}"

SEARCH RESULTS:
${searchResults.map((r, i) => `${i+1}. ${r.title}\n   ${r.snippet}\n   Source: ${r.link}`).join('\n\n')}

${contentData.length > 0 ? `
DEEP CONTENT EXTRACTED:
${contentData.map((c, i) => `${i+1}. ${c.title} (${c.wordCount} words)\n   ${c.content.substring(0, 500)}...`).join('\n\n')}
` : ''}

Format: ${format}
Depth: ${depth}

Provide a ${format} analysis that includes:
1. Key findings and insights
2. Important facts and data points  
3. Different perspectives or viewpoints
4. Credibility assessment of sources
5. Actionable conclusions

${format === 'structured' ? 'Use clear headings, bullet points, and organize information logically.' : ''}
${format === 'narrative' ? 'Write in a flowing, story-like format that connects all information.' : ''}
${format === 'bullet' ? 'Use concise bullet points and short summaries.' : ''}

Be comprehensive but concise. Focus on the most valuable and actionable information.`;

  try {
    const analysisResponse = await llmService.makeLLMRequest([
      { role: 'system', content: 'You are an expert research analyst who synthesizes web search results into clear, actionable insights.' },
      { role: 'user', content: analysisPrompt }
    ], {
      temperature: 0.3,
      n_predict: 1200  // Reduced from 2000 to 1200 for faster response
    });

    return analysisResponse.content || 'Analysis could not be generated.';

  } catch (error) {
    console.error('Analysis generation failed:', error);
    return `Search completed but analysis failed: ${error.message}`;
  }
}

function formatResult(result) {
  return {
    title: result.title,
    url: result.link,
    snippet: result.snippet,
    source: result.source || 'web',
    position: result.position,
    date: result.date || null,
    relevanceScore: calculateRelevanceScore(result)
  };
}

function calculateRelevanceScore(result) {
  let score = 0;
  
  // Higher score for news sources
  if (result.source === 'news') score += 0.2;
  
  // Higher score for recent content
  if (result.date) {
    const daysAgo = (Date.now() - new Date(result.date).getTime()) / (1000 * 60 * 60 * 24);
    if (daysAgo < 7) score += 0.3;
    else if (daysAgo < 30) score += 0.1;
  }
  
  // Higher score for longer snippets (more content)
  if (result.snippet && result.snippet.length > 100) score += 0.2;
  
  // Higher score for top positions
  if (result.position <= 3) score += 0.3;
  else if (result.position <= 5) score += 0.1;
  
  return Math.min(1.0, score + 0.5); // Base score + bonuses
}

function calculateReliability(searchResults) {
  const totalResults = searchResults.length;
  const newsResults = searchResults.filter(r => r.source === 'news').length;
  const recentResults = searchResults.filter(r => r.date && 
    (Date.now() - new Date(r.date).getTime()) < 7 * 24 * 60 * 60 * 1000).length;
  
  let reliability = 0.5; // Base reliability
  
  if (totalResults >= 5) reliability += 0.2;
  if (newsResults > 0) reliability += 0.2;
  if (recentResults > 0) reliability += 0.1;
  
  return Math.min(1.0, reliability);
}