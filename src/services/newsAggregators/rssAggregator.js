/**
 * RSS News Aggregator - Primary content source
 * Handles RSS feeds from music news sources with strict filtering
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import strictArtistMatcher from './strictArtistMatcher.js';
import feedTypeStrategies from './feedTypeStrategies.js';

class RSSAggregator {
  constructor() {
    // RSS feeds - most reliable source
    this.rssSources = [
      {
        name: 'Pitchfork',
        url: 'https://pitchfork.com/rss/news/',
        type: 'music'
      },
      {
        name: 'Rolling Stone',
        url: 'https://www.rollingstone.com/music/rss/',
        type: 'music'
      },
      {
        name: 'Complex Music',
        url: 'https://www.complex.com/music/rss.xml',
        type: 'hiphop'
      },
      {
        name: 'Billboard',
        url: 'https://www.billboard.com/c/music/rss.xml',
        type: 'music'
      }
    ];
  }

  /**
   * Get music news from RSS feeds with STRICT filtering
   */
  async getMusicNewsFromRSS(artistNames, feedType = 'timeline', limit = 15) {
    try {
      console.log(`[DEBUG] RSS - STRICT filtering for ${artistNames.length} user artists`);
      
      const allArticles = [];
      
      // Fetch from all RSS sources in parallel
      const rssPromises = this.rssSources.map(source => 
        this.parseRSSFeed(source.url, source)
      );
      
      const rssResults = await Promise.all(rssPromises);
      
      // Flatten all articles
      rssResults.forEach(articles => {
        allArticles.push(...articles);
      });
      
      console.log(`[DEBUG] RSS - Total articles before filtering: ${allArticles.length}`);
      
      // ULTRA STRICT FILTERING: ONLY content about user's actual artists
      const relevantArticles = [];
      allArticles.forEach(article => {
        const content = `${article.title} ${article.description}`.toLowerCase();
        
        // Check for user's artist mentions ONLY
        const mentionedArtist = strictArtistMatcher.strictArtistMatch(content, artistNames);
        
        if (mentionedArtist) {
          // Content type filtering based on feedType
          let contentBonus = 0.2; // Base bonus for user artist match
          
          if (feedType === 'releases') {
            const isRelease = feedTypeStrategies.containsReleaseKeywords(content);
            contentBonus = isRelease ? 0.5 : 0.1;
          } else if (feedType === 'tours') {
            const isTour = feedTypeStrategies.containsTourKeywords(content);
            contentBonus = isTour ? 0.5 : 0.1;
          } else if (feedType === 'news') {
            const isNews = feedTypeStrategies.containsNewsKeywords(content);
            contentBonus = isNews ? 0.3 : 0.1;
          }
          
          let relevanceScore = this.calculateRelevance(content, mentionedArtist);
          
          // MAJOR boost for user's actual artists
          relevanceScore += 0.9; // Maximum boost for user's artists
          relevanceScore += contentBonus;
          
          console.log(`[DEBUG] RSS - MATCH: "${article.title}" mentions user's artist: ${mentionedArtist}`);
          
          relevantArticles.push({
            id: `rss_${Date.now()}_${Math.random()}`,
            type: feedType,
            title: article.title,
            description: article.description,
            source: article.source,
            publishedAt: article.publishedAt,
            url: article.link,
            imageUrl: this.extractImageFromRSS(article), 
            relevanceScore,
            artistName: mentionedArtist,
            isFresh: true
          });
        } else {
          console.log(`[DEBUG] RSS - REJECTED: "${article.title}" - no user artist match`);
        }
      });
      
      console.log(`[DEBUG] RSS - Relevant ${feedType} articles: ${relevantArticles.length}/${allArticles.length}`);
      
      // Sort by relevance and recency
      const sortedArticles = relevantArticles
        .sort((a, b) => {
          const scoreA = b.relevanceScore + feedTypeStrategies.getRecencyScore(b.publishedAt);
          const scoreB = a.relevanceScore + feedTypeStrategies.getRecencyScore(a.publishedAt);
          return scoreA - scoreB;
        })
        .slice(0, limit);
        
      console.log(`[DEBUG] RSS - Final ${feedType} articles returned: ${sortedArticles.length}`);
      return sortedArticles;

    } catch (error) {
      console.error('[DEBUG] RSS error:', error);
      return [];
    }
  }

  /**
   * Parse RSS feed and extract articles
   */
  async parseRSSFeed(url, source) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MusicBot/1.0)'
        }
      });
      
      if (!response.ok) {
        console.log(`[DEBUG] RSS - ${source.name} returned ${response.status}`);
        return [];
      }
      
      const xml = await response.text();
      const $ = cheerio.load(xml, { xmlMode: true });
      
      const articles = [];
      $('item').each((i, item) => {
        const title = $(item).find('title').text().trim();
        const link = $(item).find('link').text().trim();
        const description = $(item).find('description').text().replace(/<[^>]*>/g, '').trim();
        const pubDate = $(item).find('pubDate').text().trim();
        
        if (title && link) {
          articles.push({
            title,
            link,
            description,
            source: source.name,
            publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString()
          });
        }
      });
      
      console.log(`[DEBUG] RSS - ${source.name}: ${articles.length} articles`);
      return articles;
      
    } catch (error) {
      console.error(`[DEBUG] RSS - Failed to parse ${source.name}:`, error.message);
      return [];
    }
  }

  /**
   * Extract image from RSS article data
   */
  extractImageFromRSS(article) {
    if (article.description) {
      const $ = cheerio.load(article.description);
      const img = $('img').first();
      if (img.length > 0) {
        return img.attr('src');
      }
    }
    return null;
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

export default new RSSAggregator();