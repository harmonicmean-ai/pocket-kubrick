import { createContext, useContext } from "react";
import type { TimelineTheme } from "./types";


export const ThemeContext = createContext<TimelineTheme | null>(null);


export function useTheme(): TimelineTheme | null {
    return useContext(ThemeContext);
}
