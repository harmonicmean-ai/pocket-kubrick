/**
 * Synthesize command: converts segments to audio using Inworld TTS.
 *
 * For each scene:
 * 1. Read ConvertedScene JSON from generated/segments/
 * 2. Chunk segments for 2000-char API limit
 * 3. Synthesize each chunk (with caching)
 * 4. Concatenate audio with silence padding
 * 5. Match anchors against word timestamps
 * 6. Write audio and timepoints files
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { resolveProjectRoot, getConfigPath } from "../util/fs-helpers.js";
import { loadVideoConfig } from "../parser/yaml-loader.js";
import { formatDiagnostics, hasErrors } from "../util/errors.js";
import { info, setVerbose, verbose, warn } from "../util/logger.js";
import { chunkSegments } from "../converter/text-chunker.js";
import { synthesizeText } from "../synthesizer/inworld-client.js";
import { computeCacheKey, readCache, writeCache, pruneCache } from "../synthesizer/cache.js";
import { matchAnchors } from "../synthesizer/anchor-matcher.js";
import { concatenateAudio, concatenateSceneFiles } from "../synthesizer/audio-concat.js";
import { probeAudioDuration } from "../util/audio-probe.js";
import type { DiagnosticMessage } from "../util/errors.js";
import type { VideoConfig, Voice } from "../schema/types.js";
import type { ConvertedScene, ScriptSegment } from "../converter/segment-types.js";
import type { InworldWordAlignment, SceneSynthesisResult, AnchorTimepoint } from "../synthesizer/types.js";
import type { AudioChunk } from "../synthesizer/audio-concat.js";


export interface SynthesizeOptions {
    project?: string;
    verbose?: boolean;
    cache?: boolean;
}


export interface SynthesizeResult {
    success: boolean;
    diagnostics: DiagnosticMessage[];
    sceneResults: SceneSynthesisResult[];
    outputFiles: string[];
}


/**
 * Run TTS synthesis for all scenes.
 */
