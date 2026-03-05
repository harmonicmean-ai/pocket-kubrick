/**
 * Core Markdown-to-segments converter.
 *
 * Pipeline:
 * 1. Pre-process bracket directives into placeholders
 * 2. Parse Markdown with remark
 * 3. Walk AST and emit plain text with placeholders
 * 4. Restore placeholders to structured tokens
 * 5. Split text into ScriptSegment[] based on tokens and paragraph breaks
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import { preProcessDirectives, restorePlaceholders, PH_START, PH_END } from "./bracket-directives.js";
import {
    TOKEN_PAUSE,
    TOKEN_VOICE_START,
    TOKEN_VOICE_END,
    TOKEN_RATE_START,
    TOKEN_RATE_END,
} from "./bracket-directives.js";
import { splitSentences } from "./sentence-splitter.js";
import type { SentenceSegment } from "./sentence-splitter.js";
import type { ScriptSegment } from "./segment-types.js";
import type { DiagnosticMessage } from "../util/errors.js";
import type { Root, Content, Text, Emphasis, Strong, InlineCode, Blockquote, ThematicBreak, Paragraph, Heading } from "mdast";


export interface ConvertOptions {
    /** Configurable thematic break pause in ms. Default: 1000 */
    thematicBreakMs?: number;
    /** Configurable paragraph break pause in ms. Default: 700 */
    paragraphBreakMs?: number;
    /** Configurable line break pause in ms. Default: 400 */
    lineBreakMs?: number;
}


export interface ConvertResult {
    segments: ScriptSegment[];
    diagnostics: DiagnosticMessage[];
}


const DEFAULT_OPTIONS: Required<ConvertOptions> = {
    thematicBreakMs: 1000,
    paragraphBreakMs: 700,
    lineBreakMs: 400,
};


/**
 * Segment break sentinel used internally during AST walking.
 * Format: \uE003BREAK:durationMs\uE003
 */
const BREAK_SENTINEL_CHAR: string = "\uE003";


function makeBreakSentinel(durationMs: number): string {
    return `${BREAK_SENTINEL_CHAR}BREAK:${durationMs}${BREAK_SENTINEL_CHAR}`;
}


/**
 * Convert a Markdown script to an array of ScriptSegments.
 */
export function convertMarkdownToSegments(markdown: string, options?: ConvertOptions): ConvertResult {
    const opts: Required<ConvertOptions> = { ...DEFAULT_OPTIONS, ...options };
    const diagnostics: DiagnosticMessage[] = [];

    // Step 1: Pre-process bracket directives
    const { text: preprocessed, placeholders, diagnostics: directiveDiags } = preProcessDirectives(markdown);
    diagnostics.push(...directiveDiags);

    // Step 2: Parse with remark
    const tree: Root = unified()
        .use(remarkParse)
        .parse(preprocessed);

    // Step 3: Walk AST and produce plain text with break sentinels
    const textParts: string[] = [];
    const children: Content[] = tree.children;

    for (let i = 0; i < children.length; i++) {
        const node: Content = children[i];

        // Insert paragraph breaks between block-level nodes (not before the first)
        if (i > 0 && node.type !== "thematicBreak") {
            textParts.push(makeBreakSentinel(opts.paragraphBreakMs));
        }

        const result: string = processBlockNode(node, opts);
        if (result) {
            textParts.push(result);
        }
    }

    const rawText: string = textParts.join("");

    // Step 4: Restore placeholders to structured tokens
    const restored: string = restorePlaceholders(rawText, placeholders);

    // Step 5: Split into segments based on tokens and break sentinels
    const segments: ScriptSegment[] = splitIntoSegments(restored);

    // Filter out empty segments
    const nonEmpty: ScriptSegment[] = segments.filter((s) => s.text.trim().length > 0 || s.pauseAfterMs !== undefined);

    return { segments: nonEmpty, diagnostics };
}


function processBlockNode(node: Content, opts: Required<ConvertOptions>): string {
    switch (node.type) {
        case "paragraph":
            return processParagraph(node as Paragraph, opts);
        case "heading":
            return processParagraph(node as Heading, opts);
        case "thematicBreak":
            return makeBreakSentinel(opts.thematicBreakMs);
        case "blockquote":
            return processBlockquote(node as Blockquote, opts);
        case "code":
            // Code blocks are skipped (handled at validation stage)
            return "";
        default:
            return "";
    }
}


function processParagraph(node: Paragraph | Heading, opts: Required<ConvertOptions>): string {
    return processInlineNodes(node.children, opts);
}


function processBlockquote(node: Blockquote, opts: Required<ConvertOptions>): string {
    // Flatten to plain text (no prosody control in Inworld)
    const innerParts: string[] = [];
    for (const child of node.children) {
        const result: string = processBlockNode(child, opts);
        if (result) {
            innerParts.push(result);
        }
    }
    return innerParts.join("");
}


function processInlineNodes(nodes: Content[], opts: Required<ConvertOptions>): string {
    const parts: string[] = [];

    for (const node of nodes) {
        parts.push(processInlineNode(node, opts));
    }

    return parts.join("");
}


