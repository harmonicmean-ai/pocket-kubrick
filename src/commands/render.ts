import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { resolveProjectRoot, getConfigPath, localTimestamp, resolveRemotionEntryPoint } from "../util/fs-helpers.js";
import { loadVideoConfig } from "../parser/yaml-loader.js";
import { formatDiagnostics } from "../util/errors.js";
import { info, setVerbose, verbose as verboseLog, warn, progressBar, clearProgress } from "../util/logger.js";
import type { DiagnosticMessage } from "../util/errors.js";
import type { VideoConfig } from "../schema/types.js";
import type { Timeline } from "../resolver/types.js";


export interface RenderOptions {
    project?: string;
    verbose?: boolean;
    quality?: string;
}


export interface RenderResult {
    success: boolean;
    diagnostics: DiagnosticMessage[];
    outputFiles: string[];
}


interface QualityConfig {
    crf: number;
    scaleFactor: number;
    fps: number | null; // null = use timeline fps
    imageFormat: "png" | "jpeg";
    jpegQuality: number;
}


const QUALITY_PRESETS: Record<string, QualityConfig> = {
    draft: { crf: 28, scaleFactor: 0.5, fps: 24, imageFormat: "jpeg", jpegQuality: 80 },
    standard: { crf: 23, scaleFactor: 1.0, fps: null, imageFormat: "png", jpegQuality: 100 },
    high: { crf: 18, scaleFactor: 1.0, fps: null, imageFormat: "png", jpegQuality: 100 },
};


const CODEC_MAP: Record<string, string> = {
    mp4: "h264",
    webm: "vp8",
    mov: "prores",
    gif: "gif",
};


/**
 * Run the render stage: use Remotion to render video from timeline.json.
 */
export async function runRender(
    config: VideoConfig,
    projectRoot: string,
    options: RenderOptions,
): Promise<RenderResult> {
    const diagnostics: DiagnosticMessage[] = [];
    const outputFiles: string[] = [];

    // Read timeline
    const timelinePath: string = join(projectRoot, "generated", "timeline.json");
    if (!existsSync(timelinePath)) {
        diagnostics.push({
            severity: "error",
            message: `Timeline not found: ${timelinePath}. Run resolve first.`,
        });
        return { success: false, diagnostics, outputFiles };
    }

    let timeline: Timeline;
    try {
        timeline = JSON.parse(readFileSync(timelinePath, "utf-8"));
    } catch (e) {
        diagnostics.push({
            severity: "error",
            file: timelinePath,
            message: `Failed to parse timeline: ${(e as Error).constructor.name}: ${(e as Error).message}`,
        });
        return { success: false, diagnostics, outputFiles };
    }

    // Quality preset
    const qualityName: string = options.quality ?? config.video.quality;
    const quality: QualityConfig = QUALITY_PRESETS[qualityName] ?? QUALITY_PRESETS.standard;
    info(`  Quality preset: ${qualityName} (CRF ${quality.crf}, scale ${quality.scaleFactor}x)`);

    // Resolve entry point for Remotion
    const currentDir: string = dirname(fileURLToPath(import.meta.url));
    const entryPoint: string = resolveRemotionEntryPoint(currentDir);

    if (!existsSync(entryPoint)) {
        diagnostics.push({
            severity: "error",
            message: `Remotion entry point not found: ${entryPoint}`,
        });
        return { success: false, diagnostics, outputFiles };
    }

    // Bundle the Remotion project
    info("  Bundling Remotion project...");
    let bundleLocation: string;
    try {
        bundleLocation = await bundle({
            entryPoint,
            publicDir: projectRoot,
        });
        verboseLog(`  Bundle created at: ${bundleLocation}`);
    } catch (e) {
        diagnostics.push({
            severity: "error",
            message: `Remotion bundle failed: ${(e as Error).constructor.name}: ${(e as Error).message}`,
        });
        return { success: false, diagnostics, outputFiles };
    }

    // Apply quality scaling
    const renderWidth: number = Math.round(timeline.video.width * quality.scaleFactor);
    const renderHeight: number = Math.round(timeline.video.height * quality.scaleFactor);
    const renderFps: number = quality.fps ?? timeline.video.fps;

    // Adjust timeline for quality scaling if needed
    const renderTimeline: Timeline = quality.scaleFactor === 1.0 && !quality.fps
        ? timeline
        : {
            ...timeline,
            video: {
                ...timeline.video,
                width: renderWidth,
                height: renderHeight,
                fps: renderFps,
                total_frames: quality.fps
                    ? Math.round(timeline.video.total_duration_seconds * renderFps)
                    : timeline.video.total_frames,
            },
        };

    // Select composition
    info("  Selecting composition...");
    let composition;
    try {
        composition = await selectComposition({
            serveUrl: bundleLocation,
            id: "VideoComposition",
            inputProps: { timeline: renderTimeline },
        });
    } catch (e) {
        diagnostics.push({
            severity: "error",
            message: `Composition selection failed: ${(e as Error).constructor.name}: ${(e as Error).message}`,
        });
        return { success: false, diagnostics, outputFiles };
    }

    // Determine output path
    const outputDir: string = join(projectRoot, "output");
    mkdirSync(outputDir, { recursive: true });

    const formats: string[] = config.video.format;
    const primaryFormat: string = formats[0];
    const primaryCodec: string = CODEC_MAP[primaryFormat] ?? "h264";
    const slug: string = slugify(config.video.title);
    const stamp: string = localTimestamp();
    const primaryFilename: string = `${slug}_${stamp}.${primaryFormat}`;
    const primaryOutputPath: string = join(outputDir, primaryFilename);

    // Render
    info(`  Rendering ${primaryFormat} (${renderWidth}x${renderHeight} @ ${renderFps}fps)...`);
    try {
        await renderMedia({
            composition,
            serveUrl: bundleLocation,
            codec: primaryCodec as any,
            outputLocation: primaryOutputPath,
            inputProps: { timeline: renderTimeline },
            crf: primaryCodec === "prores" ? undefined : quality.crf,
            imageFormat: quality.imageFormat,
            jpegQuality: quality.jpegQuality,
            onProgress: ({ progress }) => {
                progressBar("Rendering", progress);
            },
        });
        clearProgress();
        outputFiles.push(primaryOutputPath);
        info(`  Wrote: ${primaryOutputPath}`);
    } catch (e) {
        clearProgress();
        diagnostics.push({
            severity: "error",
            message: `Render failed: ${(e as Error).constructor.name}: ${(e as Error).message}`,
        });
        return { success: false, diagnostics, outputFiles };
    }

    // Transcode to additional formats
    for (let i = 1; i < formats.length; i++) {
        const fmt: string = formats[i];
        const fmtFilename: string = `${slug}_${stamp}.${fmt}`;
        const fmtOutputPath: string = join(outputDir, fmtFilename);

        info(`  Transcoding to ${fmt}...`);
        try {
            transcodeWithFfmpeg(primaryOutputPath, fmtOutputPath, fmt);
            outputFiles.push(fmtOutputPath);
            info(`  Wrote: ${fmtOutputPath}`);
        } catch (e) {
            diagnostics.push({
                severity: "warning",
                message: `Transcode to ${fmt} failed: ${(e as Error).constructor.name}: ${(e as Error).message}`,
                suggestion: `You can manually transcode: ffmpeg -i "${primaryOutputPath}" "${fmtOutputPath}"`,
            });
        }
    }

    return {
        success: diagnostics.every((d) => d.severity !== "error"),
        diagnostics,
        outputFiles,
    };
}


