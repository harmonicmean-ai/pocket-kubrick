import type { Theme } from "../schema/types.js";

export interface RenderableAnnotation {
    type: string;
    props: Record<string, unknown>;
}

export type ThemeLike = Pick<Theme, "background" | "accent" | "font"> | Partial<Theme> | undefined;

const THEME_KEYS = ["background", "accent", "font"] as const;

export function resolveThemeValue(value: unknown, theme: ThemeLike): unknown {
    if (typeof value !== "string" || !value.includes("$")) {
        return value;
    }

    return value.replace(/\$([a-z]+\d*)/gi, (match: string, varBody: string) => {
        for (const key of THEME_KEYS) {
            const base = theme?.[key];
            if (!base) {
                continue;
            }

            if (varBody === key) {
                return base;
            }

            if (varBody.startsWith(key) && varBody.length > key.length) {
                const suffix = varBody.slice(key.length);
                const opacityPercent = parseInt(suffix, 10);
                if (!Number.isNaN(opacityPercent) && opacityPercent >= 0 && opacityPercent <= 100) {
                    return hexWithOpacity(base, opacityPercent);
                }
            }
        }
        return match;
    });
}

function hexWithOpacity(hex: string, opacityPercent: number): string {
    const alpha = Math.round((opacityPercent / 100) * 255);
    const alphaSuffix = alpha.toString(16).padStart(2, "0");
    const baseHex = hex.length === 9 ? hex.slice(0, 7) : hex;
    return `${baseHex}${alphaSuffix}`;
}

function resolveColor(value: unknown, theme: ThemeLike): unknown {
    if (!theme || !value) return value;
    return resolveThemeValue(value, theme);
}

function themeFont(theme: ThemeLike): string {
    const font = theme?.font ?? "sans-serif";
    const primary = font.includes(" ") ? `'${font}'` : font;
    return `${primary}, sans-serif`;
}

