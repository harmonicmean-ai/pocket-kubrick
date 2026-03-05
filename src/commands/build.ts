import { runValidation } from "./validate.js";
import { runConversion } from "./convert.js";
import { runSynthesis } from "./synthesize.js";
import { runResolve } from "./resolve.js";
import { runRender } from "./render.js";
import { runTranscript } from "./transcript.js";
import { formatDiagnostics, hasErrors } from "../util/errors.js";
import { info, setVerbose, warn } from "../util/logger.js";
import type { DiagnosticMessage } from "../util/errors.js";
import type { ValidateOptions, ValidateResult } from "./validate.js";


export interface BuildOptions {
    project?: string;
    quality?: string;
    verbose?: boolean;
    cache?: boolean;
    from?: string;
    through?: string;
}


const STAGES: string[] = ["validate", "convert", "synthesize", "resolve", "render", "transcript"];


/**
 * CLI handler for `pocket-kubrick build`.
 * Chains: validate -> convert -> synthesize -> resolve -> render -> transcript.
 * Supports --from and --through flags for partial pipeline execution.
 */
export async function buildCommand(options: BuildOptions): Promise<void> {
    if (options.verbose) {
        setVerbose(true);
    }

    // Determine stage range
    const fromStage: string = options.from ?? "validate";
    const throughStage: string = options.through ?? "transcript";

    const fromIndex: number = STAGES.indexOf(fromStage);
    const throughIndex: number = STAGES.indexOf(throughStage);

    if (fromIndex === -1) {
        console.error(`Unknown stage: "${fromStage}". Valid stages: ${STAGES.join(", ")}`);
        process.exit(1);
    }
    if (throughIndex === -1) {
        console.error(`Unknown stage: "${throughStage}". Valid stages: ${STAGES.join(", ")}`);
        process.exit(1);
    }
    if (fromIndex > throughIndex) {
        console.error(`--from "${fromStage}" is after --through "${throughStage}". Nothing to do.`);
        process.exit(1);
    }

    const stagesToRun: string[] = STAGES.slice(fromIndex, throughIndex + 1);

    // Always run validate (it's cheap and catches config errors)
    if (!stagesToRun.includes("validate")) {
        stagesToRun.unshift("validate");
    }

    const totalSteps: number = stagesToRun.length;
    let step: number = 0;

    info(`Build pipeline: ${stagesToRun.join(" -> ")}`);

    // Step: Validate (always runs)
    if (stagesToRun.includes("validate")) {
        step++;
        info(`Step ${step}/${totalSteps}: Validating...`);
    }

    const validateOpts: ValidateOptions = {
        project: options.project,
        verbose: options.verbose,
    };
    const validateResult: ValidateResult = runValidation(validateOpts);

    if (validateResult.diagnostics.length > 0) {
        console.error(formatDiagnostics(validateResult.diagnostics));
    }

    if (!validateResult.success || !validateResult.config) {
        console.error("\nBuild aborted due to validation errors.");
        process.exit(1);
    }

    // Step: Convert
    if (stagesToRun.includes("convert")) {
        step++;
        info(`Step ${step}/${totalSteps}: Converting MD to segments...`);
        const convertResult = runConversion(validateResult.config, validateResult.projectRoot);

        if (convertResult.diagnostics.length > 0) {
            console.error(formatDiagnostics(convertResult.diagnostics));
        }

        if (!convertResult.success) {
            console.error("\nBuild aborted due to conversion errors.");
            process.exit(1);
        }

        info(`  Wrote ${convertResult.outputFiles.length} segment file(s).`);
    }

    // Step: Synthesize
    if (stagesToRun.includes("synthesize")) {
        step++;
        info(`Step ${step}/${totalSteps}: Synthesizing audio with Inworld TTS...`);
        const synthResult = await runSynthesis(
            validateResult.config,
            validateResult.projectRoot,
            { project: options.project, verbose: options.verbose, cache: options.cache },
        );

        if (synthResult.diagnostics.length > 0) {
            console.error(formatDiagnostics(synthResult.diagnostics));
        }

        if (!synthResult.success) {
            console.error("\nBuild aborted due to synthesis errors.");
            process.exit(1);
        }

        const totalApiCalls: number = synthResult.sceneResults.reduce((sum, r) => sum + r.apiCalls, 0);
        const totalCacheHits: number = synthResult.sceneResults.reduce((sum, r) => sum + r.cacheHits, 0);
        info(`  API calls: ${totalApiCalls}, Cache hits: ${totalCacheHits}`);
    }

    // Step: Resolve
    if (stagesToRun.includes("resolve")) {
        step++;
        info(`Step ${step}/${totalSteps}: Resolving timeline...`);
        const resolveResult = runResolve(validateResult.config, validateResult.projectRoot);

        if (resolveResult.diagnostics.length > 0) {
            console.error(formatDiagnostics(resolveResult.diagnostics));
        }

        if (!resolveResult.success) {
            console.error("\nBuild aborted due to resolve errors.");
            process.exit(1);
        }
    }

    // Step: Render
    if (stagesToRun.includes("render")) {
        step++;
        info(`Step ${step}/${totalSteps}: Rendering video...`);
        const renderResult = await runRender(
            validateResult.config,
            validateResult.projectRoot,
            { project: options.project, verbose: options.verbose, quality: options.quality },
        );

        if (renderResult.diagnostics.length > 0) {
            console.error(formatDiagnostics(renderResult.diagnostics));
        }

        if (!renderResult.success) {
            console.error("\nBuild aborted due to render errors.");
            process.exit(1);
        }

        info(`  Wrote ${renderResult.outputFiles.length} output file(s).`);
    }

    // Step: Transcript
    if (stagesToRun.includes("transcript")) {
        step++;
        info(`Step ${step}/${totalSteps}: Generating transcript...`);
        const transcriptResult = runTranscript(validateResult.config, validateResult.projectRoot);

        if (transcriptResult.diagnostics.length > 0) {
            console.error(formatDiagnostics(transcriptResult.diagnostics));
        }

        if (!transcriptResult.success) {
            console.error("\nBuild aborted due to transcript errors.");
            process.exit(1);
        }
    }

    info("\nBuild complete.");
    process.exit(0);
}
