import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { resolveProjectRoot, getConfigPath, resolveAssetPath } from "../util/fs-helpers.js";
import { resolvePercentages } from "../resolver/event-resolver.js";
import { loadVideoConfig } from "../parser/yaml-loader.js";
import { formatDiagnostics } from "../util/errors.js";
import { info, setVerbose, verbose as verboseLog } from "../util/logger.js";
import { stampAnnotations } from "../util/annotation-stamper.js";
import type { VideoConfig, Theme, Scene } from "../schema/types.js";


/** Annotation types that are meaningful as static stamps on a screenshot. */
// TODO: disappear_at is not handled here — keyframe states operate on raw YAML
// (pre-audio-synthesis) so anchor names can't be resolved to temporal order.
// Annotations with disappear_at will appear in keyframe PNGs but won't be
// removed in later states. Acceptable for now.
const STAMPABLE_TYPES: Set<string> = new Set(["arrow", "highlight", "circle", "badge", "cursor", "text", "stack"]);


export interface KeyframesOptions {
    project?: string;
    verbose?: boolean;
}


interface ScreenshotLayer {
    path: string;
    position?: { x: number; y: number };
    size?: { w: number; h?: number };
    fit?: string;
    shadow?: boolean;
    border_radius?: number;
    overflow?: string;
    border?: string | null;
    dim_before?: number;
}


interface KeyframeState {
    screenshotLayers: ScreenshotLayer[];
    annotations: Record<string, unknown>[];
}


interface ScreenshotSegment {
    screenshotSrc: string;
    layout: Omit<ScreenshotLayer, "path">;
    baseAnnotations: Record<string, unknown>[];
    atGroups: { at: string | number; events: Record<string, unknown>[] }[];
}


/**
 * Build ordered cumulative keyframe states for a scene.
 *
 * Each state represents how the visual progressively builds up as annotations
 * appear one-by-one (or in groups sharing the same `at` anchor).
 *
 * - State 0: Base screenshot + any stampable events with no `at` field
 * - State 1: State 0 + events from the first distinct `at` value
 * - State N: State N-1 + events from the Nth distinct `at` value
 *
 * Screenshots with position/size are overlays: they stack on top of all
 * previous screenshot layers rather than replacing them.  A full-frame
 * screenshot (no position/size) resets the layer stack.
 */
