import { resolveThemeColors } from "./theme-resolver.js";
import { resolveAssetPath } from "../util/fs-helpers.js";
import type { Theme } from "../schema/types.js";
import type { TimelineEvent } from "./types.js";


// ---------------------------------------------------------------------------
// Percentage → pixel resolution
// ---------------------------------------------------------------------------

const PERCENT_RE: RegExp = /^(\d+(?:\.\d+)?)%$/;


/**
 * If `value` is a percentage string like "50%", resolve it against `dimension`
 * and return the pixel value. If it's already a number, return it unchanged.
 * Returns `undefined` for any other type (missing fields, etc.).
 */
function resolveValue(value: unknown, dimension: number): number | undefined {
    if (typeof value === "number") {
        return value;
    }
    if (typeof value === "string") {
        const match: RegExpMatchArray | null = value.match(PERCENT_RE);
        if (match) {
            return (parseFloat(match[1]) / 100) * dimension;
        }
    }
    return undefined;
}


/**
 * Resolve point fields (`{ x, y }`) in-place, converting percentage strings
 * to pixel values. Returns the (possibly mutated) object, or undefined if
 * the field was not present.
 */
function resolvePoint(
    obj: Record<string, unknown> | undefined,
    videoWidth: number,
    videoHeight: number,
): Record<string, unknown> | undefined {
    if (!obj || typeof obj !== "object") {
        return obj;
    }
    const xVal: number | undefined = resolveValue(obj.x, videoWidth);
    const yVal: number | undefined = resolveValue(obj.y, videoHeight);
    if (xVal !== undefined) obj.x = xVal;
    if (yVal !== undefined) obj.y = yVal;
    return obj;
}


/**
 * Resolve region fields (`{ x, y, w, h }`) in-place.
 */
function resolveRegion(
    obj: Record<string, unknown> | undefined,
    videoWidth: number,
    videoHeight: number,
): void {
    if (!obj || typeof obj !== "object") {
        return;
    }
    const xVal: number | undefined = resolveValue(obj.x, videoWidth);
    const yVal: number | undefined = resolveValue(obj.y, videoHeight);
    const wVal: number | undefined = resolveValue(obj.w, videoWidth);
    const hVal: number | undefined = resolveValue(obj.h, videoHeight);
    if (xVal !== undefined) obj.x = xVal;
    if (yVal !== undefined) obj.y = yVal;
    if (wVal !== undefined) obj.w = wVal;
    if (hVal !== undefined) obj.h = hVal;
}


/**
 * Convert percentage strings (e.g. "50%") to pixel values throughout a raw
 * visual event record. Returns a shallow copy with resolved point/size/region
 * fields. Numbers pass through unchanged.
 *
 * Call this BEFORE `applyEventDefaults` so that shorthand arithmetic
 * (e.g. the arrow position shorthand) operates on pixel values.
 */
export function resolvePercentages(
    raw: Record<string, unknown>,
    videoWidth: number,
    videoHeight: number,
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...raw };

    // Deep-copy and resolve point-shaped fields
    for (const key of ["position", "from", "to"] as const) {
        if (result[key] && typeof result[key] === "object") {
            result[key] = { ...(result[key] as Record<string, unknown>) };
            resolvePoint(result[key] as Record<string, unknown>, videoWidth, videoHeight);
        }
    }

    // target ({ x, y, r }) -- resolve x/y but leave r as-is (radius is always pixels)
    if (result.target && typeof result.target === "object") {
        const target: Record<string, unknown> = { ...(result.target as Record<string, unknown>) };
        const xVal: number | undefined = resolveValue(target.x, videoWidth);
        const yVal: number | undefined = resolveValue(target.y, videoHeight);
        if (xVal !== undefined) target.x = xVal;
        if (yVal !== undefined) target.y = yVal;
        result.target = target;
    }

    // size -- screenshot uses { w, h }, badge uses a plain number (leave numbers alone)
    if (result.size && typeof result.size === "object") {
        result.size = { ...(result.size as Record<string, unknown>) };
        const size: Record<string, unknown> = result.size as Record<string, unknown>;
        const wVal: number | undefined = resolveValue(size.w, videoWidth);
        const hVal: number | undefined = resolveValue(size.h, videoHeight);
        if (wVal !== undefined) size.w = wVal;
        if (hVal !== undefined) size.h = hVal;
    }

    // region ({ x, y, w, h })
    if (result.region && typeof result.region === "object") {
        result.region = { ...(result.region as Record<string, unknown>) };
        resolveRegion(result.region as Record<string, unknown>, videoWidth, videoHeight);
    }

    return result;
}


/**
 * Color fields per event type that should be resolved against the theme.
 */
