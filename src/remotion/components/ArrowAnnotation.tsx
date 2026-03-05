import React from "react";
import { useVideoConfig } from "remotion";
import { applyAnimation, drawProgress } from "../util/animations";
import type { ArrowEvent } from "../util/types";


interface ArrowAnnotationProps {
    event: ArrowEvent;
    frame: number;
    fps: number;
}


export const ArrowAnnotation: React.FC<ArrowAnnotationProps> = ({ event, frame, fps }) => {
    const { width, height } = useVideoConfig();
    const anim = applyAnimation(event.animate, frame, fps, event.animate_frames);

    // Compute line length for draw animation
    const dx: number = event.to.x - event.from.x;
    const dy: number = event.to.y - event.from.y;
    const lineLength: number = Math.sqrt(dx * dx + dy * dy);
    if (lineLength === 0) {
        return null;
    }

    const isDraw: boolean = event.animate === "draw";
    const ux: number = dx / lineLength;
    const uy: number = dy / lineLength;
    const headLength: number = Math.min(event.head_size, lineLength);
    const halfWidth: number = headLength * 0.5;

    const arrowBaseX: number = event.to.x - ux * headLength;
    const arrowBaseY: number = event.to.y - uy * headLength;
    const px: number = -uy * halfWidth;
    const py: number = ux * halfWidth;

    const shorten: number = Math.min(Math.max(headLength / 2 + event.stroke_width / 2, 0), lineLength);
    const visibleLineLength: number = Math.max(lineLength - shorten, 0);
    const hasLine: boolean = visibleLineLength > 0.5;
    const lineEndX: number = hasLine ? event.to.x - ux * shorten : event.from.x;
    const lineEndY: number = hasLine ? event.to.y - uy * shorten : event.from.y;

    const dashArray: number | undefined = isDraw && hasLine ? visibleLineLength : undefined;
    const dashOffset: number | undefined = isDraw && hasLine
        ? visibleLineLength * drawProgress(frame, event.animate_frames)
        : undefined;

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
            {hasLine && (
                <line
                    x1={event.from.x}
                    y1={event.from.y}
                    x2={lineEndX}
                    y2={lineEndY}
                    stroke={event.color}
                    strokeWidth={event.stroke_width}
                    strokeDasharray={dashArray}
                    strokeDashoffset={dashOffset}
                />
            )}
            <polygon
                points={`${arrowBaseX + px},${arrowBaseY + py} ${event.to.x},${event.to.y} ${arrowBaseX - px},${arrowBaseY - py}`}
                fill={event.color}
            />
        </svg>
    );
};
