/**
 * YAML output generation: produces copy-pasteable YAML matching the project's style.
 * Generates visuals array fragments with inline flow-style for geometry objects.
 */


// ── Default Values (omit from output when matching) ─────────────

const DEFAULTS = {
    highlight: { color: "$accent20", border: null, animate_duration: 0.4, z_index: 0 },
    circle: { color: "$accent", stroke_width: 4, fill: "none", animate_duration: 0.4, z_index: 0 },
    arrow: { color: "$accent", stroke_width: 10, animate_duration: 0.4, z_index: 0 },
    badge: { variant: "circle", color: "$accent", text_color: "#FFFFFF", size: 32, animate_duration: 0.4, z_index: 0 },
    cursor: { click: false, animate_duration: 0.4, z_index: 0 },
    zoom: { scale: 2, animate_duration: 0.4, z_index: 0 },
    text: { style: "caption", align: "left", color: "#FFFFFF", font_size: null, animate_duration: 0.4, z_index: 0 },
    stack: { gap: 40, animate_duration: 0.4, z_index: 0 },
};


/**
 * Generate YAML output and update the display.
 */
export function generateYaml(annotations, theme) {
    const output = document.getElementById("yaml-output");
    if (!output) return;

    if (annotations.length === 0) {
        output.textContent = "    visuals:\n      # No annotations yet";
        return;
    }

    const lines = ["    visuals:"];

    for (const ann of annotations) {
        lines.push(`      - type: ${ann.type}`);
        const typeLines = formatAnnotation(ann);
        for (const line of typeLines) {
            lines.push(`        ${line}`);
        }
    }

    output.textContent = lines.join("\n");
}


/**
 * Format a single annotation's properties as YAML lines (without the type field).
 */
function formatAnnotation(ann) {
    const lines = [];
    const defaults = DEFAULTS[ann.type] ?? {};

    switch (ann.type) {
        case "highlight":
            lines.push(formatRegion(ann.props.region));
            addIfNotDefault(lines, "color", ann.props.color, defaults.color);
            addIfNotDefault(lines, "border", ann.props.border, defaults.border);
            break;

        case "circle":
            lines.push(formatTarget(ann.props.target));
            addIfNotDefault(lines, "color", ann.props.color, defaults.color);
            addIfNotDefault(lines, "stroke_width", ann.props.stroke_width, defaults.stroke_width);
            addIfNotDefault(lines, "fill", ann.props.fill, defaults.fill);
            break;

        case "arrow":
            lines.push(formatPoint("from", ann.props.from));
            lines.push(formatPoint("to", ann.props.to));
            addIfNotDefault(lines, "color", ann.props.color, defaults.color);
            addIfNotDefault(lines, "stroke_width", ann.props.stroke_width, defaults.stroke_width);
            if (ann.props.head_size !== undefined) {
                const expectedDefault = (ann.props.stroke_width ?? 10) * 3;
                if (ann.props.head_size !== expectedDefault) {
                    lines.push(`head_size: ${ann.props.head_size}`);
                }
            }
            break;

        case "badge":
            lines.push(formatPoint("position", ann.props.position));
            lines.push(`content: ${quoteIfNeeded(String(ann.props.content ?? ""))}`);
            addIfNotDefault(lines, "variant", ann.props.variant, defaults.variant);
            addIfNotDefault(lines, "size", ann.props.size, defaults.size);
            addIfNotDefault(lines, "color", ann.props.color, defaults.color);
            addIfNotDefault(lines, "text_color", ann.props.text_color, defaults.text_color);
            break;

        case "cursor":
            if (ann.props.from) {
                lines.push(formatPoint("from", ann.props.from));
            }
            lines.push(formatPoint("to", ann.props.to));
            addIfNotDefault(lines, "click", ann.props.click, defaults.click);
            break;

        case "zoom":
            lines.push(formatRegion(ann.props.region));
            addIfNotDefault(lines, "scale", ann.props.scale, defaults.scale);
            if (ann.props.position) {
                lines.push(formatPoint("position", ann.props.position));
            }
            break;

        case "text":
            lines.push(formatPoint("position", ann.props.position));
            lines.push(`content: ${quoteIfNeeded(ann.props.content ?? "")}`);
            addIfNotDefault(lines, "style", ann.props.style, defaults.style);
            addIfNotDefault(lines, "align", ann.props.align, defaults.align);
            addIfNotDefault(lines, "color", ann.props.color, defaults.color);
            addIfNotDefault(lines, "font_size", ann.props.font_size, defaults.font_size);
            break;

        case "stack":
            lines.push(formatPoint("position", ann.props.position));
            addIfNotDefault(lines, "gap", ann.props.gap, defaults.gap);
            if (ann.props.items?.length) {
                lines.push("items:");
                for (const item of ann.props.items) {
                    lines.push(`  - content: ${quoteIfNeeded(item.content ?? "")}`);
                    if (item.style) lines.push(`    style: ${item.style}`);
                    if (item.animate) lines.push(`    animate: ${item.animate}`);
                    if (item.color) lines.push(`    color: ${quoteIfNeeded(item.color)}`);
                    if (item.at) lines.push(`    at: ${quoteIfNeeded(item.at)}`);
                }
            }
            break;
    }

    // Preserve `at` if present (from existing annotations)
    if (ann.props.at !== undefined && ann.props.at !== null && ann.props.at !== "") {
        lines.push(`at: ${quoteIfNeeded(ann.props.at)}`);
    }

    // Preserve `disappear_at` if present
    if (ann.props.disappear_at !== undefined && ann.props.disappear_at !== null && ann.props.disappear_at !== "") {
        lines.push(`disappear_at: ${quoteIfNeeded(ann.props.disappear_at)}`);
    }

    // Common fields
    addIfNotDefault(lines, "animate", ann.props.animate, undefined);
    addIfNotDefault(lines, "animate_duration", ann.props.animate_duration, defaults.animate_duration);
    addIfNotDefault(lines, "z_index", ann.props.z_index, defaults.z_index);
    if (ann.props.duration !== undefined && ann.props.duration !== null) {
        lines.push(`duration: ${ann.props.duration}`);
    }

    return lines;
}


// ── Formatting Helpers ──────────────────────────────────────────

function formatRegion(region) {
    if (!region) return "region: {}";
    return `region: { x: ${region.x}, y: ${region.y}, w: ${region.w}, h: ${region.h} }`;
}


function formatTarget(target) {
    if (!target) return "target: {}";
    return `target: { x: ${target.x}, y: ${target.y}, r: ${target.r} }`;
}


function formatPoint(name, point) {
    if (!point) return `${name}: {}`;
    return `${name}: { x: ${point.x}, y: ${point.y} }`;
}


function addIfNotDefault(lines, name, value, defaultValue) {
    if (value === undefined || value === null || value === "" || value === defaultValue) {
        return;
    }
    lines.push(`${name}: ${quoteIfNeeded(value)}`);
}


/**
 * Quote a value if it contains special characters or is a string that
 * could be misinterpreted by YAML parsers.
 */
function quoteIfNeeded(value) {
    if (typeof value === "boolean") {
        return value ? "true" : "false";
    }
    if (typeof value === "number") {
        return String(value);
    }

    const str = String(value);

    // Always quote strings with $, spaces, or special YAML chars
    if (str.includes("$") || str.includes(" ") || str.includes("#") ||
        str.includes(":") || str.includes("{") || str.includes("}") ||
        str === "true" || str === "false" || str === "null" || str === "yes" || str === "no") {
        return `"${str}"`;
    }

    return str;
}
