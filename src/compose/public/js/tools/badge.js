/**
 * Badge tool: single click to place a numbered badge.
 */

let svg = null;
let appState = null;
let callbacks = null;


export function activateTool(svgEl, state, cbs) {
    svg = svgEl;
    appState = state;
    callbacks = cbs;

    svg.addEventListener("click", onClick);
    svg.style.cursor = "crosshair";
}


export function deactivateTool() {
    if (!svg) return;
    svg.removeEventListener("click", onClick);
    svg = null;
}


function onClick(e) {
    // Ignore clicks on existing annotations or handles
    if (e.target.closest(".annotation-group") || e.target.closest(".selection-handle")) {
        return;
    }

    const pt = callbacks.screenToSvg(e.clientX, e.clientY);

    // Auto-increment badge content
    const badgeCount = appState.annotations.filter((a) => a.type === "badge").length;
    const content = String(badgeCount + 1);

    callbacks.addAnnotation({
        type: "badge",
        props: {
            position: { x: pt.x, y: pt.y },
            content,
            variant: "circle",
            color: "$accent",
            text_color: "#FFFFFF",
            size: 32,
            animate: "pop",
        },
    });
}