export function buildKeyframeStates(
    scene: Scene,
    projectRoot: string,
    videoWidth: number,
    videoHeight: number,
): KeyframeState[] {
    const visuals: Record<string, unknown>[] = scene.visuals as Record<string, unknown>[];
    const segments: ScreenshotSegment[] = [];
    let currentSegment: ScreenshotSegment | null = null;
    const seenAtValues: Map<string | number, number> = new Map();

    for (const visual of visuals) {
        const eventType: string = visual.type as string;

        if (eventType === "screenshot") {
            const src: string = visual.src as string;
            const resolved: string | null = src.startsWith("inbox/")
                ? src
                : resolveAssetPath(projectRoot, src);
            const screenshotSrc: string = resolved ?? `inbox/assets/${src}`;

            // Resolve percentage values in position/size to pixels
            const pctResolved: Record<string, unknown> = resolvePercentages(
                { ...visual },
                videoWidth,
                videoHeight,
            );

            const layout: Omit<ScreenshotLayer, "path"> = {};
            const rawPos = pctResolved.position as { x?: number; y?: number } | undefined;
            if (rawPos) {
                layout.position = { x: rawPos.x ?? 0, y: rawPos.y ?? 0 };
            }
            const rawSize = pctResolved.size as { w?: number; h?: number } | undefined;
            if (rawSize) {
                layout.size = { w: rawSize.w ?? videoWidth };
                if (rawSize.h !== undefined) layout.size.h = rawSize.h;
            }
            if (visual.fit !== undefined) layout.fit = visual.fit as string;
            if (visual.shadow !== undefined) layout.shadow = visual.shadow as boolean;
            if (visual.border_radius !== undefined) layout.border_radius = visual.border_radius as number;
            if (visual.overflow !== undefined) layout.overflow = visual.overflow as string;
            if (visual.border !== undefined) layout.border = visual.border as string | null;

            // Collect child annotations from children array
            const childAnnotations: Record<string, unknown>[] = [];
            if (Array.isArray(visual.children)) {
                const parentX: number = rawPos?.x ?? 0;
                const parentY: number = rawPos?.y ?? 0;
                for (const child of visual.children as Record<string, unknown>[]) {
                    const childType: string = child.type as string;
                    if (childType === "screenshot" || !STAMPABLE_TYPES.has(childType)) {
                        continue;
                    }
                    // Mark with parent offset metadata for coordinate transformation
                    childAnnotations.push({
                        ...child,
                        _parent_offset_x: parentX,
                        _parent_offset_y: parentY,
                    });
                }
            }

            currentSegment = {
                screenshotSrc,
                layout,
                baseAnnotations: [],
                atGroups: [],
            };
            segments.push(currentSegment);
            seenAtValues.clear();

            // Add child annotations (grouped by their at value)
            for (const childAnnotation of childAnnotations) {
                const childAtValue: string | number | undefined = childAnnotation.at as string | number | undefined;
                if (childAtValue === undefined || childAtValue === null) {
                    currentSegment.baseAnnotations.push(childAnnotation);
                } else {
                    const existingIndex: number | undefined = seenAtValues.get(childAtValue);
                    if (existingIndex !== undefined) {
                        currentSegment.atGroups[existingIndex].events.push(childAnnotation);
                    } else {
                        const groupIndex: number = currentSegment.atGroups.length;
                        currentSegment.atGroups.push({ at: childAtValue, events: [childAnnotation] });
                        seenAtValues.set(childAtValue, groupIndex);
                    }
                }
            }

            continue;
        }

        if (!STAMPABLE_TYPES.has(eventType)) {
            if (eventType !== "screenshot") {
                verboseLog(`  Skipping unsupported visual type "${eventType}"`);
            }
            continue;
        }

        if (!currentSegment) {
            continue;
        }

        const atValue: string | number | undefined = visual.at as string | number | undefined;

        if (atValue === undefined || atValue === null) {
            currentSegment.baseAnnotations.push(visual);
        } else {
            const existingIndex: number | undefined = seenAtValues.get(atValue);
            if (existingIndex !== undefined) {
                currentSegment.atGroups[existingIndex].events.push(visual);
            } else {
                const groupIndex: number = currentSegment.atGroups.length;
                currentSegment.atGroups.push({ at: atValue, events: [visual] });
                seenAtValues.set(atValue, groupIndex);
            }
        }
    }

    if (segments.length === 0) {
        return [];
    }

    // Build cumulative states from segments.
    // Screenshots with position/size are overlays that stack on top of
    // all previous layers.  A full-frame screenshot resets the stack.
    const states: KeyframeState[] = [];
    let layerStack: ScreenshotLayer[] = [];
    let cumulativeDimPercent: number = 0;

    for (const segment of segments) {
        const screenshotPath: string = join(projectRoot, segment.screenshotSrc);
        const isOverlay: boolean = segment.layout.position !== undefined
            || segment.layout.size !== undefined;

        const layer: ScreenshotLayer = { path: screenshotPath, ...segment.layout };

        // Track dim accumulation for inset screenshots
        if (isOverlay) {
            layer.dim_before = cumulativeDimPercent;
            // Default border for insets if not explicitly set
            if (layer.border === undefined) {
                layer.border = "4px solid black";
            }
            // Default dim_beneath of 10% for insets
            const dimBeneath: number = 10;
            cumulativeDimPercent += dimBeneath;
        }

        if (isOverlay) {
            // Overlay: push on top of the existing stack
            layerStack = [...layerStack, layer];
        } else {
            // Full-frame: replace the entire stack
            layerStack = [layer];
        }

        // State 0: screenshot layers + base (no-at) annotations
        const baseAnnotations: Record<string, unknown>[] = [...segment.baseAnnotations];
        states.push({
            screenshotLayers: [...layerStack],
            annotations: [...baseAnnotations],
        });

        // Cumulative states for each at-group
        let cumulative: Record<string, unknown>[] = [...baseAnnotations];
        for (const group of segment.atGroups) {
            cumulative = [...cumulative, ...group.events];
            states.push({
                screenshotLayers: [...layerStack],
                annotations: [...cumulative],
            });
        }
    }

    return states;
}


