import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { concatenateAudio, concatenateSceneFiles } from "../../src/synthesizer/audio-concat.js";
import type { AudioChunk } from "../../src/synthesizer/audio-concat.js";


const TEST_OUTPUT_DIR: string = resolve(import.meta.dirname, "../fixtures/.test-audio-output");


describe("concatenateAudio", () => {
    beforeEach(() => {
        mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
    });

    afterEach(() => {
        if (existsSync(TEST_OUTPUT_DIR)) {
            rmSync(TEST_OUTPUT_DIR, { recursive: true });
        }
    });

    it("writes empty buffer for zero chunks", async () => {
        const outputPath: string = join(TEST_OUTPUT_DIR, "empty.mp3");
        const duration: number = await concatenateAudio([], outputPath);

        expect(existsSync(outputPath)).toBe(true);
        expect(readFileSync(outputPath).length).toBe(0);
        expect(duration).toBe(0);
    });

    it("writes single chunk directly when no pause", async () => {
        const fakeAudio: Buffer = Buffer.from("fake-mp3-data-for-testing");
        const chunks: AudioChunk[] = [
            { audioBuffer: fakeAudio, pauseAfterMs: 0 },
        ];

        const outputPath: string = join(TEST_OUTPUT_DIR, "single.mp3");
        const duration: number = await concatenateAudio(chunks, outputPath);

        expect(existsSync(outputPath)).toBe(true);
        const output: Buffer = readFileSync(outputPath);
        expect(output).toEqual(fakeAudio);
        // Duration is estimated from file size (128kbps = 16000 bytes/sec)
        expect(duration).toBeCloseTo(fakeAudio.length / 16000, 4);
    });
});


describe("concatenateSceneFiles", () => {
    beforeEach(() => {
        mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
    });

    afterEach(() => {
        if (existsSync(TEST_OUTPUT_DIR)) {
            rmSync(TEST_OUTPUT_DIR, { recursive: true });
        }
    });

    it("writes empty buffer for zero scene paths", async () => {
        const outputPath: string = join(TEST_OUTPUT_DIR, "empty-full.mp3");
        const duration: number = await concatenateSceneFiles([], [], outputPath);

        expect(existsSync(outputPath)).toBe(true);
        expect(readFileSync(outputPath).length).toBe(0);
        expect(duration).toBe(0);
    });
});