export async function runSynthesis(
    config: VideoConfig,
    projectRoot: string,
    options: SynthesizeOptions,
): Promise<SynthesizeResult> {
    const diagnostics: DiagnosticMessage[] = [];
    const outputFiles: string[] = [];
    const sceneResults: SceneSynthesisResult[] = [];

    // Resolve API key
    const apiKey: string | undefined = resolveApiKey();
    if (!apiKey) {
        diagnostics.push({
            severity: "error",
            message: "INWORLD_APY_KEY environment variable is not set. Cannot synthesize audio.",
            suggestion: "Set INWORLD_APY_KEY in your .env file (loaded automatically by the CLI).",
        });
        return { success: false, diagnostics, sceneResults, outputFiles };
    }

    // Ensure output directories
    const audioDir: string = resolve(projectRoot, "generated", "audio");
    const cacheDir: string = resolve(projectRoot, ".pocket-kubrick", "cache");
    mkdirSync(audioDir, { recursive: true });
    mkdirSync(cacheDir, { recursive: true });

    // Prune stale cache entries
    const useCache: boolean = options.cache !== false;
    if (useCache) {
        pruneCache(cacheDir);
    }

    // Read segment files
    const segmentsDir: string = resolve(projectRoot, "generated", "segments");
    const segmentFiles: string[] = readdirSync(segmentsDir)
        .filter((f) => f.endsWith(".json"))
        .sort();

    if (segmentFiles.length === 0) {
        diagnostics.push({
            severity: "error",
            message: "No segment files found in generated/segments/. Run convert first.",
        });
        return { success: false, diagnostics, sceneResults, outputFiles };
    }

    // Synthesize each scene
    const scenePaths: string[] = [];
    const pausesBetween: number[] = [];

    for (const segFile of segmentFiles) {
        const segPath: string = join(segmentsDir, segFile);
        const scene: ConvertedScene = JSON.parse(readFileSync(segPath, "utf-8"));
        const sceneName: string = basename(segFile, ".json");

        info(`  Synthesizing scene ${scene.sceneIndex}: ${sceneName}...`);

        const sceneResult: SceneSynthesisResult = await synthesizeScene(
            scene,
            sceneName,
            config,
            audioDir,
            cacheDir,
            apiKey,
            useCache,
        );

        diagnostics.push(...sceneResult.diagnostics);
        sceneResults.push(sceneResult);

        if (sceneResult.audioPath) {
            outputFiles.push(sceneResult.audioPath);
            scenePaths.push(sceneResult.audioPath);

            // Write timepoints JSON
            const timepointsPath: string = join(audioDir, `${sceneName}.timepoints.json`);
            writeFileSync(timepointsPath, JSON.stringify({
                scene: sceneName,
                durationSeconds: sceneResult.durationSeconds,
                marks: sceneResult.timepoints,
            }, null, 2));
            outputFiles.push(timepointsPath);
        }

        // Pause between scenes from YAML config
        const sceneConfig = config.scenes[scene.sceneIndex];
        pausesBetween.push((sceneConfig?.pause_after ?? 0.3) * 1000);

        info(`    ${sceneName}: ${sceneResult.durationSeconds.toFixed(2)}s, ${sceneResult.timepoints.length} anchor(s), ${sceneResult.apiCalls} API call(s), ${sceneResult.cacheHits} cache hit(s)`);
    }

    // Concatenate all scene audio into full.mp3
    if (scenePaths.length > 0) {
        const fullAudioPath: string = join(audioDir, "full.mp3");
        try {
            await concatenateSceneFiles(scenePaths, pausesBetween, fullAudioPath);
            outputFiles.push(fullAudioPath);
            info(`  Wrote concatenated audio: generated/audio/full.mp3`);
        } catch (e) {
            diagnostics.push({
                severity: "warning",
                message: `Failed to concatenate scene audio: ${(e as Error).constructor.name}: ${(e as Error).message}`,
                suggestion: "Individual scene audio files are still available.",
            });
        }
    }

    // Write manifest
    const manifestPath: string = join(audioDir, "manifest.json");
    writeFileSync(manifestPath, JSON.stringify({
        scenes: sceneResults.map((r) => ({
            name: r.sceneName,
            audioFile: basename(r.audioPath),
            durationSeconds: r.durationSeconds,
            actualDurationSeconds: r.actualDurationSeconds,
            timepoints: r.timepoints,
        })),
        totalApiCalls: sceneResults.reduce((sum, r) => sum + r.apiCalls, 0),
        totalCacheHits: sceneResults.reduce((sum, r) => sum + r.cacheHits, 0),
    }, null, 2));
    outputFiles.push(manifestPath);

    return {
        success: !hasErrors(diagnostics),
        diagnostics,
        sceneResults,
        outputFiles,
    };
}


