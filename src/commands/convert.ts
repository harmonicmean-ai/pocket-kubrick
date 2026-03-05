import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { convertMarkdownToSegments } from "../converter/md-to-segments.js";
import { resolveProjectRoot, getConfigPath } from "../util/fs-helpers.js";
import { loadVideoConfig } from "../parser/yaml-loader.js";
import { collectStringAnchors } from "../util/collect-anchors.js";
import { formatDiagnostics, hasErrors } from "../util/errors.js";
import { info, setVerbose, verbose } from "../util/logger.js";
import { sceneLabel } from "../util/scene-label.js";
import type { DiagnosticMessage } from "../util/errors.js";
import type { VideoConfig, Scene } from "../schema/types.js";
import type { ConvertedScene } from "../converter/segment-types.js";


export interface ConvertOptions {
    project?: string;
    verbose?: boolean;
}


export interface ConvertResult {
    success: boolean;
    diagnostics: DiagnosticMessage[];
    outputFiles: string[];
    scenes: ConvertedScene[];
}


/**
 * Convert all scene scripts from Markdown to segments.
 * Expects a valid config (run validate first).
 */
export function runConversion(config: VideoConfig, projectRoot: string): ConvertResult {
    const diagnostics: DiagnosticMessage[] = [];
    const outputFiles: string[] = [];
    const scenes: ConvertedScene[] = [];
    const segmentsDir: string = resolve(projectRoot, "generated", "segments");
    mkdirSync(segmentsDir, { recursive: true });

    for (const [sceneIndex, scene] of config.scenes.entries()) {
        const result: ConvertSceneResult | null =
            convertScene(scene, sceneIndex, config, segmentsDir);

        if (result) {
            diagnostics.push(...result.diagnostics);
            outputFiles.push(result.outputPath);
            scenes.push(result.convertedScene);
        }
    }

    return {
        success: !hasErrors(diagnostics),
        diagnostics,
        outputFiles,
        scenes,
    };
}


interface ConvertSceneResult {
    convertedScene: ConvertedScene;
    outputPath: string;
    diagnostics: DiagnosticMessage[];
}


function convertScene(
    scene: Scene,
    sceneIndex: number,
    config: VideoConfig,
    segmentsDir: string,
): ConvertSceneResult | null {
    const diagnostics: DiagnosticMessage[] = [];
    const label: string = sceneLabel(scene, sceneIndex);
    const markdown: string = scene.script;

    verbose(`Converting scene ${sceneIndex}: ${label}`);

    // Convert MD to segments
    const { segments, diagnostics: convertDiags } = convertMarkdownToSegments(markdown);
    diagnostics.push(...convertDiags);

    // Collect string anchors from visuals (at, disappear_at, children, stack items)
    const anchors: string[] = collectStringAnchors(scene.visuals);

    // Determine default voice for this scene
    const defaultVoice: string = scene.voice ?? config.default_voice;

    // Build the converted scene
    const convertedScene: ConvertedScene = {
        sceneIndex,
        sceneId: label,
        defaultVoice,
        segments,
        anchors,
    };

    // Write segment JSON file
    const outputPath: string = join(segmentsDir, `${label}.json`);
    writeFileSync(outputPath, JSON.stringify(convertedScene, null, 2));
    verbose(`  -> ${outputPath}`);

    return { convertedScene, outputPath, diagnostics };
}


/**
 * CLI handler for `pocket-kubrick convert`.
 */
export function convertCommand(options: ConvertOptions): void {
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

    info(`Converting ${config.scenes.length} scene(s) to segments...`);
    const result: ConvertResult = runConversion(config, projectRoot);

    if (result.diagnostics.length > 0) {
        console.error(formatDiagnostics(result.diagnostics));
    }

    if (result.success) {
        info(`Wrote ${result.outputFiles.length} segment file(s) to generated/segments/`);
        process.exit(0);
    } else {
        process.exit(1);
    }
}
