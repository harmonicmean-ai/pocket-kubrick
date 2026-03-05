import { renderAnnotationSvg } from "./renderers.js";


let svgElement = null;
let bgImage = null;
let annotationsGroup = null;
let handlesGroup = null;
let drawingPreview = null;
let videoWidth = 1920;
let videoHeight = 1080;


/**
 * Initialize the SVG canvas inside the given container element.
 */
export function initCanvas(container, w, h) {
    videoWidth = w;
    videoHeight = h;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.style.userSelect = "none";
    svgElement = svg;

    // Defs for filters (cursor shadow, etc.)
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
        <filter id="cursorShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="1" dy="2" stdDeviation="2" flood-opacity="0.5"/>
        </filter>
    `;
    svg.appendChild(defs);

    // Layer 0: Background screenshot
    bgImage = document.createElementNS("http://www.w3.org/2000/svg", "image");
    bgImage.setAttribute("width", String(w));
    bgImage.setAttribute("height", String(h));
    bgImage.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.appendChild(bgImage);

    // Layer 1: Annotations
    annotationsGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    annotationsGroup.setAttribute("id", "annotations-layer");
    svg.appendChild(annotationsGroup);

    // Layer 2: Selection handles
    handlesGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    handlesGroup.setAttribute("id", "handles-layer");
    svg.appendChild(handlesGroup);

    // Layer 3: Drawing preview
    drawingPreview = document.createElementNS("http://www.w3.org/2000/svg", "g");
    drawingPreview.setAttribute("id", "drawing-preview");
    drawingPreview.classList.add("drawing-preview");
    svg.appendChild(drawingPreview);

    container.appendChild(svg);
    updateScale();

    window.addEventListener("resize", updateScale);
}


/**
 * Update the SVG element dimensions to fit its container while
 * preserving the viewBox aspect ratio.
 */
function updateScale() {
    if (!svgElement) return;

    const container = svgElement.parentElement;
    const availW = container.clientWidth - 32;
    const availH = container.clientHeight - 32;
    const scale = Math.min(availW / videoWidth, availH / videoHeight);

    svgElement.setAttribute("width", String(Math.round(videoWidth * scale)));
    svgElement.setAttribute("height", String(Math.round(videoHeight * scale)));
}


/**
 * Convert screen (client) coordinates to SVG viewBox coordinates.
 * Returns integer pixel values in video coordinate space.
 */
export function screenToSvg(clientX, clientY) {
    const pt = svgElement.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svgElement.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm.inverse());
    return {
        x: Math.round(svgPt.x),
        y: Math.round(svgPt.y),
    };
}


/**
 * Get the SVG element for tool event binding.
 */
export function getSvgElement() {
    return svgElement;
}


/**
 * Get the handles group for selection UI.
 */
export function getHandlesGroup() {
    return handlesGroup;
}


/**
 * Get the drawing preview group for in-progress tool shapes.
 */
export function getDrawingPreview() {
    return drawingPreview;
}


/**
 * Set the background screenshot image, applying optional layout properties
 * (position, size, fit, shadow, border_radius) that mirror the Remotion
 * Screenshot component's CSS positioning.
 */
export function setBackgroundImage(src, layout) {
    if (src) {
        bgImage.setAttribute("href", src);

        const x = layout?.position?.x ?? 0;
        const y = layout?.position?.y ?? 0;
        const w = layout?.size?.w ?? videoWidth;
        const h = layout?.size?.h ?? videoHeight;

        bgImage.setAttribute("x", String(x));
        bgImage.setAttribute("y", String(y));
        bgImage.setAttribute("width", String(w));
        bgImage.setAttribute("height", String(h));

        // Map CSS object-fit to SVG preserveAspectRatio
        const fit = layout?.fit ?? "contain";
        // Match Remotion/Sharp behavior: contain aligns top-left, cover stays centered
        const parMap = { contain: "xMinYMin meet", cover: "xMidYMid slice", fill: "none" };
        bgImage.setAttribute("preserveAspectRatio", parMap[fit] ?? "xMinYMin meet");
    } else {
        bgImage.removeAttribute("href");
        bgImage.setAttribute("x", "0");
        bgImage.setAttribute("y", "0");
        bgImage.setAttribute("width", String(videoWidth));
        bgImage.setAttribute("height", String(videoHeight));
        bgImage.setAttribute("preserveAspectRatio", "xMidYMid meet");
    }
}


/**
 * Render all annotations onto the canvas.
 */
export function renderAnnotations(annotations, theme) {
    if (!annotationsGroup) return;

    annotationsGroup.innerHTML = "";

    annotations.forEach((ann, index) => {
        const svgMarkup = renderAnnotationSvg(ann, theme, index);
        if (svgMarkup) {
            const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
            g.classList.add("annotation-group");
            g.setAttribute("data-index", String(index));
            // Offset child annotations into their parent screenshot's coordinate system
            const offset = ann.props._parent_offset;
            if (offset && (offset.x || offset.y)) {
                g.setAttribute("transform", `translate(${offset.x ?? 0}, ${offset.y ?? 0})`);
            }
            g.innerHTML = svgMarkup;
            annotationsGroup.appendChild(g);
        }
    });
}


/**
 * Get the video dimensions.
 */
export function getVideoDimensions() {
    return { w: videoWidth, h: videoHeight };
}
