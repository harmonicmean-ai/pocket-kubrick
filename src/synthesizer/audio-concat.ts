/**
 * Audio concatenation utilities.
 *
 * Concatenates per-segment MP3 audio buffers with silence padding
 * into per-scene and full-project audio files using FFmpeg.
 */

import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { verbose } from "../util/logger.js";


export interface AudioChunk {
    audioBuffer: Buffer;
    pauseAfterMs: number;
}


/**
 * Concatenate audio chunks with silence padding into a single MP3 file.
 * Returns total duration in seconds (estimated from file sizes / chunk count).
 */
export async function concatenateAudio(
    chunks: AudioChunk[],
    outputPath: string,
): Promise<number> {
    if (chunks.length === 0) {
        writeFileSync(outputPath, Buffer.alloc(0));
        return 0;
    }

    if (chunks.length === 1 && chunks[0].pauseAfterMs <= 0) {
        writeFileSync(outputPath, chunks[0].audioBuffer);
        return estimateMp3Duration(chunks[0].audioBuffer);
    }

    const tempDir: string = join(tmpdir(), `pk-audio-${randomUUID()}`);
    mkdirSync(tempDir, { recursive: true });

    try {
        const inputFiles: string[] = [];

        for (let i = 0; i < chunks.length; i++) {
            // Write chunk audio to temp file
            const chunkPath: string = join(tempDir, `chunk-${i}.mp3`);
            writeFileSync(chunkPath, chunks[i].audioBuffer);
            inputFiles.push(chunkPath);

            // Generate silence file if needed
            if (chunks[i].pauseAfterMs > 0 && i < chunks.length - 1) {
                const silencePath: string = join(tempDir, `silence-${i}.mp3`);
                const durationSec: number = chunks[i].pauseAfterMs / 1000;
                generateSilence(silencePath, durationSec);
                inputFiles.push(silencePath);
            }
        }

        // Build FFmpeg concat list
        const concatListPath: string = join(tempDir, "concat.txt");
        const concatContent: string = inputFiles.map((f) => `file '${f}'`).join("\n");
        writeFileSync(concatListPath, concatContent);

        // Run FFmpeg concat
        execFileSync("ffmpeg", [
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concatListPath,
            "-c", "copy",
            outputPath,
        ], { stdio: "pipe" });

        verbose(`  Wrote concatenated audio: ${outputPath}`);

        // Estimate duration from output file
        return estimateMp3Duration(readFileSync(outputPath));
    } finally {
        // Clean up temp files
        cleanupDir(tempDir);
    }
}


/**
 * Concatenate multiple scene audio files with pauses between them.
 */
export async function concatenateSceneFiles(
    scenePaths: string[],
    pausesBetweenMs: number[],
    outputPath: string,
): Promise<number> {
    if (scenePaths.length === 0) {
        writeFileSync(outputPath, Buffer.alloc(0));
        return 0;
    }

    const chunks: AudioChunk[] = scenePaths.map((path, i) => ({
        audioBuffer: readFileSync(path),
        pauseAfterMs: pausesBetweenMs[i] ?? 0,
    }));

    return concatenateAudio(chunks, outputPath);
}


/**
 * Generate a silent MP3 file of the given duration.
 */
function generateSilence(outputPath: string, durationSeconds: number): void {
    execFileSync("ffmpeg", [
        "-y",
        "-f", "lavfi",
        "-i", `anullsrc=r=48000:cl=mono`,
        "-t", String(durationSeconds),
        "-c:a", "libmp3lame",
        "-b:a", "128k",
        outputPath,
    ], { stdio: "pipe" });
}


/**
 * Rough estimate of MP3 duration from file size.
 * Assumes 128kbps for estimation. This is a fallback;
 * the synthesize command computes duration from word timestamps.
 */
function estimateMp3Duration(buffer: Buffer): number {
    // 128kbps = 16000 bytes per second
    return buffer.length / 16000;
}


function cleanupDir(dir: string): void {
    try {
        const { readdirSync, rmSync } = require("node:fs");
        rmSync(dir, { recursive: true, force: true });
    } catch {
        // Best effort cleanup
    }
}
