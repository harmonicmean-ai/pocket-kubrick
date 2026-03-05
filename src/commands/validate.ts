import { loadVideoConfig } from "../parser/yaml-loader.js";
import { validateSchema } from "../validator/schema-validator.js";
import { validateScripts } from "../validator/script-validator.js";
import { validateVoices } from "../validator/voice-validator.js";
import { validateAnchors } from "../validator/anchor-validator.js";
import { validateAssets } from "../validator/asset-validator.js";
import { resolveProjectRoot, getConfigPath } from "../util/fs-helpers.js";
import { formatDiagnostics, hasErrors } from "../util/errors.js";
import { info, setVerbose } from "../util/logger.js";
import type { DiagnosticMessage } from "../util/errors.js";
import type { VideoConfig } from "../schema/types.js";


export interface ValidateOptions {
    project?: string;
    verbose?: boolean;
}


export interface ValidateResult {
    success: boolean;
    diagnostics: DiagnosticMessage[];
    config: VideoConfig | null;
    projectRoot: string;
}


/**
 * Run all validators and return aggregated diagnostics.
 * Used by both the `validate` command and the `build` command.
 */
export function runValidation(options: ValidateOptions): ValidateResult {
    if (options.verbose) {
        setVerbose(true);
    }

    let projectRoot: string;
    try {
        projectRoot = resolveProjectRoot(options.project);
    } catch (e) {
        return {
            success: false,
            diagnostics: [{
                severity: "error",
                message: (e as Error).message,
            }],
            config: null,
            projectRoot: options.project ?? process.cwd(),
        };
    }

    const configPath: string = getConfigPath(projectRoot);
    info(`Validating project at ${projectRoot}`);

    // Load and parse YAML
    const { config, diagnostics: loadDiags } = loadVideoConfig(configPath);
    const allDiagnostics: DiagnosticMessage[] = [...loadDiags];

    if (!config) {
        return {
            success: false,
            diagnostics: allDiagnostics,
            config: null,
            projectRoot,
        };
    }

    // Run all validators, collecting all errors
    allDiagnostics.push(...validateSchema(config));
    allDiagnostics.push(...validateScripts(config));
    allDiagnostics.push(...validateVoices(config));
    allDiagnostics.push(...validateAnchors(config));
    allDiagnostics.push(...validateAssets(config, projectRoot));

    const success: boolean = !hasErrors(allDiagnostics);

    return {
        success,
        diagnostics: allDiagnostics,
        config,
        projectRoot,
    };
}


/**
 * CLI handler for `pocket-kubrick validate`.
 */
export function validateCommand(options: ValidateOptions): void {
    const result: ValidateResult = runValidation(options);

    if (result.diagnostics.length > 0) {
        console.error(formatDiagnostics(result.diagnostics));
    }

    if (result.success) {
        info("Validation passed.");
        process.exit(0);
    } else {
        process.exit(1);
    }
}
