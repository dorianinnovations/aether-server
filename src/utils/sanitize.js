// Helper function to ensure all special markers are removed from text
export const sanitizeResponse = (text) => {
  if (!text) return "";

  // Initial regex-based cleaning with case-insensitive matching
  let sanitized = text
    // Remove all variations of TASK_INFERENCE with case insensitivity
    .replace(/TASK_INFERENCE:?\s*(\{[\s\S]*?\})?\s*?/gi, "")
    .replace(/TASK_INFERENCE:?/gi, "")
    // Remove all variations of EMOTION_LOG with case insensitivity
    .replace(/EMOTION_LOG:?\s*(\{[\s\S]*?\})?\s*?/gi, "")
    .replace(/EMOTION_LOG:?/gi, "")
    // Also clean up any formatting artifacts
    .replace(/(\r?\n){2,}/g, "\n")
    .trim();

  // Case-insensitive check for remaining markers
  const lowerSanitized = sanitized.toLowerCase();
  if (
    lowerSanitized.includes("task_inference") ||
    lowerSanitized.includes("emotion_log")
  ) {
    // Secondary line-by-line filtering with case insensitivity
    sanitized = sanitized
      .split("\n")
      .filter((line) => {
        const lowerLine = line.toLowerCase();
        return (
          !lowerLine.includes("task_inference") &&
          !lowerLine.includes("emotion_log")
        );
      })
      .join("\n")
      .trim();
  }

  return (
    sanitized ||
    "I'm sorry, I wasn't able to provide a proper response. Please try again."
  );
}; 