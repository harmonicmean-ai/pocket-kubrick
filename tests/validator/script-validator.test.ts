import { describe, it, expect } from "vitest";
import { validateScripts } from "../../src/validator/script-validator.js";
import type { VideoConfig } from "../../src/schema/types.js";


function makeConfig(scripts: string[]): VideoConfig {
    return {
        video: {
            title: "Test",
            resolution: "1920x1080",
            fps: 30,
            format: ["mp4"],
            quality: "standard",
            theme: {
                background: "#121212",
                accent: "#07C107",
                font: "Open Sans",
                font_size: 24,
                padding: 40,
            },
        },
        voices: {
            narrator: {
                google_voice: "en-US-Studio-O",
                speaking_rate: 1.0,
                pitch: "+0st",
            },
        },
        default_voice: "narrator",
        scenes: scripts.map((s) => ({
            script: s,
            transition: "cut" as const,
            transition_duration: 0.5,
            pause_before: 0,
            pause_after: 0.3,
            visuals: [],
        })),
    };
}


describe("validateScripts", () => {
    it("passes for well-formed script text", () => {
        const config = makeConfig(["Welcome to the guide. Let's get started."]);
        const diagnostics = validateScripts(config);
        expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    });

    it("warns for code blocks in script", () => {
        const config = makeConfig(["Here is some code:\n```\nconst x = 1;\n```\nEnd."]);
        const diagnostics = validateScripts(config);
        const warnings = diagnostics.filter((d) => d.severity === "warning");
        expect(warnings).toHaveLength(1);
        expect(warnings[0].message).toContain("code blocks");
    });

    it("errors for unclosed bracket directive", () => {
        const config = makeConfig(["Hello [voice aside]some text without closing tag."]);
        const diagnostics = validateScripts(config);
        expect(diagnostics.some((d) => d.severity === "error" && d.message.includes("Unclosed bracket directive"))).toBe(true);
    });

    it("passes for properly closed bracket directives", () => {
        const config = makeConfig(["Hello [voice aside]tip text[/voice] end."]);
        const diagnostics = validateScripts(config);
        expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    });
});
