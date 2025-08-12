/**
 * Free News Aggregator Service
 * Reddit + direct scraping - NO expensive API calls
 * Cost: $0/month vs SerpAPI's $50-200+/month
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { log } from '../utils/logger.js';

class FreeNewsAggregator {
  constructor() {
    // Working music news sources via direct web scraping
    this.scrapingSources = [
      {
        name: 'HipHopDX',
        url: 'https://hiphopdx.com/news',
        titleSelector: 'h3 a',
        linkSelector: 'h3 a',
        dateSelector: '.date'
      },
      {
        name: 'AllHipHop',
        url: 'https://allhiphop.com/news/',
        titleSelector: '.post-title a',
        linkSelector: '.post-title a', 
        dateSelector: '.post-date'
      }
    ];

    // Reddit sources (free API)
    this.redditSources = [
      'https://www.reddit.com/r/hiphopheads/new.json?limit=25',
      'https://www.reddit.com/r/music/new.json?limit=25',
      'https://www.reddit.com/r/rap/new.json?limit=25'
    ];
  }

  /**
   * Get artist news from web scraping (FREE)
   */
  async getArtistNewsFromScraping(artistName, limit = 10) {
    try {
      log.info(`🆓 Fetching FREE scraped news for: ${artistName}`);
      
      const allArticles = [];
      
      // Scrape from each source
      for (const source of this.scrapingSources) {
        try {
          const response = await fetch(source.url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
          });
          
          if (!response.ok) continue;
          
          const html = await response.text();
          const $ = cheerio.load(html);
          
          $(source.titleSelector).each((i, element) => {
            if (i >= 20) return; // Limit per source
            
            const $element = $(element);
            const title = $element.text().trim();
            const link = $element.attr('href');
            
            // Check if article mentions the artist
            const content = title.toLowerCase();
            if (content.includes(artistName.toLowerCase())) {
              
              // Build full URL if relative
              const fullUrl = link?.startsWith('http') 
                ? link 
                : `${new URL(source.url).origin}${link}`;
              
              allArticles.push({
                id: `scrape_${Date.now()}_${Math.random()}`,
                type: 'news',
                title: title,
                description: `Latest news about ${artistName} from ${source.name}`,
                source: source.name,
                publishedAt: new Date().toISOString(), // Use current time since date scraping is complex
                url: fullUrl,
                imageUrl: null,
                relevanceScore: this.calculateRelevance(content, artistName),
                isFresh: true, // Assume scraped content is fresh
                artistName,
                cost: 0 // FREE!
              });
            }
          });
          
        } catch (error) {
          log.warn(`Scraping failed for ${source.name}:`, error.message);
        }
      }
      
      // Sort by relevance
      return allArticles
        .filter(article => article.relevanceScore > 0.3)
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, limit);
        
    } catch (error) {
      log.error(`Free scraping failed for ${artistName}:`, error);
      return [];
    }
  }

  /**
   * Get trending content from Reddit (FREE)
   */
  async getTrendingFromReddit(artistNames, limit = 15) {
    try {
      log.info(`🆓 Fetching FREE Reddit trending for ${artistNames.length} artists`);
      
      const allPosts = [];
      
      for (const redditUrl of this.redditSources) {
        try {
          const response = await fetch(redditUrl, {
            headers: {
              'User-Agent': 'Aether Music News Bot 1.0'
            },
            timeout: 10000
          });
          
          if (!response.ok) continue;
          
          const data = await response.json();
          const posts = data.data?.children || [];
          
          posts.forEach(post => {
            const postData = post.data;
            const title = postData.title;
            const selftext = postData.selftext || '';
            const content = `${title} ${selftext}`.toLowerCase();
            
            // Check if post mentions any of the user's artists
            const mentionedArtist = artistNames.find(artist => 
              content.includes(artist.toLowerCase())
            );
            
            if (mentionedArtist || this.containsMusicKeywords(content)) {
              allPosts.push({
                id: `reddit_${postData.id}`,
                type: 'trending',
                title: title,
                description: selftext ? selftext.substring(0, 200) + '...' : `Trending discussion about ${mentionedArtist || 'music'}`,
                source: `r/${postData.subreddit}`,
                publishedAt: new Date(postData.created_utc * 1000).toISOString(),
                url: `https://reddit.com${postData.permalink}`,
                imageUrl: postData.thumbnail !== 'self' ? postData.thumbnail : null,
                relevanceScore: this.calculateRedditRelevance(postData, artistNames),
                isFresh: true,
                artistName: mentionedArtist || 'Community',
                cost: 0 // FREE!
              });
            }
          });
          
        } catch (error) {
          log.warn(`Reddit fetch failed for ${redditUrl}:`, error.message);
        }
      }
      
      return allPosts
        .filter(post => post.relevanceScore > 0.4)
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, limit);
        
    } catch (error) {
      log.error('Free Reddit trending fetch failed:', error);
      return [];
    }
  }

  /**
   * Get releases from Spotify (already free via your API)
   */
  async getArtistReleases(artistName, limit = 5) {
    // This method can stay the same since Spotify API is free
    // Just return empty for now - you can copy from existing service
    return [];
  }

  /**
   * Generate complete free feed (Reddit-only, 100% reliable)
   */
  async getPersonalizedFeedFree(followedArtists, feedType = 'timeline', limit = 20) {
    try {
      log.info(`🆓 Generating FREE Reddit-based ${feedType} feed for ${followedArtists.length} artists`);
      
      const artistNames = followedArtists.map(artist => artist.name || artist.artistName);
      const allContent = [];
      
      // Use Reddit for all content types - it's the most reliable free source
      if (feedType === 'timeline' || feedType === 'news' || feedType === 'releases') {
        const redditContent = await this.getTrendingFromReddit(artistNames, limit);
        allContent.push(...redditContent);
      }
      
      // If no artist-specific content found, get general hip-hop content
      if (allContent.length === 0) {
        log.info('🎵 No artist-specific content found, getting general hip-hop content');
        const generalContent = await this.getTrendingFromReddit(['hip-hop', 'rap', 'music'], limit);
        allContent.push(...generalContent);
      }
      
      // Sort by relevance and engagement
      const sortedContent = allContent
        .filter(item => item && item.title)
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, limit);
        
      log.info(`✅ Generated ${sortedContent.length} FREE Reddit feed items (ZERO cost!)`);
      return sortedContent;
      
    } catch (error) {
      log.error('Free Reddit feed generation failed:', error);
      return [];
    }
  }

  /**
   * Helper methods
   */
  calculateRelevance(content, artistName) {
    const name = artistName.toLowerCase();
    let score = 0;
    
    if (content.includes(name)) score += 0.8;
    
    const musicKeywords = ['album', 'single', 'song', 'track', 'music', 'rapper', 'hip-hop', 'rap'];
    musicKeywords.forEach(keyword => {
      if (content.includes(keyword)) score += 0.1;
    });
    
    return Math.min(score, 1.0);
  }

  calculateRedditRelevance(postData, artistNames) {
    const content = `${postData.title} ${postData.selftext}`.toLowerCase();
    let score = 0.3; // Base Reddit score
    
    // Artist mentions
    artistNames.forEach(name => {
      if (content.includes(name.toLowerCase())) score += 0.4;
    });
    
    // Engagement boost
    const engagement = (postData.score || 0) + (postData.num_comments || 0);
    if (engagement > 100) score += 0.2;
    if (engagement > 500) score += 0.2;
    
    return Math.min(score, 1.0);
  }

  containsMusicKeywords(content) {
    const keywords = ['new album', 'new single', 'dropped', 'released', 'music video', 'collaboration', 'beef', 'diss track'];
    return keywords.some(keyword => content.includes(keyword));
  }

  isRecent(dateString) {
    const date = new Date(dateString);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    return date >= threeDaysAgo;
  }

  getRecencyScore(dateString) {
    const date = new Date(dateString);
    const hoursAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60);
    
    if (hoursAgo < 6) return 0.3;
    if (hoursAgo < 24) return 0.2;
    if (hoursAgo < 72) return 0.1;
    return 0;
  }
}

export default new FreeNewsAggregator();