/**
 * Real Data Ingestion Service
 * Fetches real artist data from Spotify and news from reputable sources
 */

import fetch from 'node-fetch';
import { env } from '../config/environment.js';
import { log } from '../utils/logger.js';
import Artist from '../models/Artist.js';
import ArtistUpdate from '../models/ArtistUpdate.js';

class RealDataIngestionService {
  constructor() {
    this.spotifyClientId = env.SPOTIFY_CLIENT_ID;
    this.spotifyClientSecret = env.SPOTIFY_CLIENT_SECRET;
    this.googleApiKey = env.GOOGLE_SEARCH_API_KEY;
    this.serpApiKey = env.SERPAPI_API_KEY;
    this.spotifyAccessToken = null;
    this.tokenExpiresAt = null;
  }

  /**
   * Get Spotify access token for app-only requests
   */
  async getSpotifyAppToken() {
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
      
      if (!response.ok) {
        throw new Error(`Spotify auth failed: ${data.error_description}`);
      }

      this.spotifyAccessToken = data.access_token;
      this.tokenExpiresAt = Date.now() + (data.expires_in * 1000) - 60000; // 1 min buffer

      log.info('✅ Spotify app token obtained');
      return this.spotifyAccessToken;
    } catch (error) {
      log.error('Failed to get Spotify app token:', error);
      throw error;
    }
  }

  /**
   * Search for artists on Spotify
   */
  async searchSpotifyArtists(query, limit = 50) {
    try {
      const token = await this.getSpotifyAppToken();
      const encodedQuery = encodeURIComponent(query);
      
      const response = await fetch(`https://api.spotify.com/v1/search?q=${encodedQuery}&type=artist&limit=${limit}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(`Spotify search failed: ${data.error?.message}`);
      }

      return data.artists.items.map(artist => ({
        name: artist.name,
        spotifyId: artist.id,
        genres: artist.genres,
        popularity: artist.popularity,
        followers: artist.followers.total,
        images: artist.images,
        spotifyUrl: artist.external_urls.spotify,
        uri: artist.uri
      }));
    } catch (error) {
      log.error('Spotify artist search failed:', error);
      throw error;
    }
  }

  /**
   * Get artist's recent albums/singles from Spotify
   */
  async getArtistReleases(artistId, limit = 20) {
    try {
      const token = await this.getSpotifyAppToken();
      
      const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album,single&market=US&limit=${limit}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(`Spotify releases fetch failed: ${data.error?.message}`);
      }

      return data.items.map(album => ({
        name: album.name,
        type: album.album_type,
        releaseDate: album.release_date,
        spotifyId: album.id,
        totalTracks: album.total_tracks,
        images: album.images,
        spotifyUrl: album.external_urls.spotify
      }));
    } catch (error) {
      log.error('Failed to get artist releases:', error);
      throw error;
    }
  }

  /**
   * Search for artist news using Google News API via SerpAPI
   */
  async searchArtistNews(artistName, daysBack = 7) {
    try {
      const fromDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const params = new URLSearchParams({
        api_key: this.serpApiKey,
        engine: 'google_news',
        q: `"${artistName}" (music OR album OR single OR tour OR concert OR rap OR hip-hop)`,
        gl: 'us',
        hl: 'en',
        tbm: 'nws',
        tbs: `qdr:w` // Past week
      });

      const response = await fetch(`https://serpapi.com/search?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(`SerpAPI failed: ${data.error}`);
      }

      return (data.news_results || []).map(article => ({
        title: article.title,
        source: typeof article.source === 'object' ? article.source.name : article.source,
        date: article.date,
        snippet: article.snippet,
        link: article.link,
        thumbnail: article.thumbnail
      }));
    } catch (error) {
      log.error(`Failed to search news for ${artistName}:`, error);
      return []; // Return empty array instead of failing
    }
  }

  /**
   * Create or update artist in database
   */
  async createOrUpdateArtist(spotifyArtist) {
    try {
      const artistId = `spotify_${spotifyArtist.spotifyId}`;
      
      let artist = await Artist.findOne({ artistId });
      
      const artistData = {
        name: spotifyArtist.name,
        artistId,
        externalIds: {
          spotifyId: spotifyArtist.spotifyId
        },
        genres: spotifyArtist.genres,
        bio: `${spotifyArtist.name} is ${spotifyArtist.genres.length > 0 ? 'a ' + spotifyArtist.genres[0] : 'an'} artist with ${spotifyArtist.followers.toLocaleString()} followers on Spotify.`,
        images: {
          large: spotifyArtist.images[0]?.url,
          medium: spotifyArtist.images[1]?.url || spotifyArtist.images[0]?.url,
          small: spotifyArtist.images[2]?.url || spotifyArtist.images[0]?.url
        },
        socialLinks: {
          spotify: spotifyArtist.spotifyUrl
        },
        popularity: {
          spotifyPopularity: spotifyArtist.popularity,
          followers: {
            spotify: spotifyArtist.followers,
            total: spotifyArtist.followers
          },
          lastUpdated: new Date()
        },
        tracking: {
          isActive: true,
          lastScraped: {
            spotify: new Date()
          }
        }
      };

      if (artist) {
        // Update existing artist
        Object.assign(artist, artistData);
        await artist.save();
        log.info(`Updated artist: ${artist.name}`);
      } else {
        // Create new artist
        artist = new Artist(artistData);
        await artist.save();
        log.info(`Created new artist: ${artist.name}`);
      }

      return artist;
    } catch (error) {
      log.error(`Failed to create/update artist ${spotifyArtist.name}:`, error);
      throw error;
    }
  }

  /**
   * Create artist update from news article
   */
  async createNewsUpdate(artist, newsArticle) {
    try {
      // Check if we already have this news article
      const existingUpdate = await ArtistUpdate.findOne({
        artistId: artist._id,
        'content.articleInfo.url': newsArticle.link
      });

      if (existingUpdate) {
        log.info(`News article already exists for ${artist.name}: ${newsArticle.title}`);
        return null;
      }

      const update = new ArtistUpdate({
        artistId: artist._id,
        artistName: artist.name,
        updateType: 'news',
        title: newsArticle.title,
        description: newsArticle.snippet,
        content: {
          articleInfo: {
            source: newsArticle.source,
            publishedAt: new Date(newsArticle.date),
            url: newsArticle.link,
            category: 'news',
            sentiment: 'neutral'
          }
        },
        media: {
          images: newsArticle.thumbnail ? [{
            url: newsArticle.thumbnail,
            type: 'thumbnail',
            width: 150,
            height: 150
          }] : []
        },
        targeting: {
          relevanceScore: 0.8,
          priority: 'medium'
        },
        distribution: {
          originalPublishDate: new Date(newsArticle.date),
          distributionStarted: new Date(),
          stats: {
            usersNotified: 0,
            usersEngaged: 0,
            totalViews: 0
          }
        },
        processing: {
          status: 'distributed',
          aiAnalysis: {
            summary: `News article about ${artist.name}`,
            sentiment: 'neutral',
            topics: ['news', 'music'],
            keywords: [artist.name, 'news'],
            importance: 0.7
          },
          quality: {
            hasValidMedia: !!newsArticle.thumbnail,
            hasValidLinks: !!newsArticle.link,
            contentLength: newsArticle.snippet?.length || 0,
            qualityScore: 0.8
          }
        },
        engagement: {
          totalEngagements: 0,
          engagementRate: 0
        },
        lifecycle: {
          isActive: true,
          isArchived: false,
          isDeleted: false
        }
      });

      await update.save();
      log.info(`Created news update for ${artist.name}: ${newsArticle.title}`);
      return update;
    } catch (error) {
      log.error(`Failed to create news update for ${artist.name}:`, error);
      throw error;
    }
  }

  /**
   * Create artist update from Spotify release
   */
  async createReleaseUpdate(artist, release) {
    try {
      // Check if we already have this release
      const existingUpdate = await ArtistUpdate.findOne({
        artistId: artist._id,
        'content.releaseInfo.spotifyId': release.spotifyId
      });

      if (existingUpdate) {
        log.info(`Release already exists for ${artist.name}: ${release.name}`);
        return null;
      }

      const update = new ArtistUpdate({
        artistId: artist._id,
        artistName: artist.name,
        updateType: 'release',
        title: `New ${release.type}: "${release.name}"`,
        description: `${artist.name} has released a new ${release.type}${release.totalTracks > 1 ? ` with ${release.totalTracks} tracks` : ''}.`,
        content: {
          releaseInfo: {
            type: release.type === 'album' ? 'album' : 'single',
            releaseDate: new Date(release.releaseDate),
            trackCount: release.totalTracks,
            spotifyId: release.spotifyId,
            genres: artist.genres
          }
        },
        media: {
          images: release.images.map(img => ({
            url: img.url,
            type: 'cover_art',
            width: img.width,
            height: img.height
          }))
        },
        targeting: {
          relevanceScore: 0.95,
          priority: 'high'
        },
        distribution: {
          originalPublishDate: new Date(release.releaseDate),
          distributionStarted: new Date(),
          stats: {
            usersNotified: 0,
            usersEngaged: 0,
            totalViews: 0
          }
        },
        processing: {
          status: 'distributed',
          aiAnalysis: {
            summary: `New ${release.type} from ${artist.name}`,
            sentiment: 'positive',
            topics: ['music', 'release', release.type],
            keywords: [artist.name, 'release', 'new', release.type],
            importance: 0.9
          },
          quality: {
            hasValidMedia: release.images.length > 0,
            hasValidLinks: true,
            contentLength: 150,
            qualityScore: 0.9
          }
        },
        engagement: {
          totalEngagements: 0,
          engagementRate: 0
        },
        lifecycle: {
          isActive: true,
          isArchived: false,
          isDeleted: false
        }
      });

      await update.save();
      log.info(`Created release update for ${artist.name}: ${release.name}`);
      return update;
    } catch (error) {
      log.error(`Failed to create release update for ${artist.name}:`, error);
      throw error;
    }
  }

  /**
   * Ingest data for a specific artist
   */
  async ingestArtistData(artistName) {
    try {
      log.info(`🎵 Starting data ingestion for: ${artistName}`);

      // 1. Search for artist on Spotify
      const spotifyArtists = await this.searchSpotifyArtists(artistName, 1);
      if (spotifyArtists.length === 0) {
        log.warn(`No Spotify results found for: ${artistName}`);
        return { success: false, message: 'Artist not found on Spotify' };
      }

      const spotifyArtist = spotifyArtists[0];
      log.info(`Found Spotify artist: ${spotifyArtist.name} (${spotifyArtist.followers} followers)`);

      // 2. Create/update artist in database
      const artist = await this.createOrUpdateArtist(spotifyArtist);

      // 3. Get recent releases
      const releases = await this.getArtistReleases(spotifyArtist.spotifyId);
      log.info(`Found ${releases.length} releases for ${artist.name}`);

      // 4. Create release updates for recent releases (last 30 days)
      const recentReleases = releases.filter(release => {
        const releaseDate = new Date(release.releaseDate);
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        return releaseDate >= thirtyDaysAgo;
      });

      for (const release of recentReleases) {
        await this.createReleaseUpdate(artist, release);
      }

      // 5. Search for recent news
      const newsArticles = await this.searchArtistNews(artist.name);
      log.info(`Found ${newsArticles.length} news articles for ${artist.name}`);

      // 6. Create news updates
      for (const article of newsArticles) {
        await this.createNewsUpdate(artist, article);
      }

      return {
        success: true,
        artist: artist.name,
        releases: recentReleases.length,
        news: newsArticles.length
      };

    } catch (error) {
      log.error(`Failed to ingest data for ${artistName}:`, error);
      throw error;
    }
  }

  /**
   * Ingest popular rap/hip-hop artists
   */
  async ingestPopularRapArtists() {
    // Top rap/hip-hop artists to focus on
    const rapArtists = [
      'Drake',
      'Kendrick Lamar', 
      'J. Cole',
      'Travis Scott',
      'Future',
      'Lil Baby',
      'DaBaby',
      'Megan Thee Stallion',
      'Cardi B',
      'Doja Cat',
      'Tyler, The Creator',
      'A$AP Rocky',
      '21 Savage',
      'Lil Uzi Vert',
      'Playboi Carti',
      'Jack Harlow',
      'Polo G',
      'Rod Wave',
      'NBA YoungBoy',
      'Lil Durk'
    ];

    const results = [];
    
    for (const artistName of rapArtists) {
      try {
        const result = await this.ingestArtistData(artistName);
        results.push({ artist: artistName, ...result });
        
        // Add delay to respect API rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        log.error(`Failed to ingest ${artistName}:`, error);
        results.push({ artist: artistName, success: false, error: error.message });
      }
    }

    return results;
  }
}

export default new RealDataIngestionService();