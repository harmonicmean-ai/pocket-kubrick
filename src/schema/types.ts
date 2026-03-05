import type { z } from "zod/v4";
import type {
    VideoConfigSchema,
    VideoSchema,
    VoiceSchema,
    ThemeSchema,
    SceneSchema,
    VisualEventBase,
} from "./video-config.js";


export type VideoConfig = z.infer<typeof VideoConfigSchema>;
export type Video = z.infer<typeof VideoSchema>;
export type Voice = z.infer<typeof VoiceSchema>;
export type Theme = z.infer<typeof ThemeSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type VisualEvent = z.infer<typeof VisualEventBase>;
