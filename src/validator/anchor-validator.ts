import type { VideoConfig } from "../schema/types.js";
import type { DiagnosticMessage } from "../util/errors.js";
import { collectStringAnchors } from "../util/collect-anchors.js";
import { normalizeAnchor } from "../util/text-normalize.js";
import { sceneLabel } from "../util/scene-label.js";


/**
 * Validate that all string `at` anchors in visual events can be found
 * in the corresponding scene's Markdown script text.
 */
export function validateAnchors(config: VideoConfig): DiagnosticMessage[] {
    const diagnostics: DiagnosticMessage[] = [];

    for (const [sceneIndex, scene] of config.scenes.entries()) {
        const anchors: string[] = collectStringAnchors(scene.visuals);
        if (anchors.length === 0) {
            continue;
        }

        const label: string = sceneLabel(scene, sceneIndex);

        // Check for duplicate anchor names within a scene
        const anchorCounts: Map<string, number> = new Map();
        for (const anchor of anchors) {
            anchorCounts.set(anchor, (anchorCounts.get(anchor) ?? 0) + 1);
        }
        for (const [anchor, count] of anchorCounts) {
            if (count > 1) {
                diagnostics.push({
                    severity: "warning",
                    message: `Scene ${sceneIndex}: Anchor "${anchor}" is used ${count} times. Each will get a unique mark (${anchor}, ${anchor}-2, etc.)`,
                });
            }
        }

        const content: string = scene.script;
        const normalizedContent: string = content.toLowerCase();

        // Check each unique anchor
        const uniqueAnchors: Set<string> = new Set(anchors);
        for (const anchor of uniqueAnchors) {
            const searchText: string = normalizeAnchor(anchor);
            const firstIndex: number = normalizedContent.indexOf(searchText);

            if (firstIndex === -1) {
                diagnostics.push({
                    severity: "error",
                    file: label,
                    message: `Scene ${sceneIndex}: Anchor "${anchor}" not found in script text.`,
                    suggestion: `Searched for "${searchText}" (case-insensitive). Check that the anchor text appears in the narration.`,
                });
                continue;
            }

            // Check for ambiguous matches (anchor text appears more than once)
            const secondIndex: number = normalizedContent.indexOf(searchText, firstIndex + 1);
            if (secondIndex !== -1) {
                diagnostics.push({
                    severity: "warning",
                    file: label,
                    message: `Scene ${sceneIndex}: Anchor "${anchor}" matches multiple locations in script. The first occurrence will be used.`,
                });
            }
        }
    }

    return diagnostics;
}
