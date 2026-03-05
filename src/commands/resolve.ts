import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { resolveProjectRoot, getConfigPath } from "../util/fs-helpers.js";
import { loadVideoConfig } from "../parser/yaml-loader.js";
import { buildTimeline } from "../resolver/timeline-builder.js";
import { formatDiagnostics, hasErrors } from "../util/errors.js";
import { info, setVerbose, verbose as verboseLog } from "../util/logger.js";
import type { DiagnosticMessage } from "../util/errors.js";
import type { VideoConfig } from "../schema/types.js";
import type { Timeline } from "../resolver/types.js";
import type { ResolveResult } from "../resolver/timeline-builder.js";


export interface ResolveOptions {
    project?: string;
    verbose?: boolean;
}

export type { ResolveResult };


/**
 * Run the resolve stage: build timeline.json from config + audio artifacts.
 */
export function runResolve(
    config: VideoConfig,
    projectRoot: string,
): ResolveResult {
    const result: ResolveResult = buildTimeline(config, projectRoot);

    if (result.timeline) {
        const generatedDir: string = join(projectRoot, "generated");
        mkdirSync(generatedDir, { recursive: true });
        const timelinePath: string = join(generatedDir, "timeline.json");
        writeFileSync(timelinePath, JSON.stringify(result.timeline, null, 2));
        info(`  Wrote ${timelinePath}`);

        verboseLog(`  Timeline: ${result.timeline.scenes.length} scene(s), ${result.timeline.events.length} event(s), ${result.timeline.video.total_frames} total frames`);
    }

    return result;
}


/**
 * CLI handler for `pocket-kubrick resolve`.
 */
export function resolveCommand(options: ResolveOptions): void {
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

    info(`Resolving timeline for "${config.video.title}"...`);
    const result: ResolveResult = runResolve(config, projectRoot);

    if (result.diagnostics.length > 0) {
        console.error(formatDiagnostics(result.diagnostics));
    }

    if (result.success) {
        info("Resolve complete.");
        process.exit(0);
    } else {
        console.error("\nResolve failed.");
        process.exit(1);
    }
}
