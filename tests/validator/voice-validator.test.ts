import { describe, it, expect } from "vitest";
import { validateVoices } from "../../src/validator/voice-validator.js";
import type { VideoConfig } from "../../src/schema/types.js";


function makeVoiceConfig(overrides?: Partial<VideoConfig>): VideoConfig {
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
            narrator: { voice_id: "Craig", provider: "inworld", model_id: "inworld-tts-1.5-max", speaking_rate: 1.0, temperature: 1.1 },
        },
        default_voice: "narrator",
        scenes: [{ script: "Welcome to the intro.", transition: "cut", transition_duration: 0.5, pause_before: 0, pause_after: 0.3, visuals: [] }],
        ...overrides,
    };
}


describe("validateVoices", () => {
    it("passes when default_voice exists in voices map", () => {
        const config: VideoConfig = makeVoiceConfig();
        const diagnostics = validateVoices(config);
        expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    });

    it("errors when default_voice is not in voices map", () => {
        const config: VideoConfig = makeVoiceConfig({ default_voice: "nonexistent" });
        const diagnostics = validateVoices(config);
        expect(diagnostics.some((d) => d.severity === "error" && d.message.includes("nonexistent"))).toBe(true);
    });

    // NOTE: Inworld preset voice warning is currently disabled in the validator.
    // Re-enable this test if the preset check is un-commented.
    it.skip("warns for non-preset Inworld voice ID", () => {
        const config: VideoConfig = makeVoiceConfig({
            voices: {
                narrator: { voice_id: "my-custom-clone", provider: "inworld", model_id: "inworld-tts-1.5-max", speaking_rate: 1.0, temperature: 1.1 },
            },
        });
        const diagnostics = validateVoices(config);
        expect(diagnostics.some((d) => d.severity === "warning" && d.message.includes("my-custom-clone"))).toBe(true);
    });

    it("validates [voice] directives in script text", () => {
        const config: VideoConfig = makeVoiceConfig({
            voices: {
                narrator: { voice_id: "Craig", provider: "inworld", model_id: "inworld-tts-1.5-max", speaking_rate: 1.0, temperature: 1.1 },
                aside: { voice_id: "Ashley", provider: "inworld", model_id: "inworld-tts-1.5-max", speaking_rate: 1.0, temperature: 1.1 },
            },
            scenes: [{
                script: "Some text.\n\n[voice aside]Tip: check this out.[/voice]",
                transition: "cut",
                transition_duration: 0.5,
                pause_before: 0,
                pause_after: 0.3,
                visuals: [],
            }],
        });
        const diagnostics = validateVoices(config);
        // Should pass since "aside" is defined
        expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    });
});
