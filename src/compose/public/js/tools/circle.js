/**
 * Circle tool: click to set center, drag to set radius.
 */

import { getDrawingPreview } from "../canvas.js";

let svg = null;
let callbacks = null;
let drawing = false;
let centerPt = null;
let previewCircle = null;

const MIN_RADIUS = 10;


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

    centerPt = callbacks.screenToSvg(e.clientX, e.clientY);
    drawing = true;

    const preview = getDrawingPreview();
    previewCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    previewCircle.setAttribute("cx", String(centerPt.x));
    previewCircle.setAttribute("cy", String(centerPt.y));
    previewCircle.setAttribute("r", "0");
    previewCircle.setAttribute("fill", "none");
    previewCircle.setAttribute("stroke", "#07C107");
    previewCircle.setAttribute("stroke-width", "4");
    previewCircle.setAttribute("stroke-dasharray", "6 3");
    preview.appendChild(previewCircle);
}


function onMouseMove(e) {
    if (!drawing || !previewCircle) return;

    const pt = callbacks.screenToSvg(e.clientX, e.clientY);
    const dx = pt.x - centerPt.x;
    const dy = pt.y - centerPt.y;
    const r = Math.round(Math.sqrt(dx * dx + dy * dy));

    previewCircle.setAttribute("r", String(r));
}


function onMouseUp(e) {
    if (!drawing) return;
    drawing = false;

    const pt = callbacks.screenToSvg(e.clientX, e.clientY);
    const dx = pt.x - centerPt.x;
    const dy = pt.y - centerPt.y;
    const r = Math.round(Math.sqrt(dx * dx + dy * dy));

    clearPreview();

    if (r < MIN_RADIUS) return;

    callbacks.addAnnotation({
        type: "circle",
        props: {
            target: { x: centerPt.x, y: centerPt.y, r },
            color: "$accent",
            stroke_width: 4,
            animate: "fade-in",
        },
    });
}


function clearPreview() {
    const preview = getDrawingPreview();
    if (preview) preview.innerHTML = "";
    previewCircle = null;
    centerPt = null;
}
