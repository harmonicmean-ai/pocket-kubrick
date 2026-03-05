import React from "react";
import { AbsoluteFill, Audio, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { SceneContainer } from "./components/SceneContainer";
import { EventRenderer } from "./util/event-renderer";
import type { Timeline, TimelineScene, TimelineEvent } from "./util/types";


interface VideoCompositionProps {
    timeline: Timeline;
}


export const VideoComposition: React.FC<VideoCompositionProps> = ({ timeline }) => {
    const frame: number = useCurrentFrame();
    const { fps } = useVideoConfig();

    if (!timeline) {
        return (
            <AbsoluteFill style={{ backgroundColor: "#121212", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ color: "#666", fontSize: 32, fontFamily: "monospace" }}>
                    No timeline loaded
                </div>
            </AbsoluteFill>
        );
    }

    // Find the active scene for the current frame.
    // During pause_after gaps and after the last scene ends, hold the
    // previous scene's final visual state so there's no flash of black.
    const lastScene: TimelineScene = timeline.scenes[timeline.scenes.length - 1];
    let activeScene: TimelineScene | undefined =
        timeline.scenes.find((s) => frame >= s.start_frame && frame < s.end_frame);

    // If no scene is active, hold the most recent scene that has already ended
    const holdingScene: boolean = !activeScene && frame > 0;
    if (!activeScene) {
        for (let i = timeline.scenes.length - 1; i >= 0; i--) {
            if (frame >= timeline.scenes[i].end_frame) {
                activeScene = timeline.scenes[i];
                break;
            }
        }
    }

    // Collect events that are active at the current frame, sorted by z_index.
    // When holding a scene (gap or post-last), show its events at their final state.
    const activeEvents: TimelineEvent[] = timeline.events
        .filter((e) => holdingScene
            ? activeScene && e.end_frame >= activeScene.start_frame && e.start_frame <= activeScene.end_frame
            : frame >= e.start_frame && frame <= e.end_frame)
        .sort((a, b) => a.z_index - b.z_index);

    return (
        <AbsoluteFill style={{ backgroundColor: timeline.video.title ? "#000000" : "#121212" }}>
            {/* Background layer */}
            <AbsoluteFill style={{ backgroundColor: "#121212" }} />

            {/* Scene container with transition */}
            {activeScene && (
                <SceneContainer
                    scene={activeScene}
                    currentFrame={holdingScene ? activeScene.end_frame - 1 : frame}
                    fps={fps}
                >
                    {/* Visual events -- clamp to end_frame when holding */}
                    {activeEvents.map((event) => (
                        <EventRenderer
                            key={event.id}
                            event={event}
                            currentFrame={holdingScene ? activeScene.end_frame - 1 : frame}
                            fps={fps}
                        />
                    ))}
                </SceneContainer>
            )}

            {/* Audio track */}
            <Audio src={staticFile(timeline.video.audio_src)} />
        </AbsoluteFill>
    );
};
