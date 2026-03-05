import { describe, it, expect } from "vitest";
import {
    preProcessDirectives,
    restorePlaceholders,
    parseDurationMs,
    parseRate,
    TOKEN_PAUSE,
    TOKEN_VOICE_START,
    TOKEN_VOICE_END,
    TOKEN_RATE_START,
    TOKEN_RATE_END,
} from "../../src/converter/bracket-directives.js";


describe("parseDurationMs", () => {
    it("parses seconds", () => {
        expect(parseDurationMs("2s")).toBe(2000);
    });

    it("parses milliseconds", () => {
        expect(parseDurationMs("500ms")).toBe(500);
    });

    it("parses fractional seconds", () => {
        expect(parseDurationMs("1.5s")).toBe(1500);
    });
});


describe("parseRate", () => {
    it("maps named rates to numbers", () => {
        expect(parseRate("slow")).toBe(0.75);
        expect(parseRate("fast")).toBe(1.25);
        expect(parseRate("x-slow")).toBe(0.5);
    });

    it("passes numeric rates through", () => {
        expect(parseRate("0.8")).toBe(0.8);
    });
});


describe("preProcessDirectives", () => {
    it("converts [pause 2s] to pause token", () => {
        const result = preProcessDirectives("Hello [pause 2s] world");
        expect(result.placeholders).toHaveLength(1);
        expect(result.placeholders[0].token).toBe(`${TOKEN_PAUSE}:2000`);
        expect(result.text).not.toContain("[pause");
    });

    it("converts [rate slow]...[/rate] to rate tokens", () => {
        const result = preProcessDirectives("[rate slow]speak slowly[/rate]");
        expect(result.placeholders).toHaveLength(2);
        expect(result.placeholders[0].token).toBe(`${TOKEN_RATE_START}:0.75`);
        expect(result.placeholders[1].token).toBe(TOKEN_RATE_END);
    });

    it("converts [voice aside]...[/voice] to voice tokens", () => {
        const result = preProcessDirectives("[voice aside]tip text[/voice]");
        expect(result.placeholders).toHaveLength(2);
        expect(result.placeholders[0].token).toBe(`${TOKEN_VOICE_START}:aside`);
        expect(result.placeholders[1].token).toBe(TOKEN_VOICE_END);
    });

    it("strips [pitch] with deprecation warning", () => {
        const result = preProcessDirectives("[pitch +2st]high pitch[/pitch]");
        expect(result.placeholders).toHaveLength(0);
        expect(result.text).toContain("high pitch");
        expect(result.text).not.toContain("[pitch");
        expect(result.diagnostics).toHaveLength(1);
        expect(result.diagnostics[0].severity).toBe("warning");
        expect(result.diagnostics[0].message).toContain("[pitch]");
    });

    it("spells out [say-as characters] content", () => {
        const result = preProcessDirectives("[say-as characters]API[/say-as]");
        expect(result.text).toContain("A P I");
        expect(result.placeholders).toHaveLength(0);
    });

    it("passes through [say-as date] content unchanged", () => {
        const result = preProcessDirectives("[say-as date]2026-02-24[/say-as]");
        expect(result.text).toContain("2026-02-24");
    });

    it("converts [sub alias] to IPA notation", () => {
        const result = preProcessDirectives("[sub A.P.I.]API[/sub]");
        expect(result.text).toContain("/A.P.I./");
        expect(result.text).not.toContain("[sub");
    });

    it("handles multiple directives in one text", () => {
        const result = preProcessDirectives(
            "Hello [pause 1s] [rate slow]world[/rate] [pause 500ms] done.",
        );
        expect(result.placeholders.length).toBeGreaterThanOrEqual(4);
    });

    it("leaves text without directives unchanged", () => {
        const result = preProcessDirectives("No directives here.");
        expect(result.text).toBe("No directives here.");
        expect(result.placeholders).toHaveLength(0);
        expect(result.diagnostics).toHaveLength(0);
    });
});


describe("restorePlaceholders", () => {
    it("restores all placeholders as delimited tokens", () => {
        const { text, placeholders } = preProcessDirectives("Hello [pause 2s] world");
        const restored: string = restorePlaceholders(text, placeholders);
        expect(restored).toContain(`${TOKEN_PAUSE}:2000`);
        // Original placeholder index markers (\uE001N\uE002) should be gone
        expect(restored).not.toContain("\uE0010\uE002");
    });
});
