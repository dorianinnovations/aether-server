// Helper function to ensure all special markers are removed from text
export const sanitizeResponse = (text) => {
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return "I'm sorry, I wasn't able to provide a proper response. Please try again.";
  }

  // Remove markers and their JSON, case-insensitive
  let sanitized = text
    .replace(/TASK_INFERENCE:?\s*(\{[\s\S]*?\})?\s*/gi, ' ')
    .replace(/EMOTION_LOG:?\s*(\{[\s\S]*?\})?\s*/gi, ' ')
    // Remove any stray braces left behind
    .replace(/\}+/g, ' ')
    // Collapse multiple spaces to one (but preserve newlines)
    .replace(/[ ]{2,}/g, ' ')
    // Collapse multiple newlines to a single newline
    .replace(/\n{2,}/g, '\n')
    // Remove leading/trailing spaces and newlines
    .replace(/^[ \n]+|[ \n]+$/g, '');

  if (!sanitized) {
    return "I'm sorry, I wasn't able to provide a proper response. Please try again.";
  }
  return sanitized;
}; 