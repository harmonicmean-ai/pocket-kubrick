/**
 * Pre-process bracket directives in Markdown text before remark parsing.
 *
 * Converts bracket directives to unique placeholders so remark doesn't
 * misinterpret them as link references. After Markdown parsing, placeholders
 * are restored as structured tokens that the segment builder can interpret.
 */

import type { DiagnosticMessage } from "../util/errors.js";


/**
 * Placeholder delimiters using Unicode private-use-area characters.
 * Each directive gets a unique placeholder like: \uE001_0\uE002
 */
const PH_START: string = "\uE001";
const PH_END: string = "\uE002";

/** Token prefix for segment-break directives. */
export const TOKEN_PAUSE: string = "PAUSE";
/** Token prefix for voice-switch start. */
export const TOKEN_VOICE_START: string = "VOICE_START";
/** Token for voice-switch end. */
export const TOKEN_VOICE_END: string = "VOICE_END";
/** Token prefix for rate-change start. */
export const TOKEN_RATE_START: string = "RATE_START";
/** Token for rate-change end. */
export const TOKEN_RATE_END: string = "RATE_END";

let placeholderCounter: number = 0;


export interface DirectivePlaceholder {
    placeholder: string;
    token: string;
}


export interface PreProcessResult {
    text: string;
    placeholders: DirectivePlaceholder[];
    diagnostics: DiagnosticMessage[];
}


/** Map named rate values to Inworld speaking-rate numbers. */
const RATE_MAP: Record<string, number> = {
    "x-slow": 0.5,
    "slow": 0.75,
    "medium": 1.0,
    "fast": 1.25,
    "x-fast": 1.5,
};


/**
 * Parse a duration string (e.g. "2s", "500ms", "1.5s") into milliseconds.
 */
export function parseDurationMs(duration: string): number {
    const trimmed: string = duration.trim();
    if (trimmed.endsWith("ms")) {
        return parseFloat(trimmed.slice(0, -2));
    }
    if (trimmed.endsWith("s")) {
        return parseFloat(trimmed.slice(0, -1)) * 1000;
    }
    // Assume seconds if no unit
    return parseFloat(trimmed) * 1000;
}


/**
 * Parse a rate value string into a numeric speaking rate.
 */
export function parseRate(rateStr: string): number {
    const trimmed: string = rateStr.trim().toLowerCase();
    if (RATE_MAP[trimmed] !== undefined) {
        return RATE_MAP[trimmed];
    }
    const numeric: number = parseFloat(trimmed);
    if (!isNaN(numeric)) {
        return numeric;
    }
    return 1.0;
}


/**
 * Extract bracket directives from text, replacing them with placeholders.
 * Returns modified text + a map of placeholder -> token replacement.
 */
export function preProcessDirectives(text: string): PreProcessResult {
    const placeholders: DirectivePlaceholder[] = [];
    const diagnostics: DiagnosticMessage[] = [];

    // Reset counter for deterministic output in tests
    placeholderCounter = 0;

    // Handle self-closing directives: [pause 2s]
    text = text.replace(
        /\[pause\s+([^\]]+)\]/g,
        (_match: string, duration: string) => {
            const ms: number = parseDurationMs(duration);
            return makePlaceholder(placeholders, `${TOKEN_PAUSE}:${ms}`);
        },
    );

    // Handle [rate slow]...[/rate]
    text = text.replace(
        /\[rate\s+([^\]]+)\]([\s\S]*?)\[\/rate\]/g,
        (_match: string, rate: string, content: string) => {
            const rateValue: number = parseRate(rate);
            const openPh: string = makePlaceholder(placeholders, `${TOKEN_RATE_START}:${rateValue}`);
            const closePh: string = makePlaceholder(placeholders, TOKEN_RATE_END);
            return `${openPh}${content}${closePh}`;
        },
    );

    // Handle [pitch ...]...[/pitch] -- DEPRECATED, strip markers and keep content
    text = text.replace(
        /\[pitch\s+([^\]]+)\]([\s\S]*?)\[\/pitch\]/g,
        (_match: string, _pitch: string, content: string) => {
            diagnostics.push({
                severity: "warning",
                message: "The [pitch] directive has no effect with the Inworld TTS provider. Consider removing it.",
            });
            return content;
        },
    );

    // Handle [voice name]...[/voice]
    text = text.replace(
        /\[voice\s+([^\]]+)\]([\s\S]*?)\[\/voice\]/g,
        (_match: string, name: string, content: string) => {
            const openPh: string = makePlaceholder(placeholders, `${TOKEN_VOICE_START}:${name.trim()}`);
            const closePh: string = makePlaceholder(placeholders, TOKEN_VOICE_END);
            return `${openPh}${content}${closePh}`;
        },
    );

    // Handle [say-as characters]...[/say-as] -- spell out with spaces
    text = text.replace(
        /\[say-as\s+([^\]]+)\]([\s\S]*?)\[\/say-as\]/g,
        (_match: string, type: string, content: string) => {
            const interpretAs: string = type.trim().toLowerCase();
            if (interpretAs === "characters" || interpretAs === "spell-out") {
                return content.split("").join(" ");
            }
            // For date, ordinal, etc. -- rely on Inworld's text normalization, pass through
            return content;
        },
    );

    // Handle [sub alias]...[/sub] -- replace content with IPA or alias text
    text = text.replace(
        /\[sub\s+([^\]]+)\]([\s\S]*?)\[\/sub\]/g,
        (_match: string, alias: string, _content: string) => {
            const trimmedAlias: string = alias.trim();
            // If it looks like IPA (starts with /), use Inworld IPA notation
            if (trimmedAlias.startsWith("/") && trimmedAlias.endsWith("/")) {
                return trimmedAlias;
            }
            // Otherwise wrap in IPA delimiters for Inworld
            return `/${trimmedAlias}/`;
        },
    );

    return { text, placeholders, diagnostics };
}


/**
 * Replace all placeholders in the given text with delimited token strings.
 * Tokens are wrapped in PH_START/PH_END to prevent them from merging with adjacent text.
 */
export function restorePlaceholders(text: string, placeholders: DirectivePlaceholder[]): string {
    let result: string = text;
    for (const { placeholder, token } of placeholders) {
        result = result.replace(placeholder, `${PH_START}${token}${PH_END}`);
    }
    return result;
}


/** Exported for use by the segment splitter. */
export { PH_START, PH_END };


function makePlaceholder(placeholders: DirectivePlaceholder[], token: string): string {
    const placeholder: string = `${PH_START}${placeholderCounter}${PH_END}`;
    placeholderCounter++;
    placeholders.push({ placeholder, token });
    return placeholder;
}
