/**
 * Anchor matcher: matches anchor phrases against Inworld word-level timestamps.
 *
 * Replaces the Phase 1 mark-injector. Instead of injecting <mark> tags
 * pre-synthesis, this module matches anchor phrases against the word
 * timestamp array returned post-synthesis.
 */

import { normalizeAnchor } from "../util/text-normalize.js";
import type { DiagnosticMessage } from "../util/errors.js";
import type { InworldWordAlignment, AnchorTimepoint } from "./types.js";


/** A word with its absolute timestamp in the scene timeline. */
interface TimedWord {
    text: string;
    normalized: string;
    absoluteStart: number;
    absoluteEnd: number;
}


export interface AnchorMatchResult {
    matches: AnchorTimepoint[];
    diagnostics: DiagnosticMessage[];
}


/**
 * Match anchor phrases against word timestamps from synthesized segments.
 *
 * @param anchors - Anchor names from YAML visual events (e.g., "settings-icon")
 * @param wordAlignments - Word alignment arrays, one per synthesized segment
 * @param segmentTimeOffsets - Cumulative time offset for each segment in seconds
 */
export function matchAnchors(
    anchors: string[],
    wordAlignments: InworldWordAlignment[],
    segmentTimeOffsets: number[],
): AnchorMatchResult {
    const matches: AnchorTimepoint[] = [];
    const diagnostics: DiagnosticMessage[] = [];

    // Build a unified word list across all segments
    const timedWords: TimedWord[] = buildTimedWordList(wordAlignments, segmentTimeOffsets);

    for (const anchor of anchors) {
        const anchorNorm: string = normalizeAnchor(anchor);
        const anchorWords: string[] = anchorNorm.split(/\s+/).filter((w) => w.length > 0);

        if (anchorWords.length === 0) {
            diagnostics.push({
                severity: "error",
                message: `Anchor "${anchor}" normalizes to empty string, cannot match.`,
            });
            continue;
        }

        const matchResult = findAnchorInWords(anchorWords, timedWords);

        if (matchResult === null) {
            diagnostics.push({
                severity: "error",
                message: `Anchor "${anchor}" not found in synthesized audio word timestamps.`,
                suggestion: "Verify the anchor phrase appears in the script text.",
            });
            continue;
        }

        // Check for additional matches (ambiguity)
        const secondMatch = findAnchorInWords(anchorWords, timedWords, matchResult.endIndex + 1);
        if (secondMatch !== null) {
            diagnostics.push({
                severity: "warning",
                message: `Anchor "${anchor}" matches multiple positions in audio (at ${matchResult.timeSeconds.toFixed(2)}s and ${secondMatch.timeSeconds.toFixed(2)}s). Using first match.`,
            });
        }

        matches.push({
            name: anchor,
            timeSeconds: matchResult.timeSeconds,
        });
    }

    return { matches, diagnostics };
}


function buildTimedWordList(
    wordAlignments: InworldWordAlignment[],
    segmentTimeOffsets: number[],
): TimedWord[] {
    const timedWords: TimedWord[] = [];

    for (let segIdx = 0; segIdx < wordAlignments.length; segIdx++) {
        const alignment: InworldWordAlignment = wordAlignments[segIdx];
        const offset: number = segmentTimeOffsets[segIdx] ?? 0;

        for (let wordIdx = 0; wordIdx < alignment.words.length; wordIdx++) {
            const word: string = alignment.words[wordIdx];
            timedWords.push({
                text: word,
                normalized: stripPunctuation(word).toLowerCase(),
                absoluteStart: offset + alignment.wordStartTimeSeconds[wordIdx],
                absoluteEnd: offset + alignment.wordEndTimeSeconds[wordIdx],
            });
        }
    }

    return timedWords;
}


interface AnchorMatchInternal {
    timeSeconds: number;
    endIndex: number;
}


function findAnchorInWords(
    anchorWords: string[],
    timedWords: TimedWord[],
    startFrom: number = 0,
): AnchorMatchInternal | null {
    for (let i = startFrom; i <= timedWords.length - anchorWords.length; i++) {
        let matched: boolean = true;
        for (let j = 0; j < anchorWords.length; j++) {
            if (!wordsMatch(timedWords[i + j].normalized, anchorWords[j])) {
                matched = false;
                break;
            }
        }
        if (matched) {
            return {
                timeSeconds: timedWords[i].absoluteStart,
                endIndex: i + anchorWords.length - 1,
            };
        }
    }
    return null;
}


/**
 * Compare a TTS word (already stripped/lowered) against an anchor word.
 */
function wordsMatch(ttsWord: string, anchorWord: string): boolean {
    return ttsWord === anchorWord;
}


/**
 * Strip leading and trailing punctuation from a word.
 */
function stripPunctuation(word: string): string {
    return word.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "");
}
