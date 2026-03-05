import React from "react";
import { applyAnimation } from "../util/animations";
import type { HighlightEvent } from "../util/types";


interface HighlightRegionProps {
    event: HighlightEvent;
    frame: number;
    fps: number;
}


export const HighlightRegion: React.FC<HighlightRegionProps> = ({ event, frame, fps }) => {
    const anim = applyAnimation(event.animate, frame, fps, event.animate_frames);

    const style: React.CSSProperties = {
        position: "absolute",
        top: event.region.y,
        left: event.region.x,
        width: event.region.w,
        height: event.region.h,
        backgroundColor: event.color,
        border: event.border ?? undefined,
        borderRadius: "4px",
        opacity: anim.opacity,
        transform: anim.transform,
        zIndex: event.z_index,
        pointerEvents: "none",
    };

    return <div style={style} />;
};
