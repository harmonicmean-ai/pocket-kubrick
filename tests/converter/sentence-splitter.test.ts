import { describe, it, expect } from "vitest";
import { splitSentences } from "../../src/converter/sentence-splitter.js";
import type { SentenceSegment } from "../../src/converter/sentence-splitter.js";


describe("splitSentences", () => {
    it("splits simple sentences on period + space", () => {
        const segments: SentenceSegment[] = splitSentences("Hello world. How are you?");
        const sentences: string[] = segments.filter((s) => !s.isBreak).map((s) => s.text);
        expect(sentences).toEqual(["Hello world.", "How are you?"]);
    });

    it("handles single sentence", () => {
        const segments: SentenceSegment[] = splitSentences("Just one sentence.");
        const sentences: string[] = segments.filter((s) => !s.isBreak).map((s) => s.text);
        expect(sentences).toEqual(["Just one sentence."]);
    });

    it("does not split on abbreviations", () => {
        const segments: SentenceSegment[] = splitSentences("Dr. Smith went to the U.S. embassy.");
        const sentences: string[] = segments.filter((s) => !s.isBreak).map((s) => s.text);
        expect(sentences).toEqual(["Dr. Smith went to the U.S. embassy."]);
    });

    it("inserts paragraph breaks for blank lines", () => {
        const segments: SentenceSegment[] = splitSentences("First paragraph.\n\nSecond paragraph.");
        expect(segments).toHaveLength(3);
        expect(segments[0]).toMatchObject({ text: "First paragraph.", isBreak: false });
        expect(segments[1]).toMatchObject({ isBreak: true, breakDuration: "700ms" });
        expect(segments[2]).toMatchObject({ text: "Second paragraph.", isBreak: false });
    });

    it("handles question and exclamation marks", () => {
        const segments: SentenceSegment[] = splitSentences("What? Really! Yes.");
        const sentences: string[] = segments.filter((s) => !s.isBreak).map((s) => s.text);
        expect(sentences).toEqual(["What?", "Really!", "Yes."]);
    });

    it("collapses single newlines to spaces", () => {
        const segments: SentenceSegment[] = splitSentences("Line one\nline two.");
        const sentences: string[] = segments.filter((s) => !s.isBreak).map((s) => s.text);
        expect(sentences).toEqual(["Line one line two."]);
    });

    it("handles empty input", () => {
        const segments: SentenceSegment[] = splitSentences("");
        expect(segments).toEqual([]);
    });

    it("preserves abbreviation e.g. in middle of sentence", () => {
        const segments: SentenceSegment[] = splitSentences("Use e.g. this method. It works.");
        const sentences: string[] = segments.filter((s) => !s.isBreak).map((s) => s.text);
        expect(sentences).toEqual(["Use e.g. this method.", "It works."]);
    });
});
