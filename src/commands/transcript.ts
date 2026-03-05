import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { resolveProjectRoot, getConfigPath } from "../util/fs-helpers.js";
import { loadVideoConfig } from "../parser/yaml-loader.js";
import { formatDiagnostics } from "../util/errors.js";
import { info, setVerbose, verbose as verboseLog } from "../util/logger.js";
import { slugify } from "../util/text-normalize.js";
import type { DiagnosticMessage } from "../util/errors.js";
import type { VideoConfig } from "../schema/types.js";
import type { ConvertedScene } from "../converter/segment-types.js";


export interface TranscriptOptions {
    project?: string;
    verbose?: boolean;
}


export interface TranscriptResult {
    success: boolean;
    diagnostics: DiagnosticMessage[];
    outputFiles: string[];
}


/**
 * A block in the transcript: either a speaker change or a text paragraph.
 */
interface TranscriptBlock {
    type: "speaker" | "text";
    sceneNum: number;
    voiceKey: string;
    displayName: string;
    actorNum: string;
    text: string;
}


/**
 * Capitalize the first letter of a voice key for display.
 */
function capitalizeVoiceKey(key: string): string {
    return key.charAt(0).toUpperCase() + key.slice(1);
}


/**
 * Convert Inworld emphasis markers (*word*) to HTML <em> tags.
 */
function emphasisToHtml(text: string): string {
    return text.replace(/\*([^*]+)\*/g, "<em>$1</em>");
}


/**
 * Escape special HTML characters in text content.
 */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}


/**
 * Build an HTML document from transcript blocks.
 */
function buildHtml(blocks: TranscriptBlock[], title: string): string {
    const lines: string[] = [];
    lines.push("<!DOCTYPE html>");
    lines.push("<html>");
    lines.push("<head>");
    lines.push(`    <meta charset="utf-8">`);
    lines.push(`    <title>${escapeHtml(title)} - Transcript</title>`);
    lines.push("    <!-- styles here are just for demonstration; the body is ready to cut and paste -->");
    lines.push("    <style>");
    lines.push("        body { font-family: sans-serif; max-width: 720px; margin: 2em auto; line-height: 1.6; }");
    lines.push("        .speaker-tag { font-weight: bold; text-transform: uppercase; margin-top: 1.5em; }");
    lines.push("        .scene-marker { font-size: 0.85em; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2em; }");
    lines.push("        .video-scene:first-child .scene-marker { margin-top: 0; }");
    lines.push("        .scene-body { margin-left: 1.5em; }");
    lines.push("    </style>");
    lines.push("</head>");
    lines.push("<body>");
    lines.push("<!-- copy from here down to get nicely style-friendly transcripts -->");

    let actorDivOpen: boolean = false;
    let sceneOpen: boolean = false;
    let currentSceneNum: number = -1;

    for (const block of blocks) {
        const sceneChanged: boolean = block.sceneNum !== currentSceneNum;

        if (sceneChanged) {
            if (actorDivOpen) {
                lines.push("            </div>");
                actorDivOpen = false;
            }
            if (sceneOpen) {
                lines.push("        </div>");
                lines.push("    </div>");
            }
            const parity: string = block.sceneNum % 2 !== 0 ? "odd" : "even";
            lines.push(`    <div class="video-scene scene-${parity} scene-${block.sceneNum}">`);
            lines.push(`        <div class="scene-marker">Scene ${block.sceneNum}</div>`);
            lines.push(`        <div class="scene-body">`);
            currentSceneNum = block.sceneNum;
            sceneOpen = true;
        }

        if (block.type === "speaker") {
            if (actorDivOpen) {
                lines.push("            </div>");
            }
            lines.push(`            <div class="actor-${block.actorNum} ${block.displayName}">`);
            lines.push(`                <div class="speaker-tag">${block.displayName}</div>`);
            actorDivOpen = true;
        } else {
            if (!actorDivOpen) {
                lines.push(`            <div class="actor-${block.actorNum} ${block.displayName}">`);
                actorDivOpen = true;
            }
            const htmlText: string = emphasisToHtml(escapeHtml(block.text));
            lines.push(`                <p>${htmlText}</p>`);
        }
    }

    if (actorDivOpen) {
        lines.push("            </div>");
    }
    if (sceneOpen) {
        lines.push("        </div>");
        lines.push("    </div>");
    }

    lines.push("</body>");
    lines.push("</html>");
    return lines.join("\n") + "\n";
}


/**
 * Build Markdown output from transcript blocks.
 */
function buildMarkdown(blocks: TranscriptBlock[]): string {
    const parts: string[] = [];
    let currentSceneNum: number = -1;
    let sceneOpen: boolean = false;

    for (const block of blocks) {
        if (block.sceneNum !== currentSceneNum) {
            if (sceneOpen) {
                parts.push("</div>\n</div>");
            }
            const parity: string = block.sceneNum % 2 !== 0 ? "odd" : "even";
            parts.push(
                `<div class="video-scene scene-${parity} scene-${block.sceneNum}">\n` +
                `<div class="scene-marker">Scene ${block.sceneNum}</div>\n` +
                `<div class="scene-body">`
            );
            currentSceneNum = block.sceneNum;
            sceneOpen = true;
        }

        if (block.type === "speaker") {
            parts.push(`<div class="speaker-tag actor-${block.actorNum} ${block.displayName}">${block.displayName}</div>`);
        } else {
            parts.push(block.text);
        }
    }

    if (sceneOpen) {
        parts.push("</div>\n</div>");
    }

    return parts.join("\n\n") + "\n";
}


