import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { computeCacheKey, readCache, writeCache, pruneCache } from "../../src/synthesizer/cache.js";
import type { InworldWordAlignment } from "../../src/synthesizer/types.js";


const TEST_CACHE_DIR: string = resolve(import.meta.dirname, "../fixtures/.test-cache");


describe("computeCacheKey", () => {
    it("produces deterministic keys for same input", () => {
        const key1: string = computeCacheKey("hello", "Craig", "inworld-tts-1.5-max", 1.0, 1.1);
        const key2: string = computeCacheKey("hello", "Craig", "inworld-tts-1.5-max", 1.0, 1.1);
        expect(key1).toBe(key2);
    });

    it("produces different keys for different input", () => {
        const key1: string = computeCacheKey("hello", "Craig", "inworld-tts-1.5-max", 1.0, 1.1);
        const key2: string = computeCacheKey("world", "Craig", "inworld-tts-1.5-max", 1.0, 1.1);
        expect(key1).not.toBe(key2);
    });

    it("produces different keys for different voice", () => {
        const key1: string = computeCacheKey("hello", "Craig", "inworld-tts-1.5-max", 1.0, 1.1);
        const key2: string = computeCacheKey("hello", "Ashley", "inworld-tts-1.5-max", 1.0, 1.1);
        expect(key1).not.toBe(key2);
    });
});


describe("writeCache / readCache", () => {
    beforeEach(() => {
        if (existsSync(TEST_CACHE_DIR)) {
            rmSync(TEST_CACHE_DIR, { recursive: true });
        }
        mkdirSync(TEST_CACHE_DIR, { recursive: true });
    });

    afterEach(() => {
        if (existsSync(TEST_CACHE_DIR)) {
            rmSync(TEST_CACHE_DIR, { recursive: true });
        }
    });

    it("round-trips a cache entry", () => {
        const key: string = "test-key-123";
        const alignment: InworldWordAlignment = {
            words: ["hello", "world"],
            wordStartTimeSeconds: [0, 0.3],
            wordEndTimeSeconds: [0.3, 0.7],
        };

        writeCache(TEST_CACHE_DIR, key, "base64audio==", alignment, 11);
        const entry = readCache(TEST_CACHE_DIR, key);

        expect(entry).not.toBeNull();
        expect(entry!.audioContent).toBe("base64audio==");
        expect(entry!.wordAlignment.words).toEqual(["hello", "world"]);
        expect(entry!.processedChars).toBe(11);
    });

    it("returns null for cache miss", () => {
        const entry = readCache(TEST_CACHE_DIR, "nonexistent-key");
        expect(entry).toBeNull();
    });
});


describe("pruneCache", () => {
    beforeEach(() => {
        if (existsSync(TEST_CACHE_DIR)) {
            rmSync(TEST_CACHE_DIR, { recursive: true });
        }
    });

    afterEach(() => {
        if (existsSync(TEST_CACHE_DIR)) {
            rmSync(TEST_CACHE_DIR, { recursive: true });
        }
    });

    it("returns 0 for nonexistent directory", () => {
        expect(pruneCache(TEST_CACHE_DIR)).toBe(0);
    });

    it("keeps recent entries", () => {
        mkdirSync(TEST_CACHE_DIR, { recursive: true });
        const alignment: InworldWordAlignment = { words: [], wordStartTimeSeconds: [], wordEndTimeSeconds: [] };
        writeCache(TEST_CACHE_DIR, "recent-entry", "audio", alignment, 5);

        const pruned: number = pruneCache(TEST_CACHE_DIR, 90);
        expect(pruned).toBe(0);
        expect(readCache(TEST_CACHE_DIR, "recent-entry")).not.toBeNull();
    });
});
