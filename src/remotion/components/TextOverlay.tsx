import React from "react";
import { applyAnimation } from "../util/animations";
import type { TextEvent } from "../util/types";


interface TextOverlayProps {
    event: TextEvent;
    frame: number;
    fps: number;
}


const STYLE_PRESETS: Record<string, React.CSSProperties> = {
    title: {
        fontSize: 96,
        fontWeight: "bold",
        letterSpacing: "-0.02em",
    },
    caption: {
        fontSize: 48,
        fontWeight: "normal",
        padding: "8px 16px",
        borderRadius: "8px",
        backgroundColor: "rgba(0, 0, 0, 0.6)",
    },
    callout: {
        fontSize: 40,
        fontWeight: 600,
        padding: "12px 20px",
        borderRadius: "12px",
    },
    label: {
        fontSize: 32,
        fontWeight: 500,
        textTransform: "uppercase" as const,
        letterSpacing: "0.05em",
    },
};


export const TextOverlay: React.FC<TextOverlayProps> = ({ event, frame, fps }) => {
    const anim = applyAnimation(event.animate, frame, fps, event.animate_frames);
    const presetStyle: React.CSSProperties = STYLE_PRESETS[event.style] ?? STYLE_PRESETS.caption;

    const isCenter: boolean = event.align === "center";

    const style: React.CSSProperties = {
        position: "absolute",
        top: event.position.y,
        left: event.position.x,
        ...(isCenter ? { transform: `translateX(-50%) ${anim.transform === "none" ? "" : anim.transform}`.trim() } : { transform: anim.transform }),
        opacity: anim.opacity,
        zIndex: event.z_index,
        color: event.color ?? "#FFFFFF",
        fontFamily: "Open Sans, sans-serif",
        textAlign: event.align ?? "left",
        whiteSpace: "pre-wrap",
        ...presetStyle,
        ...(event.style === "callout" ? { backgroundColor: "rgba(7, 193, 7, 0.15)" } : {}),
        ...(event.font_size ? { fontSize: event.font_size } : {}),
    };

    return (
        <div style={style}>
            {event.content}
        </div>
    );
};
