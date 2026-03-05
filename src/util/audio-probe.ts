import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { warn } from "./logger.js";


/**
 * Probe the actual duration of an audio file using ffprobe.
 * Returns 0 if the file doesn't exist or ffprobe fails.
 */
export function probeAudioDuration(audioPath: string): number {
    if (!existsSync(audioPath)) {
        return 0;
    }

    try {
        const output: string = execFileSync("ffprobe", [
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            audioPath,
        ], { stdio: ["pipe", "pipe", "pipe"], encoding: "utf-8" }).trim();

        const duration: number = parseFloat(output);
        return isNaN(duration) ? 0 : duration;
    } catch {
        warn("  Could not probe audio duration with ffprobe; using computed duration.");
        return 0;
    }
}
