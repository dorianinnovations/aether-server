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
        dateSelector: '.date',
        contentSelector: '.post-content, .entry-content, article, .content-area'
      },
      {
        name: 'AllHipHop',
        url: 'https://allhiphop.com/news/',
        titleSelector: '.post-title a',
        linkSelector: '.post-title a', 
        dateSelector: '.post-date',
        contentSelector: '.post-content, .entry-content, article, .content-area'
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
   * Scrape full article content from a URL
   */
  async scrapeFullArticle(url, source) {
    try {
      log.info(`📄 Scraping full article from: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 15000
      });
      
      if (!response.ok) {
        log.warn(`Failed to fetch article: ${response.status}`);
        return null;
      }
      
      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Try different content selectors
      let content = '';
      const selectors = [
        source.contentSelector,
        '.post-content p',
        '.entry-content p', 
        'article p',
        '.content-area p',
        '.main-content p',
        'p'
      ];
      
      for (const selector of selectors) {
        const paragraphs = $(selector);
        if (paragraphs.length > 2) { // Need substantial content
          content = paragraphs.map((i, el) => $(el).text().trim())
            .get()
            .filter(text => text.length > 50) // Filter out short paragraphs
            .slice(0, 8) // Take first 8 substantial paragraphs
            .join('\n\n');
          
          if (content.length > 300) break; // Good enough content found
        }
      }
      
      // Clean up the content
      content = content
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/\n\s*\n/g, '\n\n') // Clean up line breaks
        .trim();
      
      // Extract image if available
      let imageUrl = null;
      const imgSelectors = [
        'meta[property="og:image"]',
        '.featured-image img',
        '.post-image img',
        'article img',
        '.content img'
      ];
      
      for (const imgSelector of imgSelectors) {
        const imgSrc = $(imgSelector).first().attr('content') || $(imgSelector).first().attr('src');
        if (imgSrc) {
          imageUrl = imgSrc.startsWith('http') ? imgSrc : `${new URL(url).origin}${imgSrc}`;
          break;
        }
      }
      
      return {
        content: content.length > 100 ? content : null,
        imageUrl
      };
      
    } catch (error) {
      log.error(`Error scraping article ${url}:`, error.message);
      return null;
    }
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
          
          // Collect article URLs first
          const articleUrls = [];
          $(source.titleSelector).each((i, element) => {
            if (i >= 5) return; // Limit to 5 per source for full content scraping
            
            const $element = $(element);
            const title = $element.text().trim();
            const link = $element.attr('href');
            
            // Check if article mentions the artist (flexible matching)
            const titleContent = title.toLowerCase();
            if (this.matchesArtist(titleContent, artistName.toLowerCase())) {
              // Build full URL if relative
              const fullUrl = link?.startsWith('http') 
                ? link 
                : `${new URL(source.url).origin}${link}`;
              
              articleUrls.push({
                title,
                fullUrl,
                relevanceScore: this.calculateRelevance(titleContent, artistName)
              });
            }
          });
          
          // Scrape full content for each article
          for (const article of articleUrls) {
            try {
              const articleData = await this.scrapeFullArticle(article.fullUrl, source);
              
              allArticles.push({
                id: `scrape_${Date.now()}_${Math.random()}`,
                type: 'news',
                title: article.title,
                description: articleData?.content || `Latest news about ${artistName} from ${source.name}`,
                source: source.name,
                publishedAt: new Date().toISOString(),
                url: article.fullUrl,
                imageUrl: articleData?.imageUrl || null,
                relevanceScore: article.relevanceScore,
                isFresh: true,
                artistName,
                cost: 0 // FREE!
              });
            } catch (error) {
              log.error(`Error processing article ${article.fullUrl}:`, error.message);
            }
          }
          
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
      console.log(`[DEBUG] Reddit - Artist names:`, artistNames.slice(0, 5)); // Show first 5
      
      const allPosts = [];
      
      for (const redditUrl of this.redditSources) {
        try {
          console.log(`[DEBUG] Reddit - Fetching from: ${redditUrl}`);
          const response = await fetch(redditUrl, {
            headers: {
              'User-Agent': 'Aether Music News Bot 1.0'
            },
            timeout: 10000
          });
          
          console.log(`[DEBUG] Reddit - Response status: ${response.status}`);
          if (!response.ok) {
            console.log(`[DEBUG] Reddit - Failed response: ${response.statusText}`);
            continue;
          }
          
          const data = await response.json();
          const posts = data.data?.children || [];
          console.log(`[DEBUG] Reddit - Found ${posts.length} posts from ${redditUrl}`);
          
          let matchedPosts = 0;
          posts.forEach(post => {
            const postData = post.data;
            const title = postData.title;
            const selftext = postData.selftext || '';
            const content = `${title} ${selftext}`.toLowerCase();
            
            // Check if post mentions any of the user's artists (flexible matching)
            const mentionedArtist = artistNames.find(artist => 
              this.matchesArtist(content, artist.toLowerCase())
            );
            
            if (mentionedArtist || this.containsMusicKeywords(content)) {
              matchedPosts++;
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
          
          console.log(`[DEBUG] Reddit - Matched ${matchedPosts} posts from ${redditUrl}`);
          
        } catch (error) {
          console.log(`[DEBUG] Reddit - Error for ${redditUrl}:`, error.message);
          log.warn(`Reddit fetch failed for ${redditUrl}:`, error.message);
        }
      }
      
      console.log(`[DEBUG] Reddit - Total posts before filtering: ${allPosts.length}`);
      
      const filteredPosts = allPosts.filter(post => post.relevanceScore > 0.2); // Lowered from 0.4 to 0.2
      console.log(`[DEBUG] Reddit - Posts after relevance filter (>0.2): ${filteredPosts.length}`);
      
      const finalPosts = filteredPosts
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, limit);
        
      console.log(`[DEBUG] Reddit - Final posts returned: ${finalPosts.length}`);
      return finalPosts;
        
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
    
    // Artist mentions (flexible matching)
    artistNames.forEach(name => {
      if (this.matchesArtist(content, name.toLowerCase())) score += 0.4;
    });
    
    // Engagement boost
    const engagement = (postData.score || 0) + (postData.num_comments || 0);
    if (engagement > 100) score += 0.2;
    if (engagement > 500) score += 0.2;
    
    return Math.min(score, 1.0);
  }

  /**
   * Flexible artist name matching with aliases and variations
   */
  matchesArtist(content, artistName) {
    // Direct match
    if (content.includes(artistName)) return true;
    
    // Common artist aliases and variations
    const aliases = {
      'drake': ['drizzy', '6 god', 'champagne papi', 'aubrey'],
      'kanye west': ['ye', 'yeezy', 'yeezus'],
      'jay-z': ['jay z', 'jigga', 'hov'],
      'kendrick lamar': ['kdot', 'k dot', 'kung fu kenny'],
      'travis scott': ['cactus jack', 'la flame'],
      'future': ['future hendrix', 'pluto', 'freebandz'],
      'lil wayne': ['weezy', 'tunechi', 'wayne'],
      'nicki minaj': ['barbie', 'young money nicki'],
      'cardi b': ['cardib', 'bardi'],
      'megan thee stallion': ['hot girl meg', 'tina snow'],
      'tyler the creator': ['tyler', 'odd future'],
      'asap rocky': ['a$ap rocky', 'flacko'],
      'j cole': ['jcole', 'dreamville'],
      'childish gambino': ['donald glover', 'bino'],
      'frank ocean': ['blonde frank', 'christopher breaux'],
      'the weeknd': ['weeknd', 'abel tesfaye'],
      'post malone': ['posty', 'stoney'],
      '21 savage': ['savage', '21'],
      'lil baby': ['baby', 'qc'],
      'dababy': ['baby jesus', 'kirk'],
      'playboi carti': ['carti', 'sir cartier'],
      'young thug': ['thugger', 'slime', 'jeffery'],
      'gunna': ['wunna', 'ysl gunna'],
      'lil uzi vert': ['uzi', 'baby pluto'],
      'juice wrld': ['juice', '999'],
      'xxxtentacion': ['x', 'jahseh'],
      'ski mask the slump god': ['ski mask', 'slump god'],
      'denzel curry': ['zel', 'curry'],
      'jid': ['j.i.d', 'dreamville jid'],
      'vince staples': ['vince', 'long beach vince'],
      'mac miller': ['mac', 'malcolm', 'swimming'],
      'nipsey hussle': ['nip', 'hussle', 'marathon'],
      'pop smoke': ['pop', 'woo'],
      'king von': ['von', 'o block von'],
      'polo g': ['polo', 'capalot'],
      'rod wave': ['rod', 'heart break'],
      'moneybagg yo': ['bagg', 'memphis yo'],
      'est gee': ['gee', '5500 degrees'],
      '42 dugg': ['dugg', 'cmg dugg'],
      'rylo rodriguez': ['rylo', 'alabama rylo']
    };
    
    // Check aliases for this artist
    const artistAliases = aliases[artistName] || [];
    return artistAliases.some(alias => content.includes(alias));
  }

  containsMusicKeywords(content) {
    const keywords = [
      'new album', 'new single', 'dropped', 'released', 'music video', 'collaboration', 
      'beef', 'diss track', 'mixtape', 'ep', 'deluxe', 'tracklist', 'features',
      'snippet', 'leak', 'preview', 'teaser', 'announced', 'coming soon',
      'tour dates', 'concert', 'festival', 'performance', 'live show',
      'interview', 'freestyle', 'cypher', 'remix', 'cover', 'sample',
      '[fresh]', '[leak]', '[snippet]', 'just dropped', 'out now',
      'spotify', 'apple music', 'soundcloud', 'youtube music'
    ];
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