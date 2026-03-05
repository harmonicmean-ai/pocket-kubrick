/**
 * HTTP client for the Inworld TTS API.
 *
 * Uses Node 20 built-in fetch(). No external dependencies.
 */

import { error as logError, verbose } from "../util/logger.js";
import type { InworldTtsResponse, InworldWordAlignment } from "./types.js";


const INWORLD_API_URL: string = "https://api.inworld.ai/tts/v1/voice";
const MAX_RETRIES: number = 3;
const INITIAL_RETRY_DELAY_MS: number = 1000;


export interface SynthesizeRequest {
    text: string;
    voiceId: string;
    modelId: string;
    speakingRate: number;
    temperature: number;
    audioEncoding?: string;
    sampleRateHertz?: number;
}


export interface SynthesizeResult {
    audioContent: string;  // base64
    wordAlignment: InworldWordAlignment;
    processedChars: number;
}


export class InworldApiError extends Error {
    constructor(
        public readonly statusCode: number,
        public readonly statusText: string,
        public readonly body: string,
    ) {
        super(`Inworld API error ${statusCode} ${statusText}: ${body}`);
        this.name = "InworldApiError";
    }
}


/**
 * Call the Inworld TTS API to synthesize text.
 * Retries on 429 and 5xx errors with exponential backoff.
 */
export async function synthesizeText(
    request: SynthesizeRequest,
    apiKey: string,
): Promise<SynthesizeResult> {
    const body = {
        text: request.text,
        voiceId: request.voiceId,
        modelId: request.modelId,
        audioConfig: {
            audioEncoding: request.audioEncoding ?? "MP3",
            sampleRateHertz: request.sampleRateHertz ?? 48000,
            speakingRate: request.speakingRate,
        },
        temperature: request.temperature,
        timestampType: "WORD",
        applyTextNormalization: "ON",
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (attempt > 0) {
            const delay: number = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
            verbose(`  Retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
            await sleep(delay);
        }

        let response: Response;
        try {
            response = await fetch(INWORLD_API_URL, {
                method: "POST",
                headers: {
                    "Authorization": `Basic ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });
        } catch (e) {
            lastError = e as Error;
            logError(`Inworld API network error: ${(e as Error).constructor.name}: ${(e as Error).message}`);
            continue;
        }

        if (response.ok) {
            const data: InworldTtsResponse = await response.json() as InworldTtsResponse;
            return {
                audioContent: data.audioContent,
                wordAlignment: data.timestampInfo?.wordAlignment ?? { words: [], wordStartTimeSeconds: [], wordEndTimeSeconds: [] },
                processedChars: data.usage?.processedCharactersCount ?? 0,
            };
        }

        const responseBody: string = await response.text();

        // Retry on 429 (rate limited) and 5xx (server errors)
        if (response.status === 429 || response.status >= 500) {
            lastError = new InworldApiError(response.status, response.statusText, responseBody);
            logError(`Inworld API ${response.status}: ${responseBody.substring(0, 200)}`);
            continue;
        }

        // Non-retryable error
        throw new InworldApiError(response.status, response.statusText, responseBody);
    }

    throw lastError ?? new Error("Inworld API: all retries exhausted");
}


function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
