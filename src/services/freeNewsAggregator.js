/**
 * Free News Aggregator Service - REFACTORED & MODULAR
 * Main orchestrator for STRICT user-personalized content
 * NO MORE IRRELEVANT CONTENT!
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { log } from '../utils/logger.js';
import strictArtistMatcher from './newsAggregators/strictArtistMatcher.js';
import feedTypeStrategies from './newsAggregators/feedTypeStrategies.js';
import rssAggregator from './newsAggregators/rssAggregator.js';
import newsAPIAggregator from './newsAggregators/newsAPIAggregator.js';

class FreeNewsAggregator {
  /**
   * STRICT PERSONALIZED FEED - Only user's artists, no generic content
   */
  async getPersonalizedFeedFree(followedArtists, feedType = 'timeline', limit = 20) {
    try {
      log.info(`🎯 Generating STRICT personalized ${feedType} feed for ${followedArtists.length} artists`);
      
      if (!followedArtists || followedArtists.length === 0) {
        log.warn('No artists provided - returning empty feed');
        return [];
      }
      
      const artistNames = followedArtists.map(artist => artist.name || artist.artistName);
      console.log(`[DEBUG] Feed - Searching content for user's artists: ${artistNames.slice(0, 5).join(', ')}${artistNames.length > 5 ? '...' : ''}`);
      
      const allContent = [];
      
      // PREMIUM: NewsAPI (if available) - STRICT user artist filtering
      if (process.env.NEWSAPI_KEY) {
        console.log(`[DEBUG] Feed - Starting STRICT NewsAPI aggregation for ${feedType}`);
        const newsAPIContent = await newsAPIAggregator.getMusicNewsFromNewsAPI(artistNames, feedType, Math.ceil(limit * 0.6));
        allContent.push(...newsAPIContent);
        console.log(`[DEBUG] Feed - NewsAPI returned ${newsAPIContent.length} STRICT matches`);
      }
      
      // RSS DISABLED - Using NewsAPI only for truly relevant content
      console.log(`[DEBUG] Feed - RSS DISABLED - Using NewsAPI only`);
      // const rssContent = await rssAggregator.getMusicNewsFromRSS(artistNames, feedType, Math.ceil(limit * 0.8));
      // allContent.push(...rssContent);
      console.log(`[DEBUG] Feed - RSS skipped - 0 articles`);
      
      console.log(`[DEBUG] Feed - Total STRICT content: ${allContent.length}`);
      
      // Remove duplicates and apply feed-type specific filtering
      const uniqueContent = this.removeDuplicateArticles(allContent);
      const typeFilteredContent = feedTypeStrategies.applyFeedTypeStrategy(uniqueContent, feedType, artistNames);
      
      console.log(`[DEBUG] Feed - Final ${feedType} content: ${typeFilteredContent.length} items`);
      
      if (typeFilteredContent.length === 0) {
        log.warn(`No relevant ${feedType} content found for user's artists: ${artistNames.slice(0, 3).join(', ')}`);
      }
      
      return typeFilteredContent.slice(0, limit);
      
    } catch (error) {
      log.error(`Error generating personalized feed (${feedType}):`, error);
      return [];
    }
  }

  /**
   * Get trending content from Reddit (if available)
   */
  async getTrendingFromReddit(artistNames, limit = 10) {
    try {
      console.log(`[DEBUG] Reddit - Getting trending for ${artistNames.length} artists`);
      
      const allPosts = [];
      const redditSources = [
        'https://www.reddit.com/r/hiphopheads/new.json?limit=25',
        'https://www.reddit.com/r/music/new.json?limit=25',
        'https://www.reddit.com/r/rap/new.json?limit=25'
      ];
      
      for (const redditUrl of redditSources) {
        try {
          const response = await fetch(redditUrl, {
            headers: {
              'User-Agent': 'MusicAggregator/1.0'
            }
          });
          
          if (response.status === 429) {
            console.log('[DEBUG] Reddit - Rate limited, skipping');
            continue;
          }
          
          if (!response.ok) {
            console.log(`[DEBUG] Reddit - ${redditUrl} returned ${response.status}`);
            continue;
          }
          
          const data = await response.json();
          
          if (data.data && data.data.children) {
            let matchedPosts = 0;
            data.data.children.forEach(child => {
              const postData = child.data;
              const title = postData.title || '';
              const selftext = postData.selftext || '';
              const content = `${title} ${selftext}`.toLowerCase();
              
              // STRICT filtering: Only posts about user's artists
              const mentionedArtist = strictArtistMatcher.strictArtistMatch(content, artistNames);
              
              if (mentionedArtist) {
                matchedPosts++;
                allPosts.push({
                  id: `reddit_${postData.id}`,
                  type: 'trending',
                  title: title,
                  description: selftext ? selftext.substring(0, 200) + '...' : `Trending discussion about ${mentionedArtist}`,
                  source: `r/${postData.subreddit}`,
                  publishedAt: new Date(postData.created_utc * 1000).toISOString(),
                  url: `https://reddit.com${postData.permalink}`,
                  imageUrl: postData.thumbnail?.startsWith('http') ? postData.thumbnail : null,
                  relevanceScore: this.calculateRedditRelevance(postData, artistNames),
                  artistName: mentionedArtist,
                  isTrending: true
                });
              }
            });
            
            console.log(`[DEBUG] Reddit - ${redditUrl}: ${matchedPosts}/${data.data.children.length} posts matched user's artists`);
          }
          
        } catch (error) {
          console.log(`[DEBUG] Reddit - Error fetching ${redditUrl}:`, error.message);
        }
      }
      
      // Sort by relevance and limit
      const sortedPosts = allPosts
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, limit);
      
      console.log(`[DEBUG] Reddit - Returning ${sortedPosts.length} trending posts`);
      return sortedPosts;
      
    } catch (error) {
      console.error('[DEBUG] Reddit trending error:', error);
      return [];
    }
  }

  /**
   * Calculate Reddit relevance score
   */
  calculateRedditRelevance(postData, artistNames) {
    const content = `${postData.title} ${postData.selftext}`.toLowerCase();
    let score = 0.3; // Base Reddit score
    
    // Artist mentions (strict matching for user's artists)
    const mentionedArtist = strictArtistMatcher.strictArtistMatch(content, artistNames);
    if (mentionedArtist) score += 0.6; // Higher boost for user's artists
    
    // Engagement boost
    const engagement = (postData.score || 0) + (postData.num_comments || 0);
    if (engagement > 100) score += 0.2;
    if (engagement > 500) score += 0.2;
    
    return Math.min(score, 1.0);
  }

  /**
   * Scrape full article content (public method)
   */
  async scrapeFullArticleContent(url) {
    try {
      console.log(`[DEBUG] Scraping full content from: ${url.substring(0, 50)}...`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 10000
      });
      
      if (!response.ok) {
        console.log(`[DEBUG] Scraping failed: ${response.status}`);
        return null;
      }
      
      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Remove unwanted elements
      $('script, style, nav, header, footer, .ads, .advertisement, .sidebar, .related, .comments').remove();
      
      // Try multiple content selectors in order of preference
      const contentSelectors = [
        'article .content, article .post-content, article .entry-content',
        '.article-body, .post-body, .entry-body',
        '.content, .post-content, .entry-content',
        'article p, .article p, .post p',
        'p'
      ];
      
      let content = '';
      for (const selector of contentSelectors) {
        const elements = $(selector);
        if (elements.length > 0) {
          content = elements.map((i, el) => $(el).text()).get().join(' ').trim();
          if (content.length > 200) break; // Found substantial content
        }
      }
      
      // Clean up the content
      content = content
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/\n+/g, '\n') // Normalize line breaks
        .substring(0, 2000); // Limit length
      
      // Extract image
      const imageUrl = $('meta[property="og:image"]').attr('content') || 
                      $('article img, .content img, .post img').first().attr('src');
      
      return {
        content: content || 'Content could not be extracted',
        imageUrl: imageUrl
      };
      
    } catch (error) {
      console.log(`[DEBUG] Scraping error:`, error.message);
      return null;
    }
  }

  /**
   * Remove duplicate articles based on title similarity
   */
  removeDuplicateArticles(articles) {
    const unique = [];
    const seenTitles = new Set();
    
    articles.forEach(article => {
      const normalizedTitle = article.title?.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (normalizedTitle && !seenTitles.has(normalizedTitle)) {
        seenTitles.add(normalizedTitle);
        unique.push(article);
      }
    });
    
    console.log(`[DEBUG] Feed - Removed ${articles.length - unique.length} duplicate articles`);
    return unique;
  }
}

export default new FreeNewsAggregator();