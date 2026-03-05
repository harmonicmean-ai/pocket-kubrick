/**
 * Re-exports timeline types for use in React components.
 * Remotion code imports from here rather than the resolver directly.
 */
export type {
    Timeline,
    TimelineVideo,
    TimelineScene,
    TimelineEvent,
    ChildTimelineEvent,
    ScreenshotEvent,
    TextEvent,
    CircleEvent,
    ArrowEvent,
    HighlightEvent,
    CursorEvent,
    ZoomEvent,
    BadgeEvent,
    StackItem,
    StackEvent,
} from "../../resolver/types.js";
