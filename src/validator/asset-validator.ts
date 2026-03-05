import { resolve } from "node:path";
import { resolveAssetPath } from "../util/fs-helpers.js";
import type { VideoConfig } from "../schema/types.js";
import type { DiagnosticMessage } from "../util/errors.js";


const IMAGE_EXTENSIONS: Set<string> = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);


/**
 * Validate that all referenced asset files exist.
 * Phase 1 stub: checks file existence only (no image dimension validation).
 */
export function validateAssets(config: VideoConfig, projectRoot: string): DiagnosticMessage[] {
    const diagnostics: DiagnosticMessage[] = [];

    for (const [sceneIndex, scene] of config.scenes.entries()) {
        for (const [visualIndex, visual] of scene.visuals.entries()) {
            const record: Record<string, unknown> = visual as Record<string, unknown>;
            const src: unknown = record.src;

            if (typeof src !== "string") {
                continue;
            }

            const resolved: string | null = resolveAssetPath(projectRoot, src);
            if (!resolved) {
                const expectedAt: string = resolve(projectRoot, "inbox", "assets", src);
                diagnostics.push({
                    severity: "error",
                    file: `inbox/assets/${src}`,
                    message: `Scene ${sceneIndex}, visual ${visualIndex}: Asset file not found: ${src}`,
                    suggestion: `Expected at: ${expectedAt}`,
                });
                continue;
            }

            // Verify file extension is a supported image type
            const ext: string = src.toLowerCase().slice(src.lastIndexOf("."));
            if (!IMAGE_EXTENSIONS.has(ext)) {
                diagnostics.push({
                    severity: "warning",
                    file: resolved,
                    message: `Scene ${sceneIndex}, visual ${visualIndex}: Asset "${src}" has unsupported extension "${ext}". Supported: ${[...IMAGE_EXTENSIONS].join(", ")}`,
                });
            }
        }
    }

    return diagnostics;
}
