import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolve } from "node:path";
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import type { VideoConfig } from "../../src/schema/types.js";
import type { ConvertedScene } from "../../src/converter/segment-types.js";


// Mock audio concatenation (avoids FFmpeg dependency in tests)
vi.mock("../../src/synthesizer/audio-concat.js", () => ({
    concatenateAudio: vi.fn().mockImplementation(async (_chunks: unknown[], outputPath: string) => {
        writeFileSync(outputPath, Buffer.from("fake-mp3"));
        return 2.5;
    }),
    concatenateSceneFiles: vi.fn().mockImplementation(async (_paths: string[], _pauses: number[], outputPath: string) => {
        writeFileSync(outputPath, Buffer.from("fake-full-mp3"));
        return 5.0;
    }),
}));


// Import after mock setup
const { runSynthesis } = await import("../../src/commands/synthesize.js");


const TEST_PROJECT: string = resolve(import.meta.dirname, "../fixtures/.test-synth-project");
const SEGMENTS_DIR: string = resolve(TEST_PROJECT, "generated", "segments");
const AUDIO_DIR: string = resolve(TEST_PROJECT, "generated", "audio");
const CACHE_DIR: string = resolve(TEST_PROJECT, ".pocket-kubrick", "cache");


const MOCK_CONFIG: VideoConfig = {
    title: "Test Video",
    version: "1.0",
    format: {
        width: 1920,
        height: 1080,
        fps: 30,
        quality: "standard",
    },
    voices: {
        narrator: {
            voice_id: "Craig",
            provider: "inworld",
            model_id: "inworld-tts-1.5-max",
            speaking_rate: 1.0,
            temperature: 1.1,
        },
    },
    theme: {
        background: "#e5e5e5",
        font_family: "Open Sans",
    },
    scenes: [
        {
            script: "scripts/01-intro.md",
            voice: "narrator",
            visuals: [],
        },
    ],
};


const MOCK_SCENE: ConvertedScene = {
    sceneIndex: 0,
    sceneId: "01-intro",
    defaultVoice: "narrator",
    segments: [
        { text: "Hello and welcome to this tutorial." },
        { text: "Let us get started.", pauseAfterMs: 500 },
    ],
    anchors: ["get-started"],
};


const MOCK_API_RESPONSE = {
    audioContent: "dGVzdGF1ZGlv",  // base64 of "testaudio"
    timestampInfo: {
        wordAlignment: {
            words: ["Hello", "and", "welcome", "to", "this", "tutorial."],
            wordStartTimeSeconds: [0, 0.3, 0.5, 0.9, 1.1, 1.3],
            wordEndTimeSeconds: [0.3, 0.5, 0.9, 1.1, 1.3, 1.8],
        },
    },
    usage: { processedCharactersCount: 35, modelId: "inworld-tts-1.5-max" },
};

const MOCK_API_RESPONSE_2 = {
    audioContent: "c2Vjb25k",  // base64 of "second"
    timestampInfo: {
        wordAlignment: {
            words: ["Let", "us", "get", "started."],
            wordStartTimeSeconds: [0, 0.2, 0.4, 0.6],
            wordEndTimeSeconds: [0.2, 0.4, 0.6, 1.0],
        },
    },
    usage: { processedCharactersCount: 19, modelId: "inworld-tts-1.5-max" },
};


