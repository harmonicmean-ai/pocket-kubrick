import type { VideoConfig } from "../schema/types.js";
import type { DiagnosticMessage } from "../util/errors.js";


/**
 * Check a record's string values for unknown $variable theme references.
 */
function validateThemeRefs(
    record: Record<string, unknown>,
    prefix: string,
    validRefs: Set<string>,
    diagnostics: DiagnosticMessage[],
): void {
    for (const [key, value] of Object.entries(record)) {
        if (typeof value === "string" && value.startsWith("$")) {
            // Allow $accent with opacity suffix like "$accent20"
            const baseRef: string = "$" + value.slice(1).replace(/[0-9a-fA-F]+$/, "");
            if (!validRefs.has(baseRef)) {
                diagnostics.push({
                    severity: "error",
                    message: `${prefix}.${key}: Unknown theme reference "${value}". Valid references: ${[...validRefs].join(", ")}`,
                });
            }
        }
    }
}


/**
 * Validate schema-level constraints that Zod doesn't catch
 * (e.g., $variable references in color fields resolve to defined theme keys).
 */
export function validateSchema(config: VideoConfig): DiagnosticMessage[] {
    const diagnostics: DiagnosticMessage[] = [];
    const validThemeRefs: Set<string> = new Set(["$background", "$accent", "$font"]);

    for (const [sceneIndex, scene] of config.scenes.entries()) {
        for (const [visualIndex, visual] of scene.visuals.entries()) {
            const prefix: string = `scenes[${sceneIndex}].visuals[${visualIndex}]`;
            const record: Record<string, unknown> = visual as Record<string, unknown>;

            validateThemeRefs(record, prefix, validThemeRefs, diagnostics);

            // Recurse into children arrays on screenshot visuals
            if (record.type === "screenshot" && Array.isArray(record.children)) {
                for (const [childIndex, child] of (record.children as Record<string, unknown>[]).entries()) {
                    const childPrefix: string = `${prefix}.children[${childIndex}]`;

                    // Children must not be type screenshot
                    if (child.type === "screenshot") {
                        diagnostics.push({
                            severity: "error",
                            message: `${childPrefix}: Children must not be type "screenshot".`,
                        });
                        continue;
                    }

                    validateThemeRefs(child, childPrefix, validThemeRefs, diagnostics);
                }
            }
        }
    }

    return diagnostics;
}
