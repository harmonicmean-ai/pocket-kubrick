import React from "react";
import { applyAnimation } from "../util/animations";
import type { ZoomEvent } from "../util/types";


interface ZoomRegionProps {
    event: ZoomEvent;
    frame: number;
    fps: number;
}


export const ZoomRegion: React.FC<ZoomRegionProps> = ({ event, frame, fps }) => {
    const anim = applyAnimation(event.animate, frame, fps, event.animate_frames);

    // Position the magnified view; defaults to right of region with some offset
    const displayX: number = event.position?.x ?? (event.region.x + event.region.w + 20);
    const displayY: number = event.position?.y ?? event.region.y;

    // The zoomed display dimensions
    const displayW: number = event.region.w * event.scale;
    const displayH: number = event.region.h * event.scale;

    return (
        <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: event.z_index }}>
            {/* Highlight the source region */}
            <div
                style={{
                    position: "absolute",
                    top: event.region.y,
                    left: event.region.x,
                    width: event.region.w,
                    height: event.region.h,
                    border: "2px solid rgba(255, 255, 255, 0.6)",
                    borderRadius: "4px",
                    opacity: anim.opacity,
                }}
            />

            {/* Magnified view */}
            <div
                style={{
                    position: "absolute",
                    top: displayY,
                    left: displayX,
                    width: displayW,
                    height: displayH,
                    overflow: "hidden",
                    border: "2px solid rgba(255, 255, 255, 0.8)",
                    borderRadius: "8px",
                    boxShadow: "0 4px 24px rgba(0, 0, 0, 0.5)",
                    opacity: anim.opacity,
                    transform: anim.transform,
                    transformOrigin: "top left",
                    backgroundColor: "#121212",
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        top: -event.region.y * event.scale,
                        left: -event.region.x * event.scale,
                        transform: `scale(${event.scale})`,
                        transformOrigin: "top left",
                    }}
                >
                    {/* The zoom content is rendered by clipping the parent scene.
                        In practice this shows the magnified region of the background.
                        Full implementation would use a duplicated scene layer here. */}
                </div>
            </div>
        </div>
    );
};
