import { initCanvas, renderAnnotations, setBackgroundImage, screenToSvg, getSvgElement } from "./canvas.js";
import { renderAnnotationSvg, resolveThemeValue } from "./renderers.js";
import { initAnnotationList, renderAnnotationList } from "./annotation-list.js";
import { renderPropertiesPanel } from "./properties-panel.js";
import { generateYaml } from "./yaml-output.js";
import { showHandles } from "./tools/select.js";

// Dynamic tool imports
const toolModules = {
    select: () => import("./tools/select.js"),
    highlight: () => import("./tools/highlight.js"),
    circle: () => import("./tools/circle.js"),
    arrow: () => import("./tools/arrow.js"),
    badge: () => import("./tools/badge.js"),
    cursor: () => import("./tools/cursor.js"),
    zoom: () => import("./tools/zoom.js"),
};


// ── Global State ────────────────────────────────────────────────

export const state = {
    project: null,
    scenes: [],
    currentSceneIndex: 0,
    currentScene: null,
    keyframes: [],
    currentKeyframeIndex: 0,
    annotations: [],
    selectedIndex: -1,
    activeTool: "select",
};


// ── Event Bus ───────────────────────────────────────────────────

const listeners = new Map();


export function on(event, callback) {
    if (!listeners.has(event)) {
        listeners.set(event, new Set());
    }
    listeners.get(event).add(callback);
}


export function off(event, callback) {
    if (listeners.has(event)) {
        listeners.get(event).delete(callback);
    }
}


export function emit(event, data) {
    if (listeners.has(event)) {
        for (const cb of listeners.get(event)) {
            cb(data);
        }
    }
}


// ── Annotation Management ───────────────────────────────────────

export function addAnnotation(annotation) {
    state.annotations.push(annotation);
    state.selectedIndex = state.annotations.length - 1;
    emit("annotationsChanged");
    emit("selectionChanged");
}


export function updateAnnotation(index, field, value) {
    if (index < 0 || index >= state.annotations.length) return;
    const ann = state.annotations[index];

    // Handle nested fields like "region.x"
    const parts = field.split(".");
    if (parts.length === 2) {
        if (!ann.props[parts[0]]) {
            ann.props[parts[0]] = {};
        }
        ann.props[parts[0]][parts[1]] = value;
    } else {
        if (field === "type") {
            ann.type = value;
        } else {
            ann.props[field] = value;
        }
    }
    emit("annotationsChanged");
}


export function deleteAnnotation(index) {
    if (index < 0 || index >= state.annotations.length) return;
    state.annotations.splice(index, 1);
    if (state.selectedIndex >= state.annotations.length) {
        state.selectedIndex = state.annotations.length - 1;
    }
    if (state.selectedIndex === index) {
        state.selectedIndex = -1;
    } else if (state.selectedIndex > index) {
        state.selectedIndex--;
    }
    emit("annotationsChanged");
    emit("selectionChanged");
}


export function selectAnnotation(index) {
    state.selectedIndex = index;
    emit("selectionChanged");
}


export function reorderAnnotations(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const [item] = state.annotations.splice(fromIndex, 1);
    state.annotations.splice(toIndex, 0, item);
    // Update selection to follow the moved item
    if (state.selectedIndex === fromIndex) {
        state.selectedIndex = toIndex;
    } else if (state.selectedIndex > fromIndex && state.selectedIndex <= toIndex) {
        state.selectedIndex--;
    } else if (state.selectedIndex < fromIndex && state.selectedIndex >= toIndex) {
        state.selectedIndex++;
    }
    emit("annotationsChanged");
    emit("selectionChanged");
}


// ── Tool Switching ──────────────────────────────────────────────

let currentToolModule = null;


async function switchTool(toolName) {
    if (currentToolModule && currentToolModule.deactivateTool) {
        currentToolModule.deactivateTool();
    }

    state.activeTool = toolName;

    // Update button states
    document.querySelectorAll(".tool-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.tool === toolName);
    });

    const loader = toolModules[toolName];
    if (loader) {
        currentToolModule = await loader();
        if (currentToolModule.activateTool) {
            currentToolModule.activateTool(getSvgElement(), state, {
                addAnnotation,
                updateAnnotation,
                selectAnnotation,
                screenToSvg,
                emit,
            });
        }
    }

    emit("toolChanged", toolName);
}


// ── Scene Loading ───────────────────────────────────────────────

