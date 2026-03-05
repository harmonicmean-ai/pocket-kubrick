/**
 * Properties panel: type-specific property editing for the selected annotation.
 */

import { resolveThemeValue } from "./renderers.js";

let appModule = null;


async function getApp() {
    if (!appModule) {
        appModule = await import("./app.js");
    }
    return appModule;
}


const ANIMATE_OPTIONS = [
    "", "fade-in", "fade-out", "slide-left", "slide-right",
    "slide-up", "slide-down", "scale-in", "pulse", "draw", "pop", "none",
];


/**
 * Render the properties panel for the selected annotation.
 */
export function renderPropertiesPanel(annotation, index, theme) {
    const container = document.getElementById("properties-fields");

    if (!annotation || index < 0) {
        container.innerHTML = "<p class=\"placeholder\">Select an annotation to edit its properties.</p>";
        return;
    }

    const rows = [];

    // Type-specific fields
    switch (annotation.type) {
        case "highlight":
            rows.push(groupLabel("Region"));
            rows.push(regionFields(annotation.props.region, index));
            rows.push(groupLabel("Style"));
            rows.push(colorField("color", annotation.props.color ?? "$accent20", index, theme));
            rows.push(textField("border", annotation.props.border ?? "", index));
            break;

        case "circle":
            rows.push(groupLabel("Target"));
            rows.push(targetFields(annotation.props.target, index));
            rows.push(groupLabel("Style"));
            rows.push(colorField("color", annotation.props.color ?? "$accent", index, theme));
            rows.push(numberField("stroke_width", annotation.props.stroke_width ?? 4, index));
            rows.push(colorField("fill", annotation.props.fill ?? "none", index, theme));
            break;

        case "arrow":
            rows.push(groupLabel("From"));
            rows.push(pointFields("from", annotation.props.from, index));
            rows.push(groupLabel("To"));
            rows.push(pointFields("to", annotation.props.to, index));
            rows.push(groupLabel("Style"));
            rows.push(colorField("color", annotation.props.color ?? "$accent", index, theme));
            rows.push(numberField("stroke_width", annotation.props.stroke_width ?? 10, index));
            rows.push(numberField("head_size", annotation.props.head_size ?? 30, index));
            break;

        case "badge":
            rows.push(groupLabel("Position"));
            rows.push(pointFields("position", annotation.props.position, index));
            rows.push(groupLabel("Badge"));
            rows.push(textField("content", annotation.props.content ?? "", index));
            rows.push(selectField("variant", annotation.props.variant ?? "circle", ["circle", "pill"], index));
            rows.push(numberField("size", annotation.props.size ?? 32, index));
            rows.push(groupLabel("Style"));
            rows.push(colorField("color", annotation.props.color ?? "$accent", index, theme));
            rows.push(colorField("text_color", annotation.props.text_color ?? "#FFFFFF", index, theme));
            break;

        case "cursor":
            rows.push(groupLabel("To (destination)"));
            rows.push(pointFields("to", annotation.props.to, index));
            if (annotation.props.from) {
                rows.push(groupLabel("From (origin)"));
                rows.push(pointFields("from", annotation.props.from, index));
            }
            rows.push(groupLabel("Options"));
            rows.push(checkboxField("click", annotation.props.click ?? false, index));
            break;

        case "zoom":
            rows.push(groupLabel("Source Region"));
            rows.push(regionFields(annotation.props.region, index));
            rows.push(groupLabel("Zoom"));
            rows.push(numberField("scale", annotation.props.scale ?? 2, index, 0.5, 10, 0.5));
            if (annotation.props.position) {
                rows.push(groupLabel("Display Position"));
                rows.push(pointFields("position", annotation.props.position, index));
            }
            break;

        case "text":
            rows.push(groupLabel("Position"));
            rows.push(pointFields("position", annotation.props.position, index));
            rows.push(groupLabel("Content"));
            rows.push(textField("content", annotation.props.content ?? "", index));
            rows.push(selectField("style", annotation.props.style ?? "caption", ["title", "caption", "callout", "label"], index));
            rows.push(selectField("align", annotation.props.align ?? "left", ["left", "center", "right"], index));
            rows.push(colorField("color", annotation.props.color ?? "#FFFFFF", index, theme));
            rows.push(numberField("font_size", annotation.props.font_size ?? "", index, 12, 200, 1));
            break;

        case "stack":
            rows.push(groupLabel("Position"));
            rows.push(pointFields("position", annotation.props.position ?? { x: 200, y: 240 }, index));
            rows.push(numberField("gap", annotation.props.gap ?? 40, index, 0, 200, 1));
            rows.push(groupLabel("Items (edit in YAML)"));
            {
                const items = annotation.props.items ?? [];
                rows.push(`<div class="prop-row"><label>count</label><span>${items.length} item(s)</span></div>`);
                for (const item of items) {
                    rows.push(`<div class="prop-row item-preview">${escapeAttr(item.content ?? "")}</div>`);
                }
            }
            break;
    }

    // Timing fields
    rows.push(groupLabel("Timing"));
    rows.push(textField("at", annotation.props.at ?? "", index));
    rows.push(textField("disappear_at", annotation.props.disappear_at ?? "", index));

    // Common fields
    rows.push(groupLabel("Animation"));
    rows.push(selectField("animate", annotation.props.animate ?? "", ANIMATE_OPTIONS, index));
    rows.push(numberField("animate_duration", annotation.props.animate_duration ?? 0.4, index, 0.1, 5, 0.1));
    rows.push(numberField("z_index", annotation.props.z_index ?? 0, index, -10, 100, 1));

    container.innerHTML = rows.join("");

    // Attach event handlers
    attachHandlers(container, index);
}


