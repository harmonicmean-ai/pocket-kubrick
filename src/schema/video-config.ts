import { z } from "zod/v4";


// --- Shared sub-schemas ---

const PointSchema = z.object({
    x: z.number(),
    y: z.number(),
});

const ResolutionPattern = /^\d+x\d+$/;

const AnimationType = z.enum([
    "fade-in",
    "fade-out",
    "slide-left",
    "slide-right",
    "slide-up",
    "slide-down",
    "scale-in",
    "pulse",
    "draw",
    "pop",
    "none",
]);

const TransitionType = z.enum([
    "fade",
    "cut",
    "slide-left",
    "slide-right",
    "wipe-down",
]);

const QualityPreset = z.enum(["draft", "standard", "high"]);

const OutputFormat = z.enum(["mp4", "webm", "mov", "gif"]);

const FpsValue = z.union([
    z.literal(24),
    z.literal(25),
    z.literal(30),
    z.literal(60),
]);


// --- Visual event base fields ---

const VisualEventBase = z.object({
    type: z.string(),
    at: z.union([z.string(), z.number()]).optional(),
    disappear_at: z.union([z.string(), z.number()]).optional(),
    duration: z.number().optional(),
    animate: AnimationType.optional(),
    animate_duration: z.number().default(0.4),
    z_index: z.number().int().default(0),
});


// --- Theme ---

const ThemeSchema = z.object({
    background: z.string().default("#121212"),
    accent: z.string().default("#07C107"),
    font: z.string().default("Open Sans"),
    font_size: z.number().int().default(48),
    padding: z.number().int().default(40),
});


// --- Voice ---

const VoiceSchema = z.object({
    voice_id: z.string(),
    provider: z.enum(["inworld"]).default("inworld"),
    model_id: z.string().default("inworld-tts-1.5-max"),
    speaking_rate: z.number().min(0.5).max(1.5).default(1.0),
    temperature: z.number().gt(0).lte(2.0).default(1.1),
});


// --- Video top-level ---

const VideoSchema = z.object({
    title: z.string(),
    resolution: z.string().regex(ResolutionPattern, "Must be WIDTHxHEIGHT format").default("1920x1080"),
    fps: FpsValue.default(30),
    format: z.array(OutputFormat).min(1).default(["mp4"]),
    quality: QualityPreset.default("standard"),
    theme: ThemeSchema.default(() => ({
        background: "#121212",
        accent: "#07C107",
        font: "Open Sans",
        font_size: 48,
        padding: 40,
    })),
    hold_last: z.number().nonnegative().default(1.0),
});


// --- Scene ---
// Visual events use passthrough() for Phase 1 — full validation in later phases.

const SceneSchema = z.object({
    id: z.string().optional(),
    script: z.string(),
    voice: z.string().optional(),
    transition: TransitionType.default("cut"),
    transition_duration: z.number().default(0.5),
    pause_before: z.number().default(0),
    pause_after: z.number().default(0.3),
    visuals: z.array(VisualEventBase.passthrough()).default([]),
});


// --- Root config ---

const VideoConfigSchema = z.object({
    video: VideoSchema,
    voices: z.record(z.string(), VoiceSchema),
    default_voice: z.string(),
    scenes: z.array(SceneSchema).min(1),
});


export {
    VideoConfigSchema,
    VideoSchema,
    VoiceSchema,
    ThemeSchema,
    SceneSchema,
    VisualEventBase,
    AnimationType,
    TransitionType,
    QualityPreset,
    OutputFormat,
    FpsValue,
    PointSchema,
};
