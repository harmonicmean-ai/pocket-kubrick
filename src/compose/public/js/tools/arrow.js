/**
 * Arrow tool: click-drag from start point to end point.
 */

import { getDrawingPreview } from "../canvas.js";

let svg = null;
let callbacks = null;
let drawing = false;
let fromPt = null;
let previewLine = null;

const MIN_LENGTH = 15;


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

    fromPt = callbacks.screenToSvg(e.clientX, e.clientY);
    drawing = true;

    const preview = getDrawingPreview();
    previewLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    previewLine.setAttribute("x1", String(fromPt.x));
    previewLine.setAttribute("y1", String(fromPt.y));
    previewLine.setAttribute("x2", String(fromPt.x));
    previewLine.setAttribute("y2", String(fromPt.y));
    previewLine.setAttribute("stroke", "#07C107");
    previewLine.setAttribute("stroke-width", "10");
    previewLine.setAttribute("stroke-linecap", "round");
    previewLine.setAttribute("stroke-dasharray", "8 4");
    preview.appendChild(previewLine);
}


function onMouseMove(e) {
    if (!drawing || !previewLine) return;

    const pt = callbacks.screenToSvg(e.clientX, e.clientY);
    previewLine.setAttribute("x2", String(pt.x));
    previewLine.setAttribute("y2", String(pt.y));
}


function onMouseUp(e) {
    if (!drawing) return;
    drawing = false;

    const toPt = callbacks.screenToSvg(e.clientX, e.clientY);
    const dx = toPt.x - fromPt.x;
    const dy = toPt.y - fromPt.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    clearPreview();

    if (len < MIN_LENGTH) return;

    callbacks.addAnnotation({
        type: "arrow",
        props: {
            from: { x: fromPt.x, y: fromPt.y },
            to: { x: toPt.x, y: toPt.y },
            color: "$accent",
            stroke_width: 10,
            animate: "draw",
        },
    });
}


function clearPreview() {
    const preview = getDrawingPreview();
    if (preview) preview.innerHTML = "";
    previewLine = null;
    fromPt = null;
}
