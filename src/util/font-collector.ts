/**
 * Walk a Timeline and collect every font family it references.
 * Includes the implicit default ("Open Sans") so renders without any
 * `font:` overrides still self-host instead of hitting a system font.
 */

import type { Timeline, TimelineEvent } from "../resolver/types.js";


const DEFAULT_FAMILY: string = "Open Sans";


export function collectFontsFromTimeline(timeline: Timeline): string[] {
    const families: Set<string> = new Set([DEFAULT_FAMILY]);

    for (const event of timeline.events) {
        addFamiliesFromEvent(event, families);
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
