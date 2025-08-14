import { log } from '../utils/logger.js';
import musicAnalyticsService from './musicAnalyticsService.js';
import musicPredictionService from './musicPredictionService.js';
import spotifyService from './spotifyService.js';

class SmartMusicDiscoveryService {
  constructor() {
    // Discovery strategies - completely configurable
    this.discoveryStrategies = {
      // Use YOUR prediction system with Spotify search
      CUSTOM_PREDICTION: 'custom_prediction',
      
      // Use Spotify's recommendations (optional fallback)
      SPOTIFY_FALLBACK: 'spotify_fallback',
      
      // Hybrid approach
      HYBRID: 'hybrid'
    };

    // Default to YOUR system, not Spotify's
    this.defaultStrategy = this.discoveryStrategies.CUSTOM_PREDICTION;
  }

  // Main discovery method - returns actual songs using YOUR algorithm
  async discoverSongsForUser(userId, options = {}) {
    try {
      const {
        limit = 20,
        strategy = this.defaultStrategy,
        useSpotifyRecs = false, // Explicitly opt-in to Spotify recs
        searchQueries = [],
        seedGenres = [],
        includeScores = false // Optional visual aid
      } = options;

      const user = await this.getUserWithSpotifyAccess(userId);
      if (!user) {
        throw new Error('User not found or Spotify not connected');
      }

      let discoveredSongs = [];

      switch (strategy) {
        case this.discoveryStrategies.CUSTOM_PREDICTION:
          discoveredSongs = await this.discoverWithCustomPrediction(user, {
            limit,
            searchQueries,
            seedGenres,
            includeScores
          });
          break;

        case this.discoveryStrategies.SPOTIFY_FALLBACK:
          if (useSpotifyRecs) {
            discoveredSongs = await this.discoverWithSpotifyFallback(user, { limit, includeScores });
          } else {
            log.warn('Spotify fallback requested but useSpotifyRecs is false');
            discoveredSongs = [];
          }
          break;

        case this.discoveryStrategies.HYBRID:
          discoveredSongs = await this.discoverWithHybridApproach(user, {
            limit,
            useSpotifyRecs,
            searchQueries,
            seedGenres,
            includeScores
          });
          break;

        default:
          discoveredSongs = await this.discoverWithCustomPrediction(user, {
            limit,
            searchQueries,
            seedGenres,
            includeScores
          });
      }

      return {
        songs: discoveredSongs,
        strategy: strategy,
        timestamp: new Date(),
        userId: userId
      };

    } catch (error) {
      log.error('Failed to discover songs for user:', error);
      throw error;
    }
  }

  // YOUR prediction system - searches Spotify catalog and ranks with your algorithm
  async discoverWithCustomPrediction(user, options) {
    const { limit, searchQueries = [], seedGenres = [], includeScores } = options;
    
    // Get user's personalized profile
    const customWeights = user.musicProfile?.musicPersonality?.predictionSettings?.customWeights;
    const userProfile = await musicPredictionService.getUserPersonalizedProfile(user._id, customWeights);
    
    if (!userProfile) {
      log.warn('No user profile available, using basic search');
      return await this.basicSearch(user, { limit, searchQueries, includeScores });
    }

    // Generate smart search queries based on user preferences
    const smartQueries = this.generateSmartSearchQueries(userProfile, searchQueries, seedGenres);
    
    let candidateSongs = [];
    
    // Search Spotify for candidate songs using multiple strategies
    for (const query of smartQueries.slice(0, 5)) { // Limit to prevent API overuse
      try {
        const searchResults = await spotifyService.search(
          user.musicProfile.spotify.accessToken,
          query.query,
          'track',
          Math.min(50, Math.ceil(limit * 2)) // Get more candidates than needed
        );

        if (searchResults.tracks && searchResults.tracks.items) {
          const tracksWithFeatures = await this.addAudioFeaturesToTracks(
            user.musicProfile.spotify.accessToken,
            searchResults.tracks.items
          );
          
          candidateSongs.push(...tracksWithFeatures.map(track => ({
            ...track,
            searchQuery: query.query,
            searchReason: query.reason
          })));
        }
      } catch (error) {
        log.warn(`Search failed for query "${query.query}":`, error);
      }
    }

    // Remove duplicates
    const uniqueSongs = this.removeDuplicateTracks(candidateSongs);
    
    // Use YOUR prediction algorithm to rank these real songs
    const rankedSongs = await this.rankSongsWithCustomAlgorithm(
      user._id, 
      uniqueSongs, 
      customWeights,
      includeScores
    );

    return rankedSongs.slice(0, limit);
  }

