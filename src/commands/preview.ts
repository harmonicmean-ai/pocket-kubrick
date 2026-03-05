import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveProjectRoot, getConfigPath, resolveRemotionEntryPoint } from "../util/fs-helpers.js";
import { loadVideoConfig } from "../parser/yaml-loader.js";
import { formatDiagnostics } from "../util/errors.js";
import { info, setVerbose } from "../util/logger.js";
import type { Timeline } from "../resolver/types.js";


export interface PreviewOptions {
    project?: string;
    verbose?: boolean;
    port?: string;
}


/**
 * CLI handler for `pocket-kubrick preview`.
 * Launches Remotion Studio for interactive browser-based preview.
 */
export function previewCommand(options: PreviewOptions): void {
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

    // Verify timeline exists
    const timelinePath: string = join(projectRoot, "generated", "timeline.json");
    if (!existsSync(timelinePath)) {
        console.error(`Timeline not found: ${timelinePath}. Run resolve first.`);
        process.exit(1);
    }

    // Read timeline and write as a props file for Remotion Studio
    const timeline: Timeline = JSON.parse(readFileSync(timelinePath, "utf-8"));
    const propsPath: string = join(projectRoot, "generated", "remotion-props.json");
    writeFileSync(propsPath, JSON.stringify({ timeline }, null, 2));

    // Resolve entry point
    const currentDir: string = dirname(fileURLToPath(import.meta.url));
    const entryPoint: string = resolveRemotionEntryPoint(currentDir);

    if (!existsSync(entryPoint)) {
        console.error(`Remotion entry point not found: ${entryPoint}`);
        process.exit(1);
    }

    const port: string = options.port ?? "3000";
    info(`Launching Remotion Studio on port ${port}...`);
    info(`  Entry: ${entryPoint}`);
    info(`  Props: ${propsPath}`);
    info(`  Public dir: ${projectRoot}`);

    const child = spawn("npx", [
        "remotion",
        "studio",
        entryPoint,
        "--props", propsPath,
        "--port", port,
        "--public-dir", projectRoot,
    ], {
        stdio: "inherit",
        cwd: process.cwd(),
    });

    child.on("error", (err) => {
        console.error(`Failed to launch Remotion Studio: ${err.constructor.name}: ${err.message}`);
        process.exit(1);
    });

    child.on("close", (code) => {
        process.exit(code ?? 0);
    });
}
