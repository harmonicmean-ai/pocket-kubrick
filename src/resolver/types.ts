import { z } from "zod/v4";


// --- Shared geometry ---

const PointSchema = z.object({
    x: z.number(),
    y: z.number(),
});

const RegionSchema = z.object({
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
});


// --- Video metadata ---

const TimelineVideoSchema = z.object({
    title: z.string(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().int().positive(),
    total_frames: z.number().int().nonnegative(),
    total_duration_seconds: z.number().nonnegative(),
    audio_src: z.string(),
});


// --- Scene entry ---

const TimelineSceneSchema = z.object({
    index: z.number().int().nonnegative(),
    name: z.string(),
    start_frame: z.number().int().nonnegative(),
    end_frame: z.number().int().nonnegative(),
    duration_frames: z.number().int().nonnegative(),
    transition: z.string(),
    transition_frames: z.number().int().nonnegative(),
});


// --- Event types (discriminated union on `type`) ---

const BaseEventSchema = z.object({
    id: z.string(),
    type: z.string(),
    start_frame: z.number().int().nonnegative(),
    end_frame: z.number().int().nonnegative(),
    z_index: z.number().int(),
    animate: z.string().nullable(),
    animate_frames: z.number().int().nonnegative(),
});

const TextEventSchema = BaseEventSchema.extend({
    type: z.literal("text"),
    content: z.string(),
    position: PointSchema,
    style: z.enum(["title", "caption", "callout", "label"]),
    align: z.enum(["left", "center", "right"]).optional(),
    color: z.string().optional(),
    font_size: z.number().optional(),
});

const CircleEventSchema = BaseEventSchema.extend({
    type: z.literal("circle"),
    target: z.object({ x: z.number(), y: z.number(), r: z.number() }),
    color: z.string(),
    stroke_width: z.number(),
    fill: z.string().nullable(),
});

const ArrowEventSchema = BaseEventSchema.extend({
    type: z.literal("arrow"),
    from: PointSchema,
    to: PointSchema,
    color: z.string(),
    stroke_width: z.number(),
    head_size: z.number(),
});

const HighlightEventSchema = BaseEventSchema.extend({
    type: z.literal("highlight"),
    region: RegionSchema,
    color: z.string(),
    border: z.string().nullable(),
});

const CursorEventSchema = BaseEventSchema.extend({
    type: z.literal("cursor"),
    from: PointSchema.nullable(),
    to: PointSchema,
    click: z.boolean(),
});

const ZoomEventSchema = BaseEventSchema.extend({
    type: z.literal("zoom"),
    region: RegionSchema,
    scale: z.number(),
    position: PointSchema.optional(),
});

const BadgeEventSchema = BaseEventSchema.extend({
    type: z.literal("badge"),
    content: z.string(),
    position: PointSchema,
    variant: z.enum(["circle", "pill"]),
    color: z.string(),
    text_color: z.string(),
    size: z.number(),
});

const StackItemSchema = z.object({
    content: z.string(),
    style: z.enum(["title", "caption", "callout", "label"]).optional(),
    animate: z.string().nullable().optional(),
    animate_frames: z.number().int().nonnegative().optional(),
    color: z.string().optional(),
    font_size: z.number().optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    start_frame: z.number().int().nonnegative(),
    end_frame: z.number().int().nonnegative(),
});

const StackEventSchema = BaseEventSchema.extend({
    type: z.literal("stack"),
    position: PointSchema,
    gap: z.number(),
    items: z.array(StackItemSchema),
});


// --- Child event (annotation nested inside a screenshot) ---

const ChildTimelineEventSchema = z.discriminatedUnion("type", [
    TextEventSchema,
    CircleEventSchema,
    ArrowEventSchema,
    HighlightEventSchema,
    CursorEventSchema,
    ZoomEventSchema,
    BadgeEventSchema,
    StackEventSchema,
]);


// --- Screenshot (defined after annotations so it can reference ChildTimelineEventSchema) ---

const ScreenshotEventSchema = BaseEventSchema.extend({
    type: z.literal("screenshot"),
    src: z.string(),
    fit: z.enum(["contain", "cover", "fill"]),
    shadow: z.boolean(),
    border_radius: z.number().optional(),
    position: PointSchema.optional(),
    size: z.object({ w: z.number(), h: z.number() }).optional(),
    overflow: z.enum(["clip", "resize"]).default("clip"),
    border: z.string().nullable(),
    dim_beneath: z.number().min(0).max(100),
    dim_before: z.number().default(0),
    children: z.array(ChildTimelineEventSchema).optional(),
});

const TimelineEventSchema = z.discriminatedUnion("type", [
    ScreenshotEventSchema,
    TextEventSchema,
    CircleEventSchema,
    ArrowEventSchema,
    HighlightEventSchema,
    CursorEventSchema,
    ZoomEventSchema,
    BadgeEventSchema,
    StackEventSchema,
]);


// --- Root timeline ---

const TimelineSchema = z.object({
    video: TimelineVideoSchema,
    scenes: z.array(TimelineSceneSchema),
    events: z.array(TimelineEventSchema),
});


// --- Inferred types ---

export type TimelineVideo = z.infer<typeof TimelineVideoSchema>;
export type TimelineScene = z.infer<typeof TimelineSceneSchema>;
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
export type ScreenshotEvent = z.infer<typeof ScreenshotEventSchema>;
export type TextEvent = z.infer<typeof TextEventSchema>;
export type CircleEvent = z.infer<typeof CircleEventSchema>;
export type ArrowEvent = z.infer<typeof ArrowEventSchema>;
export type HighlightEvent = z.infer<typeof HighlightEventSchema>;
export type CursorEvent = z.infer<typeof CursorEventSchema>;
export type ZoomEvent = z.infer<typeof ZoomEventSchema>;
export type BadgeEvent = z.infer<typeof BadgeEventSchema>;
export type StackItem = z.infer<typeof StackItemSchema>;
export type StackEvent = z.infer<typeof StackEventSchema>;
export type ChildTimelineEvent = z.infer<typeof ChildTimelineEventSchema>;
export type Timeline = z.infer<typeof TimelineSchema>;


// --- Manifest types (read from generated/audio/manifest.json) ---

export interface ManifestTimepoint {
    name: string;
    timeSeconds: number;
}

export interface ManifestScene {
    name: string;
    audioFile: string;
    durationSeconds: number;
    actualDurationSeconds?: number;
    timepoints: ManifestTimepoint[];
}

export interface AudioManifest {
    scenes: ManifestScene[];
    totalApiCalls: number;
    totalCacheHits: number;
}


// --- Timepoints file (read from generated/audio/{scene}.timepoints.json) ---

export interface TimepointsFile {
    scene: string;
    durationSeconds: number;
    marks: ManifestTimepoint[];
}


export {
    TimelineSchema,
    TimelineVideoSchema,
    TimelineSceneSchema,
    TimelineEventSchema,
    ChildTimelineEventSchema,
    ScreenshotEventSchema,
    TextEventSchema,
    CircleEventSchema,
    ArrowEventSchema,
    HighlightEventSchema,
    CursorEventSchema,
    ZoomEventSchema,
    BadgeEventSchema,
    StackItemSchema,
    StackEventSchema,
};
