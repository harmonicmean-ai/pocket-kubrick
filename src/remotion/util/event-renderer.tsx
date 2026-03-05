import React from "react";
import { Screenshot } from "../components/Screenshot";
import { TextOverlay } from "../components/TextOverlay";
import { CircleAnnotation } from "../components/CircleAnnotation";
import { ArrowAnnotation } from "../components/ArrowAnnotation";
import { HighlightRegion } from "../components/HighlightRegion";
import { Cursor } from "../components/Cursor";
import { ZoomRegion } from "../components/ZoomRegion";
import { Badge } from "../components/Badge";
import { Stack } from "../components/Stack";
import type { TimelineEvent } from "./types";


interface EventRendererProps {
    event: TimelineEvent;
    currentFrame: number;
    fps: number;
}


export const EventRenderer: React.FC<EventRendererProps> = ({ event, currentFrame, fps }) => {
    // Only render if current frame is within the event's range
    if (currentFrame < event.start_frame || currentFrame > event.end_frame) {
        return null;
    }

    const relativeFrame: number = currentFrame - event.start_frame;

    switch (event.type) {
        case "screenshot":
            return <Screenshot event={event} frame={relativeFrame} fps={fps} currentFrame={currentFrame} />;
        case "text":
            return <TextOverlay event={event} frame={relativeFrame} fps={fps} />;
        case "circle":
            return <CircleAnnotation event={event} frame={relativeFrame} fps={fps} />;
        case "arrow":
            return <ArrowAnnotation event={event} frame={relativeFrame} fps={fps} />;
        case "highlight":
            return <HighlightRegion event={event} frame={relativeFrame} fps={fps} />;
        case "cursor":
            return <Cursor event={event} frame={relativeFrame} fps={fps} />;
        case "zoom":
            return <ZoomRegion event={event} frame={relativeFrame} fps={fps} />;
        case "badge":
            return <Badge event={event} frame={relativeFrame} fps={fps} />;
        case "stack":
            return <Stack event={event} frame={relativeFrame} fps={fps} />;
        default:
            return null;
    }
};
