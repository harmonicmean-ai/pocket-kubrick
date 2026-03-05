import React from "react";
import { useVideoConfig } from "remotion";
import { applyAnimation, drawProgress } from "../util/animations";
import type { CircleEvent } from "../util/types";


interface CircleAnnotationProps {
    event: CircleEvent;
    frame: number;
    fps: number;
}


export const CircleAnnotation: React.FC<CircleAnnotationProps> = ({ event, frame, fps }) => {
    const { width, height } = useVideoConfig();
    const anim = applyAnimation(event.animate, frame, fps, event.animate_frames);

    const circumference: number = 2 * Math.PI * event.target.r;
    const isDraw: boolean = event.animate === "draw";
    const dashOffset: number = isDraw
        ? circumference * drawProgress(frame, event.animate_frames)
        : 0;

    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{
                position: "absolute",
                top: 0,
                left: 0,
                opacity: anim.opacity,
                transform: anim.transform,
                zIndex: event.z_index,
                pointerEvents: "none",
            }}
        >
            <circle
                cx={event.target.x}
                cy={event.target.y}
                r={event.target.r}
                fill={event.fill ?? "none"}
                stroke={event.color}
                strokeWidth={event.stroke_width}
                strokeDasharray={isDraw ? circumference : undefined}
                strokeDashoffset={isDraw ? dashOffset : undefined}
            />
        </svg>
    );
};