describe("runSynthesis", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        // Create test project structure
        mkdirSync(SEGMENTS_DIR, { recursive: true });
        mkdirSync(AUDIO_DIR, { recursive: true });
        mkdirSync(CACHE_DIR, { recursive: true });

        // Write a scene segment file
        writeFileSync(
            resolve(SEGMENTS_DIR, "01-intro.json"),
            JSON.stringify(MOCK_SCENE),
        );

        // Set API key
        process.env.INWORLD_APY_KEY = "test-api-key-for-synth";
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        delete process.env.INWORLD_APY_KEY;

        if (existsSync(TEST_PROJECT)) {
            rmSync(TEST_PROJECT, { recursive: true });
        }
    });

    it("fails when INWORLD_APY_KEY is not set", async () => {
        delete process.env.INWORLD_APY_KEY;

        const result = await runSynthesis(MOCK_CONFIG, TEST_PROJECT, {});
        expect(result.success).toBe(false);
        expect(result.diagnostics.some((d) => d.message.includes("INWORLD_APY_KEY"))).toBe(true);
    });

    it("fails when no segment files exist", async () => {
        // Remove segment files
        rmSync(SEGMENTS_DIR, { recursive: true });
        mkdirSync(SEGMENTS_DIR, { recursive: true });

        const result = await runSynthesis(MOCK_CONFIG, TEST_PROJECT, {});
        expect(result.success).toBe(false);
        expect(result.diagnostics.some((d) => d.message.includes("No segment files"))).toBe(true);
    });

    it("synthesizes a scene with mocked API and writes output files", async () => {
        let callCount: number = 0;
        globalThis.fetch = vi.fn().mockImplementation(() => {
            callCount++;
            const response = callCount === 1 ? MOCK_API_RESPONSE : MOCK_API_RESPONSE_2;
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(response),
            });
        });

        const result = await runSynthesis(MOCK_CONFIG, TEST_PROJECT, { cache: false });

        expect(result.success).toBe(true);
        expect(result.sceneResults).toHaveLength(1);

        const sceneResult = result.sceneResults[0];
        expect(sceneResult.sceneName).toBe("01-intro");
        expect(sceneResult.apiCalls).toBe(2);
        expect(sceneResult.cacheHits).toBe(0);
        expect(sceneResult.durationSeconds).toBeGreaterThan(0);

        // Should have matched the "get-started" anchor
        const getStartedAnchor = sceneResult.timepoints.find((t) => t.name === "get-started");
        expect(getStartedAnchor).toBeDefined();
        expect(getStartedAnchor!.timeSeconds).toBeGreaterThan(0);

        // Output files should include the scene MP3, timepoints, full.mp3, manifest
        expect(result.outputFiles.some((f) => f.endsWith("01-intro.mp3"))).toBe(true);
        expect(result.outputFiles.some((f) => f.endsWith("01-intro.timepoints.json"))).toBe(true);
        expect(result.outputFiles.some((f) => f.endsWith("full.mp3"))).toBe(true);
        expect(result.outputFiles.some((f) => f.endsWith("manifest.json"))).toBe(true);

        // Verify timepoints JSON was written
        const timepointsPath: string = resolve(AUDIO_DIR, "01-intro.timepoints.json");
        expect(existsSync(timepointsPath)).toBe(true);
        const timepoints = JSON.parse(readFileSync(timepointsPath, "utf-8"));
        expect(timepoints.scene).toBe("01-intro");
        expect(timepoints.marks).toHaveLength(1);
        expect(timepoints.marks[0].name).toBe("get-started");

        // Verify manifest was written
        const manifestPath: string = resolve(AUDIO_DIR, "manifest.json");
        expect(existsSync(manifestPath)).toBe(true);
        const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
        expect(manifest.scenes).toHaveLength(1);
        expect(manifest.scenes[0].name).toBe("01-intro");
        expect(manifest.totalApiCalls).toBe(2);
        expect(manifest.totalCacheHits).toBe(0);
    });

    it("uses cache on second run", async () => {
        let fetchCallCount: number = 0;
        globalThis.fetch = vi.fn().mockImplementation(() => {
            fetchCallCount++;
            const response = fetchCallCount % 2 === 1 ? MOCK_API_RESPONSE : MOCK_API_RESPONSE_2;
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(response),
            });
        });

        // First run: populates cache
        const result1 = await runSynthesis(MOCK_CONFIG, TEST_PROJECT, { cache: true });
        expect(result1.success).toBe(true);
        expect(result1.sceneResults[0].apiCalls).toBe(2);
        expect(result1.sceneResults[0].cacheHits).toBe(0);

        // Second run: should hit cache
        const result2 = await runSynthesis(MOCK_CONFIG, TEST_PROJECT, { cache: true });
        expect(result2.success).toBe(true);
        expect(result2.sceneResults[0].cacheHits).toBe(2);
        expect(result2.sceneResults[0].apiCalls).toBe(0);
    });

    it("reports error for unknown voice", async () => {
        const badScene: ConvertedScene = {
            ...MOCK_SCENE,
            defaultVoice: "nonexistent-voice",
        };
        writeFileSync(
            resolve(SEGMENTS_DIR, "01-intro.json"),
            JSON.stringify(badScene),
        );

        globalThis.fetch = vi.fn();

        const result = await runSynthesis(MOCK_CONFIG, TEST_PROJECT, {});
        expect(result.success).toBe(false);
        expect(result.diagnostics.some((d) =>
            d.severity === "error" && d.message.includes("nonexistent-voice")
        )).toBe(true);
        // Should NOT have called the API
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });
});
