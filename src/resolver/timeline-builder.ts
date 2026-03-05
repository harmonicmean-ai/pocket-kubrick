import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { applyEventDefaults, buildEventId, resolvePercentages } from "./event-resolver.js";
import { resolveThemeColors } from "./theme-resolver.js";
import { probeAudioDuration } from "../util/audio-probe.js";
import { verbose } from "../util/logger.js";
import type { VideoConfig, Scene, Theme } from "../schema/types.js";
import type { DiagnosticMessage } from "../util/errors.js";
import type {
    Timeline,
    TimelineVideo,
    TimelineScene,
    TimelineEvent,
    ChildTimelineEvent,
    AudioManifest,
    ManifestScene,
    TimepointsFile,
    ManifestTimepoint,
    StackItem,
} from "./types.js";


export interface ResolveResult {
    success: boolean;
    timeline: Timeline | null;
    diagnostics: DiagnosticMessage[];
}


/**
 * Build the complete timeline from YAML config + audio manifest + timepoints.
 */
export function buildTimeline(
    config: VideoConfig,
    projectRoot: string,
): ResolveResult {
    const diagnostics: DiagnosticMessage[] = [];

    // Parse resolution
    const [widthStr, heightStr] = config.video.resolution.split("x");
    const width: number = parseInt(widthStr, 10);
    const height: number = parseInt(heightStr, 10);
    const fps: number = config.video.fps;

    // Read audio manifest
    const manifestPath: string = join(projectRoot, "generated", "audio", "manifest.json");
    if (!existsSync(manifestPath)) {
        diagnostics.push({
            severity: "error",
            message: `Audio manifest not found: ${manifestPath}. Run synthesize first.`,
        });
        return { success: false, timeline: null, diagnostics };
    }

    let manifest: AudioManifest;
    try {
        manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    } catch (e) {
        diagnostics.push({
            severity: "error",
            file: manifestPath,
            message: `Failed to parse manifest: ${(e as Error).constructor.name}: ${(e as Error).message}`,
        });
        return { success: false, timeline: null, diagnostics };
    }

    // Validate scene count matches
    if (manifest.scenes.length !== config.scenes.length) {
        diagnostics.push({
            severity: "error",
            message: `Scene count mismatch: config has ${config.scenes.length} scene(s) but manifest has ${manifest.scenes.length}. Re-run convert + synthesize.`,
        });
        return { success: false, timeline: null, diagnostics };
    }

    // Read timepoints files for each scene
    const timepointsByScene: Map<string, ManifestTimepoint[]> = new Map();
    for (const manifestScene of manifest.scenes) {
        const timepointsPath: string = join(
            projectRoot, "generated", "audio", `${manifestScene.name}.timepoints.json`,
        );
        if (existsSync(timepointsPath)) {
            try {
                const tpFile: TimepointsFile = JSON.parse(readFileSync(timepointsPath, "utf-8"));
                timepointsByScene.set(manifestScene.name, tpFile.marks);
            } catch (e) {
                diagnostics.push({
                    severity: "warning",
                    file: timepointsPath,
                    message: `Failed to parse timepoints: ${(e as Error).constructor.name}: ${(e as Error).message}`,
                });
            }
        }
    }

    // Build scenes and events
    const timelineScenes: TimelineScene[] = [];
    const timelineEvents: TimelineEvent[] = [];
    let currentFrame: number = 0;
    let cumulativeDimPercent: number = 0;

    for (const [sceneIndex, sceneConfig] of config.scenes.entries()) {
        const manifestScene: ManifestScene = manifest.scenes[sceneIndex];
        const sceneMarks: ManifestTimepoint[] = timepointsByScene.get(manifestScene.name) ?? [];

        // Account for pause_before
        const pauseBeforeFrames: number = secondsToFrames(sceneConfig.pause_before, fps);
        currentFrame += pauseBeforeFrames;

        const sceneStartFrame: number = currentFrame;

        // Scene duration from audio (prefer probed actual duration over word-timestamp duration)
        const sceneDuration: number = manifestScene.actualDurationSeconds ?? manifestScene.durationSeconds;
        const sceneDurationFrames: number = secondsToFrames(sceneDuration, fps);
        const sceneEndFrame: number = sceneStartFrame + sceneDurationFrames;

        // Transition
        const transitionFrames: number = sceneConfig.transition === "cut"
            ? 0
            : secondsToFrames(sceneConfig.transition_duration, fps);

        const timelineScene: TimelineScene = {
            index: sceneIndex,
            name: manifestScene.name,
            start_frame: sceneStartFrame,
            end_frame: sceneEndFrame,
            duration_frames: sceneDurationFrames,
            transition: sceneConfig.transition,
            transition_frames: transitionFrames,
        };
        timelineScenes.push(timelineScene);

        verbose(`  Scene ${sceneIndex} "${manifestScene.name}": frames ${sceneStartFrame}-${sceneEndFrame} (${sceneDuration.toFixed(2)}s)`);

        // Resolve visual events for this scene
        const eventCountByType: Map<string, number> = new Map();

        for (const visual of sceneConfig.visuals) {
            const rawEvent: Record<string, unknown> = visual as Record<string, unknown>;
            const eventType: string = rawEvent.type as string;

            // Track per-type index for ID generation
            const typeCount: number = eventCountByType.get(eventType) ?? 0;
            eventCountByType.set(eventType, typeCount + 1);

            // Resolve `at` field -> seconds offset within scene
            const atSeconds: number = resolveAtField(
                rawEvent.at,
                sceneMarks,
                sceneIndex,
                eventType,
                diagnostics,
            );

            // Check feasibility
            if (atSeconds > manifestScene.durationSeconds) {
                diagnostics.push({
                    severity: "warning",
                    message: `Scene ${sceneIndex}, ${eventType}: "at" resolves to ${atSeconds.toFixed(2)}s but scene audio is only ${manifestScene.durationSeconds.toFixed(2)}s.`,
                    suggestion: "The event will still appear but may extend beyond the audio.",
                });
            }

            // Compute frame range
            const eventStartFrame: number = sceneStartFrame + secondsToFrames(atSeconds, fps);

            const rawDuration: unknown = rawEvent.duration;
            let eventEndFrame: number;
            if (typeof rawDuration === "number" && rawDuration > 0) {
                eventEndFrame = eventStartFrame + secondsToFrames(rawDuration, fps);
            } else {
                eventEndFrame = sceneEndFrame;
            }

            // Resolve disappear_at: overrides end_frame if present
            if (rawEvent.disappear_at !== undefined && rawEvent.disappear_at !== null) {
                const disappearSeconds: number = resolveAtField(
                    rawEvent.disappear_at,
                    sceneMarks,
                    sceneIndex,
                    `${eventType} disappear_at`,
                    diagnostics,
                );
                const disappearFrame: number = sceneStartFrame + secondsToFrames(disappearSeconds, fps);

                if (typeof rawDuration === "number" && rawDuration > 0) {
                    diagnostics.push({
                        severity: "warning",
                        message: `Scene ${sceneIndex}, ${eventType}: both "duration" and "disappear_at" are set. "disappear_at" wins.`,
                    });
                }

                if (disappearFrame <= eventStartFrame) {
                    diagnostics.push({
                        severity: "warning",
                        message: `Scene ${sceneIndex}, ${eventType}: "disappear_at" resolves to frame ${disappearFrame} which is at or before "at" frame ${eventStartFrame}. Event will never be visible.`,
                    });
                }

                eventEndFrame = disappearFrame;
            }

            // Animation frames
            const animateDuration: number = (rawEvent.animate_duration as number) ?? 0.4;
            const animateFrames: number = secondsToFrames(animateDuration, fps);

            // Resolve percentage strings to pixels, then apply type-specific defaults
            const percentResolved: Record<string, unknown> = resolvePercentages(rawEvent, width, height);
            const resolved: Record<string, unknown> = applyEventDefaults(percentResolved, config.video.theme, projectRoot);

            // Build the timeline event
            const eventId: string = buildEventId(sceneIndex, eventType, typeCount);
            const animate: string | null = (resolved.animate as string) ?? null;

            // Remove config-only fields that don't belong in the timeline
            delete resolved.at;
            delete resolved.disappear_at;
            delete resolved.duration;
            delete resolved.animate_duration;

            // Set computed fields
            resolved.id = eventId;
            resolved.start_frame = eventStartFrame;
            resolved.end_frame = eventEndFrame;
            resolved.z_index = (resolved.z_index as number) ?? 0;
            resolved.animate = animate === "none" ? null : animate;
            resolved.animate_frames = animateFrames;

            // Resolve stack items: each item gets its own at-anchor and frame range
            if (eventType === "stack" && Array.isArray(resolved.items)) {
                resolved.items = resolveStackItems(
                    resolved.items as Record<string, unknown>[],
                    sceneMarks, sceneIndex, sceneStartFrame, eventEndFrame,
                    fps, config.video.theme, diagnostics,
                );
            }

            // Resolve children for screenshot events
            if (eventType === "screenshot" && Array.isArray(rawEvent.children)) {
                resolved.dim_before = cumulativeDimPercent;
                const dimBeneath: number = (resolved.dim_beneath as number) ?? 0;
                cumulativeDimPercent += dimBeneath;

                const resolvedChildren: ChildTimelineEvent[] = [];
                let childIndex: number = 0;

                for (const rawChild of rawEvent.children as Record<string, unknown>[]) {
                    const childType: string = rawChild.type as string;

                    if (childType === "screenshot") {
                        diagnostics.push({
                            severity: "error",
                            message: `Scene ${sceneIndex}, ${eventType}: children must not be type "screenshot".`,
                        });
                        continue;
                    }

                    // Resolve at/disappear_at/duration for child
                    const childAtSeconds: number = resolveAtField(
                        rawChild.at, sceneMarks, sceneIndex,
                        `${eventType} child ${childType}`, diagnostics,
                    );
                    const childStartFrame: number = sceneStartFrame + secondsToFrames(childAtSeconds, fps);

                    const childRawDuration: unknown = rawChild.duration;
                    let childEndFrame: number;
                    if (typeof childRawDuration === "number" && childRawDuration > 0) {
                        childEndFrame = childStartFrame + secondsToFrames(childRawDuration, fps);
                    } else {
                        childEndFrame = eventEndFrame;
                    }

                    // Resolve disappear_at for child
                    if (rawChild.disappear_at !== undefined && rawChild.disappear_at !== null) {
                        const childDisappearSeconds: number = resolveAtField(
                            rawChild.disappear_at, sceneMarks, sceneIndex,
                            `${eventType} child ${childType} disappear_at`, diagnostics,
                        );
                        childEndFrame = sceneStartFrame + secondsToFrames(childDisappearSeconds, fps);
                    }

                    // Clamp child end_frame to parent screenshot's end_frame
                    childEndFrame = Math.min(childEndFrame, eventEndFrame);

                    const childAnimDuration: number = (rawChild.animate_duration as number) ?? 0.4;
                    const childAnimFrames: number = secondsToFrames(childAnimDuration, fps);

                    // Resolve percentage strings to pixels, then apply type-specific defaults
                    const childPctResolved: Record<string, unknown> = resolvePercentages(rawChild, width, height);
                    const childResolved: Record<string, unknown> = applyEventDefaults(childPctResolved, config.video.theme, projectRoot);

                    const childId: string = `${eventId}-child-${childType}-${childIndex}`;
                    const childAnimate: string | null = (childResolved.animate as string) ?? null;

                    // Remove config-only fields
                    delete childResolved.at;
                    delete childResolved.disappear_at;
                    delete childResolved.duration;
                    delete childResolved.animate_duration;

                    // Set computed fields
                    childResolved.id = childId;
                    childResolved.start_frame = childStartFrame;
                    childResolved.end_frame = childEndFrame;
                    childResolved.z_index = (childResolved.z_index as number) ?? 0;
                    childResolved.animate = childAnimate === "none" ? null : childAnimate;
                    childResolved.animate_frames = childAnimFrames;

                    // Resolve stack items within child if applicable
                    if (childType === "stack" && Array.isArray(childResolved.items)) {
                        childResolved.items = resolveStackItems(
                            childResolved.items as Record<string, unknown>[],
                            sceneMarks, sceneIndex, sceneStartFrame, childEndFrame,
                            fps, config.video.theme, diagnostics,
                        );
                    }

                    resolvedChildren.push(childResolved as unknown as ChildTimelineEvent);
                    childIndex++;

                    verbose(`      Child ${childId}: frames ${childStartFrame}-${childEndFrame}, animate=${childAnimate}`);
                }

                if (resolvedChildren.length > 0) {
                    resolved.children = resolvedChildren;
                }
            } else if (eventType === "screenshot") {
                // Screenshot without children still contributes to dim
                resolved.dim_before = cumulativeDimPercent;
                const dimBeneath: number = (resolved.dim_beneath as number) ?? 0;
                cumulativeDimPercent += dimBeneath;
            }

            timelineEvents.push(resolved as TimelineEvent);

            verbose(`    Event ${eventId}: frames ${eventStartFrame}-${eventEndFrame}, animate=${animate}`);
        }

        // Advance current frame past scene + pause_after
        currentFrame = sceneEndFrame;
        const pauseAfterFrames: number = secondsToFrames(sceneConfig.pause_after, fps);
        currentFrame += pauseAfterFrames;
    }

    // Ensure the video covers the full audio file (MP3 encoding can add padding
    // beyond the sum of segment durations, causing the audio to clip at the end).
    const fullAudioPath: string = join(projectRoot, "generated", "audio", "full.mp3");
    const audioDurationSeconds: number = probeAudioDuration(fullAudioPath);
    const audioFrames: number = audioDurationSeconds > 0
        ? Math.ceil(audioDurationSeconds * fps)
        : currentFrame;

    if (audioFrames > currentFrame) {
        verbose(`  Audio file is ${audioDurationSeconds.toFixed(3)}s (${audioFrames} frames), extending video from ${currentFrame} frames to cover it.`);
    }

    // Add hold_last after the audio ends so the video doesn't end abruptly
    const holdLastFrames: number = secondsToFrames(config.video.hold_last, fps);
    const totalFrames: number = Math.max(currentFrame, audioFrames) + holdLastFrames;
    const totalDurationSeconds: number = totalFrames / fps;

    verbose(`  hold_last: ${config.video.hold_last}s (${holdLastFrames} frames)`);

    const video: TimelineVideo = {
        title: config.video.title,
        width,
        height,
        fps,
        total_frames: totalFrames,
        total_duration_seconds: totalDurationSeconds,
        audio_src: "generated/audio/full.mp3",
    };

    const timeline: Timeline = {
        video,
        scenes: timelineScenes,
        events: timelineEvents,
    };

    return {
        success: diagnostics.every((d) => d.severity !== "error"),
        timeline,
        diagnostics,
    };
}


