import type { VideoConfig } from "../schema/types.js";
import type { DiagnosticMessage } from "../util/errors.js";
import { sceneLabel } from "../util/scene-label.js";


const VOICE_DIRECTIVE_PATTERN: RegExp = /\[voice\s+([^\]]+)\]/g;

/** Known Inworld preset voice IDs. */
const INWORLD_PRESET_VOICES: Set<string> = new Set([
    "Alex", "Ashley", "Craig", "Deborah", "Craig", "Dominus",
    "Edward", "Elizabeth", "Hades", "Heitor", "Julia", "Maite",
    "Mark", "Olivia", "Pixie", "Priya", "Ronald", "Sarah",
    "Shaun", "Theodore", "Timothy", "Wendy",
]);


/**
 * Validate voice configuration consistency.
 */
export function validateVoices(config: VideoConfig): DiagnosticMessage[] {
    const diagnostics: DiagnosticMessage[] = [];
    const definedVoices: Set<string> = new Set(Object.keys(config.voices));

    // Check that default_voice is defined
    if (!definedVoices.has(config.default_voice)) {
        diagnostics.push({
            severity: "error",
            message: `default_voice "${config.default_voice}" is not defined in the voices map. Available voices: ${[...definedVoices].join(", ")}`,
        });
    }

    // Warn if voice_id is not a known Inworld preset
    // for (const [name, voice] of Object.entries(config.voices)) {
    //     if (!INWORLD_PRESET_VOICES.has(voice.voice_id)) {
    //         diagnostics.push({
    //             severity: "warning",
    //             message: `Voice "${name}": voice_id "${voice.voice_id}" is not a known Inworld preset voice. It may be a cloned voice or may not exist.`,
    //             suggestion: `Known presets: ${[...INWORLD_PRESET_VOICES].slice(0, 5).join(", ")}...`,
    //         });
    //     }
    // }

    // Check scene-level voice overrides
    for (const [sceneIndex, scene] of config.scenes.entries()) {
        if (scene.voice && !definedVoices.has(scene.voice)) {
            diagnostics.push({
                severity: "error",
                message: `Scene ${sceneIndex}: voice override "${scene.voice}" is not defined in the voices map.`,
            });
        }

        // Check [voice name] directives in scripts
        const content: string = scene.script;
        const label: string = sceneLabel(scene, sceneIndex);
        const voicePattern: RegExp = new RegExp(VOICE_DIRECTIVE_PATTERN.source, "g");
        let match: RegExpExecArray | null;
        while ((match = voicePattern.exec(content)) !== null) {
            const voiceName: string = match[1].trim();
            if (!definedVoices.has(voiceName)) {
                diagnostics.push({
                    severity: "error",
                    file: label,
                    message: `Scene ${sceneIndex}: [voice ${voiceName}] references undefined voice. Available voices: ${[...definedVoices].join(", ")}`,
                });
            }
        }
    }

    return diagnostics;
}
