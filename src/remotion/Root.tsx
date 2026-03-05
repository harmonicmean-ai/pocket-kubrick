import React from "react";
import { Composition } from "remotion";
import { VideoComposition } from "./VideoComposition";
import type { Timeline } from "./util/types";


export const RemotionRoot: React.FC = () => {
    return (
        <>
            <Composition
                id="VideoComposition"
                component={VideoComposition as unknown as React.FC<Record<string, unknown>>}
                durationInFrames={1}
                fps={30}
                width={1920}
                height={1080}
                defaultProps={{
                    timeline: null as unknown as Timeline,
                }}
                calculateMetadata={async ({ props }) => {
                    const timeline = (props as { timeline: Timeline | null }).timeline;
                    if (!timeline) {
                        return {};
                    }
                    return {
                        durationInFrames: timeline.video.total_frames,
                        fps: timeline.video.fps,
                        width: timeline.video.width,
                        height: timeline.video.height,
                    };
                }}
            />
        </>
    );
};
