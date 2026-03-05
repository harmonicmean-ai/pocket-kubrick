import type { Theme } from "../schema/types.js";


/**
 * Hex color to 8-digit hex with alpha suffix.
 * E.g. hexWithOpacity("#07C107", 20) -> "#07C10733"
 */
function hexWithOpacity(hex: string, opacityPercent: number): string {
    const alpha: number = Math.round((opacityPercent / 100) * 255);
    const alphaSuffix: string = alpha.toString(16).padStart(2, "0");
    // Normalize to 6-digit hex (strip existing alpha if any)
    const baseHex: string = hex.length === 9 ? hex.slice(0, 7) : hex;
    return `${baseHex}${alphaSuffix}`;
}


/**
 * Resolve a single `$variable` or `$variable{opacity}` reference against the theme.
 *
 * Examples:
 *   "$accent"      -> "#07C107"
 *   "$accent20"    -> "#07C10733"   (accent at 20% opacity)
 *   "$background"  -> "#121212"
 *   "red"          -> "red"         (not a variable, returned as-is)
 */
export function resolveThemeValue(value: string, theme: Theme): string {
    if (!value.includes("$")) {
        return value;
    }

    const themeKeys: string[] = ["background", "accent", "font"];

    // Replace all $variable references (with optional opacity suffix) in the string
    return value.replace(/\$([a-z]+\d*)/g, (_match: string, varBody: string) => {
        for (const key of themeKeys) {
            if (varBody === key) {
                return resolveThemeKey(key, theme);
            }

            if (varBody.startsWith(key) && varBody.length > key.length) {
                const suffix: string = varBody.slice(key.length);
                const opacityPercent: number = parseInt(suffix, 10);
                if (!isNaN(opacityPercent) && opacityPercent >= 0 && opacityPercent <= 100) {
                    const baseColor: string = resolveThemeKey(key, theme);
                    return hexWithOpacity(baseColor, opacityPercent);
                }
            }
        }

        // Unknown variable -- return as-is
        return _match;
    });
}


/**
 * Resolve a bare theme key to its value.
 */
function resolveThemeKey(key: string, theme: Theme): string {
    switch (key) {
        case "background":
            return theme.background;
        case "accent":
            return theme.accent;
        case "font":
            return theme.font;
        default:
            return `$${key}`;
    }
}


/**
 * Resolve all `$variable` references in a record of string values.
 * Only processes string values; non-strings are left untouched.
 */
export function resolveThemeColors(
    obj: Record<string, unknown>,
    theme: Theme,
    colorFields: string[],
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...obj };

    for (const field of colorFields) {
        const val: unknown = result[field];
        if (typeof val === "string") {
            result[field] = resolveThemeValue(val, theme);
        }
    }

    return result;
}