/**
 * Transcode a video file to another format using FFmpeg.
 */
function transcodeWithFfmpeg(inputPath: string, outputPath: string, format: string): void {
    const args: string[] = ["-y", "-i", inputPath];

    switch (format) {
        case "webm":
            args.push("-c:v", "libvpx", "-b:v", "2M", "-c:a", "libopus");
            break;
        case "mov":
            args.push("-c:v", "prores_ks", "-profile:v", "3", "-c:a", "pcm_s16le");
            break;
        case "gif":
            args.push("-vf", "fps=15,scale=480:-1:flags=lanczos", "-loop", "0");
            break;
        default:
            args.push("-c:v", "libx264", "-crf", "23", "-c:a", "aac");
            break;
    }

    args.push(outputPath);
    execFileSync("ffmpeg", args, { stdio: "pipe" });
}


/**
 * Slugify a title for use in filenames.
 */
function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}


/**
 * CLI handler for `pocket-kubrick render`.
 */
export async function renderCommand(options: RenderOptions): Promise<void> {
    if (options.verbose) {
        setVerbose(true);
    }

    let projectRoot: string;
    try {
        projectRoot = resolveProjectRoot(options.project);
    } catch (e) {
        console.error((e as Error).message);
        process.exit(1);
    }

    const configPath: string = getConfigPath(projectRoot);
    const { config, diagnostics: loadDiags } = loadVideoConfig(configPath);

    if (!config) {
        console.error(formatDiagnostics(loadDiags));
        process.exit(1);
    }

    info(`Rendering "${config.video.title}"...`);
    const result: RenderResult = await runRender(config, projectRoot, options);

    if (result.diagnostics.length > 0) {
        console.error(formatDiagnostics(result.diagnostics));
    }

    if (result.success) {
        info(`\nRender complete. ${result.outputFiles.length} file(s) written to output/`);
        process.exit(0);
    } else {
        console.error("\nRender failed.");
        process.exit(1);
    }
}
