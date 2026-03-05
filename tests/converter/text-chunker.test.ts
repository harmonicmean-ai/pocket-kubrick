import { describe, it, expect } from "vitest";
import { chunkSegment, chunkSegments } from "../../src/converter/text-chunker.js";
import type { ScriptSegment } from "../../src/converter/segment-types.js";


describe("chunkSegment", () => {
    it("passes short segments through unchanged", () => {
        const segment: ScriptSegment = { text: "Hello world." };
        const result = chunkSegment(segment, 2000);
        expect(result).toHaveLength(1);
        expect(result[0].text).toBe("Hello world.");
    });

    it("splits at sentence boundaries when over limit", () => {
        const segment: ScriptSegment = {
            text: "First sentence. Second sentence. Third sentence.",
        };
        // Use a very small limit to force splitting
        const result = chunkSegment(segment, 30);
        expect(result.length).toBeGreaterThan(1);
        // Each chunk should be under the limit
        for (const chunk of result) {
            expect(chunk.text.length).toBeLessThanOrEqual(30);
        }
    });

    it("only last chunk inherits pauseAfterMs", () => {
        const segment: ScriptSegment = {
            text: "First sentence. Second sentence. Third sentence.",
            pauseAfterMs: 700,
        };
        const result = chunkSegment(segment, 30);
        expect(result.length).toBeGreaterThan(1);
        // Only the last chunk should have pauseAfterMs
        for (let i = 0; i < result.length - 1; i++) {
            expect(result[i].pauseAfterMs).toBeUndefined();
        }
        expect(result[result.length - 1].pauseAfterMs).toBe(700);
    });

    it("preserves voiceId and speakingRate on all chunks", () => {
        const segment: ScriptSegment = {
            text: "First sentence. Second sentence. Third sentence.",
            voiceId: "aside",
            speakingRate: 0.75,
        };
        const result = chunkSegment(segment, 30);
        for (const chunk of result) {
            expect(chunk.voiceId).toBe("aside");
            expect(chunk.speakingRate).toBe(0.75);
        }
    });

    it("applies emotion only to the first chunk", () => {
        const segment: ScriptSegment = {
            text: "First sentence. Second sentence. Third sentence.",
            emotion: "happy",
        };
        const result = chunkSegment(segment, 30);
        expect(result.length).toBeGreaterThan(1);
        expect(result[0].emotion).toBe("happy");
        for (let i = 1; i < result.length; i++) {
            expect(result[i].emotion).toBeUndefined();
        }
    });

    it("accounts for emotion tag overhead in char count", () => {
        // "happy" emotion = "[happy] " = 8 chars overhead
        // effective max = 50 - 8 = 42
        const segment: ScriptSegment = {
            text: "A".repeat(45),
            emotion: "happy",
        };
        const result = chunkSegment(segment, 50);
        expect(result.length).toBeGreaterThan(1);
    });
});


describe("chunkSegments", () => {
    it("chunks an array of segments", () => {
        const segments: ScriptSegment[] = [
            { text: "Short." },
            { text: "First sentence. Second sentence. Third sentence." },
        ];
        const result = chunkSegments(segments, 30);
        expect(result.length).toBeGreaterThan(2);
        expect(result[0].text).toBe("Short.");
    });
});
