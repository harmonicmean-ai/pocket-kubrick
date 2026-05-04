/**
 * Loads Google Fonts used by text overlays. Importing this module triggers
 * `loadFont()` for each font listed below, registering it with the browser
 * font-loading API so Remotion's renderer can use them.
 *
 * To add a new font: add another `loadFont()` call here and a key to
 * `KNOWN_FONTS` so `resolveFontFamily()` returns a sensible CSS fallback.
 */

import { loadFont as loadJura } from "@remotion/google-fonts/Jura";
import { loadFont as loadOpenSans } from "@remotion/google-fonts/OpenSans";


loadJura();
loadOpenSans();


const KNOWN_FONTS: Record<string, string> = {
    "jura": "Jura, sans-serif",
    "open sans": "Open Sans, sans-serif",
};

const DEFAULT_FONT: string = "Open Sans, sans-serif";


/**
 * Turn a user-supplied font name (e.g. "Jura") into a CSS `font-family`
 * value with a sensible fallback. Unknown fonts are passed through as-is
 * with a generic sans-serif fallback so a custom installed font still works.
 */
export function resolveFontFamily(name: string | null | undefined): string {
    if (!name) {
        return DEFAULT_FONT;
    }
    const key: string = name.trim().toLowerCase();
    return KNOWN_FONTS[key] ?? `${name}, sans-serif`;
}
