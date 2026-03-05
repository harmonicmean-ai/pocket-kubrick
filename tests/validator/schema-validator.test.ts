import { describe, it, expect } from "vitest";
import { validateSchema } from "../../src/validator/schema-validator.js";
import type { VideoConfig } from "../../src/schema/types.js";


function makeConfig(overrides?: Partial<VideoConfig>): VideoConfig {
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
                voice_id: "Craig",
                provider: "inworld",
                model_id: "inworld-tts-1.5-max",
                speaking_rate: 1.0,
                temperature: 1.1,
            },
        },
        default_voice: "narrator",
        scenes: [{
            script: "scripts/01-intro.md",
            transition: "cut",
            transition_duration: 0.5,
            pause_before: 0,
            pause_after: 0.3,
            visuals: [],
        }],
        ...overrides,
    };
}


describe("validateSchema", () => {
    it("passes for valid config with no theme refs", () => {
        const config: VideoConfig = makeConfig();
        const diagnostics = validateSchema(config);
        expect(diagnostics).toHaveLength(0);
    });

    it("passes for valid $accent reference", () => {
        const config: VideoConfig = makeConfig({
            scenes: [{
                script: "scripts/01-intro.md",
                transition: "cut",
                transition_duration: 0.5,
                pause_before: 0,
                pause_after: 0.3,
                visuals: [{
                    type: "circle",
                    color: "$accent",
                    animate_duration: 0.4,
                    z_index: 0,
                }],
            }],
        });
        const diagnostics = validateSchema(config);
        expect(diagnostics).toHaveLength(0);
    });

    it("errors for invalid theme reference", () => {
        const config: VideoConfig = makeConfig({
            scenes: [{
                script: "scripts/01-intro.md",
                transition: "cut",
                transition_duration: 0.5,
                pause_before: 0,
                pause_after: 0.3,
                visuals: [{
                    type: "circle",
                    color: "$bogus",
                    animate_duration: 0.4,
                    z_index: 0,
                }],
            }],
        });
        const diagnostics = validateSchema(config);
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0].severity).toBe("error");
        expect(diagnostics[0].message).toContain("$bogus");
    });
});
