/**
 * Select tool: click to select annotations, drag to move, drag handles to resize.
 */

import { getHandlesGroup } from "../canvas.js";

let svg = null;
let appState = null;
let callbacks = null;
let dragging = false;
let dragStartSvg = null;
let dragOriginalProps = null;
let resizing = false;
let resizeHandle = null;
let resizeOriginal = null;

const HANDLE_SIZE = 10;


export function activateTool(svgEl, state, cbs) {
    svg = svgEl;
    appState = state;
    callbacks = cbs;

    svg.addEventListener("mousedown", onMouseDown);
    svg.addEventListener("mousemove", onMouseMove);
    svg.addEventListener("mouseup", onMouseUp);
    svg.style.cursor = "default";
}


export function deactivateTool() {
    if (!svg) return;
    svg.removeEventListener("mousedown", onMouseDown);
    svg.removeEventListener("mousemove", onMouseMove);
    svg.removeEventListener("mouseup", onMouseUp);
    clearHandles();
    svg = null;
}


function onMouseDown(e) {
    if (e.button !== 0) return;

    const pt = callbacks.screenToSvg(e.clientX, e.clientY);

    // Check if clicking a resize handle
    const handleEl = e.target.closest(".selection-handle");
    if (handleEl && appState.selectedIndex >= 0) {
        resizing = true;
        resizeHandle = handleEl.dataset.handle;
        const ann = appState.annotations[appState.selectedIndex];
        resizeOriginal = JSON.parse(JSON.stringify(ann.props));
        dragStartSvg = pt;
        e.preventDefault();
        return;
    }

    // Check if clicking an annotation
    const group = e.target.closest(".annotation-group");
    if (group) {
        const index = parseInt(group.dataset.index, 10);
        callbacks.selectAnnotation(index);
        dragging = true;
        dragStartSvg = pt;
        dragOriginalProps = JSON.parse(JSON.stringify(appState.annotations[index].props));
        e.preventDefault();
        return;
    }

    // Click on empty space -- deselect
    callbacks.selectAnnotation(-1);
    clearHandles();
}


function onMouseMove(e) {
    if (!dragStartSvg) return;

    const pt = callbacks.screenToSvg(e.clientX, e.clientY);
    const dx = pt.x - dragStartSvg.x;
    const dy = pt.y - dragStartSvg.y;

    if (resizing && appState.selectedIndex >= 0) {
        applyResize(dx, dy);
        return;
    }

    if (dragging && appState.selectedIndex >= 0) {
        applyMove(dx, dy);
    }
}


function onMouseUp() {
    dragging = false;
    resizing = false;
    dragStartSvg = null;
    dragOriginalProps = null;
    resizeHandle = null;
    resizeOriginal = null;

    if (appState.selectedIndex >= 0) {
        showHandles(appState.selectedIndex);
    }
}


