import React from "react";
import { Img, staticFile, useVideoConfig } from "remotion";
import { applyAnimation } from "../util/animations";
import { EventRenderer } from "../util/event-renderer";
import type { ScreenshotEvent, ChildTimelineEvent } from "../util/types";


interface ScreenshotProps {
    event: ScreenshotEvent;
    frame: number;
    fps: number;
    /** Absolute current frame (not relative to event start). Needed for children timing. */
    currentFrame: number;
}


export const Screenshot: React.FC<ScreenshotProps> = ({ event, frame, fps, currentFrame }) => {
    const { width: videoWidth, height: videoHeight } = useVideoConfig();
    const anim = applyAnimation(event.animate, frame, fps, event.animate_frames);

    const offsetX: number = event.position?.x ?? 0;
    const offsetY: number = event.position?.y ?? 0;
    const isInset: boolean = offsetX !== 0 || offsetY !== 0;
    const overflowMode: string = event.overflow ?? "clip";
    const dimBefore: number = event.dim_before ?? 0;

    // Compute dimensions and scale for resize mode
    let containerWidth: number | string;
    let containerHeight: number | string;
    let innerWidth: number = videoWidth;
    let innerHeight: number = videoHeight;
    let scaleFactor: number = 1;

    if (overflowMode === "resize" && isInset) {
        scaleFactor = Math.min(
            (videoWidth - offsetX) / videoWidth,
            (videoHeight - offsetY) / videoHeight,
        );
        containerWidth = Math.round(videoWidth * scaleFactor);
        containerHeight = Math.round(videoHeight * scaleFactor);
    } else if (event.size) {
        containerWidth = event.size.w;
        containerHeight = event.size.h ?? videoHeight;
    } else {
        // Clip mode or full-frame: container extends full video dims from offset
        containerWidth = videoWidth;
        containerHeight = videoHeight;
    }

    const containerStyle: React.CSSProperties = {
        position: "absolute",
        top: offsetY,
        left: offsetX,
        width: containerWidth,
        height: containerHeight,
        overflow: isInset ? "hidden" : undefined,
        opacity: anim.opacity,
        transform: anim.transform,
        zIndex: event.z_index,
    };

    const innerStyle: React.CSSProperties = {
        position: "relative",
        width: innerWidth,
        height: innerHeight,
        ...(overflowMode === "resize" && isInset ? {
            transform: `scale(${scaleFactor})`,
            transformOrigin: "top left",
        } : {}),
    };

    const imgStyle: React.CSSProperties = {
        width: "100%",
        height: "100%",
        objectFit: event.fit,
        borderRadius: event.border_radius ? `${event.border_radius}px` : undefined,
        boxShadow: event.shadow ? "0 8px 32px rgba(0, 0, 0, 0.4)" : undefined,
    };

    const borderOverlayStyle: React.CSSProperties | null = event.border ? {
        position: "absolute",
        inset: 0,
        border: event.border,
        pointerEvents: "none",
        boxSizing: "border-box",
    } : null;

    // Dim overlay renders as a sibling before the container (not inside it)
    const dimOverlay: React.ReactNode = dimBefore > 0 ? (
        <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: `rgba(0, 0, 0, ${dimBefore / 100})`,
            zIndex: (event.z_index ?? 0) - 1,
            opacity: anim.opacity,
            pointerEvents: "none",
        }} />
    ) : null;

    const children: ChildTimelineEvent[] = event.children ?? [];

    return (
        <>
            {dimOverlay}
            <div style={containerStyle}>
                <div style={innerStyle}>
                    <Img src={staticFile(event.src)} style={imgStyle} />
                    {borderOverlayStyle && <div style={borderOverlayStyle} />}
                    {children.map((child) => (
                        <EventRenderer
                            key={child.id}
                            event={child}
                            currentFrame={currentFrame}
                            fps={fps}
                        />
                    ))}
                </div>
            </div>
        </>
    );
};
