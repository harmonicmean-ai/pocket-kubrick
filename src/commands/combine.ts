import { existsSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, join, extname, basename } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { localTimestamp } from "../util/fs-helpers.js";
import { info, setVerbose, verbose } from "../util/logger.js";
import { formatDiagnostics } from "../util/errors.js";
import type { DiagnosticMessage } from "../util/errors.js";


export interface CombineOptions {
    outputDir?: string;
    filename?: string;
    verbose?: boolean;
}


export interface CombineResult {
    success: boolean;
    diagnostics: DiagnosticMessage[];
    outputFile: string | null;
}


interface VideoProbe {
    width: number;
    height: number;
    fps: number;
    codec: string;
    path: string;
}


/**
 * Probe a video file for its properties using ffprobe.
 */
function probeVideo(filePath: string): VideoProbe {
    const raw: string = execFileSync("ffprobe", [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate,codec_name",
        "-of", "json",
        filePath,
    ], { encoding: "utf-8" });

    const parsed: { streams: Array<{ width: number; height: number; r_frame_rate: string; codec_name: string }> } =
        JSON.parse(raw);

    if (!parsed.streams || parsed.streams.length === 0) {
        throw new Error(`No video stream found in ${filePath}`);
    }

    const stream: { width: number; height: number; r_frame_rate: string; codec_name: string } = parsed.streams[0];
    // r_frame_rate is a fraction like "30/1" or "30000/1001"
    const [num, den]: number[] = stream.r_frame_rate.split("/").map(Number);
    const fps: number = Math.round((num / den) * 100) / 100;

    return {
        width: stream.width,
        height: stream.height,
        fps,
        codec: stream.codec_name,
        path: filePath,
    };
}


/**
 * Combine two or more video files into one using ffmpeg concat demuxer.
 */
export function runCombine(
    inputPaths: string[],
    options: CombineOptions,
): CombineResult {
    const diagnostics: DiagnosticMessage[] = [];

    // Validate inputs exist
    for (const p of inputPaths) {
        const absPath: string = resolve(p);
        if (!existsSync(absPath)) {
            diagnostics.push({
                severity: "error",
                file: p,
                message: `File not found: ${absPath}`,
            });
        }
    }

    if (diagnostics.length > 0) {
        return { success: false, diagnostics, outputFile: null };
    }

    // Probe all videos
    const probes: VideoProbe[] = [];
    for (const p of inputPaths) {
        const absPath: string = resolve(p);
        try {
            const probe: VideoProbe = probeVideo(absPath);
            probes.push(probe);
            verbose(`  Probed ${basename(absPath)}: ${probe.width}x${probe.height} @ ${probe.fps}fps (${probe.codec})`);
        } catch (e) {
            diagnostics.push({
                severity: "error",
                file: p,
                message: `Failed to probe video: ${(e as Error).constructor.name}: ${(e as Error).message}`,
            });
        }
    }

    if (diagnostics.length > 0) {
        return { success: false, diagnostics, outputFile: null };
    }

    // Validate compatibility
    const reference: VideoProbe = probes[0];
    for (let i = 1; i < probes.length; i++) {
        const current: VideoProbe = probes[i];

        if (current.width !== reference.width || current.height !== reference.height) {
            diagnostics.push({
                severity: "error",
                file: inputPaths[i],
                message: `Dimension mismatch: ${basename(inputPaths[i])} is ${current.width}x${current.height} but ${basename(inputPaths[0])} is ${reference.width}x${reference.height}. All videos must have the same dimensions.`,
            });
        }

        if (current.fps !== reference.fps) {
            diagnostics.push({
                severity: "error",
                file: inputPaths[i],
                message: `FPS mismatch: ${basename(inputPaths[i])} is ${current.fps}fps but ${basename(inputPaths[0])} is ${reference.fps}fps. All videos must have the same frame rate.`,
            });
        }

        if (current.codec !== reference.codec) {
            diagnostics.push({
                severity: "error",
                file: inputPaths[i],
                message: `Codec mismatch: ${basename(inputPaths[i])} uses ${current.codec} but ${basename(inputPaths[0])} uses ${reference.codec}. All videos must use the same codec.`,
            });
        }
    }

    if (diagnostics.length > 0) {
        return { success: false, diagnostics, outputFile: null };
    }

    // Determine output path
    const outputDir: string = resolve(options.outputDir ?? ".");
    mkdirSync(outputDir, { recursive: true });

    const ext: string = extname(inputPaths[0]);
    const outputName: string = options.filename
        ? `${options.filename}${ext}`
        : `combined-video-${localTimestamp()}${ext}`;
    const outputPath: string = join(outputDir, outputName);

    // Build concat list in a temp file
    const tempDir: string = join(tmpdir(), `pk-combine-${randomUUID()}`);
    mkdirSync(tempDir, { recursive: true });
    const concatListPath: string = join(tempDir, "concat.txt");

    try {
        const concatContent: string = inputPaths
            .map((p) => `file '${resolve(p)}'`)
            .join("\n");
        writeFileSync(concatListPath, concatContent);

        info(`  Combining ${inputPaths.length} videos (${reference.width}x${reference.height} @ ${reference.fps}fps)...`);

        execFileSync("ffmpeg", [
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concatListPath,
            "-c", "copy",
            outputPath,
        ], { stdio: "pipe" });

        info(`  Wrote: ${outputPath}`);
        return { success: true, diagnostics, outputFile: outputPath };
    } catch (e) {
        diagnostics.push({
            severity: "error",
            message: `FFmpeg concat failed: ${(e as Error).constructor.name}: ${(e as Error).message}`,
            suggestion: "Ensure ffmpeg is installed and the input videos are valid.",
        });
        return { success: false, diagnostics, outputFile: null };
    } finally {
        try {
            rmSync(tempDir, { recursive: true, force: true });
        } catch {
            // Best effort cleanup
        }
    }
}


/**
 * CLI handler for `pocket-kubrick combine`.
 */
export function combineCommand(sources: string[], options: CombineOptions): void {
    if (options.verbose) {
        setVerbose(true);
    }

    if (sources.length < 2) {
        console.error("Error: At least two source videos are required.");
        process.exit(1);
    }

    info(`Combining ${sources.length} videos...`);
    const result: CombineResult = runCombine(sources, options);

    if (result.diagnostics.length > 0) {
        console.error(formatDiagnostics(result.diagnostics));
    }

    if (result.success) {
        info("\nCombine complete.");
        process.exit(0);
    } else {
        console.error("\nCombine failed.");
        process.exit(1);
    }
}
