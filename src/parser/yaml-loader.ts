import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { z } from "zod/v4";
import { VideoConfigSchema } from "../schema/video-config.js";
import type { VideoConfig } from "../schema/types.js";
import type { DiagnosticMessage } from "../util/errors.js";


export interface YamlLoadResult {
    config: VideoConfig | null;
    diagnostics: DiagnosticMessage[];
}


export function loadVideoConfig(yamlPath: string): YamlLoadResult {
    const diagnostics: DiagnosticMessage[] = [];

    let rawContent: string;
    try {
        rawContent = readFileSync(yamlPath, "utf-8");
    } catch (e) {
        diagnostics.push({
            severity: "error",
            file: yamlPath,
            message: `Cannot read file: ${(e as Error).constructor.name}: ${(e as Error).message}`,
        });
        return { config: null, diagnostics };
    }

    let parsed: unknown;
    try {
        parsed = yaml.load(rawContent);
    } catch (e) {
        diagnostics.push({
            severity: "error",
            file: yamlPath,
            message: `YAML parse error: ${(e as Error).constructor.name}: ${(e as Error).message}`,
        });
        return { config: null, diagnostics };
    }

    const result = VideoConfigSchema.safeParse(parsed);
    if (!result.success) {
        const issues: z.core.$ZodIssue[] = result.error.issues;
        for (const issue of issues) {
            const path: string = issue.path.join(".");
            diagnostics.push({
                severity: "error",
                file: yamlPath,
                message: `Validation error at "${path}": ${issue.message}`,
            });
        }
        return { config: null, diagnostics };
    }

    return { config: result.data, diagnostics };
}
