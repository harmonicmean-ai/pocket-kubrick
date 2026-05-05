/**
 * Normalize a string for anchor/script matching. Lowercases and replaces every
 * run of non-letter, non-digit characters with a single space, then trims.
 * Applied symmetrically to anchors, script text, and TTS tokens so that
 * hyphens, slashes, periods, etc. inside words don't break matching.
 * E.g. "settings-icon" -> "settings icon", "multi-factor" -> "multi factor".
 */
export function normalizeForMatching(s: string): string {
    return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}


/**
 * Convert a title string to a URL-friendly slug.
 * E.g. "How to Configure Notifications" -> "how-to-configure-notifications"
 */
export function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}
