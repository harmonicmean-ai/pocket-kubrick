/**
 * Resolve a YAML-supplied font name (e.g. "Jura") into a CSS `font-family`
 * string with a sensible fallback. Actual font files are self-hosted in
 * `<projectRoot>/fonts/` and registered via `<FontStyles>` at composition
 * mount time -- this helper is just the lookup used by text components.
 */

const KNOWN_FAMILIES: Record<string, string> = {
    "jura": "Jura, sans-serif",
    "open sans": "Open Sans, sans-serif",
};

const DEFAULT_FONT: string = "Open Sans, sans-serif";


export function resolveFontFamily(name: string | null | undefined): string {
    if (!name) {
        return DEFAULT_FONT;
    }
    const key: string = name.trim().toLowerCase();
    return KNOWN_FAMILIES[key] ?? `${name}, sans-serif`;
}