async function synthesizeScene(
    scene: ConvertedScene,
    sceneName: string,
    config: VideoConfig,
    audioDir: string,
    cacheDir: string,
    apiKey: string,
    useCache: boolean,
): Promise<SceneSynthesisResult> {
    const diagnostics: DiagnosticMessage[] = [];
    let apiCalls: number = 0;
    let cacheHits: number = 0;

    // Resolve voice config
    const voiceKey: string = scene.defaultVoice;
    const defaultVoiceConfig: Voice | undefined = config.voices[voiceKey];
    if (!defaultVoiceConfig) {
        diagnostics.push({
            severity: "error",
            message: `Scene ${scene.sceneIndex}: voice "${voiceKey}" not found in config.`,
        });
        return { sceneName, audioPath: "", durationSeconds: 0, actualDurationSeconds: 0, timepoints: [], diagnostics, apiCalls, cacheHits };
    }

    // Chunk segments for 2000-char limit
    const chunkedSegments: ScriptSegment[] = chunkSegments(scene.segments);

    // Synthesize each chunk
    const audioChunks: AudioChunk[] = [];
    const wordAlignments: InworldWordAlignment[] = [];
    const segmentTimeOffsets: number[] = [];
    let cumulativeTime: number = 0;

    for (const segment of chunkedSegments) {
        // Resolve voice for this segment
        const segVoiceKey: string = segment.voiceId ?? voiceKey;
        const segVoiceConfig: Voice | undefined = config.voices[segVoiceKey] ?? defaultVoiceConfig;

        const voiceId: string = segVoiceConfig.voice_id;
        const modelId: string = segVoiceConfig.model_id;
        const speakingRate: number = segment.speakingRate ?? segVoiceConfig.speaking_rate;
        const temperature: number = segVoiceConfig.temperature;

        // Prepend emotion tag if present
        const textToSynthesize: string = segment.emotion
            ? `[${segment.emotion}] ${segment.text}`
            : segment.text;

        // Check cache
        const cacheKey: string = computeCacheKey(textToSynthesize, voiceId, modelId, speakingRate, temperature);
        let audioContent: string;
        let wordAlignment: InworldWordAlignment;

        if (useCache) {
            const cached = readCache(cacheDir, cacheKey);
            if (cached) {
                audioContent = cached.audioContent;
                wordAlignment = cached.wordAlignment;
                cacheHits++;
            } else {
                const result = await synthesizeText(
                    { text: textToSynthesize, voiceId, modelId, speakingRate, temperature },
                    apiKey,
                );
                audioContent = result.audioContent;
                wordAlignment = result.wordAlignment;
                apiCalls++;
                writeCache(cacheDir, cacheKey, audioContent, wordAlignment, result.processedChars);
            }
        } else {
            const result = await synthesizeText(
                { text: textToSynthesize, voiceId, modelId, speakingRate, temperature },
                apiKey,
            );
            audioContent = result.audioContent;
            wordAlignment = result.wordAlignment;
            apiCalls++;
        }

        const audioBuffer: Buffer = Buffer.from(audioContent, "base64");

        // Compute chunk duration from word timestamps
        let chunkDuration: number = 0;
        if (wordAlignment.wordEndTimeSeconds.length > 0) {
            chunkDuration = wordAlignment.wordEndTimeSeconds[wordAlignment.wordEndTimeSeconds.length - 1];
        }

        segmentTimeOffsets.push(cumulativeTime);
        wordAlignments.push(wordAlignment);

        audioChunks.push({
            audioBuffer,
            pauseAfterMs: segment.pauseAfterMs ?? 0,
        });

        cumulativeTime += chunkDuration + (segment.pauseAfterMs ?? 0) / 1000;
    }

    // Concatenate audio chunks
    const audioPath: string = join(audioDir, `${sceneName}.mp3`);
    try {
        await concatenateAudio(audioChunks, audioPath);
    } catch (e) {
        diagnostics.push({
            severity: "error",
            message: `Scene ${scene.sceneIndex}: Audio concatenation failed: ${(e as Error).constructor.name}: ${(e as Error).message}`,
        });
        return { sceneName, audioPath: "", durationSeconds: 0, actualDurationSeconds: 0, timepoints: [], diagnostics, apiCalls, cacheHits };
    }

    // Probe actual MP3 duration (accounts for encoder padding)
    const actualDurationSeconds: number = probeAudioDuration(audioPath) || cumulativeTime;

    // Match anchors
    let timepoints: AnchorTimepoint[] = [];
    if (scene.anchors.length > 0) {
        const matchResult = matchAnchors(scene.anchors, wordAlignments, segmentTimeOffsets);
        timepoints = matchResult.matches;
        diagnostics.push(...matchResult.diagnostics);
    }

    return {
        sceneName,
        audioPath,
        durationSeconds: cumulativeTime,
        actualDurationSeconds,
        timepoints,
        diagnostics,
        apiCalls,
        cacheHits,
    };
}


/**
 * Resolve the Inworld API key from environment (.env is auto-loaded by the CLI).
 */
function resolveApiKey(): string | undefined {
    return process.env.INWORLD_APY_KEY;
}


/**
 * CLI handler for `pocket-kubrick synthesize`.
 */
export async function synthesizeCommand(options: SynthesizeOptions): Promise<void> {
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

    info(`Synthesizing ${config.scenes.length} scene(s) with Inworld TTS...`);
    const result: SynthesizeResult = await runSynthesis(config, projectRoot, options);

    if (result.diagnostics.length > 0) {
        console.error(formatDiagnostics(result.diagnostics));
    }

    if (result.success) {
        info(`\nSynthesis complete. Wrote ${result.outputFiles.length} file(s) to generated/audio/`);
        process.exit(0);
    } else {
        process.exit(1);
    }
}
