import { initProject } from "../scaffold/init-project.js";
import { setVerbose } from "../util/logger.js";


export interface InitOptions {
    verbose?: boolean;
}


/**
 * CLI handler for `pocket-kubrick init <title>`.
 */
export function initCommand(title: string, options: InitOptions): void {
    if (options.verbose) {
        setVerbose(true);
    }

    try {
        initProject(title, process.cwd());
        process.exit(0);
    } catch (e) {
        console.error(`${(e as Error).constructor.name}: ${(e as Error).message}`);
        process.exit(1);
    }
}
