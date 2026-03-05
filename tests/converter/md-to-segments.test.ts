import { describe, it, expect } from "vitest";
import { convertMarkdownToSegments } from "../../src/converter/md-to-segments.js";
import type { ScriptSegment } from "../../src/converter/segment-types.js";


function segmentTexts(segments: ScriptSegment[]): string[] {
    return segments.map((s) => s.text);
}


describe("convertMarkdownToSegments", () => {
    it("produces a single segment from plain text", () => {
        const { segments } = convertMarkdownToSegments("Hello world.");
        expect(segments).toHaveLength(1);
        expect(segments[0].text).toBe("Hello world.");
    });

    it("converts *emphasis* to Inworld *emphasis*", () => {
        const { segments } = convertMarkdownToSegments("The *important* thing.");
        expect(segments).toHaveLength(1);
        expect(segments[0].text).toContain("*important*");
    });

    it("downgrades **strong** to *emphasis*", () => {
        const { segments } = convertMarkdownToSegments("The **very important** thing.");
        expect(segments).toHaveLength(1);
        expect(segments[0].text).toContain("*very important*");
        // Should NOT contain double asterisks
        expect(segments[0].text).not.toContain("**");
    });

    it("keeps ellipsis as-is (Inworld handles pauses from punctuation)", () => {
        const { segments } = convertMarkdownToSegments("Wait for it...");
        expect(segments).toHaveLength(1);
        expect(segments[0].text).toContain("...");
    });

    it("keeps em-dash as-is", () => {
        const { segments } = convertMarkdownToSegments("Something -- an aside -- happened.");
        expect(segments).toHaveLength(1);
        expect(segments[0].text).toContain("--");
    });

    it("creates segment split at thematic break (---)", () => {
        const { segments } = convertMarkdownToSegments("Part one.\n\n---\n\nPart two.");
        expect(segments.length).toBeGreaterThanOrEqual(2);
        expect(segmentTexts(segments)).toContain("Part one.");
        expect(segmentTexts(segments)).toContain("Part two.");
        // The segment before the thematic break should have a pause
        const partOneIdx: number = segments.findIndex((s) => s.text === "Part one.");
        expect(segments[partOneIdx].pauseAfterMs).toBeGreaterThanOrEqual(700);
    });

    it("creates segment splits between paragraphs", () => {
        const { segments } = convertMarkdownToSegments("First paragraph.\n\nSecond paragraph.");
        expect(segments.length).toBeGreaterThanOrEqual(2);
        expect(segmentTexts(segments)).toContain("First paragraph.");
        expect(segmentTexts(segments)).toContain("Second paragraph.");
    });

    it("spells out inline code characters with spaces", () => {
        const { segments } = convertMarkdownToSegments("Type `API` to continue.");
        expect(segments).toHaveLength(1);
        expect(segments[0].text).toContain("A P I");
    });

    it("flattens blockquotes to plain text", () => {
        const { segments } = convertMarkdownToSegments("> This is an aside.");
        expect(segments).toHaveLength(1);
        expect(segments[0].text).toContain("This is an aside.");
    });

    it("handles [pause] directive as segment break", () => {
        const { segments } = convertMarkdownToSegments("Before. [pause 2s] After.");
        // Should produce segments with a pause between them
        const beforeIdx: number = segments.findIndex((s) => s.text.includes("Before"));
        expect(beforeIdx).toBeGreaterThanOrEqual(0);
        expect(segments[beforeIdx].pauseAfterMs).toBe(2000);
    });

    it("handles [voice] directive as separate segment with voiceId", () => {
        const { segments } = convertMarkdownToSegments("[voice aside]Tip text.[/voice]");
        const voiceSegment: ScriptSegment | undefined = segments.find((s) => s.voiceId === "aside");
        expect(voiceSegment).toBeDefined();
        expect(voiceSegment!.text).toContain("Tip text.");
    });

    it("handles [rate] directive as separate segment with speakingRate", () => {
        const { segments } = convertMarkdownToSegments("[rate slow]Slowly now.[/rate]");
        const rateSegment: ScriptSegment | undefined = segments.find((s) => s.speakingRate !== undefined);
        expect(rateSegment).toBeDefined();
        expect(rateSegment!.speakingRate).toBe(0.75);
        expect(rateSegment!.text).toContain("Slowly now.");
    });

    it("strips raw HTML tags", () => {
        const { segments } = convertMarkdownToSegments('Before <break time="500ms"/> after.');
        // Raw HTML should be stripped, just text remains
        expect(segments).toHaveLength(1);
        expect(segments[0].text).not.toContain("<break");
    });

    it("handles the spec example script 02", () => {
        const md: string = "First, tap the *settings icon* in the top right corner\nof the main screen.";
        const { segments } = convertMarkdownToSegments(md);
        expect(segments.length).toBeGreaterThanOrEqual(1);
        const fullText: string = segmentTexts(segments).join(" ");
        expect(fullText).toContain("*settings icon*");
        expect(fullText).toContain("top right corner");
    });

    it("warns on deprecated [pitch] directive", () => {
        const { diagnostics } = convertMarkdownToSegments("[pitch +2st]High pitch text.[/pitch]");
        expect(diagnostics.some((d) => d.severity === "warning" && d.message.includes("[pitch]"))).toBe(true);
    });
});
