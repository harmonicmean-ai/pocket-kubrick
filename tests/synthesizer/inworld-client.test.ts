import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { synthesizeText, InworldApiError } from "../../src/synthesizer/inworld-client.js";
import type { SynthesizeRequest } from "../../src/synthesizer/inworld-client.js";


const MOCK_REQUEST: SynthesizeRequest = {
    text: "Hello world.",
    voiceId: "Craig",
    modelId: "inworld-tts-1.5-max",
    speakingRate: 1.0,
    temperature: 1.1,
};

const MOCK_RESPONSE = {
    audioContent: "dGVzdGF1ZGlv",  // base64 of "testaudio"
    timestampInfo: {
        wordAlignment: {
            words: ["Hello", "world."],
            wordStartTimeSeconds: [0, 0.3],
            wordEndTimeSeconds: [0.3, 0.7],
        },
    },
    usage: {
        processedCharactersCount: 12,
        modelId: "inworld-tts-1.5-max",
    },
};


describe("synthesizeText", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("parses successful API response", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(MOCK_RESPONSE),
        });

        const result = await synthesizeText(MOCK_REQUEST, "test-api-key");

        expect(result.audioContent).toBe("dGVzdGF1ZGlv");
        expect(result.wordAlignment.words).toEqual(["Hello", "world."]);
        expect(result.processedChars).toBe(12);

        // Verify fetch was called with correct params
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(callArgs[0]).toBe("https://api.inworld.ai/tts/v1/voice");
        const headers = callArgs[1].headers;
        expect(headers["Authorization"]).toBe("Basic test-api-key");
    });

    it("throws InworldApiError for 400 (non-retryable)", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 400,
            statusText: "Bad Request",
            text: () => Promise.resolve("Invalid voice ID"),
        });

        await expect(synthesizeText(MOCK_REQUEST, "test-api-key")).rejects.toThrow(InworldApiError);
        // Should NOT retry on 400
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("retries on 429 and eventually succeeds", async () => {
        const mockFetch = vi.fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 429,
                statusText: "Too Many Requests",
                text: () => Promise.resolve("Rate limited"),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve(MOCK_RESPONSE),
            });
        globalThis.fetch = mockFetch;

        const result = await synthesizeText(MOCK_REQUEST, "test-api-key");
        expect(result.audioContent).toBe("dGVzdGF1ZGlv");
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("sends correct request body", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(MOCK_RESPONSE),
        });

        await synthesizeText(MOCK_REQUEST, "test-api-key");

        const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
        const body = JSON.parse(callArgs[1].body);
        expect(body.text).toBe("Hello world.");
        expect(body.voiceId).toBe("Craig");
        expect(body.timestampType).toBe("WORD");
        expect(body.applyTextNormalization).toBe("ON");
        expect(body.audioConfig.audioEncoding).toBe("MP3");
        expect(body.audioConfig.sampleRateHertz).toBe(48000);
    });
});