function escapeXml(str: unknown): string {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function parseBorder(border: unknown, theme: ThemeLike): { width: number; color: string } | null {
    const resolved = resolveColor(border, theme);
    if (typeof resolved !== "string") return null;
    const match = resolved.match(/^(\d+(?:\.\d+)?)px\s+solid\s+(.+)$/);
    if (!match) return null;
    return { width: parseFloat(match[1]), color: match[2] };
}

function renderHighlight(props: Record<string, unknown>, theme: ThemeLike): string {
    const region = props.region as { x: number; y: number; w: number; h: number } | undefined;
    if (!region) return "";

    const fillColor = resolveColor(props.color ?? "$accent20", theme) ?? "transparent";
    const borderStr = props.border ?? null;

    let strokeAttr = "none";
    let strokeWidthAttr = 0;

    if (borderStr) {
        const parsed = parseBorder(borderStr, theme);
        if (parsed) {
            strokeAttr = parsed.color;
            strokeWidthAttr = parsed.width;
        }
    }

    return `<rect x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}" ` +
        `fill="${fillColor}" stroke="${strokeAttr}" stroke-width="${strokeWidthAttr}"/>`;
}

function renderCircle(props: Record<string, unknown>, theme: ThemeLike): string {
    const target = props.target as { x: number; y: number; r: number } | undefined;
    if (!target) return "";

    const color = resolveColor(props.color ?? "$accent", theme) ?? "#FF0000";
    const strokeWidth = (props.stroke_width as number) ?? 4;
    const fill = resolveColor(props.fill, theme) ?? "none";

    return `<circle cx="${target.x}" cy="${target.y}" r="${target.r}" ` +
        `fill="${fill}" stroke="${color}" stroke-width="${strokeWidth}"/>`;
}

function renderArrow(props: Record<string, unknown>, theme: ThemeLike): string {
    const from = props.from as { x: number; y: number } | undefined;
    const to = props.to as { x: number; y: number } | undefined;
    if (!from || !to) return "";

    const color = resolveColor(props.color ?? "$accent", theme) ?? "#FF0000";
    const strokeWidth = (props.stroke_width as number) ?? 10;
    const headSize = (props.head_size as number) ?? strokeWidth * 3;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return "";

    const ux = dx / len;
    const uy = dy / len;
    const headLength = Math.min(headSize, len);
    const halfWidth = headLength * 0.5;

    const arrowBaseX = to.x - ux * headLength;
    const arrowBaseY = to.y - uy * headLength;
    const px = -uy * halfWidth;
    const py = ux * halfWidth;

    const p1x = arrowBaseX + px;
    const p1y = arrowBaseY + py;
    const p2x = arrowBaseX - px;
    const p2y = arrowBaseY - py;

    const shorten = Math.min(Math.max(headLength / 2 + strokeWidth / 2, 0), len);
    const lineLength = len - shorten;
    const parts: string[] = [];

    if (lineLength > 0.5) {
        const lineEndX = to.x - ux * shorten;
        const lineEndY = to.y - uy * shorten;
        parts.push(
            `<line x1="${from.x}" y1="${from.y}" x2="${lineEndX}" y2="${lineEndY}" ` +
            `stroke="${color}" stroke-width="${strokeWidth}"/>`
        );
    }

    parts.push(
        `<polygon points="${p1x},${p1y} ${to.x},${to.y} ${p2x},${p2y}" fill="${color}"/>`
    );

    return parts.join("");
}

function renderBadge(props: Record<string, unknown>, theme: ThemeLike): string {
    const pos = props.position as { x: number; y: number } | undefined;
    if (!pos) return "";

    const content = String(props.content ?? "");
    const variant = (props.variant as string) ?? "circle";
    const color = resolveColor(props.color ?? "$accent", theme) ?? "#07C107";
    const textColor = resolveColor(props.text_color ?? "#FFFFFF", theme) ?? "#FFFFFF";
    const size = (props.size as number) ?? 32;

    const parts: string[] = [];

    if (variant === "pill") {
        const pillWidth = Math.max(size * 2, content.length * size * 0.7);
        const pillHeight = size * 1.4;
        const rx = pillHeight / 2;
        parts.push(
            `<rect x="${pos.x - pillWidth / 2}" y="${pos.y - pillHeight / 2}" ` +
            `width="${pillWidth}" height="${pillHeight}" rx="${rx}" fill="${color}"/>`
        );
    } else {
        parts.push(
            `<circle cx="${pos.x}" cy="${pos.y}" r="${size}" fill="${color}"/>`
        );
    }

    const fontSize = size * 0.8;
    parts.push(
        `<text x="${pos.x}" y="${pos.y}" text-anchor="middle" dominant-baseline="central" ` +
        `fill="${textColor}" font-size="${fontSize}" font-family="${themeFont(theme)}">` +
        `${escapeXml(content)}</text>`
    );

    return parts.join("");
}

function renderCursor(props: Record<string, unknown>): string {
    const to = props.to as { x: number; y: number } | undefined;
    if (!to) return "";

    const click = (props.click as boolean) ?? false;
    const parts: string[] = [];

    if (click) {
        parts.push(
            `<circle cx="${to.x}" cy="${to.y}" r="20" fill="rgba(255, 255, 255, 0.3)" stroke="none"/>`
        );
    }

    parts.push(
        `<g transform="translate(${to.x}, ${to.y})" filter="url(#cursorShadow)">`,
        `<path d="M5 3l14 8.5-6.5 1.5-3.5 6z" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>`,
        `</g>`
    );

    return parts.join("");
}

function renderZoom(props: Record<string, unknown>, theme: ThemeLike): string {
    const region = props.region as { x: number; y: number; w: number; h: number } | undefined;
    if (!region) return "";

    const scale = (props.scale as number) ?? 2;
    const position = props.position as { x?: number; y?: number } | undefined;
    const displayX = position?.x ?? (region.x + region.w + 20);
    const displayY = position?.y ?? region.y;
    const displayW = region.w * scale;
    const displayH = region.h * scale;

    const parts: string[] = [];

    parts.push(
        `<rect x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}" ` +
        `fill="none" stroke="rgba(255, 255, 255, 0.6)" stroke-width="2" stroke-dasharray="6 3"/>`
    );

    parts.push(
        `<rect x="${displayX}" y="${displayY}" width="${displayW}" height="${displayH}" ` +
        `fill="rgba(30, 30, 30, 0.7)" stroke="rgba(255, 255, 255, 0.8)" stroke-width="2" rx="8"/>`
    );

    const labelX = displayX + displayW / 2;
    const labelY = displayY + displayH / 2;
    parts.push(
        `<text x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="central" ` +
        `fill="rgba(255, 255, 255, 0.6)" font-size="24" font-family="${themeFont(theme)}">` +
        `Zoom x${scale}</text>`
    );

    const srcMidX = region.x + region.w;
    const srcMidY = region.y + region.h / 2;
    parts.push(
        `<line x1="${srcMidX}" y1="${srcMidY}" x2="${displayX}" y2="${displayY + displayH / 2}" ` +
        `stroke="rgba(255, 255, 255, 0.3)" stroke-width="1" stroke-dasharray="4 2"/>`
    );

    return parts.join("");
}

const TEXT_STYLE_PRESETS: Record<string, { fontSize: number; fontWeight: string | number }> = {
    title:   { fontSize: 96, fontWeight: "bold" },
    caption: { fontSize: 48, fontWeight: "normal" },
    callout: { fontSize: 40, fontWeight: 600 },
    label:   { fontSize: 32, fontWeight: 500 },
};

function renderText(props: Record<string, unknown>, theme: ThemeLike): string {
    const pos = props.position as { x: number; y: number } | undefined;
    if (!pos) return "";

    const content = String(props.content ?? "");
    const styleName = (props.style as string) ?? "caption";
    const preset = TEXT_STYLE_PRESETS[styleName] ?? TEXT_STYLE_PRESETS.caption;
    const fontSize = (props.font_size as number) ?? preset.fontSize;
    const fontWeight = preset.fontWeight;
    const align = (props.align as string) ?? "left";
    const color = resolveColor(props.color ?? "#FFFFFF", theme) ?? "#FFFFFF";

    const anchorMap: Record<string, string> = { left: "start", center: "middle", right: "end" };
    const textAnchor = anchorMap[align] ?? "start";

    const transform = styleName === "label"
        ? ` style="text-transform: uppercase; letter-spacing: 0.05em;"`
        : "";

    return `<text x="${pos.x}" y="${pos.y}" text-anchor="${textAnchor}" dominant-baseline="hanging" ` +
        `fill="${color}" font-size="${fontSize}" font-weight="${fontWeight}" ` +
        `font-family="${themeFont(theme)}"${transform}>` +
        `${escapeXml(content)}</text>`;
}

function renderStack(props: Record<string, unknown>, theme: ThemeLike): string {
    const pos = props.position as { x: number; y: number } | undefined;
    if (!pos) return "";

    const items = props.items as Record<string, unknown>[] | undefined;
    if (!items || items.length === 0) return "";

    const gap = (props.gap as number) ?? 40;
    const parts: string[] = [];
    let yOffset = 0;

    for (const item of items) {
        const content = String(item.content ?? "");
        const styleName = (item.style as string) ?? "caption";
        const preset = TEXT_STYLE_PRESETS[styleName] ?? TEXT_STYLE_PRESETS.caption;
        const fontSize = (item.font_size as number) ?? preset.fontSize;
        const fontWeight = preset.fontWeight;
        const color = resolveColor(item.color ?? "#FFFFFF", theme) ?? "#FFFFFF";

        parts.push(
            `<text x="${pos.x}" y="${pos.y + yOffset}" text-anchor="start" dominant-baseline="hanging" ` +
            `fill="${color}" font-size="${fontSize}" font-weight="${fontWeight}" ` +
            `font-family="${themeFont(theme)}">` +
            `${escapeXml(content)}</text>`
        );

        yOffset += fontSize + gap;
    }

    return parts.join("");
}

export function renderAnnotationSvg(annotation: RenderableAnnotation, theme: ThemeLike): string {
    const { type, props } = annotation;

    switch (type) {
        case "highlight":
            return renderHighlight(props, theme);
        case "circle":
            return renderCircle(props, theme);
        case "arrow":
            return renderArrow(props, theme);
        case "badge":
            return renderBadge(props, theme);
        case "cursor":
            return renderCursor(props);
        case "zoom":
            return renderZoom(props, theme);
        case "text":
            return renderText(props, theme);
        case "stack":
            return renderStack(props, theme);
        default:
            return "";
    }
}

export function getAnnotationSummary(annotation: RenderableAnnotation): string {
    const props = annotation.props;

    switch (annotation.type) {
        case "highlight": {
            const r = props.region as { x: number; y: number; w: number; h: number } | undefined;
            return r ? `${r.w}x${r.h} at (${r.x}, ${r.y})` : "no region";
        }
        case "circle": {
            const t = props.target as { x: number; y: number; r: number } | undefined;
            return t ? `r=${t.r} at (${t.x}, ${t.y})` : "no target";
        }
        case "arrow": {
            const f = props.from as { x: number; y: number } | undefined;
            const t = props.to as { x: number; y: number } | undefined;
            return f && t ? `(${f.x},${f.y}) -> (${t.x},${t.y})` : "no points";
        }
        case "badge": {
            const p = props.position as { x: number; y: number } | undefined;
            const c = props.content ?? "";
            return p ? `"${c}" at (${p.x}, ${p.y})` : "no position";
        }
        case "cursor": {
            const t = props.to as { x: number; y: number } | undefined;
            return t ? `to (${t.x}, ${t.y})${props.click ? " + click" : ""}` : "no target";
        }
        case "zoom": {
            const r = props.region as { x: number; y: number; w: number; h: number } | undefined;
            const s = (props.scale as number) ?? 2;
            return r ? `x${s} ${r.w}x${r.h} at (${r.x}, ${r.y})` : "no region";
        }
        case "text": {
            const p = props.position as { x: number; y: number } | undefined;
            const c = props.content ?? "";
            return p ? `"${c}" at (${p.x}, ${p.y})` : "no position";
        }
        case "stack": {
            const p = props.position as { x: number; y: number } | undefined;
            const items = props.items as unknown[] | undefined;
            return p ? `${items?.length ?? 0} item(s) at (${p.x}, ${p.y})` : "no position";
        }
        default:
            return annotation.type;
    }
}
