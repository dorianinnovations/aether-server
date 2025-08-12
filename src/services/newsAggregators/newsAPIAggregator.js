/**
 * NewsAPI Aggregator - Premium news source
 * Handles paid NewsAPI integration with strict user filtering
 */

import fetch from 'node-fetch';
import strictArtistMatcher from './strictArtistMatcher.js';

class NewsAPIAggregator {
  constructor() {
    this.newsAPIKey = process.env.NEWSAPI_KEY;
    this.newsAPIBaseUrl = 'https://newsapi.org/v2';
  }

  /**
   * Get music news from NewsAPI with STRICT USER FILTERING
   */
  async getMusicNewsFromNewsAPI(artistNames, feedType = 'timeline', limit = 20) {
    if (!this.newsAPIKey) {
      console.log('[DEBUG] NewsAPI - No API key configured');
      return [];
    }

    try {
      console.log(`[DEBUG] NewsAPI - STRICT filtering for ${artistNames.length} user artists`);
      
      const allArticles = [];
      
      // Build search queries for different content types
      let searchQueries = [];
      
      if (feedType === 'releases') {
        // Focus on release-related searches with user's artists
        searchQueries = artistNames.map(artist => `"${artist}" AND ("new album" OR "new single" OR "dropped" OR "released")`);
      } else if (feedType === 'tours') {
        // Focus on tour/concert searches with user's artists
        searchQueries = artistNames.map(artist => `"${artist}" AND ("tour" OR "concert" OR "live show" OR "tour dates")`);
      } else {
        // General music news for user's artists
        searchQueries = artistNames.map(artist => `"${artist}" AND (music OR hip-hop OR rap)`);
      }

      // Search each artist individually
      for (const query of searchQueries.slice(0, 5)) { // Limit API calls
        try {
          const response = await fetch(`${this.newsAPIBaseUrl}/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=20&apiKey=${this.newsAPIKey}`);
          const data = await response.json();
          
          if (data.articles) {
            data.articles.forEach(article => {
              const content = `${article.title} ${article.description}`.toLowerCase();
              
              // STRICT FILTERING: Only include if it mentions user's actual artists
              const mentionedArtist = strictArtistMatcher.strictArtistMatch(content, artistNames);
              if (mentionedArtist) {
                // User's artist mentioned - definitely include
                const relevanceScore = this.calculateRelevance(content, mentionedArtist);
                const boostedScore = relevanceScore + 0.8; // Higher boost for user's artists
                allArticles.push({
                  id: `newsapi_${article.publishedAt}_${Math.random()}`,
                  type: feedType,
                  title: article.title,
                  description: article.description || article.content?.substring(0, 200) + '...',
                  source: article.source?.name || 'NewsAPI',
                  publishedAt: article.publishedAt,
                  url: article.url,
                  imageUrl: article.urlToImage,
                  relevanceScore: boostedScore,
                  artistName: mentionedArtist,
                  isPremium: true
                });
              }
            });
          }
        } catch (error) {
          console.log(`[DEBUG] NewsAPI - Query failed:`, error.message);
        }
      }

      console.log(`[DEBUG] NewsAPI - Strict filtering: ${allArticles.length} articles for user's artists`);
      return allArticles.slice(0, limit);

    } catch (error) {
      console.error('[DEBUG] NewsAPI error:', error);
      return [];
    }
  }

  /**
   * Calculate relevance score
   */
  calculateRelevance(content, artistName) {
    const name = artistName.toLowerCase();
    let score = 0.3; // Base score for user's artist content
    
    // Primary artist name match
    if (content.includes(name)) {
      score += 0.8;
    }
    
    // Partial name matches (for multi-word artists)
    const nameParts = name.split(/[\s,]+/).filter(part => part.length > 2);
    nameParts.forEach(part => {
      if (content.includes(part)) {
        score += 0.3;
      }
    });
    
    // Music context keywords
    const musicKeywords = ['album', 'single', 'song', 'track', 'music', 'rapper', 'hip-hop', 'rap', 'artist'];
    musicKeywords.forEach(keyword => {
      if (content.includes(keyword)) score += 0.1;
    });
    
    // Engagement keywords
    const engagementKeywords = ['new', 'released', 'dropped', 'announced', 'exclusive', 'breaking'];
    engagementKeywords.forEach(keyword => {
      if (content.includes(keyword)) score += 0.1;
    });
    
    return Math.min(score, 1.5); // Allow higher scores for multiple matches
  }
}

export default new NewsAPIAggregator();