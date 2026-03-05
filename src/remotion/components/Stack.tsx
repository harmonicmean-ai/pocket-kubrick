import React from "react";
import { applyAnimation } from "../util/animations";
import type { StackEvent, StackItem } from "../util/types";


interface StackProps {
    event: StackEvent;
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
    },
    callout: {
        fontSize: 40,
        fontWeight: 600,
        padding: "12px 20px",
        borderRadius: "12px",
        backgroundColor: "rgba(7, 193, 7, 0.15)",
    },
    label: {
        fontSize: 32,
        fontWeight: 500,
        textTransform: "uppercase" as const,
        letterSpacing: "0.05em",
    },
};


export const Stack: React.FC<StackProps> = ({ event, frame, fps }) => {
    // Container animation applies to the whole stack
    const containerAnim = applyAnimation(event.animate, frame, fps, event.animate_frames);

    const containerStyle: React.CSSProperties = {
        position: "absolute",
        top: event.position.y,
        left: event.position.x,
        display: "flex",
        flexDirection: "column",
        gap: event.gap,
        opacity: containerAnim.opacity,
        transform: containerAnim.transform,
        zIndex: event.z_index,
    };

    return (
        <div style={containerStyle}>
            {event.items.map((item: StackItem, index: number) => {
                // Each item has its own frame range for staggered reveal
                const absoluteFrame: number = event.start_frame + frame;
                if (absoluteFrame < item.start_frame || absoluteFrame > item.end_frame) {
                    // Reserve space but keep invisible to maintain layout stability
                    return (
                        <div key={index} style={{ ...getItemStyle(item), opacity: 0 }} />
                    );
                }

                const itemRelativeFrame: number = absoluteFrame - item.start_frame;
                const itemAnim = applyAnimation(
                    item.animate ?? null,
                    itemRelativeFrame,
                    fps,
                    item.animate_frames ?? 12,
                );

                const style: React.CSSProperties = {
                    ...getItemStyle(item),
                    opacity: itemAnim.opacity,
                    transform: itemAnim.transform,
                };

                return (
                    <div key={index} style={style}>
                        {item.content}
                    </div>
                );
            })}
        </div>
    );
};


function getItemStyle(item: StackItem): React.CSSProperties {
    const preset: React.CSSProperties = STYLE_PRESETS[item.style ?? "caption"] ?? STYLE_PRESETS.caption;

    return {
        color: item.color ?? "#FFFFFF",
        fontFamily: "Open Sans, sans-serif",
        textAlign: (item.align as React.CSSProperties["textAlign"]) ?? "left",
        whiteSpace: "pre-wrap",
        ...preset,
        ...(item.font_size ? { fontSize: item.font_size } : {}),
    };
}
