/**
 * Types for the Inworld TTS synthesis pipeline.
 */

import type { DiagnosticMessage } from "../util/errors.js";


/** Word alignment data from the Inworld TTS API response. */
export interface InworldWordAlignment {
    words: string[];
    wordStartTimeSeconds: number[];
    wordEndTimeSeconds: number[];
}


/** Raw Inworld API response (subset of fields we use). */
export interface InworldTtsResponse {
    audioContent: string;  // base64-encoded audio
    timestampInfo: {
        wordAlignment: InworldWordAlignment;
    };
    usage: {
        processedCharactersCount: number;
        modelId: string;
    };
}


/** A single synthesized chunk (one API call result). */
export interface SynthesizedChunk {
    audioBuffer: Buffer;
    wordAlignment: InworldWordAlignment;
    durationSeconds: number;
    pauseAfterMs: number;
}


/** Result of synthesizing a full scene. */
export interface SceneSynthesisResult {
    sceneName: string;
    audioPath: string;
    durationSeconds: number;
    actualDurationSeconds: number;
    timepoints: AnchorTimepoint[];
    diagnostics: DiagnosticMessage[];
    apiCalls: number;
    cacheHits: number;
}


/** A matched anchor with its timestamp. */
export interface AnchorTimepoint {
    name: string;
    timeSeconds: number;
}


/** Cache entry stored on disk. */
export interface CacheEntry {
    audioContent: string;  // base64
    wordAlignment: InworldWordAlignment;
    processedChars: number;
    cachedAt: string;  // ISO timestamp
}
