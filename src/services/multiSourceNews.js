/**
 * Multi-Source Artist News - Underground + Mainstream Coverage
 * Tier 1: Guaranteed sources (APIs)
 * Tier 2: Smart scraping (conditional)
 * Tier 3: Social signals (lightweight)
 */

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { log } from '../utils/logger.js';

class MultiSourceNews {
  constructor() {
    this.sources = {
      genius: process.env.GENIUS_API_KEY,
      lastfm: process.env.LASTFM_API_KEY,
      newsapi: process.env.NEWSAPI_KEY
    };
  }

  /**
   * MAIN ENTRY POINT - Get news for user's artists
   */
  async getArtistNews(artistNames, limit = 10) {
    console.log(`[MULTI-NEWS] Starting search for ${artistNames.length} artists:`, artistNames);
    
    const allNews = [];
    const startTime = Date.now();
    
    // Process artists in parallel (max 5 to avoid overwhelming)
    const artists = artistNames.slice(0, 5);
    const promises = artists.map(artist => this.getNewsForArtist(artist));
    
    const results = await Promise.allSettled(promises);
    
    // Collect all successful results
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allNews.push(...result.value);
      } else {
        console.log(`[MULTI-NEWS] Failed for ${artists[index]}:`, result.reason?.message);
      }
    });
    
    // Deduplicate and sort
    const uniqueNews = this.deduplicateNews(allNews);
    const sortedNews = uniqueNews
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
      .slice(0, limit);
    
    const duration = Date.now() - startTime;
    console.log(`[MULTI-NEWS] Completed in ${duration}ms - ${sortedNews.length} articles from ${allNews.length} total`);
    
    return sortedNews;
  }

  /**
   * Get news for a single artist from multiple sources
   */
  async getNewsForArtist(artistName) {
    const artistNews = [];
    const timeout = 3000; // 3 second timeout per source
    
    console.log(`[MULTI-NEWS] Searching for: ${artistName}`);
    
    // TIER 1: Guaranteed API sources (parallel)
    const tier1Promises = [
      this.searchGenius(artistName, timeout),
      this.searchLastFM(artistName, timeout),
      this.searchHotNewHipHop(artistName, timeout)
    ];
    
    const tier1Results = await Promise.allSettled(tier1Promises);
    
    tier1Results.forEach((result, index) => {
      const sourceName = ['Genius', 'Last.fm', 'HotNewHipHop'][index];
      if (result.status === 'fulfilled') {
        artistNews.push(...result.value);
        console.log(`[MULTI-NEWS] ${sourceName}: ${result.value.length} articles for ${artistName}`);
      } else {
        console.log(`[MULTI-NEWS] ${sourceName} failed for ${artistName}:`, result.reason?.message);
      }
    });
    
    // TIER 2: Smart scraping (only if we found the artist in Tier 1)
    if (artistNews.length > 0) {
      try {
        const redditNews = await this.searchReddit(artistName, 2000);
        artistNews.push(...redditNews);
        console.log(`[MULTI-NEWS] Reddit: ${redditNews.length} posts for ${artistName}`);
      } catch (error) {
        console.log(`[MULTI-NEWS] Reddit failed for ${artistName}:`, error.message);
      }
    }
    
    return artistNews;
  }

  /**
   * TIER 1: Genius API - Official releases and verified info
   */
  async searchGenius(artistName, timeout = 3000) {
    if (!this.sources.genius) return [];
    
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), timeout);
      
      const searchUrl = `https://api.genius.com/search?q=${encodeURIComponent(artistName)}&access_token=${this.sources.genius}`;
      
      const response = await fetch(searchUrl, { signal: controller.signal });
      const data = await response.json();
      
      if (data.response?.hits) {
        return data.response.hits
          .filter(hit => hit.result.primary_artist.name.toLowerCase().includes(artistName.toLowerCase()))
          .slice(0, 3)
          .map(hit => ({
            id: `genius_${hit.result.id}`,
            artist: artistName,
            title: hit.result.title,
            description: `New song by ${hit.result.primary_artist.name}`,
            url: hit.result.url,
            imageUrl: hit.result.song_art_image_thumbnail_url,
            publishedAt: hit.result.release_date_for_display || new Date().toISOString(),
            source: 'Genius',
            type: 'release'
          }));
      }
      
      return [];
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log(`[MULTI-NEWS] Genius timeout for ${artistName}`);
      }
      return [];
    }
  }

  /**
   * TIER 1: Last.fm API - Artist updates and recent tracks
   */
  async searchLastFM(artistName, timeout = 3000) {
    if (!this.sources.lastfm) return [];
    
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), timeout);
      
      const artistUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(artistName)}&api_key=${this.sources.lastfm}&format=json`;
      
      const response = await fetch(artistUrl, { signal: controller.signal });
      const data = await response.json();
      
      if (data.artist) {
        const artist = data.artist;
        return [{
          id: `lastfm_${artist.mbid || Date.now()}`,
          artist: artistName,
          title: `${artistName} - Artist Info`,
          description: artist.bio?.summary?.replace(/<[^>]*>/g, '').substring(0, 200) + '...' || `Latest info about ${artistName}`,
          url: artist.url,
          imageUrl: artist.image?.find(img => img.size === 'large')?.['#text'],
          publishedAt: new Date().toISOString(),
          source: 'Last.fm',
          type: 'info'
        }];
      }
      
      return [];
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log(`[MULTI-NEWS] Last.fm timeout for ${artistName}`);
      }
      return [];
    }
  }

  /**
   * TIER 1: HotNewHipHop RSS - Underground coverage
   */
  async searchHotNewHipHop(artistName, timeout = 3000) {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), timeout);
      
      const rssUrl = 'https://www.hotnewhiphop.com/rss.xml';
      
      const response = await fetch(rssUrl, { 
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MusicBot/1.0)' }
      });
      
      const xml = await response.text();
      const $ = cheerio.load(xml, { xmlMode: true });
      
      const articles = [];
      $('item').each((i, item) => {
        const title = $(item).find('title').text().trim();
        const description = $(item).find('description').text().replace(/<[^>]*>/g, '').trim();
        const content = `${title} ${description}`.toLowerCase();
        
        // Check if artist is mentioned
        if (content.includes(artistName.toLowerCase())) {
          articles.push({
            id: `hnhh_${Date.now()}_${i}`,
            artist: artistName,
            title: title,
            description: description.substring(0, 200) + '...',
            url: $(item).find('link').text().trim(),
            imageUrl: null,
            publishedAt: $(item).find('pubDate').text().trim() || new Date().toISOString(),
            source: 'HotNewHipHop',
            type: 'news'
          });
        }
      });
      
      return articles.slice(0, 2);
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log(`[MULTI-NEWS] HotNewHipHop timeout for ${artistName}`);
      }
      return [];
    }
  }

  /**
   * TIER 2: Reddit scraping - Community buzz
   */
  async searchReddit(artistName, timeout = 2000) {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), timeout);
      
      const subreddits = ['hiphopheads', 'Music', 'rap'];
      const posts = [];
      
      for (const sub of subreddits) {
        try {
          const searchUrl = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(artistName)}&restrict_sr=1&sort=new&limit=3`;
          
          const response = await fetch(searchUrl, { 
            signal: controller.signal,
            headers: { 'User-Agent': 'MusicBot/1.0' }
          });
          
          const data = await response.json();
          
          if (data.data?.children) {
            data.data.children.forEach(child => {
              const post = child.data;
              const content = `${post.title} ${post.selftext}`.toLowerCase();
              
              if (content.includes(artistName.toLowerCase())) {
                posts.push({
                  id: `reddit_${post.id}`,
                  artist: artistName,
                  title: post.title,
                  description: post.selftext?.substring(0, 150) + '...' || `Discussion about ${artistName}`,
                  url: `https://reddit.com${post.permalink}`,
                  imageUrl: post.thumbnail?.startsWith('http') ? post.thumbnail : null,
                  publishedAt: new Date(post.created_utc * 1000).toISOString(),
                  source: `r/${sub}`,
                  type: 'discussion'
                });
              }
            });
          }
        } catch (error) {
          console.log(`[MULTI-NEWS] Reddit r/${sub} failed:`, error.message);
        }
      }
      
      return posts.slice(0, 2);
    } catch (error) {
      return [];
    }
  }

  /**
   * Remove duplicate articles based on title similarity
   */
  deduplicateNews(articles) {
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
    
    return unique;
  }
}

export default new MultiSourceNews();