import fetch from 'node-fetch';
import { env } from '../config/environment.js';
import Artist from '../models/Artist.js';
import UserAnalytics from '../models/UserAnalytics.js';
import ragMemoryService from './ragMemoryService.js';

class ArtistDiscoveryService {
  constructor() {
    this.spotifyBaseUrl = 'https://api.spotify.com/v1';
    this.lastFmBaseUrl = 'http://ws.audioscrobbler.com/2.0/';
    this.musicBrainzBaseUrl = 'https://musicbrainz.org/ws/2';
  }

  /**
   * Search for artists across multiple platforms
   */
  async searchArtists(query, options = {}) {
    try {
      const { 
        limit = 20, 
        platforms = ['spotify', 'lastfm'], 
        includeImages = true,
        minPopularity = 0 
      } = options;

      console.log(`🔍 Searching for artists: "${query}" across platforms: ${platforms.join(', ')}`);

      const results = {
        artists: [],
        totalFound: 0,
        platforms: []
      };

      // Search Spotify
      if (platforms.includes('spotify')) {
        try {
          const spotifyResults = await this.searchSpotify(query, limit);
          results.artists.push(...spotifyResults);
          results.platforms.push('spotify');
        } catch (error) {
          console.error('Spotify search error:', error.message);
        }
      }

      // Search Last.fm
      if (platforms.includes('lastfm')) {
        try {
          const lastfmResults = await this.searchLastFm(query, limit);
          results.artists.push(...lastfmResults);
          results.platforms.push('lastfm');
        } catch (error) {
          console.error('Last.fm search error:', error.message);
        }
      }

      // Deduplicate and merge results
      const uniqueArtists = this.deduplicateArtists(results.artists);

      // Filter by popularity if specified
      const filteredArtists = uniqueArtists.filter(artist => 
        (artist.popularity || 0) >= minPopularity
      );

      // Sort by relevance and popularity
      const sortedArtists = filteredArtists.sort((a, b) => {
        const scoreA = this.calculateRelevanceScore(a, query);
        const scoreB = this.calculateRelevanceScore(b, query);
        return scoreB - scoreA;
      });

      results.artists = sortedArtists.slice(0, limit);
      results.totalFound = results.artists.length;

      console.log(`✅ Found ${results.totalFound} unique artists`);
      return results;

    } catch (error) {
      console.error('Artist search error:', error);
      throw new Error(`Failed to search artists: ${error.message}`);
    }
  }

