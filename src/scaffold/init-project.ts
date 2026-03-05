import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { starterYaml, scaffoldDirName } from "./templates.js";
import { getProjectsBaseDir } from "../util/fs-helpers.js";
import { info } from "../util/logger.js";


/**
 * Scaffold a new pocket-kubrick project directory.
 */
export function initProject(title: string, parentDir: string): string {
    const dirName: string = scaffoldDirName(title);
    const projectRoot: string = join(parentDir, getProjectsBaseDir(), dirName);

    if (existsSync(projectRoot)) {
        throw new Error(`Directory already exists: ${projectRoot}`);
    }

    // Create directory structure
    const dirs: string[] = [
        projectRoot,
        join(projectRoot, "inbox", "assets", "screenshots"),
        join(projectRoot, "inbox", "assets", "icons"),
        join(projectRoot, "inbox", "assets", "overlays"),
        join(projectRoot, "generated", "segments"),
        join(projectRoot, "generated", "audio"),
        join(projectRoot, ".pocket-kubrick", "cache"),
        join(projectRoot, ".pocket-kubrick", "history"),
    ];

    for (const dir of dirs) {
        mkdirSync(dir, { recursive: true });
    }

    // Write starter files
    writeFileSync(join(projectRoot, "video-config.yaml"), starterYaml(title));

    info(`Created project: ${projectRoot}`);
    info("Next steps:");
    info("  1. Edit the script text in video-config.yaml to write your narration");
    info("  2. Add screenshots to inbox/assets/screenshots/");
    info("  3. Edit video-config.yaml to define visual events");
    info("  4. Run: pocket-kubrick validate --project " + projectRoot);

    return projectRoot;
}
