/**
 * TTS response cache.
 *
 * Caches Inworld API responses keyed by SHA-256 of the request parameters.
 * Stored in .pocket-kubrick/cache/{hash}.json.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { verbose } from "../util/logger.js";
import type { CacheEntry, InworldWordAlignment } from "./types.js";


/**
 * Compute a deterministic cache key from request parameters.
 */
export function computeCacheKey(
    text: string,
    voiceId: string,
    modelId: string,
    speakingRate: number,
    temperature: number,
): string {
    const input: string = [
        text.trim(),
        voiceId,
        modelId,
        String(speakingRate),
        String(temperature),
    ].join("|");
    return createHash("sha256").update(input).digest("hex");
}


/**
 * Read a cached response if it exists.
 */
export function readCache(cacheDir: string, key: string): CacheEntry | null {
    const filePath: string = join(cacheDir, `${key}.json`);
    if (!existsSync(filePath)) {
        return null;
    }

    try {
        const raw: string = readFileSync(filePath, "utf-8");
        const entry: CacheEntry = JSON.parse(raw);
        verbose(`  Cache hit: ${key.substring(0, 12)}...`);
        return entry;
    } catch {
        // Corrupted cache entry, ignore
        return null;
    }
}


/**
 * Write a response to the cache.
 */
export function writeCache(
    cacheDir: string,
    key: string,
    audioContent: string,
    wordAlignment: InworldWordAlignment,
    processedChars: number,
): void {
    mkdirSync(cacheDir, { recursive: true });

    const entry: CacheEntry = {
        audioContent,
        wordAlignment,
        processedChars,
        cachedAt: new Date().toISOString(),
    };

    const filePath: string = join(cacheDir, `${key}.json`);
    writeFileSync(filePath, JSON.stringify(entry));
    verbose(`  Cached: ${key.substring(0, 12)}...`);
}


/**
 * Remove cache entries older than maxAgeDays.
 * Returns the number of entries pruned.
 */
export function pruneCache(cacheDir: string, maxAgeDays: number = 90): number {
    if (!existsSync(cacheDir)) {
        return 0;
    }

    const maxAgeMs: number = maxAgeDays * 24 * 60 * 60 * 1000;
    const now: number = Date.now();
    let pruned: number = 0;

    const files: string[] = readdirSync(cacheDir).filter((f) => f.endsWith(".json"));

    for (const file of files) {
        const filePath: string = join(cacheDir, file);
        try {
            const stats = statSync(filePath);
            if (now - stats.mtimeMs > maxAgeMs) {
                unlinkSync(filePath);
                pruned++;
            }
        } catch {
            // Skip files we can't stat
        }
    }

    if (pruned > 0) {
        verbose(`  Pruned ${pruned} stale cache entries`);
    }

    return pruned;
}
