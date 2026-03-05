/**
 * Common abbreviations that should not trigger sentence splits.
 * Lowercase for comparison.
 */
const ABBREVIATIONS: Set<string> = new Set([
    "dr.", "mr.", "mrs.", "ms.", "prof.",
    "sr.", "jr.", "st.", "ave.", "blvd.",
    "inc.", "ltd.", "corp.", "co.",
    "etc.", "vs.", "approx.", "dept.",
    "e.g.", "i.e.", "a.m.", "p.m.",
    "u.s.", "u.k.", "u.n.",
    "fig.", "vol.", "no.", "pg.",
    "jan.", "feb.", "mar.", "apr.",
    "jun.", "jul.", "aug.", "sep.",
    "oct.", "nov.", "dec.",
]);


/**
 * Placeholder tokens used to protect abbreviations during splitting.
 * Using Unicode private-use-area characters that won't appear in normal text.
 */
const ABBR_PLACEHOLDER: string = "\uE000";


export interface SentenceSegment {
    text: string;
    isBreak: boolean;
    breakDuration?: string;
}


/**
 * Split text into sentence segments, respecting abbreviations.
 * Returns an array of segments — either sentence text or break indicators
 * for paragraph boundaries.
 *
 * This function works on plain text (no SSML tags). Bracket directive
 * placeholders should already be substituted before calling this.
 */
export function splitSentences(text: string): SentenceSegment[] {
    const segments: SentenceSegment[] = [];

    // Split on paragraph breaks (blank lines)
    const paragraphs: string[] = text.split(/\n\s*\n/);

    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
        const paragraph: string = paragraphs[pIdx].trim();
        if (!paragraph) {
            continue;
        }

        // Insert paragraph break between paragraphs
        if (pIdx > 0) {
            segments.push({ text: "", isBreak: true, breakDuration: "700ms" });
        }

        // Split paragraph into sentences
        const sentences: string[] = splitParagraphIntoSentences(paragraph);
        for (const sentence of sentences) {
            const trimmed: string = sentence.trim();
            if (trimmed) {
                segments.push({ text: trimmed, isBreak: false });
            }
        }
    }

    return segments;
}


/**
 * Split a single paragraph into sentences by punctuation boundaries,
 * while respecting abbreviations.
 */
function splitParagraphIntoSentences(paragraph: string): string[] {
    // Replace line breaks (single newlines) with spaces
    let text: string = paragraph.replace(/\n/g, " ").replace(/\s+/g, " ");

    // Protect known abbreviations by replacing their periods with placeholders
    const lowerText: string = text.toLowerCase();
    const protectedPositions: Array<{ start: number; end: number }> = [];

    for (const abbr of ABBREVIATIONS) {
        let searchFrom: number = 0;
        while (true) {
            const idx: number = lowerText.indexOf(abbr, searchFrom);
            if (idx === -1) break;
            protectedPositions.push({ start: idx, end: idx + abbr.length });
            searchFrom = idx + 1;
        }
    }

    // Sort positions in reverse order so replacements don't shift indices
    protectedPositions.sort((a, b) => b.start - a.start);

    // Replace periods in abbreviations with placeholders
    const chars: string[] = [...text];
    for (const pos of protectedPositions) {
        for (let i = pos.start; i < pos.end && i < chars.length; i++) {
            if (chars[i] === ".") {
                chars[i] = ABBR_PLACEHOLDER;
            }
        }
    }
    text = chars.join("");

    // Split on sentence-ending punctuation followed by whitespace or end-of-string
    const sentences: string[] = text.split(/(?<=[.!?])\s+/);

    // Restore abbreviation periods
    return sentences.map((s) => s.replace(new RegExp(ABBR_PLACEHOLDER, "g"), "."));
}
