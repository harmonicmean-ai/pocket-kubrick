/**
 * Splits oversized ScriptSegments into chunks that fit within the
 * Inworld TTS API's 2000-character limit, splitting at sentence boundaries.
 */

import { splitSentences } from "./sentence-splitter.js";
import type { ScriptSegment } from "./segment-types.js";


const DEFAULT_MAX_CHARS: number = 2000;


/**
 * Split a single segment into sub-segments that each fit within maxChars.
 * Splits at sentence boundaries when possible.
 */
export function chunkSegment(segment: ScriptSegment, maxChars: number = DEFAULT_MAX_CHARS): ScriptSegment[] {
    // Account for emotion tag length if present
    const emotionOverhead: number = segment.emotion ? segment.emotion.length + 3 : 0; // "[happy] " = emotion + [] + space
    const effectiveMax: number = maxChars - emotionOverhead;

    if (segment.text.length <= effectiveMax) {
        return [segment];
    }

    const sentences = splitSentences(segment.text);
    const textSentences: string[] = sentences
        .filter((s) => !s.isBreak)
        .map((s) => s.text);

    if (textSentences.length === 0) {
        return [segment];
    }

    const chunks: ScriptSegment[] = [];
    let currentChunk: string = "";

    for (const sentence of textSentences) {
        if (sentence.length > effectiveMax) {
            // Flush current chunk first
            if (currentChunk) {
                chunks.push(makeChunk(currentChunk, segment, chunks.length === 0));
                currentChunk = "";
            }
            // Split long sentence at word boundaries
            chunks.push(...splitLongSentence(sentence, effectiveMax, segment, chunks.length === 0));
        } else if (currentChunk && (currentChunk.length + 1 + sentence.length > effectiveMax)) {
            // Current chunk is full, start a new one
            chunks.push(makeChunk(currentChunk, segment, chunks.length === 0));
            currentChunk = sentence;
        } else {
            currentChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
        }
    }

    if (currentChunk) {
        chunks.push(makeChunk(currentChunk, segment, chunks.length === 0));
    }

    // Only the last chunk inherits pauseAfterMs
    for (let i = 0; i < chunks.length - 1; i++) {
        delete chunks[i].pauseAfterMs;
    }

    return chunks;
}


/**
 * Chunk all segments in an array.
 */
export function chunkSegments(segments: ScriptSegment[], maxChars: number = DEFAULT_MAX_CHARS): ScriptSegment[] {
    return segments.flatMap((seg) => chunkSegment(seg, maxChars));
}


function makeChunk(text: string, parent: ScriptSegment, isFirst: boolean): ScriptSegment {
    const chunk: ScriptSegment = { text };
    if (parent.voiceId) chunk.voiceId = parent.voiceId;
    if (parent.speakingRate !== undefined) chunk.speakingRate = parent.speakingRate;
    // Emotion only on the first chunk
    if (isFirst && parent.emotion) chunk.emotion = parent.emotion;
    if (parent.pauseAfterMs !== undefined) chunk.pauseAfterMs = parent.pauseAfterMs;
    return chunk;
}


function splitLongSentence(
    sentence: string,
    maxChars: number,
    parent: ScriptSegment,
    isFirstChunk: boolean,
): ScriptSegment[] {
    const chunks: ScriptSegment[] = [];
    let remaining: string = sentence;

    while (remaining.length > maxChars) {
        // Find the last space before the limit
        let splitAt: number = remaining.lastIndexOf(" ", maxChars);
        if (splitAt <= 0) {
            // No space found, force split at limit
            splitAt = maxChars;
        }
        const piece: string = remaining.substring(0, splitAt).trim();
        if (piece) {
            chunks.push(makeChunk(piece, parent, isFirstChunk && chunks.length === 0));
        }
        remaining = remaining.substring(splitAt).trim();
    }

    if (remaining) {
        chunks.push(makeChunk(remaining, parent, isFirstChunk && chunks.length === 0));
    }

    return chunks;
}
