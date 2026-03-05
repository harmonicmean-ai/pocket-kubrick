import React from "react";
import { interpolate, spring } from "remotion";
import type { CursorEvent } from "../util/types";


interface CursorProps {
    event: CursorEvent;
    frame: number;
    fps: number;
}


export const Cursor: React.FC<CursorProps> = ({ event, frame, fps }) => {
    const moveFrames: number = Math.max(event.animate_frames, 1);

    // Movement animation
    const fromX: number = event.from?.x ?? event.to.x - 100;
    const fromY: number = event.from?.y ?? event.to.y + 60;

    const moveProgress: number = spring({
        frame: Math.min(frame, moveFrames),
        fps,
        config: { damping: 15, stiffness: 120, mass: 0.8 },
    });

    const currentX: number = interpolate(moveProgress, [0, 1], [fromX, event.to.x]);
    const currentY: number = interpolate(moveProgress, [0, 1], [fromY, event.to.y]);

    // Click animation (after movement completes)
    let clickScale: number = 1;
    let rippleOpacity: number = 0;
    let rippleScale: number = 0;

    if (event.click && frame > moveFrames) {
        const clickFrame: number = frame - moveFrames;
        const clickDuration: number = Math.round(fps * 0.3);

        // Cursor press scale
        clickScale = interpolate(
            clickFrame,
            [0, clickDuration * 0.3, clickDuration * 0.6, clickDuration],
            [1, 0.85, 1.05, 1],
            { extrapolateRight: "clamp" },
        );

        // Ripple effect
        rippleScale = interpolate(clickFrame, [0, clickDuration], [0, 2.5], {
            extrapolateRight: "clamp",
        });
        rippleOpacity = interpolate(clickFrame, [0, clickDuration * 0.3, clickDuration], [0.5, 0.3, 0], {
            extrapolateRight: "clamp",
        });
    }

    // Fade in opacity
    const opacity: number = interpolate(frame, [0, 5], [0, 1], { extrapolateRight: "clamp" });

    return (
        <div
            style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                zIndex: event.z_index,
                opacity,
            }}
        >
            {/* Click ripple */}
            {event.click && rippleOpacity > 0 && (
                <div
                    style={{
                        position: "absolute",
                        left: event.to.x - 20,
                        top: event.to.y - 20,
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        backgroundColor: "rgba(255, 255, 255, 0.4)",
                        transform: `scale(${rippleScale})`,
                        opacity: rippleOpacity,
                    }}
                />
            )}

            {/* Cursor SVG */}
            <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                style={{
                    position: "absolute",
                    left: currentX,
                    top: currentY,
                    transform: `scale(${clickScale})`,
                    filter: "drop-shadow(1px 2px 3px rgba(0,0,0,0.5))",
                }}
            >
                <path
                    d="M5 3l14 8.5-6.5 1.5-3.5 6z"
                    fill="white"
                    stroke="black"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                />
            </svg>
        </div>
    );
};