/**
 * Run the transcript stage: generate speaker-attributed Markdown and HTML
 * transcripts from converted segment JSON files.
 */
export function runTranscript(
    config: VideoConfig,
    projectRoot: string,
): TranscriptResult {
    const diagnostics: DiagnosticMessage[] = [];
    const segmentsDir: string = join(projectRoot, "generated", "segments");

    if (!existsSync(segmentsDir)) {
        diagnostics.push({
            severity: "error",
            message: `Segments directory not found: ${segmentsDir}. Run convert first.`,
        });
        return { success: false, diagnostics, outputFiles: [] };
    }

    // Read and parse segment files
    const segmentFiles: string[] = readdirSync(segmentsDir)
        .filter((f) => f.endsWith(".json"))
        .sort();

    if (segmentFiles.length === 0) {
        diagnostics.push({
            severity: "error",
            message: `No segment JSON files found in ${segmentsDir}. Run convert first.`,
        });
        return { success: false, diagnostics, outputFiles: [] };
    }

    const scenes: ConvertedScene[] = [];
    for (const file of segmentFiles) {
        try {
            const content: string = readFileSync(join(segmentsDir, file), "utf-8");
            scenes.push(JSON.parse(content));
        } catch (e) {
            diagnostics.push({
                severity: "error",
                file: join(segmentsDir, file),
                message: `Failed to read segment file: ${(e as Error).constructor.name}: ${(e as Error).message}`,
            });
            return { success: false, diagnostics, outputFiles: [] };
        }
    }

    // Sort by sceneIndex
    scenes.sort((a, b) => a.sceneIndex - b.sceneIndex);

    // Build transcript blocks
    const actorOrder: string[] = [];
    let currentSpeaker: string | null = null;
    const blocks: TranscriptBlock[] = [];

    for (const scene of scenes) {
        const sceneNum: number = scene.sceneIndex + 1;
        for (const segment of scene.segments) {
            const voiceKey: string = segment.voiceId ?? scene.defaultVoice;
            const displayName: string = capitalizeVoiceKey(voiceKey);

            // Emit speaker block on first appearance or speaker change
            if (voiceKey !== currentSpeaker) {
                if (!actorOrder.includes(voiceKey)) {
                    actorOrder.push(voiceKey);
                }
                const actorNum: string = String(actorOrder.indexOf(voiceKey) + 1).padStart(2, "0");
                blocks.push({ type: "speaker", sceneNum, voiceKey, displayName, actorNum, text: "" });
                currentSpeaker = voiceKey;
            }

            const trimmedText: string = segment.text.trim();
            if (trimmedText) {
                const actorNum: string = String(actorOrder.indexOf(voiceKey) + 1).padStart(2, "0");
                blocks.push({ type: "text", sceneNum, voiceKey, displayName, actorNum, text: trimmedText });
            }
        }
    }

    // Write outputs to output/ (final consumer-facing artifacts)
    const outputDir: string = join(projectRoot, "output");
    mkdirSync(outputDir, { recursive: true });
    const slug: string = slugify(config.video.title);
    const outputFiles: string[] = [];

    // Markdown output (keeps *emphasis* markers as-is)
    const mdPath: string = join(outputDir, `${slug}_transcript.md`);
    writeFileSync(mdPath, buildMarkdown(blocks));
    outputFiles.push(mdPath);
    info(`  Wrote ${mdPath}`);

    // HTML output (converts *emphasis* to <em>, wraps in actor divs)
    const htmlPath: string = join(outputDir, `${slug}_transcript.html`);
    writeFileSync(htmlPath, buildHtml(blocks, config.video.title));
    outputFiles.push(htmlPath);
    info(`  Wrote ${htmlPath}`);

    verboseLog(`  ${scenes.length} scene(s), ${actorOrder.length} speaker(s), ${blocks.length} block(s)`);

    return {
        success: true,
        diagnostics,
        outputFiles,
    };
}


/**
 * CLI handler for `pocket-kubrick transcript`.
 */
export function transcriptCommand(options: TranscriptOptions): void {
    if (options.verbose) {
        setVerbose(true);
    }

    let projectRoot: string;
    try {
        projectRoot = resolveProjectRoot(options.project);
    } catch (e) {
        console.error((e as Error).message);
        process.exit(1);
    }

    const configPath: string = getConfigPath(projectRoot);
    const { config, diagnostics: loadDiags } = loadVideoConfig(configPath);

    if (!config) {
        console.error(formatDiagnostics(loadDiags));
        process.exit(1);
    }

    info(`Generating transcript for "${config.video.title}"...`);
    const result: TranscriptResult = runTranscript(config, projectRoot);

    if (result.diagnostics.length > 0) {
        console.error(formatDiagnostics(result.diagnostics));
    }

    if (result.success) {
        info("Transcript complete.");
        process.exit(0);
    } else {
        console.error("\nTranscript generation failed.");
        process.exit(1);
    }
}
