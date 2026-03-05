import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";


const CONFIG_FILENAME: string = "video-config.yaml";
const REMOTION_ENTRY: string = join("src", "remotion", "index.ts");
const DEFAULT_PROJECTS_DIR: string = "projects";


/**
 * Return the effective base directory for project lookups.
 * Uses PROJECT_ROOT from the environment if set, otherwise falls back
 * to the default "projects" directory.
 */
export function getProjectsBaseDir(): string {
    return process.env.PROJECT_ROOT || DEFAULT_PROJECTS_DIR;
}


/**
 * Find the project root by walking up from the given directory
 * until we find a video-config.yaml file.
 * Returns null if not found.
 */
export function findProjectRoot(startDir: string): string | null {
    let current: string = resolve(startDir);
    const root: string = dirname(current);

    while (true) {
        if (existsSync(join(current, CONFIG_FILENAME))) {
            return current;
        }
        const parent: string = dirname(current);
        if (parent === current || parent === root) {
            // Check root as well
            if (existsSync(join(current, CONFIG_FILENAME))) {
                return current;
            }
            break;
        }
        current = parent;
    }

    return null;
}


/**
 * Resolve the project root from an explicit path or by walking up from cwd.
 */
export function resolveProjectRoot(explicitPath?: string): string {
    if (explicitPath) {
        // Bare name (no separators) → look under the configured base directory.
        // Anything else (absolute, or contains / or ..) → resolve as-is.
        const isBare: boolean = !explicitPath.includes("/") && !explicitPath.includes("\\") && !explicitPath.startsWith(".");
        const projectRoot: string = isBare
            ? resolve(getProjectsBaseDir(), explicitPath)
            : resolve(explicitPath);
        if (existsSync(join(projectRoot, CONFIG_FILENAME))) {
            return projectRoot;
        }
        throw new Error(`No ${CONFIG_FILENAME} found at ${projectRoot}`);
    }

    const found: string | null = findProjectRoot(process.cwd());
    if (!found) {
        throw new Error(
            `No ${CONFIG_FILENAME} found in current directory or any parent. ` +
            `Run "pocket-kubrick init <title>" to create a new project, or use --project <path>.`
        );
    }
    return found;
}


/**
 * Walk up from a starting directory to find the nearest directory
 * containing a package.json, i.e. the package root.
 */
export function resolvePackageRoot(startDir: string): string {
    let dir: string = resolve(startDir);
    while (true) {
        if (existsSync(join(dir, "package.json"))) {
            return dir;
        }
        const parent: string = dirname(dir);
        if (parent === dir) {
            throw new Error("Could not find package root (no package.json found)");
        }
        dir = parent;
    }
}


/**
 * Resolve the Remotion entry point (src/remotion/index.ts) relative
 * to the package root. Works whether running from source or a bundle.
 */
export function resolveRemotionEntryPoint(startDir: string): string {
    const pkgRoot: string = resolvePackageRoot(startDir);
    const entryPoint: string = join(pkgRoot, REMOTION_ENTRY);
    return entryPoint;
}


/**
 * Get the path to the video-config.yaml config file.
 */
export function getConfigPath(projectRoot: string): string {
    return join(projectRoot, CONFIG_FILENAME);
}


/**
 * Resolve a bare asset filename to its relative path under inbox/assets/.
 * Checks inbox/assets/ directly first, then searches immediate subdirectories
 * (screenshots/, icons/, overlays/). Returns the relative path from the
 * project root (e.g. "inbox/assets/screenshots/foo.png"), or null if not found.
 */
export function resolveAssetPath(projectRoot: string, src: string): string | null {
    const assetsDir: string = join(projectRoot, "inbox", "assets");

    // Already a relative path with subdirectory?
    if (existsSync(join(assetsDir, src))) {
        return join("inbox", "assets", src);
    }

    // Search immediate subdirectories
    try {
        const subdirs: string[] = readdirSync(assetsDir, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name);

        for (const subdir of subdirs) {
            if (existsSync(join(assetsDir, subdir, src))) {
                return join("inbox", "assets", subdir, src);
            }
        }
    } catch {
        // assets dir may not exist
    }

    return null;
}


/**
 * Build a locale-based timestamp string for use in output filenames.
 * Format: YYYY-MM-DD_HHmm (e.g. "2026-03-01_1430")
 */
export function localTimestamp(): string {
    const now: Date = new Date();
    const yyyy: number = now.getFullYear();
    const mm: string = String(now.getMonth() + 1).padStart(2, "0");
    const dd: string = String(now.getDate()).padStart(2, "0");
    const hh: string = String(now.getHours()).padStart(2, "0");
    const min: string = String(now.getMinutes()).padStart(2, "0");
    const ss: string = String(now.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}_${hh}${min}`;
}
