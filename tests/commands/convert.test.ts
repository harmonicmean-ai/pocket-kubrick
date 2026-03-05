import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve, join } from "node:path";
import { existsSync, readFileSync, rmSync, cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { runValidation } from "../../src/commands/validate.js";
import { runConversion } from "../../src/commands/convert.js";
import type { ConvertedScene } from "../../src/converter/segment-types.js";


const VALID_PROJECT: string = resolve(import.meta.dirname, "../fixtures/valid-project");

let tempProject: string;


describe("runConversion", () => {
    beforeEach(() => {
        tempProject = mkdtempSync(join(tmpdir(), "convert-test-"));
        cpSync(VALID_PROJECT, tempProject, { recursive: true });
    });

    afterEach(() => {
        if (existsSync(tempProject)) {
            rmSync(tempProject, { recursive: true });
        }
    });

    it("generates segment JSON files for all scenes", () => {
        const { config } = runValidation({ project: tempProject });
        expect(config).not.toBeNull();

        const result = runConversion(config!, tempProject);
        expect(result.success).toBe(true);
        expect(result.outputFiles).toHaveLength(3);

        for (const file of result.outputFiles) {
            expect(existsSync(file)).toBe(true);
            expect(file).toMatch(/\.json$/);
        }
    });

    it("generates valid segment JSON with anchors", () => {
        const { config } = runValidation({ project: tempProject });
        const result = runConversion(config!, tempProject);

        // Read the second scene segments (has anchors)
        const segmentsDir: string = resolve(tempProject, "generated", "segments");
        const scene02Path: string = resolve(segmentsDir, "02-settings-icon.json");
        expect(existsSync(scene02Path)).toBe(true);

        const scene02: ConvertedScene = JSON.parse(readFileSync(scene02Path, "utf-8"));
        expect(scene02.sceneIndex).toBe(1);
        expect(scene02.sceneId).toBe("02-settings-icon");
        expect(scene02.anchors).toContain("settings-icon");
        expect(scene02.anchors).toContain("top-right");
        expect(scene02.segments.length).toBeGreaterThanOrEqual(1);

        // The text should contain *settings icon* (emphasis)
        const fullText: string = scene02.segments.map((s) => s.text).join(" ");
        expect(fullText).toContain("*settings icon*");
    });

    it("handles voice directives in scene 03", () => {
        const { config } = runValidation({ project: tempProject });
        const result = runConversion(config!, tempProject);

        const segmentsDir: string = resolve(tempProject, "generated", "segments");
        const scene03Path: string = resolve(segmentsDir, "03-notification-panel.json");
        expect(existsSync(scene03Path)).toBe(true);

        const scene03: ConvertedScene = JSON.parse(readFileSync(scene03Path, "utf-8"));
        expect(scene03.anchors).toContain("toggle-on");
        expect(scene03.anchors).toContain("alerts-you-want");

        // Should have a segment with voiceId for the aside
        const asideSegment = scene03.segments.find((s) => s.voiceId === "aside");
        expect(asideSegment).toBeDefined();
    });
});
