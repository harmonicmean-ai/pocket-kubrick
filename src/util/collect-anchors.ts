/**
 * Collects all string-valued `at` and `disappear_at` anchors from a visual
 * event array, including nested stack items and screenshot children.
 */
export function collectStringAnchors(visuals: Array<Record<string, unknown>>): string[] {
    const anchors: string[] = [];
    for (const visual of visuals) {
        collectFromRecord(visual, anchors);
        if (visual.type === "stack" && Array.isArray(visual.items)) {
            for (const item of visual.items as Record<string, unknown>[]) {
                collectFromRecord(item, anchors);
            }
        }
        if (visual.type === "screenshot" && Array.isArray(visual.children)) {
            for (const child of visual.children as Record<string, unknown>[]) {
                collectFromRecord(child, anchors);
            }
        }
    }
    return anchors;
}


function collectFromRecord(record: Record<string, unknown>, anchors: string[]): void {
    if (typeof record.at === "string") {
        anchors.push(record.at);
    }
    if (typeof record.disappear_at === "string") {
        anchors.push(record.disappear_at);
    }
}
