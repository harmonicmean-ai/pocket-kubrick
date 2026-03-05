import { exec } from "node:child_process";
import { resolveProjectRoot, getConfigPath } from "../util/fs-helpers.js";
import { loadVideoConfig } from "../parser/yaml-loader.js";
import { formatDiagnostics } from "../util/errors.js";
import { info, setVerbose } from "../util/logger.js";
import { createComposeServer } from "../compose/server.js";
import { ensureComposeSharedBundle } from "../compose/build-shared.js";


export interface ComposeOptions {
    project?: string;
    scene?: string;
    port?: string;
    verbose?: boolean;
}


/**
 * CLI handler for `pocket-kubrick compose`.
 * Launches a local web-based visual annotation editor.
 */
export async function composeCommand(options: ComposeOptions): Promise<void> {
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

    await ensureComposeSharedBundle();

    const port: string = options.port ?? "4400";
    const app = createComposeServer(config, projectRoot);

    const server = app.listen(parseInt(port, 10), () => {
        const url: string = `http://localhost:${port}`;
        const sceneParam: string = options.scene ? `?scene=${options.scene}` : "";
        info(`Compose editor running at ${url}${sceneParam}`);
        info("Press Ctrl+C to stop.");

        exec(`open "${url}${sceneParam}"`);
    });

    process.on("SIGINT", () => {
        info("\nShutting down compose editor...");
        server.close();
        process.exit(0);
    });
}
