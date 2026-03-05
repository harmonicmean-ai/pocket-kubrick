import React from "react";
import { applyAnimation } from "../util/animations";
import type { BadgeEvent } from "../util/types";


interface BadgeProps {
    event: BadgeEvent;
    frame: number;
    fps: number;
}


export const Badge: React.FC<BadgeProps> = ({ event, frame, fps }) => {
    const anim = applyAnimation(event.animate, frame, fps, event.animate_frames);

    const isCircle: boolean = event.variant === "circle";
    const minWidth: number = isCircle ? event.size : event.size * 1.8;

    const style: React.CSSProperties = {
        position: "absolute",
        top: event.position.y - event.size / 2,
        left: event.position.x - (isCircle ? event.size / 2 : minWidth / 2),
        width: isCircle ? event.size : undefined,
        minWidth: isCircle ? undefined : minWidth,
        height: event.size,
        borderRadius: isCircle ? "50%" : `${event.size / 2}px`,
        backgroundColor: event.color,
        color: event.text_color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: event.size * 0.55,
        fontWeight: "bold",
        fontFamily: "Open Sans, sans-serif",
        padding: isCircle ? 0 : "0 12px",
        opacity: anim.opacity,
        transform: anim.transform,
        zIndex: event.z_index,
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
    };

    return (
        <div style={style}>
            {event.content}
        </div>
    );
};
