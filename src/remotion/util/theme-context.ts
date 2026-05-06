import { createContext, useContext } from "react";
import type { TimelineTheme } from "./types";


export const ThemeContext = createContext<TimelineTheme | null>(null);


export function useTheme(): TimelineTheme | null {
    return useContext(ThemeContext);
}


/**
 * Build a CSS font-family value honoring `theme.font`.
 * Quotes the family name when it contains spaces and falls back to sans-serif.
 */
export function fontFamily(theme: TimelineTheme | null): string {
    const font: string = theme?.font ?? "Open Sans";
    const primary: string = font.includes(" ") ? `'${font}'` : font;
    return `${primary}, sans-serif`;
}
