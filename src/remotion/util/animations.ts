import { interpolate, spring, Easing } from "remotion";


export interface AnimationStyle {
    opacity: number;
    transform: string;
}


/**
 * Compute CSS opacity + transform for a given animation type at the current frame.
 *
 * @param type       Animation name (fade-in, slide-left, scale-in, pulse, pop, draw, none/null)
 * @param frame      Current frame relative to the event's start_frame
 * @param fps        Video framerate
 * @param animFrames Number of frames the animation should take
 * @returns          CSS properties to spread onto a style object
 */
export function applyAnimation(
    type: string | null,
    frame: number,
    fps: number,
    animFrames: number,
): AnimationStyle {
    if (!type || type === "none") {
        return { opacity: 1, transform: "none" };
    }

    switch (type) {
        case "fade-in":
            return {
                opacity: interpolate(frame, [0, animFrames], [0, 1], {
                    extrapolateRight: "clamp",
                }),
                transform: "none",
            };

        case "fade-out":
            return {
                opacity: interpolate(frame, [0, animFrames], [1, 0], {
                    extrapolateRight: "clamp",
                }),
                transform: "none",
            };

        case "slide-left": {
            const translateX: number = interpolate(frame, [0, animFrames], [100, 0], {
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.cubic),
            });
            const opacity: number = interpolate(frame, [0, Math.min(animFrames * 0.5, animFrames)], [0, 1], {
                extrapolateRight: "clamp",
            });
            return { opacity, transform: `translateX(${translateX}%)` };
        }

        case "slide-right": {
            const translateX: number = interpolate(frame, [0, animFrames], [-100, 0], {
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.cubic),
            });
            const opacity: number = interpolate(frame, [0, Math.min(animFrames * 0.5, animFrames)], [0, 1], {
                extrapolateRight: "clamp",
            });
            return { opacity, transform: `translateX(${translateX}%)` };
        }

        case "slide-up": {
            const translateY: number = interpolate(frame, [0, animFrames], [100, 0], {
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.cubic),
            });
            const opacity: number = interpolate(frame, [0, Math.min(animFrames * 0.5, animFrames)], [0, 1], {
                extrapolateRight: "clamp",
            });
            return { opacity, transform: `translateY(${translateY}%)` };
        }

        case "slide-down": {
            const translateY: number = interpolate(frame, [0, animFrames], [-100, 0], {
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.cubic),
            });
            const opacity: number = interpolate(frame, [0, Math.min(animFrames * 0.5, animFrames)], [0, 1], {
                extrapolateRight: "clamp",
            });
            return { opacity, transform: `translateY(${translateY}%)` };
        }

        case "scale-in": {
            const scale: number = spring({
                frame,
                fps,
                config: { damping: 12, stiffness: 200, mass: 0.8 },
            });
            return { opacity: Math.min(scale, 1), transform: `scale(${scale})` };
        }

        case "pulse": {
            // Continuous cycling pulse: scale oscillates between 1.0 and 1.15
            const cycleLength: number = Math.max(animFrames, fps); // one full cycle
            const progress: number = (frame % cycleLength) / cycleLength;
            const scale: number = 1 + 0.15 * Math.sin(progress * Math.PI * 2);
            return { opacity: 1, transform: `scale(${scale})` };
        }

        case "pop": {
            const scale: number = spring({
                frame,
                fps,
                config: { damping: 6, stiffness: 300, mass: 0.5 },
            });
            return { opacity: Math.min(scale, 1), transform: `scale(${scale})` };
        }

        case "draw":
            // For SVG elements; returns opacity ramp. Stroke animation is handled
            // in the component via strokeDashoffset.
            return {
                opacity: interpolate(frame, [0, Math.min(5, animFrames)], [0, 1], {
                    extrapolateRight: "clamp",
                }),
                transform: "none",
            };

        default:
            return { opacity: 1, transform: "none" };
    }
}


/**
 * Compute strokeDashoffset progress for SVG "draw" animations.
 * Returns a value from 1 (fully hidden) to 0 (fully drawn).
 */
export function drawProgress(frame: number, animFrames: number): number {
    return interpolate(frame, [0, animFrames], [1, 0], {
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
    });
}