/**
 * Resolve stack items: each item gets its own at-anchor and frame range.
 * Extracted to avoid duplication between top-level and child event resolution.
 */
function resolveStackItems(
    items: Record<string, unknown>[],
    sceneMarks: ManifestTimepoint[],
    sceneIndex: number,
    sceneStartFrame: number,
    parentEndFrame: number,
    fps: number,
    theme: Theme,
    diagnostics: DiagnosticMessage[],
): StackItem[] {
    const resolvedItems: StackItem[] = [];
    for (const item of items) {
        const itemAtSeconds: number = resolveAtField(
            item.at,
            sceneMarks,
            sceneIndex,
            "stack item",
            diagnostics,
        );
        const itemStartFrame: number = sceneStartFrame + secondsToFrames(itemAtSeconds, fps);
        const itemAnimDuration: number = (item.animate_duration as number) ?? 0.4;
        const itemAnimFrames: number = secondsToFrames(itemAnimDuration, fps);

        // Apply text-like defaults
        const resolvedItem: Record<string, unknown> = {
            content: item.content,
            style: item.style ?? "caption",
            animate: item.animate ?? null,
            animate_frames: itemAnimFrames,
            color: item.color ?? "#FFFFFF",
            font_size: item.font_size ?? null,
            align: item.align ?? null,
            start_frame: itemStartFrame,
            end_frame: parentEndFrame,
        };

        // Resolve theme colors on item
        const colorResolved: Record<string, unknown> = resolveThemeColors(
            resolvedItem,
            theme,
            ["color"],
        );

        resolvedItems.push(colorResolved as unknown as StackItem);

        verbose(`      Stack item "${item.content}": frame ${itemStartFrame}, animate=${resolvedItem.animate}`);
    }
    return resolvedItems;
}


/**
 * Resolve the `at` field of a visual event to a seconds offset within the scene.
 *
 * - string anchor name -> look up in timepoints
 * - number -> use directly as seconds
 * - undefined/missing -> 0
 */
function resolveAtField(
    at: unknown,
    sceneMarks: ManifestTimepoint[],
    sceneIndex: number,
    eventType: string,
    diagnostics: DiagnosticMessage[],
): number {
    if (at === undefined || at === null) {
        return 0;
    }

    if (typeof at === "number") {
        return at;
    }

    if (typeof at === "string") {
        // Find the first matching timepoint
        const mark: ManifestTimepoint | undefined = sceneMarks.find((m) => m.name === at);
        if (mark) {
            return mark.timeSeconds;
        }

        diagnostics.push({
            severity: "warning",
            message: `Scene ${sceneIndex}, ${eventType}: anchor "${at}" not found in timepoints. Defaulting to 0s.`,
            suggestion: "Check the script text or re-run synthesize.",
        });
        return 0;
    }

    return 0;
}


/**
 * Convert seconds to frame count.
 */
function secondsToFrames(seconds: number, fps: number): number {
    return Math.round(seconds * fps);
}


