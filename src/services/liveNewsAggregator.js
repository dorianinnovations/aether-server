/**
 * Live News Aggregator Service
 * Real-time aggregation from curated sources without storing everything
 * Focuses on fresh, personalized content for user's followed artists
 */

import fetch from 'node-fetch';
import { env } from '../config/environment.js';
import { log } from '../utils/logger.js';

class LiveNewsAggregator {
  constructor() {
    this.serpApiKey = env.SERPAPI_API_KEY;
    this.googleApiKey = env.GOOGLE_SEARCH_API_KEY;
    this.spotifyClientId = env.SPOTIFY_CLIENT_ID;
    this.spotifyClientSecret = env.SPOTIFY_CLIENT_SECRET;
    this.spotifyAccessToken = null;
    this.tokenExpiresAt = null;

    // Curated reputable sources for hip-hop/rap news
    this.curatedSources = [
      'billboard.com',
      'pitchfork.com', 
      'complex.com',
      'xxlmag.com',
      'hotnewhiphop.com',
      'thefader.com',
      'rollingstone.com',
      'variety.com',
      'allhiphop.com',
      'hiphopdx.com'
    ];
  }

  /**
   * Get fresh Spotify token for real-time artist data
   */
  async getSpotifyToken() {
    try {
      if (this.spotifyAccessToken && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt) {
        return this.spotifyAccessToken;
      }

      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${this.spotifyClientId}:${this.spotifyClientSecret}`).toString('base64')}`
        },
        body: 'grant_type=client_credentials'
      });

      const data = await response.json();
      this.spotifyAccessToken = data.access_token;
      this.tokenExpiresAt = Date.now() + (data.expires_in * 1000) - 60000;

      return this.spotifyAccessToken;
    } catch (error) {
      log.error('Failed to get Spotify token:', error);
      throw error;
    }
  }

  /**
   * Get real-time news for specific artist from curated sources
   */
  async getArtistNews(artistName, limit = 10) {
    try {
      log.info(`🔍 Fetching live news for: ${artistName}`);

      // Create site-specific search query for curated sources
      const siteQuery = this.curatedSources.map(site => `site:${site}`).join(' OR ');
      const fullQuery = `"${artistName}" (${siteQuery}) (music OR album OR single OR tour OR rap OR hip-hop)`;

      const params = new URLSearchParams({
        api_key: this.serpApiKey,
        engine: 'google_news',
        q: fullQuery,
        gl: 'us',
        hl: 'en',
        tbm: 'nws',
        tbs: 'qdr:w', // Past week
        num: limit.toString()
      });

      const response = await fetch(`https://serpapi.com/search?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(`SerpAPI failed: ${data.error}`);
      }

      // Debug logging to see what SerpAPI returns
      if (data.news_results && data.news_results.length > 0) {
        log.info('=== SERPAPI DEBUG ===');
        log.info('First article structure:', JSON.stringify(data.news_results[0], null, 2));
        log.info('Article keys:', Object.keys(data.news_results[0]));
        log.info('====================');
      }

      const articles = (data.news_results || []).map(article => {
        // Try multiple possible field names for description/content
        const description = article.snippet || 
                          article.summary || 
                          article.description || 
                          article.content ||
                          article.excerpt ||
                          (article.title ? `Read more about ${article.title} on ${typeof article.source === 'object' ? article.source.name : article.source}` : '');

        return {
          id: `news_${Date.now()}_${Math.random()}`,
          type: 'news',
          title: article.title,
          description: description,
          source: typeof article.source === 'object' ? article.source.name : article.source,
          publishedAt: new Date(article.date).toISOString(),
          url: article.link,
          imageUrl: article.thumbnail,
          relevanceScore: this.calculateRelevance(article, artistName),
          isFresh: this.isRecent(article.date),
          artistName
        };
      });

      // Sort by relevance and freshness
      return articles
        .filter(article => article.relevanceScore > 0.3) // Filter low relevance
        .sort((a, b) => (b.relevanceScore + (b.isFresh ? 0.2 : 0)) - (a.relevanceScore + (a.isFresh ? 0.2 : 0)))
        .slice(0, limit);

    } catch (error) {
      log.error(`Failed to get live news for ${artistName}:`, error);
      return [];
    }
  }

  /**
   * Get real-time releases for artist from Spotify
   */
  async getArtistReleases(artistName, limit = 5) {
    try {
      log.info(`🎵 Fetching live releases for: ${artistName}`);

      const token = await this.getSpotifyToken();
      
      // Search for artist
      const searchResponse = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const searchData = await searchResponse.json();
      const artist = searchData.artists?.items[0];
      
      if (!artist) return [];

      // Get recent albums/singles
      const albumsResponse = await fetch(`https://api.spotify.com/v1/artists/${artist.id}/albums?include_groups=album,single&market=US&limit=${limit}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const albumsData = await albumsResponse.json();
      
      // Filter to very recent releases (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      return (albumsData.items || [])
        .filter(album => new Date(album.release_date) >= thirtyDaysAgo)
        .map(album => ({
          id: `release_${album.id}`,
          type: 'release',
          title: `New ${album.album_type}: "${album.name}"`,
          description: `${artistName} dropped a new ${album.album_type}${album.total_tracks > 1 ? ` with ${album.total_tracks} tracks` : ''}.`,
          source: 'Spotify',
          publishedAt: new Date(album.release_date).toISOString(),
          url: album.external_urls.spotify,
          imageUrl: album.images[0]?.url,
          relevanceScore: 0.95, // Releases are always highly relevant
          isFresh: this.isRecent(album.release_date),
          artistName,
          metadata: {
            albumType: album.album_type,
            totalTracks: album.total_tracks,
            spotifyId: album.id
          }
        }));

    } catch (error) {
      log.error(`Failed to get live releases for ${artistName}:`, error);
      return [];
    }
  }

  /**
   * Get trending topics from multiple artists
   */
  async getTrendingContent(artistNames, limit = 20) {
    try {
      log.info(`📈 Fetching trending content for ${artistNames.length} artists`);

      // Search for general trending hip-hop news
      const trendingQuery = `(rap OR hip-hop OR "new album" OR "new single" OR beef OR collaboration) ${this.curatedSources.map(s => `site:${s}`).join(' OR ')}`;
      
      const params = new URLSearchParams({
        api_key: this.serpApiKey,
        engine: 'google_news', 
        q: trendingQuery,
        gl: 'us',
        hl: 'en',
        tbm: 'nws',
        tbs: 'qdr:d', // Past day for trending
        num: limit.toString()
      });

      const response = await fetch(`https://serpapi.com/search?${params.toString()}`);
      const data = await response.json();

      const trendingArticles = (data.news_results || []).map(article => {
        // Try multiple possible field names for description/content
        const description = article.snippet || 
                          article.summary || 
                          article.description || 
                          article.content ||
                          article.excerpt ||
                          (article.title ? `Trending: ${article.title}` : '');

        return {
          id: `trending_${Date.now()}_${Math.random()}`,
          type: 'trending',
          title: article.title,
          description: description,
          source: typeof article.source === 'object' ? article.source.name : article.source,
          publishedAt: new Date(article.date).toISOString(),
          url: article.link,
          imageUrl: article.thumbnail,
          relevanceScore: this.calculateTrendingRelevance(article, artistNames),
          isFresh: true,
          artistName: this.extractArtistFromContent(article, artistNames)
        };
      });

      return trendingArticles
        .filter(article => article.relevanceScore > 0.4)
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, limit);

    } catch (error) {
      log.error('Failed to get trending content:', error);
      return [];
    }
  }

  /**
   * Generate personalized feed for user's followed artists
   */
  async getPersonalizedFeed(followedArtists, feedType = 'timeline', limit = 20) {
    try {
      log.info(`🎯 Generating personalized ${feedType} feed for ${followedArtists.length} artists`);

      const artistNames = followedArtists.map(artist => artist.name || artist.artistName);
      const allContent = [];

      if (feedType === 'timeline' || feedType === 'news') {
        // Get news for each followed artist
        const newsPromises = artistNames.map(name => this.getArtistNews(name, 3));
        const newsResults = await Promise.all(newsPromises);
        allContent.push(...newsResults.flat());
      }

      if (feedType === 'timeline' || feedType === 'releases') {
        // Get releases for each followed artist
        const releasePromises = artistNames.map(name => this.getArtistReleases(name, 2));
        const releaseResults = await Promise.all(releasePromises);
        allContent.push(...releaseResults.flat());
      }

      if (feedType === 'timeline') {
        // Add some trending content
        const trending = await this.getTrendingContent(artistNames, 5);
        allContent.push(...trending);
      }

      // Sort by relevance, freshness, and recency
      const sortedContent = allContent
        .filter(item => item && item.title) // Remove any null/invalid items
        .sort((a, b) => {
          const scoreA = a.relevanceScore + (a.isFresh ? 0.3 : 0) + this.getRecencyScore(a.publishedAt);
          const scoreB = b.relevanceScore + (b.isFresh ? 0.3 : 0) + this.getRecencyScore(b.publishedAt);
          return scoreB - scoreA;
        })
        .slice(0, limit);

      log.info(`✅ Generated ${sortedContent.length} personalized items`);
      return sortedContent;

    } catch (error) {
      log.error('Failed to generate personalized feed:', error);
      return [];
    }
  }

  /**
   * Helper methods
   */
  calculateRelevance(article, artistName) {
    const content = `${article.title} ${article.snippet}`.toLowerCase();
    const name = artistName.toLowerCase();
    
    let score = 0;
    
    // Exact artist name match
    if (content.includes(name)) score += 0.8;
    
    // Music-related keywords
    const musicKeywords = ['album', 'single', 'song', 'track', 'music', 'rapper', 'hip-hop', 'rap'];
    musicKeywords.forEach(keyword => {
      if (content.includes(keyword)) score += 0.1;
    });
    
    // High-value content keywords
    const valueKeywords = ['new', 'announces', 'releases', 'drops', 'collaboration', 'tour'];
    valueKeywords.forEach(keyword => {
      if (content.includes(keyword)) score += 0.15;
    });
    
    return Math.min(score, 1.0);
  }

  calculateTrendingRelevance(article, artistNames) {
    const content = `${article.title} ${article.snippet}`.toLowerCase();
    let score = 0.3; // Base trending score
    
    // Check if any followed artist is mentioned
    artistNames.forEach(name => {
      if (content.includes(name.toLowerCase())) score += 0.4;
    });
    
    // Trending keywords
    const trendingKeywords = ['beef', 'diss', 'collaboration', 'surprise', 'breaking', 'exclusive'];
    trendingKeywords.forEach(keyword => {
      if (content.includes(keyword)) score += 0.2;
    });
    
    return Math.min(score, 1.0);
  }

  extractArtistFromContent(article, artistNames) {
    const content = `${article.title} ${article.snippet}`.toLowerCase();
    
    for (const name of artistNames) {
      if (content.includes(name.toLowerCase())) {
        return name;
      }
    }
    
    return 'Various Artists';
  }

  isRecent(dateString) {
    const date = new Date(dateString);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    return date >= threeDaysAgo;
  }

  getRecencyScore(dateString) {
    const date = new Date(dateString);
    const hoursAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60);
    
    if (hoursAgo < 6) return 0.3;    // Very recent
    if (hoursAgo < 24) return 0.2;   // Recent
    if (hoursAgo < 72) return 0.1;   // Somewhat recent
    return 0;                        // Old
  }
}

export default new LiveNewsAggregator();