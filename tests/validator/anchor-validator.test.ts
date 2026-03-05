import { describe, it, expect } from "vitest";
import { validateAnchors } from "../../src/validator/anchor-validator.js";
import type { VideoConfig } from "../../src/schema/types.js";


function makeConfig(anchors: string[], scriptText: string): VideoConfig {
    return {
        video: {
            title: "Test",
            resolution: "1920x1080",
            fps: 30,
            format: ["mp4"],
            quality: "standard",
            theme: { background: "#121212", accent: "#07C107", font: "Open Sans", font_size: 24, padding: 40 },
        },
        voices: {
            narrator: { google_voice: "en-US-Studio-O", speaking_rate: 1.0, pitch: "+0st" },
        },
        default_voice: "narrator",
        scenes: [{
            script: scriptText,
            transition: "cut",
            transition_duration: 0.5,
            pause_before: 0,
            pause_after: 0.3,
            visuals: anchors.map((a) => ({
                type: "circle",
                at: a,
                animate_duration: 0.4,
                z_index: 0,
            })),
        }],
    };
}


const SETTINGS_SCRIPT: string = "First, tap the *settings icon* in the top right corner\nof the main screen.";


describe("validateAnchors", () => {
    it("passes when anchor text exists in script", () => {
        const config = makeConfig(["settings-icon"], SETTINGS_SCRIPT);
        const diagnostics = validateAnchors(config);
        expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    });

    it("errors when anchor text is not found", () => {
        const config = makeConfig(["nonexistent-phrase"], SETTINGS_SCRIPT);
        const diagnostics = validateAnchors(config);
        expect(diagnostics.some((d) => d.severity === "error" && d.message.includes("nonexistent-phrase"))).toBe(true);
    });

    it("normalizes hyphens to spaces for matching", () => {
        const config = makeConfig(["top-right"], SETTINGS_SCRIPT);
        const diagnostics = validateAnchors(config);
        expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    });

    it("warns for duplicate anchors in same scene", () => {
        const config = makeConfig(["settings-icon", "settings-icon"], SETTINGS_SCRIPT);
        const diagnostics = validateAnchors(config);
        expect(diagnostics.some((d) => d.severity === "warning" && d.message.includes("used 2 times"))).toBe(true);
    });
});
