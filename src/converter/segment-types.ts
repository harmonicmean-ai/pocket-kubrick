/**
 * Types for the Markdown-to-segments converter output.
 *
 * Each ScriptSegment represents a contiguous piece of text that will be sent
 * as a single TTS API call. Segments are created by paragraph breaks and
 * bracket directives that change voice, rate, or insert explicit pauses.
 */


/**
 * A single segment of script text ready for TTS synthesis.
 */
export interface ScriptSegment {
    /** Plain text for this segment. May contain Inworld markup (*emphasis*, /IPA/). */
    text: string;
    /** Override voice key from the config voices map (from [voice] directive). */
    voiceId?: string;
    /** Override speaking rate (from [rate] directive). */
    speakingRate?: number;
    /** Inworld emotion tag, e.g., "happy", "sad" (from [emotion] directive or blockquote). */
    emotion?: string;
    /** Milliseconds of silence to insert after this segment's audio. */
    pauseAfterMs?: number;
}


/**
 * The output of the convert step for one scene.
 * Written to generated/segments/{scene-name}.json.
 */
export interface ConvertedScene {
    /** Zero-based scene index. */
    sceneIndex: number;
    /** Scene identifier derived from the YAML `id` field or a positional fallback. */
    sceneId: string;
    /** The voice key from the config to use as default for this scene. */
    defaultVoice: string;
    /** Ordered segments ready for TTS synthesis. */
    segments: ScriptSegment[];
    /** Anchor phrases (from YAML visual events) to match in word timestamps after synthesis. */
    anchors: string[];
}