function applyMove(dx, dy) {
    const ann = appState.annotations[appState.selectedIndex];
    const orig = dragOriginalProps;

    switch (ann.type) {
        case "highlight":
        case "zoom":
            callbacks.updateAnnotation(appState.selectedIndex, "region.x", orig.region.x + dx);
            callbacks.updateAnnotation(appState.selectedIndex, "region.y", orig.region.y + dy);
            if (ann.type === "zoom" && ann.props.position) {
                callbacks.updateAnnotation(appState.selectedIndex, "position.x", (orig.position?.x ?? 0) + dx);
                callbacks.updateAnnotation(appState.selectedIndex, "position.y", (orig.position?.y ?? 0) + dy);
            }
            break;
        case "circle":
            callbacks.updateAnnotation(appState.selectedIndex, "target.x", orig.target.x + dx);
            callbacks.updateAnnotation(appState.selectedIndex, "target.y", orig.target.y + dy);
            break;
        case "arrow":
            callbacks.updateAnnotation(appState.selectedIndex, "from.x", orig.from.x + dx);
            callbacks.updateAnnotation(appState.selectedIndex, "from.y", orig.from.y + dy);
            callbacks.updateAnnotation(appState.selectedIndex, "to.x", orig.to.x + dx);
            callbacks.updateAnnotation(appState.selectedIndex, "to.y", orig.to.y + dy);
            break;
        case "badge":
            callbacks.updateAnnotation(appState.selectedIndex, "position.x", orig.position.x + dx);
            callbacks.updateAnnotation(appState.selectedIndex, "position.y", orig.position.y + dy);
            break;
        case "cursor":
            callbacks.updateAnnotation(appState.selectedIndex, "to.x", orig.to.x + dx);
            callbacks.updateAnnotation(appState.selectedIndex, "to.y", orig.to.y + dy);
            if (orig.from) {
                callbacks.updateAnnotation(appState.selectedIndex, "from.x", orig.from.x + dx);
                callbacks.updateAnnotation(appState.selectedIndex, "from.y", orig.from.y + dy);
            }
            break;
        case "text":
        case "stack":
            callbacks.updateAnnotation(appState.selectedIndex, "position.x", orig.position.x + dx);
            callbacks.updateAnnotation(appState.selectedIndex, "position.y", orig.position.y + dy);
            break;
    }
}


function applyResize(dx, dy) {
    const ann = appState.annotations[appState.selectedIndex];
    const orig = resizeOriginal;
    const handle = resizeHandle;

    if (ann.type === "highlight" || ann.type === "zoom") {
        const r = { ...orig.region };

        if (handle.includes("w")) { r.x += dx; r.w -= dx; }
        if (handle.includes("e")) { r.w += dx; }
        if (handle.includes("n")) { r.y += dy; r.h -= dy; }
        if (handle.includes("s")) { r.h += dy; }

        // Ensure minimum size
        if (r.w < 10) { r.w = 10; }
        if (r.h < 10) { r.h = 10; }

        callbacks.updateAnnotation(appState.selectedIndex, "region.x", Math.round(r.x));
        callbacks.updateAnnotation(appState.selectedIndex, "region.y", Math.round(r.y));
        callbacks.updateAnnotation(appState.selectedIndex, "region.w", Math.round(r.w));
        callbacks.updateAnnotation(appState.selectedIndex, "region.h", Math.round(r.h));
    } else if (ann.type === "circle") {
        const t = orig.target;
        const newR = Math.max(10, Math.round(Math.sqrt(dx * dx + dy * dy) + t.r));
        if (handle === "radius") {
            callbacks.updateAnnotation(appState.selectedIndex, "target.r", newR);
        }
    } else if (ann.type === "arrow") {
        if (handle === "from") {
            callbacks.updateAnnotation(appState.selectedIndex, "from.x", Math.round(orig.from.x + dx));
            callbacks.updateAnnotation(appState.selectedIndex, "from.y", Math.round(orig.from.y + dy));
        } else if (handle === "to") {
            callbacks.updateAnnotation(appState.selectedIndex, "to.x", Math.round(orig.to.x + dx));
            callbacks.updateAnnotation(appState.selectedIndex, "to.y", Math.round(orig.to.y + dy));
        }
    }
}


/**
 * Show resize/move handles for the selected annotation.
 * Can be called externally (from app.js) even when the select tool is not active.
 */
