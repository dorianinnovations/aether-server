/**
 * Feed Type Strategies - Different content filtering per tab
 * Ensures each tab has unique, relevant content
 */

class FeedTypeStrategies {
  /**
   * Apply feed-type specific content strategies
   */
  applyFeedTypeStrategy(content, feedType, userArtists) {
    let filteredContent = [...content];
    
    switch (feedType) {
      case 'releases':
        // Prioritize release-related content
        const releaseContent = content.filter(item => 
          this.containsReleaseKeywords(item.title + ' ' + item.description)
        );
        filteredContent = releaseContent.length > 0 ? releaseContent : content;
        break;
        
      case 'tours':
        // Prioritize tour/live performance content
        const tourContent = content.filter(item => 
          this.containsTourKeywords(item.title + ' ' + item.description)
        );
        filteredContent = tourContent.length > 0 ? tourContent : content;
        break;
        
      case 'news':
        // Prioritize news articles (excluding releases and tours)
        const newsContent = content.filter(item => {
          const text = item.title + ' ' + item.description;
          return this.containsNewsKeywords(text) && 
                 !this.containsReleaseKeywords(text) && 
                 !this.containsTourKeywords(text);
        });
        filteredContent = newsContent.length > 0 ? newsContent : content;
        break;
        
      case 'trending':
        // Sort by engagement/relevance score
        filteredContent.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
        break;
        
      case 'timeline':
      default:
        // Mixed content - sort by relevance and recency
        filteredContent.sort((a, b) => {
          const scoreA = (a.relevanceScore || 0) + this.getRecencyScore(a.publishedAt);
          const scoreB = (b.relevanceScore || 0) + this.getRecencyScore(b.publishedAt);
          return scoreB - scoreA;
        });
        break;
    }
    
    console.log(`[DEBUG] Feed strategy - ${feedType}: filtered ${content.length} -> ${filteredContent.length} items`);
    return filteredContent;
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
      'news', 'interview', 'statement', 'controversy', 'beef', 'collaboration',
      'signs deal', 'record label', 'lawsuit', 'arrest', 'chart', 'billboard',
      'grammy', 'award', 'nomination', 'wins', 'platinum', 'gold', 'certified',
      'breaks record', 'milestone', 'achievement', 'announces', 'reveals'
    ];
    return keywords.some(keyword => content.includes(keyword));
  }

  containsMusicKeywords(content) {
    const keywords = [
      'music', 'album', 'single', 'song', 'track', 'rapper', 'hip-hop', 'rap',
      'artist', 'musician', 'producer', 'beats', 'lyrics', 'verse', 'chorus'
    ];
    return keywords.some(keyword => content.includes(keyword));
  }

  getRecencyScore(publishedAt) {
    if (!publishedAt) return 0;
    
    const now = new Date();
    const published = new Date(publishedAt);
    const ageInHours = (now - published) / (1000 * 60 * 60);
    
    // Boost recent content
    if (ageInHours < 24) return 0.3;
    if (ageInHours < 72) return 0.2;
    if (ageInHours < 168) return 0.1; // 1 week
    return 0;
  }
}

export default new FeedTypeStrategies();