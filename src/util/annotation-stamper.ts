import sharp from "sharp";
import { applyEventDefaults, resolvePercentages, offsetAnnotationCoordinates } from "../resolver/event-resolver.js";
import { resolveThemeValue } from "../resolver/theme-resolver.js";
import { verbose } from "./logger.js";
import type { Theme } from "../schema/types.js";
import { renderAnnotationSvg, type RenderableAnnotation } from "../shared/annotation-renderers.js";


function buildSvgDefs(): string {
    return [
        "<defs>",
        "<filter id=\"cursorShadow\" x=\"-50%\" y=\"-50%\" width=\"200%\" height=\"200%\">",
        "    <feDropShadow dx=\"1\" dy=\"2\" stdDeviation=\"2\" flood-opacity=\"0.5\"/>",
        "</filter>",
        "</defs>",
    ].join("\n");
}


/**
 * Stamp annotation visuals onto a screenshot and save the result as a PNG.
 *
 * @param screenshotSource - Absolute path to the source screenshot, or a
 *                           Buffer containing the pre-composited image data
 * @param visuals - Raw visual event records (will be run through applyEventDefaults)
 * @param theme - Theme for resolving $variable colors
 * @param outputPath - Absolute path where the preview PNG will be written
 * @param projectRoot - Project root for asset path resolution
 * @param explicitWidth - If provided, use instead of probing image metadata
 * @param explicitHeight - If provided, use instead of probing image metadata
 */
export async function stampAnnotations(
    screenshotSource: string | Buffer,
    visuals: Record<string, unknown>[],
    theme: Theme,
    outputPath: string,
    projectRoot: string,
    explicitWidth?: number,
    explicitHeight?: number,
): Promise<void> {
    const image = sharp(screenshotSource);
    let width: number;
    let height: number;

    if (explicitWidth !== undefined && explicitHeight !== undefined) {
        width = explicitWidth;
        height = explicitHeight;
    } else {
        const metadata = await image.metadata();
        width = metadata.width ?? 1920;
        height = metadata.height ?? 1080;
    }

    // Resolve percentage strings to pixels, then apply defaults and theme colors
    const resolved: RenderableAnnotation[] = visuals.map((v) => {
        const r: Record<string, unknown> = applyEventDefaults(
            resolvePercentages(v, width, height), theme, projectRoot,
        );

        // Offset coordinates by parent screenshot position (for child annotations)
        const parentOffsetX: number | undefined = v._parent_offset_x as number | undefined;
        const parentOffsetY: number | undefined = v._parent_offset_y as number | undefined;
        if (parentOffsetX !== undefined && parentOffsetY !== undefined) {
            offsetAnnotationCoordinates(r, parentOffsetX, parentOffsetY);
        }

        const { type, ...props } = r as Record<string, unknown> & { type: string };
        return { type, props };
    });

    // Build SVG overlay
    const svgParts: string[] = [];
    for (const annotation of resolved) {
        const markup: string = renderAnnotationSvg(annotation, theme);
        if (markup) {
            svgParts.push(markup);
        }
    }

    if (svgParts.length === 0) {
        verbose(`  No renderable annotations, skipping`);
        return;
    }

    const svgOverlay: string = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
        buildSvgDefs(),
        ...svgParts,
        `</svg>`,
    ].join("\n");

    verbose(`  SVG overlay (${width}x${height}): ${svgParts.length} element(s)`);

    await sharp(screenshotSource)
        .composite([{
            input: Buffer.from(svgOverlay),
            top: 0,
            left: 0,
        }])
        .png()
        .toFile(outputPath);
}
