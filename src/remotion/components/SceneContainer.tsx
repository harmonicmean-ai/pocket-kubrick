import React from "react";
import { AbsoluteFill, interpolate, Easing } from "remotion";
import type { TimelineScene } from "../util/types";


interface SceneContainerProps {
    scene: TimelineScene;
    currentFrame: number;
    fps: number;
    children: React.ReactNode;
}


export const SceneContainer: React.FC<SceneContainerProps> = ({
    scene,
    currentFrame,
    fps,
    children,
}) => {
    const relativeFrame: number = currentFrame - scene.start_frame;
    const transitionStyle: React.CSSProperties = computeTransitionStyle(
        scene.transition,
        relativeFrame,
        scene.transition_frames,
    );

    return (
        <AbsoluteFill style={transitionStyle}>
            {children}
        </AbsoluteFill>
    );
};


function computeTransitionStyle(
    transition: string,
    relativeFrame: number,
    transitionFrames: number,
): React.CSSProperties {
    if (transition === "cut" || transitionFrames <= 0) {
        return {};
    }

    // Only apply transition during the first N frames of the scene
    if (relativeFrame >= transitionFrames) {
        return {};
    }

    switch (transition) {
        case "fade": {
            const opacity: number = interpolate(
                relativeFrame, [0, transitionFrames], [0, 1],
                { extrapolateRight: "clamp" },
            );
            return { opacity };
        }

        case "slide-left": {
            const translateX: number = interpolate(
                relativeFrame, [0, transitionFrames], [100, 0],
                { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
            );
            return { transform: `translateX(${translateX}%)` };
        }

        case "slide-right": {
            const translateX: number = interpolate(
                relativeFrame, [0, transitionFrames], [-100, 0],
                { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
            );
            return { transform: `translateX(${translateX}%)` };
        }

        case "wipe-down": {
            const clipY: number = interpolate(
                relativeFrame, [0, transitionFrames], [0, 100],
                { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) },
            );
            return { clipPath: `inset(0 0 ${100 - clipY}% 0)` };
        }

        default:
            return {};
    }
}