async function loadScene(index) {
    const res = await fetch(`/api/scenes/${index}`);
    if (!res.ok) return;

    const scene = await res.json();
    state.currentSceneIndex = index;
    state.currentScene = scene;
    state.keyframes = scene.keyframes ?? [];

    // Populate keyframe dropdown
    const kfSelect = document.getElementById("keyframe-select");
    kfSelect.innerHTML = "";
    state.keyframes.forEach((kf, i) => {
        const option = document.createElement("option");
        option.value = String(i);
        option.textContent = `Frame ${i + 1}: ${kf.label}`;
        kfSelect.appendChild(option);
    });

    // Show/hide keyframe nav (hidden if 0 or 1 keyframe)
    const kfNav = document.getElementById("keyframe-nav");
    kfNav.style.display = state.keyframes.length > 1 ? "flex" : "none";

    // Remove any old notice
    const existing = document.querySelector(".notice");
    if (existing) existing.remove();

    // Update scene selector and nav buttons
    const select = document.getElementById("scene-select");
    select.value = String(index);
    document.getElementById("prev-scene").disabled = index <= 0;
    document.getElementById("next-scene").disabled = index >= state.scenes.length - 1;

    // Load the first keyframe (or clear if none)
    if (state.keyframes.length > 0) {
        loadKeyframe(0);
    } else {
        setBackgroundImage(null);
        state.annotations = [];
        state.selectedIndex = -1;
        emit("annotationsChanged");
        emit("selectionChanged");
    }
}


function loadKeyframe(index) {
    if (index < 0 || index >= state.keyframes.length) return;

    state.currentKeyframeIndex = index;
    const kf = state.keyframes[index];

    // Set background from this keyframe's screenshot
    const encoded = kf.screenshot.src
        .split("/")
        .map((seg) => encodeURIComponent(seg))
        .join("/");
    setBackgroundImage(`/api/screenshot/${encoded}`, kf.screenshot);

    // Set annotations from this keyframe
    state.annotations = kf.annotations.map((a) => ({
        type: a.type,
        props: resolvePercentageProps(deepCopy(a.props)),
    }));
    state.selectedIndex = -1;

    // Update keyframe dropdown and nav buttons
    const kfSelect = document.getElementById("keyframe-select");
    kfSelect.value = String(index);
    document.getElementById("prev-keyframe").disabled = index <= 0;
    document.getElementById("next-keyframe").disabled = index >= state.keyframes.length - 1;

    emit("annotationsChanged");
    emit("selectionChanged");
}


// ── Rendering ───────────────────────────────────────────────────

function onAnnotationsChanged() {
    renderAnnotations(state.annotations, state.project?.theme);
    renderAnnotationList(state.annotations, state.selectedIndex);
    generateYaml(state.annotations, state.project?.theme);
}


function onSelectionChanged() {
    renderAnnotationList(state.annotations, state.selectedIndex);
    renderPropertiesPanel(
        state.selectedIndex >= 0 ? state.annotations[state.selectedIndex] : null,
        state.selectedIndex,
        state.project?.theme,
    );
    renderAnnotations(state.annotations, state.project?.theme);
    showHandles(state.selectedIndex);
}


// ── Initialization ──────────────────────────────────────────────

