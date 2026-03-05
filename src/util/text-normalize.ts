/**
 * Normalize an anchor string for text matching.
 * Converts hyphens to spaces, lowercases, and trims.
 * E.g. "settings-icon" -> "settings icon"
 */
export function normalizeAnchor(anchor: string): string {
    return anchor.replace(/-/g, " ").toLowerCase().trim();
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
