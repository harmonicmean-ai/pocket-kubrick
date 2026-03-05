/**
 * Cursor tool: click to place cursor destination.
 * Hold Shift + click first to set a "from" origin, then click for "to".
 */

import { getDrawingPreview } from "../canvas.js";

let svg = null;
let callbacks = null;
let fromPt = null;
let previewMarker = null;


export function activateTool(svgEl, state, cbs) {
    svg = svgEl;
    callbacks = cbs;

    svg.addEventListener("click", onClick);
    svg.style.cursor = "crosshair";
}


export function deactivateTool() {
    if (!svg) return;
    svg.removeEventListener("click", onClick);
    clearPreview();
    fromPt = null;
    svg = null;
}


function onClick(e) {
    // Ignore clicks on existing annotations or handles
    if (e.target.closest(".annotation-group") || e.target.closest(".selection-handle")) {
        return;
    }

    const pt = callbacks.screenToSvg(e.clientX, e.clientY);

    if (e.shiftKey && !fromPt) {
        // Shift+click: set "from" point
        fromPt = pt;

        // Show preview marker at from position
        const preview = getDrawingPreview();
        previewMarker = document.createElementNS("http://www.w3.org/2000/svg", "g");
        previewMarker.innerHTML = `
            <circle cx="${pt.x}" cy="${pt.y}" r="8" fill="rgba(255,255,255,0.5)" stroke="white" stroke-width="2"/>
            <text x="${pt.x}" y="${pt.y + 25}" text-anchor="middle" fill="white" font-size="14" font-family="sans-serif">from</text>
        `;
        preview.appendChild(previewMarker);
        return;
    }

    // Place the cursor
    const props = {
        to: { x: pt.x, y: pt.y },
        click: false,
    };

    if (fromPt) {
        props.from = { x: fromPt.x, y: fromPt.y };
    }

    clearPreview();
    fromPt = null;

    callbacks.addAnnotation({
        type: "cursor",
        props,
    });
}


function clearPreview() {
    const preview = getDrawingPreview();
    if (preview) preview.innerHTML = "";
    previewMarker = null;
}