async function init() {
    // Fetch project data
    const projectRes = await fetch("/api/project");
    state.project = await projectRes.json();

    document.getElementById("project-title").textContent = state.project.title;
    document.title = `Compose - ${state.project.title}`;

    // Load theme font from Google Fonts
    loadThemeFont(state.project.theme?.font);

    // Initialize canvas
    initCanvas(
        document.getElementById("canvas-container"),
        state.project.resolution.w,
        state.project.resolution.h,
    );

    // Initialize annotation list
    initAnnotationList();

    // Fetch scenes
    const scenesRes = await fetch("/api/scenes");
    state.scenes = await scenesRes.json();

    // Populate scene selector
    const select = document.getElementById("scene-select");
    state.scenes.forEach((s, i) => {
        const option = document.createElement("option");
        option.value = String(i);
        const scriptName = s.scriptPath.split("/").pop();
        option.textContent = `Scene ${i + 1}: ${scriptName}`;
        select.appendChild(option);
    });

    // Scene navigation
    select.addEventListener("change", () => {
        loadScene(parseInt(select.value, 10));
    });

    document.getElementById("prev-scene").addEventListener("click", () => {
        if (state.currentSceneIndex > 0) {
            loadScene(state.currentSceneIndex - 1);
        }
    });

    document.getElementById("next-scene").addEventListener("click", () => {
        if (state.currentSceneIndex < state.scenes.length - 1) {
            loadScene(state.currentSceneIndex + 1);
        }
    });

    // Keyframe navigation
    document.getElementById("keyframe-select").addEventListener("change", (e) => {
        loadKeyframe(parseInt(e.target.value, 10));
    });

    document.getElementById("prev-keyframe").addEventListener("click", () => {
        if (state.currentKeyframeIndex > 0) {
            loadKeyframe(state.currentKeyframeIndex - 1);
        }
    });

    document.getElementById("next-keyframe").addEventListener("click", () => {
        if (state.currentKeyframeIndex < state.keyframes.length - 1) {
            loadKeyframe(state.currentKeyframeIndex + 1);
        }
    });

    // Tool buttons
    document.querySelectorAll(".tool-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            switchTool(btn.dataset.tool);
        });
    });

    // Copy YAML button
    document.getElementById("copy-yaml").addEventListener("click", async () => {
        const yamlText = document.getElementById("yaml-output").textContent;
        try {
            await navigator.clipboard.writeText(yamlText);
            const btn = document.getElementById("copy-yaml");
            btn.textContent = "Copied";
            btn.classList.add("copied");
            setTimeout(() => {
                btn.textContent = "Copy";
                btn.classList.remove("copied");
            }, 2000);
        } catch (e) {
            console.error("Failed to copy:", e);
        }
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
        // Skip if user is typing in an input field
        if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA") {
            return;
        }

        const toolKeys = {
            s: "select", v: "select",
            h: "highlight",
            c: "circle",
            a: "arrow",
            b: "badge",
            u: "cursor",
            z: "zoom",
        };

        if (toolKeys[e.key]) {
            switchTool(toolKeys[e.key]);
            return;
        }

        // Keyframe navigation
        if (e.key === "[" && state.currentKeyframeIndex > 0) {
            loadKeyframe(state.currentKeyframeIndex - 1);
            return;
        }
        if (e.key === "]" && state.currentKeyframeIndex < state.keyframes.length - 1) {
            loadKeyframe(state.currentKeyframeIndex + 1);
            return;
        }

        // Delete selected annotation
        if ((e.key === "Delete" || e.key === "Backspace") && state.selectedIndex >= 0) {
            deleteAnnotation(state.selectedIndex);
            return;
        }

        // Escape to deselect
        if (e.key === "Escape") {
            selectAnnotation(-1);
        }
    });

    // Subscribe to events
    on("annotationsChanged", onAnnotationsChanged);
    on("selectionChanged", onSelectionChanged);

    // Check for scene query param
    const params = new URLSearchParams(window.location.search);
    const sceneParam = params.get("scene");
    const startScene = sceneParam ? Math.max(0, parseInt(sceneParam, 10) - 1) : 0;

    // Load initial scene
    await loadScene(startScene);

    // Activate default tool
    await switchTool("select");
}


init().catch(console.error);


// ── Helpers ─────────────────────────────────────────────────────

function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}


/**
 * Resolve percentage strings (e.g. "50%") to pixel values in annotation props.
 * Mirrors src/resolver/event-resolver.ts resolvePercentages().
 */
function resolvePercentageProps(props) {
    const w = state.project?.resolution?.w ?? 1920;
    const h = state.project?.resolution?.h ?? 1080;

    const pctRe = /^(\d+(?:\.\d+)?)%$/;

    function resolveVal(val, dim) {
        if (typeof val === "string") {
            const m = val.match(pctRe);
            if (m) return Math.round((parseFloat(m[1]) / 100) * dim);
        }
        return val;
    }

    // region: { x, y, w, h }
    if (props.region && typeof props.region === "object") {
        props.region.x = resolveVal(props.region.x, w);
        props.region.y = resolveVal(props.region.y, h);
        props.region.w = resolveVal(props.region.w, w);
        props.region.h = resolveVal(props.region.h, h);
    }

    // target: { x, y, r }
    if (props.target && typeof props.target === "object") {
        props.target.x = resolveVal(props.target.x, w);
        props.target.y = resolveVal(props.target.y, h);
    }

    // point fields: from, to, position
    for (const key of ["from", "to", "position"]) {
        if (props[key] && typeof props[key] === "object") {
            props[key].x = resolveVal(props[key].x, w);
            props[key].y = resolveVal(props[key].y, h);
        }
    }

    return props;
}


/**
 * Load a Google Font by injecting a stylesheet link into the document head.
 * No-op for generic families like "sans-serif" or "monospace".
 */
function loadThemeFont(fontName) {
    if (!fontName || /^(sans-serif|serif|monospace|cursive|fantasy)$/i.test(fontName)) {
        return;
    }
    const family = encodeURIComponent(fontName);
    const href = `https://fonts.googleapis.com/css2?family=${family}:wght@400;500;600;700&display=swap`;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
}