export function showHandles(index) {
    clearHandles();
    if (index < 0) return;

    // Get the annotation from the state (appState is set when select tool is active)
    let ann = null;
    if (appState && appState.annotations[index]) {
        ann = appState.annotations[index];
    }
    if (!ann) return;

    const handlesG = getHandlesGroup();

    // Child annotations store coordinates relative to their parent screenshot.
    // Offset handles into absolute SVG space so they align with the rendered annotation.
    const offset = ann.props._parent_offset;
    const ox = offset?.x ?? 0;
    const oy = offset?.y ?? 0;

    if (ann.type === "highlight" || ann.type === "zoom") {
        const r = ann.props.region;
        if (!r) return;

        // 8-point resize handles
        const positions = [
            { handle: "nw", x: r.x + ox, y: r.y + oy },
            { handle: "n",  x: r.x + r.w / 2 + ox, y: r.y + oy },
            { handle: "ne", x: r.x + r.w + ox, y: r.y + oy },
            { handle: "w",  x: r.x + ox, y: r.y + r.h / 2 + oy },
            { handle: "e",  x: r.x + r.w + ox, y: r.y + r.h / 2 + oy },
            { handle: "sw", x: r.x + ox, y: r.y + r.h + oy },
            { handle: "s",  x: r.x + r.w / 2 + ox, y: r.y + r.h + oy },
            { handle: "se", x: r.x + r.w + ox, y: r.y + r.h + oy },
        ];

        positions.forEach((p) => {
            const rect = createHandle(p.x, p.y, p.handle);
            handlesG.appendChild(rect);
        });

        // Selection outline
        const outline = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        outline.setAttribute("x", String(r.x + ox));
        outline.setAttribute("y", String(r.y + oy));
        outline.setAttribute("width", String(r.w));
        outline.setAttribute("height", String(r.h));
        outline.setAttribute("fill", "none");
        outline.setAttribute("stroke", "#07C107");
        outline.setAttribute("stroke-width", "2");
        outline.setAttribute("stroke-dasharray", "6 3");
        outline.setAttribute("pointer-events", "none");
        handlesG.appendChild(outline);

    } else if (ann.type === "circle") {
        const t = ann.props.target;
        if (!t) return;

        // Radius handle at right edge
        const handle = createHandle(t.x + t.r + ox, t.y + oy, "radius");
        handlesG.appendChild(handle);

        // Selection outline
        const outline = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        outline.setAttribute("cx", String(t.x + ox));
        outline.setAttribute("cy", String(t.y + oy));
        outline.setAttribute("r", String(t.r));
        outline.setAttribute("fill", "none");
        outline.setAttribute("stroke", "#07C107");
        outline.setAttribute("stroke-width", "2");
        outline.setAttribute("stroke-dasharray", "6 3");
        outline.setAttribute("pointer-events", "none");
        handlesG.appendChild(outline);

    } else if (ann.type === "arrow") {
        const f = ann.props.from;
        const t = ann.props.to;
        if (!f || !t) return;

        handlesG.appendChild(createHandle(f.x + ox, f.y + oy, "from"));
        handlesG.appendChild(createHandle(t.x + ox, t.y + oy, "to"));

    } else if (ann.type === "badge") {
        const p = ann.props.position;
        if (!p) return;

        // Center handle
        handlesG.appendChild(createHandle(p.x + ox, p.y + oy, "center"));

    } else if (ann.type === "cursor") {
        const t = ann.props.to;
        if (!t) return;

        handlesG.appendChild(createHandle(t.x + ox, t.y + oy, "to"));
        if (ann.props.from) {
            handlesG.appendChild(createHandle(ann.props.from.x + ox, ann.props.from.y + oy, "from"));
        }
    } else if (ann.type === "text" || ann.type === "stack") {
        const p = ann.props.position;
        if (!p) return;

        handlesG.appendChild(createHandle(p.x + ox, p.y + oy, "center"));
    }
}


function createHandle(x, y, handleId) {
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", String(x - HANDLE_SIZE / 2));
    rect.setAttribute("y", String(y - HANDLE_SIZE / 2));
    rect.setAttribute("width", String(HANDLE_SIZE));
    rect.setAttribute("height", String(HANDLE_SIZE));
    rect.classList.add("selection-handle");
    rect.dataset.handle = handleId;
    return rect;
}


function clearHandles() {
    const handlesG = getHandlesGroup();
    if (handlesG) {
        handlesG.innerHTML = "";
    }
}
