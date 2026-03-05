/**
 * Zoom tool: click-drag to draw the source region rectangle.
 * Behaves like highlight but creates a zoom annotation.
 */

import { getDrawingPreview } from "../canvas.js";

let svg = null;
let callbacks = null;
let drawing = false;
let startPt = null;
let previewRect = null;

const MIN_SIZE = 10;


export function activateTool(svgEl, state, cbs) {
    svg = svgEl;
    callbacks = cbs;

    svg.addEventListener("mousedown", onMouseDown);
    svg.addEventListener("mousemove", onMouseMove);
    svg.addEventListener("mouseup", onMouseUp);
    svg.style.cursor = "crosshair";
}


export function deactivateTool() {
    if (!svg) return;
    svg.removeEventListener("mousedown", onMouseDown);
    svg.removeEventListener("mousemove", onMouseMove);
    svg.removeEventListener("mouseup", onMouseUp);
    clearPreview();
    svg = null;
}


function onMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();

    startPt = callbacks.screenToSvg(e.clientX, e.clientY);
    drawing = true;

    const preview = getDrawingPreview();
    previewRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    previewRect.setAttribute("fill", "none");
    previewRect.setAttribute("stroke", "rgba(255, 255, 255, 0.6)");
    previewRect.setAttribute("stroke-width", "2");
    previewRect.setAttribute("stroke-dasharray", "6 3");
    preview.appendChild(previewRect);
}


function onMouseMove(e) {
    if (!drawing || !previewRect) return;

    const pt = callbacks.screenToSvg(e.clientX, e.clientY);
    const x = Math.min(startPt.x, pt.x);
    const y = Math.min(startPt.y, pt.y);
    const w = Math.abs(pt.x - startPt.x);
    const h = Math.abs(pt.y - startPt.y);

    previewRect.setAttribute("x", String(x));
    previewRect.setAttribute("y", String(y));
    previewRect.setAttribute("width", String(w));
    previewRect.setAttribute("height", String(h));
}


function onMouseUp(e) {
    if (!drawing) return;
    drawing = false;

    const pt = callbacks.screenToSvg(e.clientX, e.clientY);
    const x = Math.min(startPt.x, pt.x);
    const y = Math.min(startPt.y, pt.y);
    const w = Math.abs(pt.x - startPt.x);
    const h = Math.abs(pt.y - startPt.y);

    clearPreview();

    if (w < MIN_SIZE || h < MIN_SIZE) return;

    callbacks.addAnnotation({
        type: "zoom",
        props: {
            region: { x, y, w, h },
            scale: 2,
            animate: "fade-in",
        },
    });
}


function clearPreview() {
    const preview = getDrawingPreview();
    if (preview) preview.innerHTML = "";
    previewRect = null;
    startPt = null;
}