  // Generate smart search queries based on user's actual listening patterns
  generateSmartSearchQueries(userProfile, customQueries = [], seedGenres = []) {
    const queries = [];
    
    // Add custom user queries first
    customQueries.forEach(query => {
      queries.push({
        query,
        reason: 'User specified'
      });
    });

    // Generate queries based on user's audio preferences
    const audioFeatures = userProfile.audioFeatures;
    
    // Energy-based queries
    if (audioFeatures.energy) {
      const energyLevel = audioFeatures.energy.preference;
      if (energyLevel === 'high' || energyLevel === 'very_high') {
        queries.push({
          query: 'energetic upbeat powerful',
          reason: 'Matches your high energy preference'
        });
      } else if (energyLevel === 'low' || energyLevel === 'very_low') {
        queries.push({
          query: 'calm peaceful ambient',
          reason: 'Matches your calm energy preference'
        });
      }
    }

    // Mood-based queries
    if (userProfile.preferences?.moodPreference) {
      const mood = userProfile.preferences.moodPreference;
      const moodQueries = {
        'happy_energetic': { query: 'upbeat happy dance party', reason: 'Matches your happy, energetic mood' },
        'happy_calm': { query: 'feel good relaxed positive', reason: 'Matches your happy, calm mood' },
        'sad_calm': { query: 'emotional melancholy introspective', reason: 'Matches your contemplative mood' },
        'energetic': { query: 'high energy motivational', reason: 'Matches your energetic preference' },
        'calm': { query: 'chill downtempo peaceful', reason: 'Matches your calm preference' }
      };
      
      if (moodQueries[mood]) {
        queries.push(moodQueries[mood]);
      }
    }

    // Danceability-based queries
    if (audioFeatures.danceability) {
      const danceLevel = audioFeatures.danceability.preference;
      if (danceLevel === 'very_danceable' || danceLevel === 'danceable') {
        queries.push({
          query: 'dance electronic groove rhythm',
          reason: 'Matches your danceable music preference'
        });
      }
    }

    // Genre-based queries
    seedGenres.forEach(genre => {
      queries.push({
        query: `${genre} new recent`,
        reason: `Exploring ${genre} genre`
      });
    });

    // Ensure we have some queries
    if (queries.length === 0) {
      queries.push(
        { query: 'indie alternative new music', reason: 'General discovery' },
        { query: 'electronic experimental', reason: 'General discovery' },
        { query: 'singer songwriter acoustic', reason: 'General discovery' }
      );
    }

    return queries;
  }

  // Add audio features to tracks in batch
  async addAudioFeaturesToTracks(accessToken, tracks) {
    try {
      const trackIds = tracks.map(track => track.id);
      const audioFeatures = await spotifyService.getAudioFeatures(accessToken, trackIds);
      
      return tracks.map((track, index) => ({
        id: track.id,
        name: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        album: track.album.name,
        imageUrl: track.album.images[0]?.url,
        spotifyUrl: track.external_urls.spotify,
        previewUrl: track.preview_url,
        popularity: track.popularity,
        duration: track.duration_ms,
        explicit: track.explicit,
        audioFeatures: audioFeatures[index] || null
      }));
    } catch (error) {
      log.error('Failed to add audio features to tracks:', error);
      // Return tracks without audio features rather than failing
      return tracks.map(track => ({
        id: track.id,
        name: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        album: track.album.name,
        imageUrl: track.album.images[0]?.url,
        spotifyUrl: track.external_urls.spotify,
        previewUrl: track.preview_url,
        popularity: track.popularity,
        duration: track.duration_ms,
        explicit: track.explicit,
        audioFeatures: null
      }));
    }
  }

