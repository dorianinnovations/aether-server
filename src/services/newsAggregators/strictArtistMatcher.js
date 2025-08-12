/**
 * Strict Artist Matcher - ONLY matches user's actual artists
 * Prevents irrelevant content from leaking through
 */

class StrictArtistMatcher {
  /**
   * STRICT artist matching - only matches user's actual artists
   */
  strictArtistMatch(content, userArtistNames) {
    const contentLower = content.toLowerCase();
    
    // Check each of the user's artists
    for (const artistName of userArtistNames) {
      if (this.matchesSpecificArtist(contentLower, artistName.toLowerCase())) {
        return artistName; // Return matched artist name
      }
    }
    
    return null; // No match found
  }

  /**
   * Enhanced artist matching with better fuzzy logic
   */
  matchesSpecificArtist(content, artistName) {
    // Direct exact match
    if (content.includes(artistName)) return true;
    
    // Handle common punctuation/spacing variations
    const normalizedArtist = artistName.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    const normalizedContent = content.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
    
    if (normalizedContent.includes(normalizedArtist)) return true;
    
    // Check for word boundary matches (prevent partial word matches)
    const artistWords = artistName.split(/\s+/).filter(word => word.length > 2);
    if (artistWords.length === 1) {
      // Single word artist - require word boundary match
      const regex = new RegExp(`\\b${this.escapeRegExp(artistWords[0])}\\b`, 'i');
      return regex.test(content);
    } else {
      // Multi-word artist - require majority of words to match with word boundaries
      let matchCount = 0;
      for (const word of artistWords) {
        const regex = new RegExp(`\\b${this.escapeRegExp(word)}\\b`, 'i');
        if (regex.test(content)) {
          matchCount++;
        }
      }
      return matchCount >= Math.ceil(artistWords.length * 0.75); // At least 75% of words must match
    }
  }

  /**
   * Escape special regex characters
   */
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

export default new StrictArtistMatcher();