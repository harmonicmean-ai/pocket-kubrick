import { resolveAssetPath } from "../util/fs-helpers.js";
import { sceneLabel } from "../util/scene-label.js";
import type { VideoConfig } from "../schema/types.js";


const EDITABLE_TYPES: Set<string> = new Set([
    "highlight", "circle", "arrow", "badge", "cursor", "zoom", "text", "stack",
]);


export interface EditorScreenshot {
    src: string;
    originalSrc: string;
    position?: { x: number; y: number };
    size?: { w: number; h?: number };
    fit?: string;
    shadow?: boolean;
    border_radius?: number;
    overflow?: string;
    border?: string | null;
    dim_beneath?: number;
}


export interface EditorAnnotation {
    type: string;
    props: Record<string, unknown>;
}


export interface EditorKeyframe {
    screenshot: EditorScreenshot;
    annotations: EditorAnnotation[];
    label: string;
}


export interface EditorScene {
    index: number;
    scriptPath: string;
    keyframes: EditorKeyframe[];
}


export interface EditorProject {
    title: string;
    resolution: { w: number; h: number };
    theme: {
        background: string;
        accent: string;
        font: string;
        font_size: number;
        padding: number;
    };
    sceneCount: number;
}


/**
 * Extract project-level metadata for the editor.
 */
export function extractProjectData(config: VideoConfig): EditorProject {
    const [w, h] = config.video.resolution.split("x").map(Number);
    return {
        title: config.video.title,
        resolution: { w, h },
        theme: {
            background: config.video.theme.background,
            accent: config.video.theme.accent,
            font: config.video.theme.font,
            font_size: config.video.theme.font_size,
            padding: config.video.theme.padding,
        },
        sceneCount: config.scenes.length,
    };
}


/**
 * Extract a summary of all scenes for the scene selector.
 */
export function extractSceneSummaries(
    config: VideoConfig,
    projectRoot: string,
): { index: number; scriptPath: string; screenshotSrc: string | null; annotationCount: number }[] {
    return config.scenes.map((scene, index) => {
        const visuals: Record<string, unknown>[] = scene.visuals as Record<string, unknown>[];
        const firstScreenshot = visuals.find((v) => v.type === "screenshot");
        let screenshotSrc: string | null = null;

        if (firstScreenshot) {
            const src: string = firstScreenshot.src as string;
            screenshotSrc = resolveScreenshotSrc(src, projectRoot);
        }

        const annotationCount: number = visuals.filter(
            (v) => EDITABLE_TYPES.has(v.type as string)
        ).length;

        return { index, scriptPath: sceneLabel(scene, index), screenshotSrc, annotationCount };
    });
}


/**
 * Extract full scene data for the editor canvas.
 *
 * Visuals are segmented into keyframes: each `screenshot` event starts a new
 * keyframe, and subsequent editable-type visuals belong to that keyframe.
 */
export function extractSceneData(
    config: VideoConfig,
    sceneIndex: number,
    projectRoot: string,
): EditorScene | null {
    if (sceneIndex < 0 || sceneIndex >= config.scenes.length) {
        return null;
    }

    const scene = config.scenes[sceneIndex];
    const visuals: Record<string, unknown>[] = scene.visuals as Record<string, unknown>[];
    const [videoWidth, videoHeight] = config.video.resolution.split("x").map(Number);

    const keyframes: EditorKeyframe[] = [];
    let currentKeyframe: EditorKeyframe | null = null;

    for (const visual of visuals) {
        const eventType: string = visual.type as string;

        if (eventType === "screenshot") {
            const src: string = visual.src as string;
            const resolvedSrc: string = resolveScreenshotSrc(src, projectRoot);
            const filename: string = src.split("/").pop() ?? src;
            const screenshot: EditorScreenshot = { src: resolvedSrc, originalSrc: src };

            // Pass through layout properties, resolving percentages to pixels
            const rawPos = visual.position as { x?: unknown; y?: unknown } | undefined;
            if (rawPos) {
                screenshot.position = {
                    x: resolvePercent(rawPos.x, videoWidth),
                    y: resolvePercent(rawPos.y, videoHeight),
                };
            }
            const rawSize = visual.size as { w?: unknown; h?: unknown } | undefined;
            if (rawSize) {
                screenshot.size = { w: resolvePercent(rawSize.w, videoWidth) };
                if (rawSize.h !== undefined) {
                    screenshot.size.h = resolvePercent(rawSize.h, videoHeight);
                }
            }
            if (visual.fit !== undefined) screenshot.fit = visual.fit as string;
            if (visual.shadow !== undefined) screenshot.shadow = visual.shadow as boolean;
            if (visual.border_radius !== undefined) screenshot.border_radius = visual.border_radius as number;
            if (visual.overflow !== undefined) screenshot.overflow = visual.overflow as string;
            if (visual.border !== undefined) screenshot.border = visual.border as string | null;
            if (visual.dim_beneath !== undefined) screenshot.dim_beneath = visual.dim_beneath as number;

            currentKeyframe = {
                screenshot,
                annotations: [],
                label: filename,
            };
            keyframes.push(currentKeyframe);

            // Extract child annotations from children array
            if (Array.isArray(visual.children)) {
                const parentOffset = screenshot.position
                    ? { x: screenshot.position.x, y: screenshot.position.y }
                    : { x: 0, y: 0 };
                for (const child of visual.children as Record<string, unknown>[]) {
                    const childType: string = child.type as string;
                    if (EDITABLE_TYPES.has(childType)) {
                        const { type, ...rest } = child as Record<string, unknown> & { type: string };
                        currentKeyframe.annotations.push({
                            type,
                            props: { ...rest, _is_child: true, _parent_offset: parentOffset },
                        });
                    }
                }
            }
        } else if (EDITABLE_TYPES.has(eventType) && currentKeyframe) {
            const { type, ...rest } = visual as Record<string, unknown> & { type: string };
            currentKeyframe.annotations.push({ type, props: rest });
        }
    }

    return {
        index: sceneIndex,
        scriptPath: sceneLabel(scene, sceneIndex),
        keyframes,
    };
}


/**
 * Resolve a percentage string (e.g. "14%") to pixels, or pass through a number.
 */
function resolvePercent(value: unknown, dimension: number): number {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
        const match: RegExpMatchArray | null = value.match(/^(\d+(?:\.\d+)?)%$/);
        if (match) return Math.round((parseFloat(match[1]) / 100) * dimension);
    }
    return 0;
}


/**
 * Resolve a screenshot src string to a path relative to the project root
 * that the /api/screenshot/ endpoint can serve.
 */
function resolveScreenshotSrc(src: string, projectRoot: string): string {
    if (src.startsWith("inbox/")) {
        return src;
    }
    const resolved: string | null = resolveAssetPath(projectRoot, src);
    return resolved ?? `inbox/assets/${src}`;
}