/**
 * Composite multiple screenshot layers into a single sharp image at video
 * resolution.  The first full-frame layer becomes the base; overlay layers
 * are resized and placed at their position offset.
 */
async function compositeScreenshotLayers(
    layers: ScreenshotLayer[],
    videoWidth: number,
    videoHeight: number,
): Promise<sharp.Sharp> {
    if (layers.length === 1 && !layers[0].position && !layers[0].size) {
        // Single full-frame screenshot — no compositing needed
        return sharp(layers[0].path).resize(videoWidth, videoHeight, { fit: "contain" });
    }

    // Start with a blank canvas at video resolution
    let base: sharp.Sharp = sharp({
        create: {
            width: videoWidth,
            height: videoHeight,
            channels: 4,
            background: { r: 18, g: 18, b: 18, alpha: 1 },  // #121212
        },
    }).png();

    const compositeInputs: sharp.OverlayOptions[] = [];

    for (const layer of layers) {
        const left: number = layer.position?.x ?? 0;
        const top: number = layer.position?.y ?? 0;
        const layerW: number = layer.size?.w ?? videoWidth;
        const layerH: number = layer.size?.h ?? videoHeight;
        const isInset: boolean = left !== 0 || top !== 0;

        // Dim overlay: darken all previous content before this inset layer
        const dimBefore: number = layer.dim_before ?? 0;
        if (dimBefore > 0 && isInset) {
            const dimAlpha: number = dimBefore / 100;
            const dimSvg: string = [
                `<svg xmlns="http://www.w3.org/2000/svg" width="${videoWidth}" height="${videoHeight}">`,
                `<rect width="100%" height="100%" fill="rgba(0,0,0,${dimAlpha})"/>`,
                `</svg>`,
            ].join("");
            compositeInputs.push({
                input: Buffer.from(dimSvg),
                top: 0,
                left: 0,
            });
        }

        // Resize the screenshot to its target dimensions, preserving aspect
        // ratio (match CSS object-fit: contain default)
        const fit: string = layer.fit ?? "contain";
        const sharpFit: keyof sharp.FitEnum = fit === "cover" ? "cover"
            : fit === "fill" ? "fill"
            : "inside";

        const layerBuf: Buffer = await sharp(layer.path)
            .resize(Math.round(layerW), Math.round(layerH), { fit: sharpFit })
            .png()
            .toBuffer();

        // If shadow requested, add a shadow effect by compositing a dark blur
        // behind the layer (simple approximation — real CSS box-shadow is complex)
        if (layer.shadow) {
            const shadowImg: Buffer = await sharp(layerBuf)
                .resize(Math.round(layerW), Math.round(layerH), { fit: "inside" })
                .modulate({ brightness: 0 })
                .blur(16)
                .ensureAlpha(0.4)
                .toBuffer();
            compositeInputs.push({
                input: shadowImg,
                top: Math.round(top + 8),
                left: Math.round(left + 4),
            });
        }

        compositeInputs.push({
            input: layerBuf,
            top: Math.round(top),
            left: Math.round(left),
        });

        // Border overlay for inset screenshots
        if (isInset && layer.border) {
            const borderMatch: RegExpMatchArray | null = layer.border.match(/^(\d+(?:\.\d+)?)px\s+solid\s+(.+)$/);
            if (borderMatch) {
                const borderWidth: number = parseFloat(borderMatch[1]);
                const borderColor: string = borderMatch[2];
                const borderSvg: string = [
                    `<svg xmlns="http://www.w3.org/2000/svg" width="${videoWidth}" height="${videoHeight}">`,
                    `<rect x="${left}" y="${top}" width="${layerW}" height="${layerH}" `,
                    `fill="none" stroke="${borderColor}" stroke-width="${borderWidth}"/>`,
                    `</svg>`,
                ].join("");
                compositeInputs.push({
                    input: Buffer.from(borderSvg),
                    top: 0,
                    left: 0,
                });
            }
        }
    }

    return base.composite(compositeInputs);
}