const COLOR_FIELDS_BY_TYPE: Record<string, string[]> = {
    screenshot: [],
    text: ["color"],
    circle: ["color", "fill"],
    arrow: ["color"],
    highlight: ["color", "border"],
    cursor: [],
    zoom: [],
    badge: ["color", "text_color"],
    stack: [],
};


/**
 * Apply type-specific defaults and normalize a raw visual event record
 * into a fully resolved timeline event (minus frame calculations, which
 * are handled by timeline-builder).
 */
export function applyEventDefaults(
    raw: Record<string, unknown>,
    theme: Theme,
    projectRoot?: string,
): Record<string, unknown> {
    const eventType: string = raw.type as string;
    const result: Record<string, unknown> = { ...raw };

    switch (eventType) {
        case "screenshot": {
            result.fit = result.fit ?? "contain";
            result.shadow = result.shadow ?? false;
            result.border_radius = result.border_radius ?? 0;
            result.overflow = result.overflow ?? "clip";
            const isInset: boolean = result.position !== undefined;
            result.border = result.border ?? (isInset ? "4px solid black" : null);
            result.dim_beneath = result.dim_beneath ?? (isInset ? 10 : 0);
            // Resolve asset path so Remotion's staticFile() can find it
            if (typeof result.src === "string" && !result.src.startsWith("inbox/")) {
                const resolved: string | null = projectRoot
                    ? resolveAssetPath(projectRoot, result.src as string)
                    : null;
                result.src = resolved ?? `inbox/assets/${result.src as string}`;
            }
            break;
        }

        case "text":
            result.color = result.color ?? "#FFFFFF";
            result.style = result.style ?? "caption";
            result.align = result.align ?? "left";
            break;

        case "circle":
            result.color = result.color ?? "$accent";
            result.stroke_width = result.stroke_width ?? 4;
            result.fill = result.fill ?? "none";
            break;

        case "arrow":
            result.color = result.color ?? "$accent";
            result.stroke_width = result.stroke_width ?? 10;
            result.head_size = result.head_size ?? (result.stroke_width as number) * 3;
            // position shorthand: generate a short arrow pointing down to that point
            if (result.position && !result.from && !result.to) {
                const pos = result.position as { x: number; y: number };
                result.to = { x: pos.x, y: pos.y };
                result.from = { x: pos.x, y: pos.y - 80 };
                delete result.position;
            }
            break;

        case "highlight":
            result.border = result.border ?? null;
            // Default highlight color: accent at 20% opacity
            if (!result.color) {
                result.color = "$accent20";
            }
            break;

        case "cursor":
            result.from = result.from ?? null;
            result.click = result.click ?? false;
            break;

        case "zoom":
            result.scale = result.scale ?? 2;
            break;

        case "badge":
            result.variant = result.variant ?? "circle";
            result.color = result.color ?? "$accent";
            result.text_color = result.text_color ?? "#FFFFFF";
            result.size = result.size ?? 32;
            break;

        case "stack":
            result.gap = result.gap ?? 40;
            break;
    }

    // Resolve theme color variables
    const colorFields: string[] = COLOR_FIELDS_BY_TYPE[eventType] ?? [];
    return resolveThemeColors(result, theme, colorFields);
}


/**
 * Build a timeline event ID.
 * Format: scene-{NN}-{type}-{index}
 */
export function buildEventId(sceneIndex: number, eventType: string, eventIndex: number): string {
    const sceneNum: string = String(sceneIndex + 1).padStart(2, "0");
    return `scene-${sceneNum}-${eventType}-${eventIndex}`;
}


/**
 * Offset point/target/region fields on an annotation by a parent screenshot's
 * position. Used by the keyframes path (Sharp) where CSS container positioning
 * isn't available to handle the offset automatically.
 */
export function offsetAnnotationCoordinates(
    annotation: Record<string, unknown>,
    parentX: number,
    parentY: number,
    scale: number = 1,
): void {
    for (const key of ["position", "from", "to"] as const) {
        const point = annotation[key] as { x?: number; y?: number } | undefined;
        if (point && typeof point === "object") {
            if (typeof point.x === "number") point.x = point.x * scale + parentX;
            if (typeof point.y === "number") point.y = point.y * scale + parentY;
        }
    }

    const target = annotation.target as { x?: number; y?: number; r?: number } | undefined;
    if (target && typeof target === "object") {
        if (typeof target.x === "number") target.x = target.x * scale + parentX;
        if (typeof target.y === "number") target.y = target.y * scale + parentY;
        if (typeof target.r === "number") target.r = target.r * scale;
    }

    const region = annotation.region as { x?: number; y?: number; w?: number; h?: number } | undefined;
    if (region && typeof region === "object") {
        if (typeof region.x === "number") region.x = region.x * scale + parentX;
        if (typeof region.y === "number") region.y = region.y * scale + parentY;
        if (typeof region.w === "number") region.w = region.w * scale;
        if (typeof region.h === "number") region.h = region.h * scale;
    }
}