function processInlineNode(node: Content, opts: Required<ConvertOptions>): string {
    switch (node.type) {
        case "text":
            return processTextNode(node as Text);

        case "emphasis":
            // Markdown *emphasis* -> Inworld *emphasis* (same syntax)
            return `*${processInlineNodes((node as Emphasis).children, opts)}*`;

        case "strong":
            // Markdown **strong** -> downgrade to Inworld *emphasis*
            return `*${processInlineNodes((node as Strong).children, opts)}*`;

        case "inlineCode":
            // Spell out characters with spaces: `API` -> "A P I"
            return (node as InlineCode).value.split("").join(" ");

        case "break":
            return makeBreakSentinel(opts.lineBreakMs);

        case "html":
            // Strip raw HTML (no SSML passthrough needed)
            return "";

        default:
            return "";
    }
}


function processTextNode(node: Text): string {
    // Keep text as-is. Ellipsis and em-dashes produce natural pauses in Inworld.
    return node.value;
}


/**
 * Split a single string containing break sentinels and delimited directive tokens
 * into an array of ScriptSegments.
 *
 * Tokens from bracket directives are wrapped in PH_START/PH_END delimiters:
 *   \uE001TOKEN_NAME:value\uE002
 * Break sentinels use a separate delimiter:
 *   \uE003BREAK:durationMs\uE003
 */
function splitIntoSegments(text: string): ScriptSegment[] {
    const segments: ScriptSegment[] = [];
    const esc = escapeRegex;

    // Collect all tokens with their positions
    const allTokens: Array<{ index: number; length: number; type: string; value: string }> = [];

    // Find break sentinels: \uE003BREAK:durationMs\uE003
    const breakRe: RegExp = new RegExp(
        `${esc(BREAK_SENTINEL_CHAR)}BREAK:(\\d+)${esc(BREAK_SENTINEL_CHAR)}`,
        "g",
    );
    let match: RegExpExecArray | null;
    while ((match = breakRe.exec(text)) !== null) {
        allTokens.push({ index: match.index, length: match[0].length, type: "break", value: match[1] });
    }

    // Find delimited directive tokens: \uE001TOKEN:value\uE002
    const delimitedRe: RegExp = new RegExp(
        `${esc(PH_START)}([^${esc(PH_END)}]+)${esc(PH_END)}`,
        "g",
    );
    while ((match = delimitedRe.exec(text)) !== null) {
        const tokenContent: string = match[1];
        const colonIdx: number = tokenContent.indexOf(":");
        const tokenType: string = colonIdx >= 0 ? tokenContent.substring(0, colonIdx) : tokenContent;
        const tokenValue: string = colonIdx >= 0 ? tokenContent.substring(colonIdx + 1) : "";

        let type: string;
        if (tokenType === TOKEN_PAUSE) type = "pause";
        else if (tokenType === TOKEN_VOICE_START) type = "voice_start";
        else if (tokenType === TOKEN_VOICE_END) type = "voice_end";
        else if (tokenType === TOKEN_RATE_START) type = "rate_start";
        else if (tokenType === TOKEN_RATE_END) type = "rate_end";
        else continue; // Unknown token, skip

        allTokens.push({ index: match.index, length: match[0].length, type, value: tokenValue });
    }

    // Sort by position
    allTokens.sort((a, b) => a.index - b.index);

    // Walk through tokens, extracting text between them
    let currentVoice: string | undefined = undefined;
    let currentRate: number | undefined = undefined;
    let pendingPauseMs: number | undefined = undefined;
    let lastIndex: number = 0;

    for (const token of allTokens) {
        // Extract text before this token
        if (token.index > lastIndex) {
            const textBefore: string = text.substring(lastIndex, token.index);
            if (textBefore.trim()) {
                const segment: ScriptSegment = { text: textBefore.trim() };
                if (currentVoice) segment.voiceId = currentVoice;
                if (currentRate !== undefined) segment.speakingRate = currentRate;
                if (pendingPauseMs !== undefined) {
                    if (segments.length > 0) {
                        segments[segments.length - 1].pauseAfterMs = pendingPauseMs;
                    }
                    pendingPauseMs = undefined;
                }
                segments.push(segment);
            } else if (pendingPauseMs !== undefined && segments.length > 0) {
                segments[segments.length - 1].pauseAfterMs = pendingPauseMs;
                pendingPauseMs = undefined;
            }
        }

        switch (token.type) {
            case "break":
                pendingPauseMs = parseInt(token.value, 10);
                break;
            case "pause":
                pendingPauseMs = parseFloat(token.value);
                break;
            case "voice_start":
                currentVoice = token.value;
                break;
            case "voice_end":
                currentVoice = undefined;
                break;
            case "rate_start":
                currentRate = parseFloat(token.value);
                break;
            case "rate_end":
                currentRate = undefined;
                break;
        }

        lastIndex = token.index + token.length;
    }

    // Remaining text after last token
    if (lastIndex < text.length) {
        const remaining: string = text.substring(lastIndex);
        if (remaining.trim()) {
            const segment: ScriptSegment = { text: remaining.trim() };
            if (currentVoice) segment.voiceId = currentVoice;
            if (currentRate !== undefined) segment.speakingRate = currentRate;
            if (pendingPauseMs !== undefined && segments.length > 0) {
                segments[segments.length - 1].pauseAfterMs = pendingPauseMs;
                pendingPauseMs = undefined;
            }
            segments.push(segment);
        }
    }

    // If there's a trailing pending pause, apply to the last segment
    if (pendingPauseMs !== undefined && segments.length > 0) {
        segments[segments.length - 1].pauseAfterMs = pendingPauseMs;
    }

    return segments;
}


function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
