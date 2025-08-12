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
    // NewsAPI configuration
    this.newsAPIKey = process.env.NEWSAPI_KEY; // Add to your .env file
    this.newsAPIBaseUrl = 'https://newsapi.org/v2';
    
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

    // Direct scraping sources as backup
    this.scrapingSources = [
      {
        name: 'HipHopDX',
        url: 'https://hiphopdx.com/news',
        titleSelector: 'h3 a, .entry-title a',
        linkSelector: 'h3 a, .entry-title a',
        dateSelector: '.date, .entry-meta',
        contentSelector: '.post-content, .entry-content, article, .content-area'
      },
      {
        name: 'XXL Magazine',
        url: 'https://www.xxlmag.com/news/',
        titleSelector: 'h2 a, h3 a',
        linkSelector: 'h2 a, h3 a',
        dateSelector: '.date, .entry-meta',
        contentSelector: '.post-content, .entry-content, article'
      }
    ];

    // Keep Reddit as fallback (even though it's blocked)
    this.redditSources = [
      'https://www.reddit.com/r/hiphopheads/new.json?limit=25',
      'https://www.reddit.com/r/music/new.json?limit=25',
      'https://www.reddit.com/r/rap/new.json?limit=25'
    ];
  }

  /**
   * Get music news from NewsAPI (PREMIUM SOURCE)
   */
  async getMusicNewsFromNewsAPI(artistNames, feedType = 'timeline', limit = 20) {
    if (!this.newsAPIKey) {
      console.log('[DEBUG] NewsAPI - No API key configured');
      return [];
    }

    try {
      console.log(`[DEBUG] NewsAPI - Fetching ${feedType} content for ${artistNames.length} artists`);
      
      const allArticles = [];
      
      // Build search queries for different content types
      let searchQueries = [];
      
      if (feedType === 'releases') {
        // Focus on release-related searches
        searchQueries = [
          '"new album" OR "new single" OR "just dropped" OR "released"',
          '"album release" OR "music release" OR "debut album"'
        ];
      } else if (feedType === 'tours') {
        // Focus on tour/concert searches
        searchQueries = [
          '"tour dates" OR "concert" OR "live show" OR "tour announcement"',
          '"world tour" OR "festival" OR "tickets on sale"'
        ];
      } else {
        // General music news
        searchQueries = [
          'music AND (hip-hop OR rap OR album OR single)',
          '"music news" OR "music industry" OR "rapper" OR "artist"'
        ];
      }

      // Add specific artist searches - FOCUS HEAVILY on user's actual artists
      const topArtists = artistNames.slice(0, 5); // Increased to top 5 artists
      topArtists.forEach(artist => {
        if (artist && artist.length > 2) {
          // Multiple variations to catch more content about user's artists
          searchQueries.push(`"${artist}"`);
          searchQueries.push(`${artist} AND (music OR rap OR hip-hop)`);
        }
      });
      
      // Reduce generic searches to focus more on user's artists
      searchQueries = searchQueries.slice(0, 8); // Limit total queries but prioritize artist-specific ones

      console.log(`[DEBUG] NewsAPI - Running ${searchQueries.length} queries`);

      // Execute searches in parallel (but limit concurrent requests)
      for (const query of searchQueries.slice(0, 5)) { // Max 5 queries to stay within limits
        try {
          const url = `${this.newsAPIBaseUrl}/everything?` + new URLSearchParams({
            q: query,
            language: 'en',
            sortBy: 'publishedAt',
            pageSize: Math.min(20, limit),
            apiKey: this.newsAPIKey
          });

          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Aether Music News Bot 1.0'
            }
          });

          if (response.ok) {
            const data = await response.json();
            console.log(`[DEBUG] NewsAPI - Query "${query}" returned ${data.articles?.length || 0} articles`);
            
            if (data.articles) {
              data.articles.forEach(article => {
                // Filter for music relevance
                const content = `${article.title} ${article.description}`.toLowerCase();
                const hasMusicContent = this.containsMusicKeywords(content);
                const mentionedArtist = artistNames.find(name => 
                  this.matchesArtist(content, name.toLowerCase())
                );

                // STRICT FILTERING: Prioritize user's actual artists heavily
                if (mentionedArtist) {
                  // User's artist mentioned - definitely include
                  const relevanceScore = this.calculateRelevance(content, mentionedArtist);
                  const boostedScore = relevanceScore + 0.5; // Higher boost for user's artists

                  allArticles.push({
                    id: `newsapi_${article.publishedAt}_${Math.random()}`,
                    type: feedType,
                    title: article.title,
                    description: article.description || '',
                    source: article.source?.name || 'NewsAPI',
                    publishedAt: article.publishedAt,
                    url: article.url,
                    imageUrl: article.urlToImage,
                    relevanceScore: boostedScore,
                    artistName: mentionedArtist,
                    isPremium: true, // Mark as premium content
                    needsFullContent: true // Flag for full content scraping
                  });
                } else if (hasMusicContent && contentBonus >= 0.4) {
                  // Only include generic music content if it's VERY relevant to feed type
                  const relevanceScore = this.calculateRelevance(content, 'music');
                  const boostedScore = Math.min(relevanceScore + 0.2, 0.6); // Lower boost, capped score
                  
                  allArticles.push({
                    id: `newsapi_${article.publishedAt}_${Math.random()}`,
                    type: feedType,
                    title: article.title,
                    description: article.description || '',
                    source: article.source?.name || 'NewsAPI',
                    publishedAt: article.publishedAt,
                    url: article.url,
                    imageUrl: article.urlToImage,
                    relevanceScore: boostedScore,
                    artistName: 'Music',
                    isPremium: true
                  });
                }
              });
            }
          } else {
            console.log(`[DEBUG] NewsAPI - Query failed: ${response.status} ${response.statusText}`);
          }

        } catch (queryError) {
          console.log(`[DEBUG] NewsAPI - Query error:`, queryError.message);
        }

        // Small delay between requests to be respectful
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Remove duplicates and sort
      const uniqueArticles = this.removeDuplicateArticles(allArticles);
      const sortedArticles = uniqueArticles
        .sort((a, b) => {
          const scoreA = b.relevanceScore + this.getRecencyScore(b.publishedAt);
          const scoreB = a.relevanceScore + this.getRecencyScore(a.publishedAt);
          return scoreA - scoreB;
        })
        .slice(0, limit);

      console.log(`[DEBUG] NewsAPI - Final articles returned: ${sortedArticles.length}`);
      return sortedArticles;

    } catch (error) {
      console.log(`[DEBUG] NewsAPI - Error:`, error.message);
      return [];
    }
  }

  /**
   * Parse RSS feeds for music news
   */
  async parseRSSFeed(rssUrl, source) {
    try {
      console.log(`[DEBUG] RSS - Fetching ${source.name} from: ${rssUrl}`);
      
      const response = await fetch(rssUrl, {
        headers: {
          'User-Agent': 'Aether Music News Bot 1.0',
          'Accept': 'application/rss+xml, application/xml, text/xml'
        },
        timeout: 15000
      });

      if (!response.ok) {
        console.log(`[DEBUG] RSS - Failed ${source.name}: ${response.status} ${response.statusText}`);
        return [];
      }

      const xml = await response.text();
      const $ = cheerio.load(xml, { xmlMode: true });
      const articles = [];

      // Parse RSS items
      $('item').each((i, element) => {
        if (i >= 20) return; // Limit to 20 items per feed
        
        const $item = $(element);
        const title = $item.find('title').text().trim();
        const link = $item.find('link').text().trim();
        const description = $item.find('description').text().trim();
        const pubDate = $item.find('pubDate').text().trim();
        
        if (title && link) {
          articles.push({
            title,
            link,
            description: this.cleanDescription(description),
            publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
            source: source.name,
            type: source.type || 'music'
          });
        }
      });

      console.log(`[DEBUG] RSS - Found ${articles.length} articles from ${source.name}`);
      return articles;

    } catch (error) {
      console.log(`[DEBUG] RSS - Error fetching ${source.name}:`, error.message);
      return [];
    }
  }

  /**
   * Clean RSS description content
   */
  cleanDescription(description) {
    if (!description) return '';
    
    // Remove HTML tags and clean up
    const $ = cheerio.load(description);
    let cleanText = $.text().trim();
    
    // Remove common RSS artifacts
    cleanText = cleanText
      .replace(/\[.*?\]/g, '') // Remove [tags]
      .replace(/The post .* appeared first on .*/i, '') // Remove WordPress footer
      .replace(/Continue reading.*/i, '') // Remove continue reading
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
      
    return cleanText.substring(0, 300) + (cleanText.length > 300 ? '...' : '');
  }

  /**
   * Get music news from RSS feeds (PRIMARY SOURCE)
   */
  async getMusicNewsFromRSS(artistNames, feedType = 'timeline', limit = 15) {
    try {
      console.log(`[DEBUG] RSS - Fetching ${feedType} content for ${artistNames.length} artists`);
      
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
      
      // Filter for artist mentions and content type
      const relevantArticles = [];
      allArticles.forEach(article => {
        const content = `${article.title} ${article.description}`.toLowerCase();
        
        // Check for artist mentions (prioritize user's artists)
        const mentionedArtist = artistNames.find(name => 
          this.matchesArtist(content, name.toLowerCase())
        );
        
        // Content type filtering based on feedType
        let contentTypeMatch = false;
        let contentBonus = 0;
        
        if (feedType === 'releases') {
          contentTypeMatch = this.containsReleaseKeywords(content);
          contentBonus = contentTypeMatch ? 0.4 : 0;
        } else if (feedType === 'tours') {
          contentTypeMatch = this.containsTourKeywords(content);
          contentBonus = contentTypeMatch ? 0.4 : 0;
        } else if (feedType === 'news') {
          contentTypeMatch = this.containsNewsKeywords(content);
          contentBonus = contentTypeMatch ? 0.2 : 0;
        } else {
          // Timeline - broader match
          contentTypeMatch = this.containsMusicKeywords(content);
        }
        
        // STRICT FILTERING: Require artist match for most content
        // Only allow generic music content if it's VERY relevant to feed type
        const shouldInclude = mentionedArtist || (contentTypeMatch && contentBonus >= 0.4);
        
        if (shouldInclude) {
          let relevanceScore = this.calculateRelevance(content, mentionedArtist || 'music');
          
          // MAJOR boost for exact artist matches (user's actual artists)
          if (mentionedArtist) {
            relevanceScore += 0.8; // Increased from 0.5
          } else if (contentTypeMatch) {
            // Generic content gets lower base score
            relevanceScore = Math.max(0.3, relevanceScore);
          }
          
          // Content type bonus
          relevanceScore += contentBonus;
          
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
            artistName: mentionedArtist || 'Music',
            isFresh: true
          });
        }
      });
      
      console.log(`[DEBUG] RSS - Relevant ${feedType} articles: ${relevantArticles.length}`);
      
      // Sort by relevance and recency
      const sortedArticles = relevantArticles
        .sort((a, b) => {
          const scoreA = b.relevanceScore + this.getRecencyScore(b.publishedAt);
          const scoreB = a.relevanceScore + this.getRecencyScore(a.publishedAt);
          return scoreA - scoreB;
        })
        .slice(0, limit);
        
      console.log(`[DEBUG] RSS - Final ${feedType} articles returned: ${sortedArticles.length}`);
      return sortedArticles;
      
    } catch (error) {
      console.log(`[DEBUG] RSS - Error in RSS news fetch:`, error.message);
      return [];
    }
  }

  /**
   * Enhanced full article content scraper for detailed reading
   */
  async scrapeFullArticleContent(url) {
    try {
      console.log(`[DEBUG] Full Article - Scraping: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout: 20000
      });
      
      if (!response.ok) {
        console.log(`[DEBUG] Full Article - Failed: ${response.status}`);
        return null;
      }
      
      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Remove unwanted elements
      $('script, style, nav, header, footer, .advertisement, .ad, .social-share, .comments').remove();
      
      // Try multiple content selectors for different news sites
      let fullContent = '';
      const contentSelectors = [
        // Common article selectors
        'article .content, article .post-content, article .entry-content',
        '.article-content, .story-content, .main-content',
        '[class*="article-body"], [class*="story-body"]',
        '.post-body, .entry-body, .content-body',
        // Music site specific selectors
        '.review-content, .news-content, .article-text',
        // Fallback selectors
        'main p, article p, .content p',
        'p' // Last resort
      ];
      
      for (const selector of contentSelectors) {
        const elements = $(selector);
        if (elements.length > 3) { // Need substantial content
          fullContent = elements.map((i, el) => {
            const text = $(el).text().trim();
            return text.length > 30 ? text : null; // Filter short paragraphs
          }).get().filter(Boolean).join('\n\n');
          
          if (fullContent.length > 500) { // Good amount of content found
            break;
          }
        }
      }
      
      // Clean up the content
      fullContent = fullContent
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/\n\s*\n/g, '\n\n') // Clean up line breaks
        .replace(/Advertisement\s*/gi, '') // Remove ad text
        .replace(/Continue reading.*/gi, '') // Remove continue reading
        .replace(/Sign up for.*/gi, '') // Remove signup prompts
        .trim();
      
      // Extract better images
      let imageUrl = null;
      const imageSelectors = [
        'meta[property="og:image"]',
        'article img[src*="wp-content"]',
        'article img[src*="upload"]',
        '.featured-image img, .article-image img',
        'img[alt*="' + url.split('/').pop() + '"]',
        'article img'
      ];
      
      for (const imgSelector of imageSelectors) {
        const imgElement = $(imgSelector).first();
        if (imgElement.length > 0) {
          const src = imgElement.attr('content') || imgElement.attr('src');
          if (src && (src.startsWith('http') || src.startsWith('//'))) {
            imageUrl = src.startsWith('//') ? `https:${src}` : src;
            if (src.startsWith('/')) {
              const urlObj = new URL(url);
              imageUrl = `${urlObj.origin}${src}`;
            }
            break;
          }
        }
      }
      
      console.log(`[DEBUG] Full Article - Extracted ${fullContent.length} chars`);
      
      return {
        content: fullContent.length > 200 ? fullContent : null,
        imageUrl,
        wordCount: fullContent.split(' ').length,
        extractedAt: new Date().toISOString()
      };
      
    } catch (error) {
      console.log(`[DEBUG] Full Article - Error:`, error.message);
      return null;
    }
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
      
      // If Reddit is blocked (403 errors), generate sample content
      if (finalPosts.length === 0 && allPosts.length === 0) {
        console.log(`[DEBUG] Reddit - All requests blocked, generating fallback content`);
        return this.generateFallbackContent(artistNames, limit);
      }
      
      return finalPosts;
        
    } catch (error) {
      log.error('Free Reddit trending fetch failed:', error);
      // Also generate fallback on error
      return this.generateFallbackContent(artistNames, limit);
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
   * Generate complete free feed (RSS + Scraping - RELIABLE)
   */
  async getPersonalizedFeedFree(followedArtists, feedType = 'timeline', limit = 20) {
    try {
      log.info(`🆓 Generating FREE RSS-based ${feedType} feed for ${followedArtists.length} artists`);
      
      const artistNames = followedArtists.map(artist => artist.name || artist.artistName);
      const allContent = [];
      
      // PREMIUM: NewsAPI (if available)
      if (this.newsAPIKey) {
        console.log(`[DEBUG] Feed - Starting NewsAPI premium aggregation for ${feedType}`);
        const newsAPIContent = await this.getMusicNewsFromNewsAPI(artistNames, feedType, Math.ceil(limit * 0.5));
        allContent.push(...newsAPIContent);
        console.log(`[DEBUG] Feed - NewsAPI returned ${newsAPIContent.length} premium articles for ${feedType}`);
      }
      
      // PRIMARY: RSS feeds (most reliable free source)
      console.log(`[DEBUG] Feed - Starting RSS news aggregation for ${feedType}`);
      const rssContent = await this.getMusicNewsFromRSS(artistNames, feedType, Math.ceil(limit * 0.4));
      allContent.push(...rssContent);
      console.log(`[DEBUG] Feed - RSS returned ${rssContent.length} articles for ${feedType}`);
      
      // SECONDARY: Direct web scraping if RSS doesn't provide enough
      if (allContent.length < limit / 2) {
        console.log(`[DEBUG] Feed - RSS insufficient, trying web scraping`);
        for (const artist of artistNames.slice(0, 5)) { // Limit to prevent timeout
          try {
            const scrapedContent = await this.getArtistNewsFromScraping(artist, 3);
            allContent.push(...scrapedContent);
            console.log(`[DEBUG] Feed - Scraping added ${scrapedContent.length} articles for ${artist}`);
          } catch (error) {
            console.log(`[DEBUG] Feed - Scraping failed for ${artist}:`, error.message);
          }
        }
      }
      
      // FALLBACK: Reddit (even though it's blocked, keep trying)
      if (allContent.length < 3) {
        console.log(`[DEBUG] Feed - Trying Reddit as fallback`);
        const redditContent = await this.getTrendingFromReddit(artistNames, limit);
        allContent.push(...redditContent);
      }
      
      // LAST RESORT: Only if absolutely no content found, use VERY targeted general content
      if (allContent.length === 0) {
        console.log(`[DEBUG] Feed - No content found, getting targeted hip-hop RSS for ${feedType}`);
        // Focus on hip-hop/rap only since user listens to rap
        const genreTerms = ['hip-hop', 'rap', 'trap', 'drill']; // Removed generic 'music', 'album', 'single'
        const generalContent = await this.getMusicNewsFromRSS(genreTerms, feedType, Math.min(limit, 5));
        allContent.push(...generalContent);
      }
      
      // Remove duplicates and sort
      const uniqueContent = this.removeDuplicateArticles(allContent);
      const sortedContent = uniqueContent
        .filter(item => item && item.title)
        .sort((a, b) => {
          const scoreA = (b.relevanceScore || 0) + this.getRecencyScore(b.publishedAt);
          const scoreB = (a.relevanceScore || 0) + this.getRecencyScore(a.publishedAt);
          return scoreA - scoreB;
        })
        .slice(0, limit);
        
      console.log(`[DEBUG] Feed - Final content: ${sortedContent.length} items`);
      log.info(`✅ Generated ${sortedContent.length} FREE multi-source feed items (RSS + Scraping)`);
      return sortedContent;
      
    } catch (error) {
      log.error('Free feed generation failed:', error);
      console.log(`[DEBUG] Feed - Error:`, error.message);
      return [];
    }
  }

  /**
   * Extract image from RSS article data
   */
  extractImageFromRSS(article) {
    // Try to extract image from RSS content
    if (article.description) {
      const $ = cheerio.load(article.description);
      const img = $('img').first();
      if (img.length > 0) {
        return img.attr('src');
      }
    }
    
    // TODO: Could implement more sophisticated image extraction
    // For now, return null and images will be extracted later if needed
    return null;
  }

  /**
   * Remove duplicate articles based on title similarity
   */
  removeDuplicateArticles(articles) {
    const unique = [];
    const seenTitles = new Set();
    
    articles.forEach(article => {
      const normalizedTitle = article.title?.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      if (normalizedTitle && !seenTitles.has(normalizedTitle)) {
        seenTitles.add(normalizedTitle);
        unique.push(article);
      }
    });
    
    console.log(`[DEBUG] Feed - Removed ${articles.length - unique.length} duplicate articles`);
    return unique;
  }

  /**
   * Helper methods
   */
  calculateRelevance(content, artistName) {
    const name = artistName.toLowerCase();
    let score = 0.2; // Base score for any music content
    
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
      'spotify', 'apple music', 'soundcloud', 'youtube music', 'rapper', 'artist',
      'song', 'track', 'music', 'hip-hop', 'rap', 'album review'
    ];
    return keywords.some(keyword => content.includes(keyword));
  }

  containsReleaseKeywords(content) {
    const keywords = [
      'new album', 'new single', 'dropped', 'released', 'out now', 'just dropped',
      'debut album', 'sophomore album', 'mixtape', 'ep', 'deluxe edition',
      'tracklist', 'album cover', 'release date', 'streaming now', 'available now',
      'surprise album', 'surprise drop', 'new music', 'latest album', 'latest single'
    ];
    return keywords.some(keyword => content.includes(keyword));
  }

  containsTourKeywords(content) {
    const keywords = [
      'tour', 'concert', 'live show', 'performance', 'tour dates', 'tickets',
      'on tour', 'world tour', 'concert tour', 'live performance', 'festival',
      'headlining', 'supporting act', 'venue', 'tour announcement', 'show dates',
      'presale', 'general sale', 'sold out', 'concert venue', 'live music'
    ];
    return keywords.some(keyword => content.includes(keyword));
  }

  containsNewsKeywords(content) {
    const keywords = [
      'announces', 'announces new', 'confirms', 'reveals', 'interview', 'talks about',
      'responds to', 'says', 'claims', 'beef', 'controversy', 'arrest', 'lawsuit',
      'collaboration', 'partnership', 'signs with', 'label', 'record deal',
      'breaking', 'exclusive', 'first time', 'never before', 'finally speaks'
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