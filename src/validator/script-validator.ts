import type { VideoConfig } from "../schema/types.js";
import type { DiagnosticMessage } from "../util/errors.js";
import { sceneLabel } from "../util/scene-label.js";


const BRACKET_DIRECTIVE_PATTERN: RegExp = /\[(pause|rate|pitch|voice|say-as|sub)\s+([^\]]*)\]/g;
const BRACKET_CLOSING_PATTERN: RegExp = /\[\/(rate|pitch|voice|say-as|sub)\]/g;
const CODE_BLOCK_PATTERN: RegExp = /^```/gm;


/**
 * Validate that all scene scripts are well-formed.
 */
export function validateScripts(config: VideoConfig): DiagnosticMessage[] {
    const diagnostics: DiagnosticMessage[] = [];

    for (const [sceneIndex, scene] of config.scenes.entries()) {
        const label: string = sceneLabel(scene, sceneIndex);
        const content: string = scene.script;

        // Check for code blocks (warning)
        const codeBlocks: RegExpMatchArray | null = content.match(CODE_BLOCK_PATTERN);
        if (codeBlocks && codeBlocks.length >= 2) {
            diagnostics.push({
                severity: "warning",
                file: label,
                message: `Scene ${sceneIndex}: Script contains code blocks (triple backticks). Code blocks are skipped during narration.`,
                suggestion: "Remove code blocks or move them to a separate reference file.",
            });
        }

        // Validate bracket directive syntax
        validateBracketDirectives(content, label, sceneIndex, diagnostics);
    }

    return diagnostics;
}


function validateBracketDirectives(
    content: string,
    scriptFile: string,
    sceneIndex: number,
    diagnostics: DiagnosticMessage[],
): void {
    // Collect opening directives (excluding [pause] which is self-closing)
    const openingTags: string[] = [];
    let match: RegExpExecArray | null;

    const openPattern: RegExp = new RegExp(BRACKET_DIRECTIVE_PATTERN.source, "g");
    while ((match = openPattern.exec(content)) !== null) {
        const directive: string = match[1];
        if (directive !== "pause") {
            openingTags.push(directive);
        }
    }

    // Collect closing directives
    const closingTags: string[] = [];
    const closePattern: RegExp = new RegExp(BRACKET_CLOSING_PATTERN.source, "g");
    while ((match = closePattern.exec(content)) !== null) {
        closingTags.push(match[1]);
    }

    // Check for unmatched opening tags
    for (const tag of openingTags) {
        const openCount: number = openingTags.filter((t) => t === tag).length;
        const closeCount: number = closingTags.filter((t) => t === tag).length;
        if (openCount > closeCount) {
            diagnostics.push({
                severity: "error",
                file: scriptFile,
                message: `Scene ${sceneIndex}: Unclosed bracket directive [${tag}] — expected [/${tag}]`,
            });
            break;
        }
    }

    // Check for unmatched closing tags
    for (const tag of closingTags) {
        const openCount: number = openingTags.filter((t) => t === tag).length;
        const closeCount: number = closingTags.filter((t) => t === tag).length;
        if (closeCount > openCount) {
            diagnostics.push({
                severity: "error",
                file: scriptFile,
                message: `Scene ${sceneIndex}: Closing directive [/${tag}] without matching opening [${tag}]`,
            });
            break;
        }
    }
}