  /**
   * Search Spotify for artists
   */
  async searchSpotify(query, limit = 20) {
    try {
      // Get Spotify access token
      const token = await this.getSpotifyAccessToken();
      
      const response = await fetch(
        `${this.spotifyBaseUrl}/search?q=${encodeURIComponent(query)}&type=artist&limit=${limit}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.statusText}`);
      }

      const data = await response.json();
      const artists = data.artists?.items || [];

      return artists.map(artist => ({
        name: artist.name,
        artistId: this.generateArtistId(artist.name),
        externalIds: {
          spotifyId: artist.id
        },
        genres: artist.genres || [],
        popularity: artist.popularity || 0,
        followers: {
          spotify: artist.followers?.total || 0
        },
        images: {
          large: artist.images?.[0]?.url,
          medium: artist.images?.[1]?.url,
          small: artist.images?.[2]?.url
        },
        socialLinks: {
          spotify: artist.external_urls?.spotify
        },
        source: 'spotify'
      }));

    } catch (error) {
      console.error('Spotify search error:', error);
      return [];
    }
  }

  /**
   * Search Last.fm for artists
   */
  async searchLastFm(query, limit = 20) {
    try {
      if (!env.LASTFM_API_KEY) {
        console.warn('Last.fm API key not configured, skipping Last.fm search');
        return [];
      }

      const response = await fetch(
        `${this.lastFmBaseUrl}?method=artist.search&artist=${encodeURIComponent(query)}&api_key=${env.LASTFM_API_KEY}&format=json&limit=${limit}`
      );

      if (!response.ok) {
        throw new Error(`Last.fm API error: ${response.statusText}`);
      }

      const data = await response.json();
      const artists = data.results?.artistmatches?.artist || [];

      // Ensure artists is always an array
      const artistArray = Array.isArray(artists) ? artists : [artists];

      return artistArray.map(artist => ({
        name: artist.name,
        artistId: this.generateArtistId(artist.name),
        externalIds: {
          lastFmId: artist.mbid
        },
        socialLinks: {
          lastfm: artist.url
        },
        images: {
          small: artist.image?.find(img => img.size === 'small')?.['#text'],
          medium: artist.image?.find(img => img.size === 'medium')?.['#text'],
          large: artist.image?.find(img => img.size === 'large')?.['#text']
        },
        listeners: parseInt(artist.listeners) || 0,
        source: 'lastfm'
      }));

    } catch (error) {
      console.error('Last.fm search error:', error);
      return [];
    }
  }

  /**
   * Get personalized artist recommendations for a user
   */
  async getPersonalizedRecommendations(userId, options = {}) {
    try {
      const { limit = 10, types = ['similar', 'genre', 'trending'] } = options;

      console.log(`🎯 Getting personalized recommendations for user ${userId}`);

      const recommendations = [];

      // Get user's current preferences and analytics
      const userAnalytics = await UserAnalytics.findOne({ userId, period: 'all_time' });
      const userMemories = await ragMemoryService.searchMemories(userId, 'music artist preference', 10);

      // Extract user preferences
      const preferences = this.extractUserPreferences(userAnalytics, userMemories);
      
      if (types.includes('similar') && preferences.favoriteArtists.length > 0) {
        const similarRecs = await this.getSimilarArtistRecommendations(preferences.favoriteArtists, Math.ceil(limit * 0.4));
        recommendations.push(...similarRecs.map(rec => ({ ...rec, type: 'similar_artists' })));
      }

      if (types.includes('genre') && preferences.favoriteGenres.length > 0) {
        const genreRecs = await this.getGenreBasedRecommendations(preferences.favoriteGenres, Math.ceil(limit * 0.3));
        recommendations.push(...genreRecs.map(rec => ({ ...rec, type: 'genre_exploration' })));
      }

      if (types.includes('trending')) {
        const trendingRecs = await this.getTrendingRecommendations(preferences, Math.ceil(limit * 0.3));
        recommendations.push(...trendingRecs.map(rec => ({ ...rec, type: 'trending' })));
      }

      // Score and sort recommendations
      const scoredRecommendations = recommendations.map(rec => ({
        ...rec,
        relevanceScore: this.calculatePersonalizedScore(rec, preferences)
      })).sort((a, b) => b.relevanceScore - a.relevanceScore);

      return {
        recommendations: scoredRecommendations.slice(0, limit),
        userPreferences: preferences,
        totalFound: scoredRecommendations.length
      };

    } catch (error) {
      console.error('Error getting personalized recommendations:', error);
      throw new Error(`Failed to get recommendations: ${error.message}`);
    }
  }

  /**
   * Get similar artists based on user's favorites
   */
  async getSimilarArtistRecommendations(favoriteArtists, limit = 5) {
    try {
      // Use Spotify's related artists endpoint for similar recommendations
      const token = await this.getSpotifyAccessToken();
      const recommendations = [];

      for (const artist of favoriteArtists.slice(0, 3)) { // Limit to top 3 to avoid rate limits
        try {
          const response = await fetch(
            `${this.spotifyBaseUrl}/artists/${artist.spotifyId}/related-artists`,
            {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            }
          );

          if (response.ok) {
            const data = await response.json();
            const relatedArtists = data.artists?.slice(0, 3) || []; // Top 3 related per artist

            recommendations.push(...relatedArtists.map(artist => ({
              name: artist.name,
              artistId: this.generateArtistId(artist.name),
              externalIds: { spotifyId: artist.id },
              genres: artist.genres,
              popularity: artist.popularity,
              images: {
                large: artist.images?.[0]?.url,
                medium: artist.images?.[1]?.url,
                small: artist.images?.[2]?.url
              },
              reason: `Similar to ${artist.name}`
            })));
          }
        } catch (error) {
          console.error(`Error getting related artists for ${artist.name}:`, error);
        }
      }

      return this.deduplicateArtists(recommendations).slice(0, limit);

    } catch (error) {
      console.error('Error getting similar artist recommendations:', error);
      return [];
    }
  }

  /**
   * Get genre-based recommendations
   */
  async getGenreBasedRecommendations(favoriteGenres, limit = 3) {
    try {
      const recommendations = [];

      for (const genre of favoriteGenres.slice(0, 2)) {
        const genreArtists = await this.searchArtists(`genre:${genre}`, { limit: 5 });
        recommendations.push(...genreArtists.artists.map(artist => ({
          ...artist,
          reason: `Popular in ${genre}`
        })));
      }

      return this.deduplicateArtists(recommendations).slice(0, limit);

    } catch (error) {
      console.error('Error getting genre recommendations:', error);
      return [];
    }
  }

  /**
   * Get trending recommendations
   */
  async getTrendingRecommendations(preferences, limit = 3) {
    try {
      // Get trending artists from our database
      const trendingArtists = await Artist.find({
        'analytics.trending.score': { $gt: 0.7 },
        'tracking.isActive': true
      })
      .sort({ 'analytics.trending.score': -1 })
      .limit(limit * 2);

      const recommendations = trendingArtists.map(artist => ({
        name: artist.name,
        artistId: artist.artistId,
        externalIds: artist.externalIds,
        genres: artist.genres,
        popularity: artist.popularity?.spotifyPopularity,
        images: artist.images,
        reason: 'Trending now',
        trendingScore: artist.analytics.trending.score
      }));

      return recommendations.slice(0, limit);

    } catch (error) {
      console.error('Error getting trending recommendations:', error);
      return [];
    }
  }


  /**
   * Utility methods
   */

  generateArtistId(name) {
    return name.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
  }

  deduplicateArtists(artists) {
    const seen = new Set();
    const unique = [];

    for (const artist of artists) {
      const key = `${artist.name.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(artist);
      } else {
        // Merge data from duplicate artist
        const existing = unique.find(a => a.name.toLowerCase() === artist.name.toLowerCase());
        if (existing && artist.externalIds) {
          existing.externalIds = { ...existing.externalIds, ...artist.externalIds };
        }
      }
    }

    return unique;
  }

  calculateRelevanceScore(artist, query) {
    let score = 0;
    const queryLower = query.toLowerCase();
    const nameLower = artist.name.toLowerCase();

    // Exact name match
    if (nameLower === queryLower) score += 100;
    // Name starts with query
    else if (nameLower.startsWith(queryLower)) score += 80;
    // Name contains query
    else if (nameLower.includes(queryLower)) score += 60;

    // Boost by popularity
    if (artist.popularity) score += artist.popularity * 0.3;

    // Boost by follower count
    if (artist.followers?.spotify) score += Math.log10(artist.followers.spotify) * 5;

    return score;
  }

  extractUserPreferences(userAnalytics, userMemories) {
    const preferences = {
      favoriteArtists: [],
      favoriteGenres: [],
      discoveryPreferences: {
        openToNewGenres: true,
        preferSimilarArtists: true
      }
    };

    // Extract from analytics
    if (userAnalytics) {
      preferences.favoriteArtists = userAnalytics.artistEngagement?.topArtists || [];
      preferences.favoriteGenres = userAnalytics.listeningBehavior?.consumption?.spotifyMetrics?.topGenres || [];
    }

    // Extract from memories
    if (userMemories?.results) {
      for (const memory of userMemories.results) {
        if (memory.metadata?.artist && memory.metadata?.genres) {
          preferences.favoriteArtists.push({
            artistName: memory.metadata.artist,
            spotifyId: memory.metadata.artistId
          });
          preferences.favoriteGenres.push(...memory.metadata.genres);
        }
      }
    }

    // Deduplicate genres
    preferences.favoriteGenres = [...new Set(preferences.favoriteGenres)];

    return preferences;
  }

  calculatePersonalizedScore(recommendation, preferences) {
    let score = recommendation.popularity || 50;

    // Boost for genre match
    if (recommendation.genres) {
      const genreMatch = recommendation.genres.some(genre => 
        preferences.favoriteGenres.includes(genre)
      );
      if (genreMatch) score += 30;
    }

    // Boost by recommendation type
    const typeBoosts = {
      similar_artists: 20,
      genre_exploration: 15,
      trending: 10
    };
    score += typeBoosts[recommendation.type] || 0;

    return score;
  }

  async createArtistRecord(artistData) {
    try {
      const artist = new Artist({
        name: artistData.name,
        artistId: artistData.artistId,
        externalIds: artistData.externalIds || {},
        genres: artistData.genres || [],
        images: artistData.images || {},
        socialLinks: artistData.socialLinks || {},
        popularity: {
          spotifyPopularity: artistData.popularity || 0,
          followers: artistData.followers || {},
          lastUpdated: new Date()
        },
        tracking: {
          isActive: true,
          lastScraped: {}
        },
        analytics: {
          followersCount: 0,
          trending: { score: 0 }
        }
      });

      await artist.save();
      console.log(`✅ Created new artist record: ${artistData.name}`);
      return artist;

    } catch (error) {
      console.error('Error creating artist record:', error);
      throw error;
    }
  }

  async getSpotifyAccessToken() {
    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
        },
        body: 'grant_type=client_credentials'
      });

      const data = await response.json();
      return data.access_token;

    } catch (error) {
      console.error('Error getting Spotify token:', error);
      throw error;
    }
  }
}

export default new ArtistDiscoveryService();