function attachHandlers(container, index) {
    container.querySelectorAll("input, select").forEach((el) => {
        const handler = async (e) => {
            const app = await getApp();
            const field = el.dataset.field;
            let value = el.value;

            if (el.type === "number") {
                value = parseFloat(value);
                if (isNaN(value)) return;
                // Integer for coordinate/size fields, float for others
                if (field.match(/(\.x|\.y|\.w|\.h|\.r|stroke_width|head_size|size|z_index)$/)) {
                    value = Math.round(value);
                }
            } else if (el.type === "checkbox") {
                value = el.checked;
            } else if (el.type === "text" && (field === "at" || field === "disappear_at")) {
                // Convert empty strings to undefined so they don't pollute YAML
                if (value === "") {
                    value = undefined;
                }
            }

            app.updateAnnotation(index, field, value);
        };

        if (el.type === "checkbox") {
            el.addEventListener("change", handler);
        } else {
            el.addEventListener("input", handler);
        }
    });
}


// ── Field Builders ──────────────────────────────────────────────

function groupLabel(label) {
    return `<div class="prop-group-label">${label}</div>`;
}


function regionFields(region, index) {
    if (!region) return "";
    return `
        <div class="prop-row">
            <label>x</label>
            <input type="number" data-field="region.x" value="${region.x}" step="1">
            <label>y</label>
            <input type="number" data-field="region.y" value="${region.y}" step="1">
        </div>
        <div class="prop-row">
            <label>w</label>
            <input type="number" data-field="region.w" value="${region.w}" step="1" min="10">
            <label>h</label>
            <input type="number" data-field="region.h" value="${region.h}" step="1" min="10">
        </div>`;
}


function targetFields(target, index) {
    if (!target) return "";
    return `
        <div class="prop-row">
            <label>x</label>
            <input type="number" data-field="target.x" value="${target.x}" step="1">
            <label>y</label>
            <input type="number" data-field="target.y" value="${target.y}" step="1">
        </div>
        <div class="prop-row">
            <label>r</label>
            <input type="number" data-field="target.r" value="${target.r}" step="1" min="10">
        </div>`;
}


function pointFields(prefix, point, index) {
    if (!point) return "";
    return `
        <div class="prop-row">
            <label>x</label>
            <input type="number" data-field="${prefix}.x" value="${point.x}" step="1">
            <label>y</label>
            <input type="number" data-field="${prefix}.y" value="${point.y}" step="1">
        </div>`;
}


function colorField(name, value, index, theme) {
    const resolved = resolveThemeValue(value, theme);
    const swatchColor = (resolved && resolved !== value) ? resolved : value;
    const isValidColor = /^#[0-9a-fA-F]{3,8}$/.test(swatchColor) || /^rgba?\(/.test(swatchColor);

    return `
        <div class="prop-row">
            <label>${name}</label>
            <input type="text" data-field="${name}" value="${escapeAttr(value)}">
            ${isValidColor ? `<div class="color-swatch" style="background: ${swatchColor}"></div>` : ""}
        </div>`;
}


function textField(name, value, index) {
    return `
        <div class="prop-row">
            <label>${name}</label>
            <input type="text" data-field="${name}" value="${escapeAttr(value)}">
        </div>`;
}


function numberField(name, value, index, min, max, step) {
    const minAttr = min !== undefined ? ` min="${min}"` : "";
    const maxAttr = max !== undefined ? ` max="${max}"` : "";
    const stepAttr = step !== undefined ? ` step="${step}"` : " step=\"1\"";

    return `
        <div class="prop-row">
            <label>${name}</label>
            <input type="number" data-field="${name}" value="${value}"${minAttr}${maxAttr}${stepAttr}>
        </div>`;
}


function selectField(name, value, options, index) {
    const optionsHtml = (Array.isArray(options) ? options : Object.keys(options))
        .map((opt) => {
            const label = opt || "(none)";
            const selected = opt === value ? " selected" : "";
            return `<option value="${opt}"${selected}>${label}</option>`;
        })
        .join("");

    return `
        <div class="prop-row">
            <label>${name}</label>
            <select data-field="${name}">${optionsHtml}</select>
        </div>`;
}


function checkboxField(name, checked, index) {
    return `
        <div class="prop-row">
            <label>${name}</label>
            <input type="checkbox" data-field="${name}"${checked ? " checked" : ""}>
        </div>`;
}


function escapeAttr(str) {
    return String(str).replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