/**
 * Stamp annotation visuals onto a pre-composited sharp image and save as PNG.
 * Like stampAnnotations() from annotation-stamper but takes a sharp instance
 * and known dimensions instead of a file path.
 */
async function stampAnnotationsOnImage(
    image: sharp.Sharp,
    width: number,
    height: number,
    visuals: Record<string, unknown>[],
    theme: Theme,
    outputPath: string,
    projectRoot: string,
): Promise<void> {
    // Write the composited base to a temp buffer, then stamp on top
    const baseBuf: Buffer = await image.png().toBuffer();
    await stampAnnotations(baseBuf, visuals, theme, outputPath, projectRoot, width, height);
}


/**
 * Core orchestration: generate keyframe PNGs for all scenes.
 */
export async function runKeyframes(
    config: VideoConfig,
    projectRoot: string,
): Promise<{ outputDir: string; fileCount: number; sceneCount: number }> {
    const theme: Theme = config.video.theme;
    const [videoWidth, videoHeight] = config.video.resolution.split("x").map(Number);
    const outputDir: string = join(projectRoot, "output", "keyframes");

    // Clear and recreate the output directory
    if (existsSync(outputDir)) {
        rmSync(outputDir, { recursive: true });
    }
    mkdirSync(outputDir, { recursive: true });

    let fileCount: number = 0;
    let sceneCount: number = 0;

    for (const [sceneIndex, scene] of config.scenes.entries()) {
        const states: KeyframeState[] = buildKeyframeStates(
            scene, projectRoot, videoWidth, videoHeight,
        );

        if (states.length === 0) {
            verboseLog(`  Scene ${sceneIndex + 1}: no screenshot found, skipping`);
            continue;
        }

        sceneCount++;
        const sceneLabel: string = String(sceneIndex + 1).padStart(2, "0");

        for (const [stateIndex, state] of states.entries()) {
            const stateLabel: string = String(stateIndex).padStart(2, "0");
            const outputPath: string = join(outputDir, `scene-${sceneLabel}_state-${stateLabel}.png`);

            // Validate all screenshot layers exist
            const missingLayer: ScreenshotLayer | undefined = state.screenshotLayers.find(
                (l) => !existsSync(l.path)
            );
            if (missingLayer) {
                console.error(`  WARNING: Screenshot not found: ${missingLayer.path}`);
                continue;
            }

            // Build composited base image from all screenshot layers
            const baseImage: sharp.Sharp = await compositeScreenshotLayers(
                state.screenshotLayers, videoWidth, videoHeight,
            );

            if (state.annotations.length === 0) {
                verboseLog(`  Scene ${sceneIndex + 1}, state ${stateIndex}: ${state.screenshotLayers.length} layer(s), no annotations`);
                await baseImage.png().toFile(outputPath);
            } else {
                verboseLog(
                    `  Scene ${sceneIndex + 1}, state ${stateIndex}: ` +
                    `${state.screenshotLayers.length} layer(s), ${state.annotations.length} annotation(s)`
                );
                await stampAnnotationsOnImage(
                    baseImage,
                    videoWidth,
                    videoHeight,
                    state.annotations,
                    theme,
                    outputPath,
                    projectRoot,
                );
            }

            fileCount++;
        }
    }

    return { outputDir, fileCount, sceneCount };
}


/**
 * CLI handler for `pocket-kubrick keyframes`.
 */
export async function keyframesCommand(options: KeyframesOptions): Promise<void> {
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

    info(`Generating keyframes for "${config.video.title}"...`);

    try {
        const { outputDir, fileCount, sceneCount } = await runKeyframes(config, projectRoot);

        if (fileCount === 0) {
            info("No scenes with screenshots found.");
        } else {
            info(`Done: ${fileCount} keyframe(s) from ${sceneCount} scene(s) in ${outputDir}`);
        }
        process.exit(0);
    } catch (e) {
        console.error(`${(e as Error).constructor.name}: ${(e as Error).message}`);
        process.exit(1);
    }
}
