import { describe, expect, it } from "vitest";
import { renderAnnotationSvg } from "../../src/shared/annotation-renderers.js";

const theme = {
    background: "#121212",
    accent: "#07C107",
    font: "Roboto Mono",
    font_size: 48,
    padding: 40,
};


describe("renderAnnotationSvg - text", () => {
    it("splits multi-line content into <tspan> elements so \\n is honored", () => {
        const svg = renderAnnotationSvg({
            type: "text",
            props: {
                position: { x: 100, y: 200 },
                content: "First line\nSecond line\nThird line",
                style: "title",
            },
        }, theme);

        expect(svg).toContain("<tspan");
        expect(svg).toContain("First line</tspan>");
        expect(svg).toContain("Second line</tspan>");
        expect(svg).toContain("Third line</tspan>");
        // Subsequent lines must offset via dy
        expect(svg).toMatch(/dy="1\.2em"/);
    });

    it("renders the theme font in font-family", () => {
        const svg = renderAnnotationSvg({
            type: "text",
            props: {
                position: { x: 100, y: 200 },
                content: "Hi",
                style: "caption",
            },
        }, theme);

        expect(svg).toContain("font-family=\"'Roboto Mono', sans-serif\"");
    });

    it("renders a background rect for caption style", () => {
        const svg = renderAnnotationSvg({
            type: "text",
            props: {
                position: { x: 100, y: 200 },
                content: "Hi",
                style: "caption",
            },
        }, theme);

        expect(svg).toContain("<rect");
        expect(svg).toContain("rgba(0, 0, 0, 0.6)");
    });

    it("renders a background rect for callout style with accent tint", () => {
        const svg = renderAnnotationSvg({
            type: "text",
            props: {
                position: { x: 100, y: 200 },
                content: "Heads up",
                style: "callout",
            },
        }, theme);

        expect(svg).toContain("rgba(7, 193, 7, 0.15)");
    });

    it("does NOT add a background for title (matches Remotion)", () => {
        const svg = renderAnnotationSvg({
            type: "text",
            props: {
                position: { x: 100, y: 200 },
                content: "Hello",
                style: "title",
            },
        }, theme);

        // title preset has no background
        expect(svg).not.toContain("<rect");
    });

    it("applies letter-spacing to title", () => {
        const svg = renderAnnotationSvg({
            type: "text",
            props: {
                position: { x: 100, y: 200 },
                content: "Hello",
                style: "title",
            },
        }, theme);

        expect(svg).toContain("letter-spacing: -0.02em");
    });

    it("applies uppercase + letter-spacing to label", () => {
        const svg = renderAnnotationSvg({
            type: "text",
            props: {
                position: { x: 100, y: 200 },
                content: "info",
                style: "label",
            },
        }, theme);

        expect(svg).toContain("text-transform: uppercase");
        expect(svg).toContain("letter-spacing: 0.05em");
    });
});


describe("renderAnnotationSvg - stack", () => {
    it("supports \\n inside item content via tspan", () => {
        const svg = renderAnnotationSvg({
            type: "stack",
            props: {
                position: { x: 50, y: 50 },
                items: [
                    { content: "Line A\nLine B", style: "caption" },
                ],
            },
        }, theme);

        expect(svg).toContain("Line A</tspan>");
        expect(svg).toContain("Line B</tspan>");
    });

    it("does NOT render a caption background (matches Stack preset)", () => {
        const svg = renderAnnotationSvg({
            type: "stack",
            props: {
                position: { x: 50, y: 50 },
                items: [
                    { content: "Hi", style: "caption" },
                ],
            },
        }, theme);

        expect(svg).not.toContain("<rect");
    });

    it("renders a callout background (matches Stack preset)", () => {
        const svg = renderAnnotationSvg({
            type: "stack",
            props: {
                position: { x: 50, y: 50 },
                items: [
                    { content: "Tip", style: "callout" },
                ],
            },
        }, theme);

        expect(svg).toContain("rgba(7, 193, 7, 0.15)");
    });
});


describe("renderAnnotationSvg - badge", () => {
    it("renders circle variant centered on (x, y) with diameter == size", () => {
        const svg = renderAnnotationSvg({
            type: "badge",
            props: {
                position: { x: 200, y: 100 },
                content: "1",
                variant: "circle",
                size: 40,
                color: "#07C107",
                text_color: "#FFFFFF",
            },
        }, theme);

        // Badge should be a rect (not <circle>) so the same rendering path
        // works for both pill and circle variants.
        // For circle: width == height == 40, top-left at (200-20, 100-20)
        expect(svg).toContain("x=\"180\"");
        expect(svg).toContain("y=\"80\"");
        expect(svg).toContain("width=\"40\"");
        expect(svg).toContain("height=\"40\"");
    });

    it("uses fontSize == size * 0.55 (matches Remotion Badge)", () => {
        const svg = renderAnnotationSvg({
            type: "badge",
            props: {
                position: { x: 200, y: 100 },
                content: "X",
                variant: "circle",
                size: 40,
                color: "#07C107",
                text_color: "#FFFFFF",
            },
        }, theme);

        expect(svg).toContain("font-size=\"22\"");
    });
});


describe("renderAnnotationSvg - highlight", () => {
    it("renders rounded corners (rx=4) to match Remotion's borderRadius", () => {
        const svg = renderAnnotationSvg({
            type: "highlight",
            props: {
                region: { x: 10, y: 20, w: 100, h: 50 },
            },
        }, theme);

        expect(svg).toContain("rx=\"4\"");
    });
});
