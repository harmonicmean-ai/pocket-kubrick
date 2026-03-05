/**
 * Annotation list sidebar: displays ordered annotations with drag-to-reorder and delete.
 */

import { getAnnotationSummary } from "./renderers.js";

// Imported dynamically to avoid circular dependency
let appModule = null;


async function getApp() {
    if (!appModule) {
        appModule = await import("./app.js");
    }
    return appModule;
}


/**
 * Initialize the annotation list event delegation.
 */
export function initAnnotationList() {
    const container = document.getElementById("annotation-items");

    // Event delegation for clicks
    container.addEventListener("click", async (e) => {
        const app = await getApp();
        const item = e.target.closest(".annotation-item");
        if (!item) return;

        // Delete button
        if (e.target.closest(".delete-btn")) {
            const index = parseInt(item.dataset.index, 10);
            app.deleteAnnotation(index);
            return;
        }

        // Select
        const index = parseInt(item.dataset.index, 10);
        app.selectAnnotation(index);
    });

    // Drag and drop for reordering
    let dragIndex = -1;

    container.addEventListener("dragstart", (e) => {
        const item = e.target.closest(".annotation-item");
        if (!item) return;
        dragIndex = parseInt(item.dataset.index, 10);
        e.dataTransfer.effectAllowed = "move";
        item.style.opacity = "0.4";
    });

    container.addEventListener("dragend", (e) => {
        const item = e.target.closest(".annotation-item");
        if (item) item.style.opacity = "";
        dragIndex = -1;
        // Clear all drag-over indicators
        container.querySelectorAll(".drag-over").forEach((el) => {
            el.classList.remove("drag-over");
        });
    });

    container.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";

        const item = e.target.closest(".annotation-item");
        if (!item) return;

        // Show insertion indicator
        container.querySelectorAll(".drag-over").forEach((el) => {
            el.classList.remove("drag-over");
        });
        item.classList.add("drag-over");
    });

    container.addEventListener("drop", async (e) => {
        e.preventDefault();
        const item = e.target.closest(".annotation-item");
        if (!item) return;

        const toIndex = parseInt(item.dataset.index, 10);
        if (dragIndex >= 0 && dragIndex !== toIndex) {
            const app = await getApp();
            app.reorderAnnotations(dragIndex, toIndex);
        }

        container.querySelectorAll(".drag-over").forEach((el) => {
            el.classList.remove("drag-over");
        });
        dragIndex = -1;
    });
}


/**
 * Render the annotation list.
 */
export function renderAnnotationList(annotations, selectedIndex) {
    const container = document.getElementById("annotation-items");

    if (annotations.length === 0) {
        container.innerHTML = "<p class=\"empty-message\">No annotations. Select a tool and draw on the canvas.</p>";
        return;
    }

    container.innerHTML = annotations.map((ann, index) => {
        const selected = index === selectedIndex ? " selected" : "";
        const summary = getAnnotationSummary(ann);
        return `<div class="annotation-item${selected}" data-index="${index}" draggable="true">
            <span class="type-label">${ann.type}</span>
            <span class="summary">${summary}</span>
            <button class="delete-btn" title="Delete">x</button>
        </div>`;
    }).join("");
}
