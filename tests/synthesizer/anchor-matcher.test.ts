import { describe, it, expect } from "vitest";
import { matchAnchors } from "../../src/synthesizer/anchor-matcher.js";
import type { InworldWordAlignment } from "../../src/synthesizer/types.js";


function makeAlignment(words: string[], starts: number[], ends: number[]): InworldWordAlignment {
    return { words, wordStartTimeSeconds: starts, wordEndTimeSeconds: ends };
}


describe("matchAnchors", () => {
    const singleSegmentWords: InworldWordAlignment = makeAlignment(
        ["First,", "tap", "the", "settings", "icon", "in", "the", "top", "right", "corner."],
        [0, 0.3, 0.5, 0.7, 1.1, 1.4, 1.5, 1.7, 1.9, 2.2],
        [0.3, 0.5, 0.7, 1.1, 1.4, 1.5, 1.7, 1.9, 2.2, 2.6],
    );

    it("matches a multi-word anchor", () => {
        const result = matchAnchors(
            ["settings-icon"],
            [singleSegmentWords],
            [0],
        );
        expect(result.matches).toHaveLength(1);
        expect(result.matches[0].name).toBe("settings-icon");
        expect(result.matches[0].timeSeconds).toBeCloseTo(0.7, 2);
        expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    });

    it("matches a single-word anchor", () => {
        const result = matchAnchors(
            ["tap"],
            [singleSegmentWords],
            [0],
        );
        expect(result.matches).toHaveLength(1);
        expect(result.matches[0].timeSeconds).toBeCloseTo(0.3, 2);
    });

    it("matches anchor with hyphen normalization", () => {
        const result = matchAnchors(
            ["top-right"],
            [singleSegmentWords],
            [0],
        );
        expect(result.matches).toHaveLength(1);
        expect(result.matches[0].timeSeconds).toBeCloseTo(1.7, 2);
    });

    it("tolerates punctuation in TTS words", () => {
        // "First," should strip the comma for matching
        const result = matchAnchors(
            ["first"],
            [singleSegmentWords],
            [0],
        );
        expect(result.matches).toHaveLength(1);
        expect(result.matches[0].timeSeconds).toBeCloseTo(0, 2);
    });

    it("errors when anchor is not found", () => {
        const result = matchAnchors(
            ["nonexistent-phrase"],
            [singleSegmentWords],
            [0],
        );
        expect(result.matches).toHaveLength(0);
        expect(result.diagnostics.some((d) => d.severity === "error" && d.message.includes("nonexistent-phrase"))).toBe(true);
    });

    it("warns on ambiguous match", () => {
        // "the" appears twice in the word list
        const result = matchAnchors(
            ["the"],
            [singleSegmentWords],
            [0],
        );
        expect(result.matches).toHaveLength(1);
        expect(result.diagnostics.some((d) => d.severity === "warning" && d.message.includes("multiple positions"))).toBe(true);
    });

    it("matches across segment boundaries with offsets", () => {
        const seg1: InworldWordAlignment = makeAlignment(
            ["Hello", "world."],
            [0, 0.3],
            [0.3, 0.7],
        );
        const seg2: InworldWordAlignment = makeAlignment(
            ["Settings", "icon", "here."],
            [0, 0.4, 0.8],
            [0.4, 0.8, 1.2],
        );
        // seg2 starts at 1.5s (0.7s segment 1 + 0.8s pause)
        const result = matchAnchors(
            ["settings-icon"],
            [seg1, seg2],
            [0, 1.5],
        );
        expect(result.matches).toHaveLength(1);
        expect(result.matches[0].timeSeconds).toBeCloseTo(1.5, 2);
    });
});
