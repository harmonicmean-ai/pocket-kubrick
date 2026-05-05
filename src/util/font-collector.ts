/**
 * Walk a Timeline (post-resolve) or a VideoConfig (pre-resolve YAML) and
 * collect every font family referenced. Always includes the implicit default
 * ("Open Sans") so consumers can self-host even when no `font:` overrides
 * appear in the source.
 */

import type { VideoConfig } from "../schema/types.js";
import type { Timeline, TimelineEvent } from "../resolver/types.js";


const DEFAULT_FAMILY: string = "Open Sans";


export function collectFontsFromTimeline(timeline: Timeline): string[] {
    const families: Set<string> = new Set([DEFAULT_FAMILY]);

    for (const event of timeline.events) {
        addFamiliesFromEvent(event, families);
    }

    return Array.from(families);
}


/**
 * Same idea, but reads the raw YAML config before any resolve step has run.
 * Used by the `compose` and `preview` commands, which don't always have a
 * built timeline.json but still need to know which fonts to load.
 */
export function collectFontsFromConfig(config: VideoConfig): string[] {
    const families: Set<string> = new Set([DEFAULT_FAMILY]);

    if (config.video.theme?.font) {
        families.add(config.video.theme.font);
    }

    for (const scene of config.scenes) {
        const visuals: Record<string, unknown>[] = (scene.visuals as Record<string, unknown>[]) ?? [];
        for (const visual of visuals) {
            addFamiliesFromRaw(visual, families);
        }
    }

    return Array.from(families);
}


function addFamiliesFromEvent(event: TimelineEvent, out: Set<string>): void {
    if (event.type === "text" || event.type === "badge") {
        const f: string | undefined = (event as { font?: string }).font;
        if (f) out.add(f);
    }

    if (event.type === "stack") {
        for (const item of event.items) {
            if (item.font) out.add(item.font);
        }
    }

    if (event.type === "screenshot" && Array.isArray(event.children)) {
        for (const child of event.children) {
            addFamiliesFromEvent(child as TimelineEvent, out);
        }
    }
}


function addFamiliesFromRaw(visual: Record<string, unknown>, out: Set<string>): void {
    const type: string = visual.type as string;

    if (type === "text" || type === "badge") {
        const f = visual.font;
        if (typeof f === "string" && f.trim().length > 0) out.add(f);
    }

    if (type === "stack" && Array.isArray(visual.items)) {
        for (const item of visual.items as Record<string, unknown>[]) {
            const f = item.font;
            if (typeof f === "string" && f.trim().length > 0) out.add(f);
        }
    }

    if (type === "screenshot" && Array.isArray(visual.children)) {
        for (const child of visual.children as Record<string, unknown>[]) {
            addFamiliesFromRaw(child, out);
        }
    }
}