  // Use YOUR algorithm to rank real songs
  async rankSongsWithCustomAlgorithm(userId, songs, customWeights, includeScores) {
    const rankedSongs = [];
    
    for (const song of songs) {
      if (!song.audioFeatures) {
        // Skip songs without audio features
        continue;
      }

      try {
        // Use YOUR prediction service to score this real song
        const prediction = await musicPredictionService.predictUserPreference(
          userId,
          song,
          customWeights
        );

        const rankedSong = {
          // The actual song data (main event)
          id: song.id,
          name: song.name,
          artist: song.artist,
          album: song.album,
          imageUrl: song.imageUrl,
          spotifyUrl: song.spotifyUrl,
          previewUrl: song.previewUrl,
          duration: song.duration,
          popularity: song.popularity,
          explicit: song.explicit,
          
          // Optional context
          searchQuery: song.searchQuery,
          searchReason: song.searchReason
        };

        // Include scores only if requested (visual aid)
        if (includeScores) {
          rankedSong.predictionScore = prediction.prediction;
          rankedSong.confidence = prediction.confidence;
          rankedSong.reasoning = prediction.reasoning;
          rankedSong.featureSimilarity = prediction.featureSimilarity;
        }

        rankedSongs.push(rankedSong);

      } catch (error) {
        log.warn(`Failed to predict preference for song ${song.id}:`, error);
        // Still include the song but without prediction
        rankedSongs.push({
          id: song.id,
          name: song.name,
          artist: song.artist,
          album: song.album,
          imageUrl: song.imageUrl,
          spotifyUrl: song.spotifyUrl,
          previewUrl: song.previewUrl,
          duration: song.duration,
          popularity: song.popularity,
          explicit: song.explicit,
          searchQuery: song.searchQuery,
          searchReason: song.searchReason
        });
      }
    }

    // Sort by prediction score (highest first) if scores are available
    rankedSongs.sort((a, b) => {
      const scoreA = a.predictionScore || 0.5;
      const scoreB = b.predictionScore || 0.5;
      return scoreB - scoreA;
    });

    return rankedSongs;
  }

  // Remove duplicate tracks
  removeDuplicateTracks(tracks) {
    const seen = new Set();
    return tracks.filter(track => {
      const key = `${track.id}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  // Basic search fallback
  async basicSearch(user, options) {
    const { limit, searchQueries, includeScores } = options;
    const queries = searchQueries.length > 0 ? searchQueries : ['new music', 'indie rock', 'electronic'];
    
    let allTracks = [];
    
    for (const query of queries.slice(0, 3)) {
      try {
        const searchResults = await spotifyService.search(
          user.musicProfile.spotify.accessToken,
          query,
          'track',
          Math.ceil(limit / queries.length)
        );

        if (searchResults.tracks && searchResults.tracks.items) {
          const tracks = searchResults.tracks.items.map(track => ({
            id: track.id,
            name: track.name,
            artist: track.artists.map(a => a.name).join(', '),
            album: track.album.name,
            imageUrl: track.album.images[0]?.url,
            spotifyUrl: track.external_urls.spotify,
            previewUrl: track.preview_url,
            duration: track.duration_ms,
            popularity: track.popularity,
            explicit: track.explicit,
            searchQuery: query
          }));
          
          allTracks.push(...tracks);
        }
      } catch (error) {
        log.warn(`Basic search failed for query "${query}":`, error);
      }
    }

    return this.removeDuplicateTracks(allTracks).slice(0, limit);
  }

  // Optional Spotify fallback (only if explicitly requested)
  async discoverWithSpotifyFallback(user, options) {
    log.warn('Using Spotify recommendation fallback - consider using custom prediction instead');
    
    // This is intentionally basic since you don't want to rely on Spotify's algorithm
    return await this.basicSearch(user, {
      ...options,
      searchQueries: ['recommended for you', 'new releases']
    });
  }

  // Hybrid approach
  async discoverWithHybridApproach(user, options) {
    const { limit, useSpotifyRecs } = options;
    
    // 80% your algorithm, 20% Spotify (if enabled)
    const customLimit = Math.ceil(limit * 0.8);
    const spotifyLimit = useSpotifyRecs ? Math.floor(limit * 0.2) : 0;
    
    const [customSongs, spotifySongs] = await Promise.all([
      this.discoverWithCustomPrediction(user, { ...options, limit: customLimit }),
      spotifyLimit > 0 ? this.discoverWithSpotifyFallback(user, { ...options, limit: spotifyLimit }) : []
    ]);

    // Interleave the results, prioritizing your algorithm
    const hybridSongs = [];
    const maxLength = Math.max(customSongs.length, spotifySongs.length);
    
    for (let i = 0; i < maxLength; i++) {
      if (i < customSongs.length) {
        hybridSongs.push(customSongs[i]);
      }
      if (i < spotifySongs.length && hybridSongs.length < limit) {
        hybridSongs.push({
          ...spotifySongs[i],
          source: 'spotify_fallback'
        });
      }
    }

    return hybridSongs.slice(0, limit);
  }

  // Helper to get user with Spotify access
  async getUserWithSpotifyAccess(userId) {
    try {
      const User = (await import('../models/User.js')).default;
      const user = await User.findById(userId);
      
      if (!user) {
        return null;
      }

      if (!user.musicProfile?.spotify?.connected || !user.musicProfile.spotify.accessToken) {
        throw new Error('Spotify not connected or access token missing');
      }

      return user;
    } catch (error) {
      log.error('Failed to get user with Spotify access:', error);
      throw error;
    }
  }
}

export default new SmartMusicDiscoveryService();