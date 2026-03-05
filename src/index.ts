import "dotenv/config";
import { Command } from "commander";
import { validateCommand } from "./commands/validate.js";
import { convertCommand } from "./commands/convert.js";
import { synthesizeCommand } from "./commands/synthesize.js";
import { buildCommand } from "./commands/build.js";
import { initCommand } from "./commands/init.js";
import { resolveCommand } from "./commands/resolve.js";
import { renderCommand } from "./commands/render.js";
import { previewCommand } from "./commands/preview.js";
import { combineCommand } from "./commands/combine.js";
import { keyframesCommand } from "./commands/keyframes.js";
import { composeCommand } from "./commands/compose.js";
import { transcriptCommand } from "./commands/transcript.js";
import type { ValidateOptions } from "./commands/validate.js";
import type { ConvertOptions } from "./commands/convert.js";
import type { SynthesizeOptions } from "./commands/synthesize.js";
import type { BuildOptions } from "./commands/build.js";
import type { InitOptions } from "./commands/init.js";
import type { ResolveOptions } from "./commands/resolve.js";
import type { RenderOptions } from "./commands/render.js";
import type { PreviewOptions } from "./commands/preview.js";
import type { CombineOptions } from "./commands/combine.js";
import type { KeyframesOptions } from "./commands/keyframes.js";
import type { ComposeOptions } from "./commands/compose.js";
import type { TranscriptOptions } from "./commands/transcript.js";


const program: Command = new Command();

program
    .name("pocket-kubrick")
    .description("Automated screencast video producer")
    .version("0.1.0");

program
    .command("init <title>")
    .description("Scaffold a new video project")
    .option("--verbose", "Verbose logging")
    .action((title: string, options: InitOptions) => {
        initCommand(title, options);
    });

program
    .command("validate")
    .description("Validate YAML, scripts, assets, and voice config")
    .option("--project <path>", "Path to project root")
    .option("--verbose", "Verbose logging")
    .action((options: ValidateOptions) => {
        validateCommand(options);
    });

program
    .command("convert")
    .description("Convert Markdown scripts to TTS segments")
    .option("--project <path>", "Path to project root")
    .option("--verbose", "Verbose logging")
    .action((options: ConvertOptions) => {
        convertCommand(options);
    });

program
    .command("synthesize")
    .description("Synthesize audio from converted segments using Inworld TTS")
    .option("--project <path>", "Path to project root")
    .option("--verbose", "Verbose logging")
    .option("--no-cache", "Disable TTS response cache")
    .action((options: SynthesizeOptions) => {
        synthesizeCommand(options);
    });

program
    .command("resolve")
    .description("Build timeline.json from config + audio artifacts")
    .option("--project <path>", "Path to project root")
    .option("--verbose", "Verbose logging")
    .action((options: ResolveOptions) => {
        resolveCommand(options);
    });

program
    .command("render")
    .description("Render video from timeline.json using Remotion")
    .option("--project <path>", "Path to project root")
    .option("--quality <preset>", "Override quality: draft | standard | high")
    .option("--verbose", "Verbose logging")
    .action((options: RenderOptions) => {
        renderCommand(options);
    });

program
    .command("transcript")
    .description("Generate a speaker-attributed Markdown transcript from converted segments")
    .option("--project <path>", "Path to project root")
    .option("--verbose", "Verbose logging")
    .action((options: TranscriptOptions) => {
        transcriptCommand(options);
    });

program
    .command("preview")
    .description("Open Remotion Studio for interactive preview")
    .option("--project <path>", "Path to project root")
    .option("--port <port>", "Port for Remotion Studio", "3000")
    .option("--verbose", "Verbose logging")
    .action((options: PreviewOptions) => {
        previewCommand(options);
    });

program
    .command("build")
    .description("Run the full pipeline (validate -> convert -> synthesize -> resolve -> render -> transcript)")
    .option("--project <path>", "Path to project root")
    .option("--quality <preset>", "Override quality: draft | standard | high")
    .option("--verbose", "Verbose logging")
    .option("--no-cache", "Disable TTS response cache")
    .option("--from <stage>", "Start from this stage (validate|convert|synthesize|resolve|render|transcript)")
    .option("--through <stage>", "Stop after this stage (validate|convert|synthesize|resolve|render|transcript)")
    .action((options: BuildOptions) => {
        buildCommand(options);
    });

program
    .command("combine <sources...>")
    .description("Combine two or more source videos into one (must match dimensions, FPS, codec)")
    .option("--output-dir <path>", "Output directory (default: current directory)")
    .option("--filename <name>", "Output filename without extension (default: combined-video-{timestamp})")
    .option("--verbose", "Verbose logging")
    .action((sources: string[], options: CombineOptions) => {
        combineCommand(sources, options);
    });

program
    .command("keyframes")
    .description("Generate progressive keyframe PNGs showing cumulative annotation build-up per scene")
    .option("--project <path>", "Path to project root")
    .option("--verbose", "Verbose logging")
    .action((options: KeyframesOptions) => {
        keyframesCommand(options);
    });

program
    .command("compose")
    .description("Open visual annotation editor for positioning annotations on screenshots")
    .option("--project <path>", "Path to project root")
    .option("--scene <index>", "Jump to scene by 1-based index")
    .option("--port <port>", "Port for editor server", "4400")
    .option("--verbose", "Verbose logging")
    .action((options: ComposeOptions) => {
        void composeCommand(options);
    });

program
    .command("clean")
    .description("Remove generated/ directory (not yet implemented)")
    .action(() => {
        console.error("Not yet implemented");
        process.exit(1);
    });

program.parse();
