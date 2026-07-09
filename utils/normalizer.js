// Normalizes and cleans up raw response text from various platforms.
export function normalizeResponse(rawText, platform, roundNumber) {
  let cleaned = (rawText || "").trim();
  cleaned = cleaned.replace(/\[\d+\]/g, "");
  cleaned = cleaned.replace(/<[^>]*>/g, "");
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  return {
    platform,
    roundNumber,
    text: cleaned,
    wordCount: words.length,
    scrapedAt: Date.now()
  };
}
