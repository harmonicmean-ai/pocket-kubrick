import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolve, join } from "node:path";
import { existsSync, readFileSync, rmSync, cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { runValidation } from "../../src/commands/validate.js";
import { runConversion } from "../../src/commands/convert.js";
import { runTranscript } from "../../src/commands/transcript.js";


const VALID_PROJECT: string = resolve(import.meta.dirname, "../fixtures/valid-project");

let tempProject: string;


describe("runTranscript", () => {
    beforeEach(() => {
        tempProject = mkdtempSync(join(tmpdir(), "transcript-test-"));
        cpSync(VALID_PROJECT, tempProject, { recursive: true });
    });

    afterEach(() => {
        if (existsSync(tempProject)) {
            rmSync(tempProject, { recursive: true });
        }
    });

    it("generates both .md and .html files named after project slug", () => {
        const { config } = runValidation({ project: tempProject });
        expect(config).not.toBeNull();

        const convertResult = runConversion(config!, tempProject);
        expect(convertResult.success).toBe(true);

        const result = runTranscript(config!, tempProject);
        expect(result.success).toBe(true);
        expect(result.outputFiles).toHaveLength(2);
        expect(result.outputFiles[0]).toMatch(/how-to-configure-notifications_transcript\.md$/);
        expect(result.outputFiles[1]).toMatch(/how-to-configure-notifications_transcript\.html$/);
        for (const file of result.outputFiles) {
            expect(existsSync(file)).toBe(true);
        }
    });

    it("emits speaker tags with correct actor numbering in .md", () => {
        const { config } = runValidation({ project: tempProject });
        runConversion(config!, tempProject);
        const result = runTranscript(config!, tempProject);

        const transcript: string = readFileSync(result.outputFiles[0], "utf-8");

        // Narrator should be actor-01 (first speaker)
        expect(transcript).toContain('class="speaker-tag actor-01 Narrator">Narrator</div>');

        // Aside voice should be actor-02 (appears in scene 03)
        expect(transcript).toContain('class="speaker-tag actor-02 Aside">Aside</div>');
    });

    it("emits speaker tag only on speaker change", () => {
        const { config } = runValidation({ project: tempProject });
        runConversion(config!, tempProject);
        const result = runTranscript(config!, tempProject);

        const transcript: string = readFileSync(result.outputFiles[0], "utf-8");

        // Narrator tag should appear at least once at start
        const narratorMatches: RegExpMatchArray | null = transcript.match(/actor-01 Narrator/g);
        expect(narratorMatches).not.toBeNull();
        expect(narratorMatches!.length).toBeGreaterThanOrEqual(1);

        // Aside tag should appear exactly once
        const asideMatches: RegExpMatchArray | null = transcript.match(/actor-02 Aside/g);
        expect(asideMatches).not.toBeNull();
        expect(asideMatches!.length).toBe(1);

        // Total speaker tags should include at least narrator + aside
        const totalSpeakerTags: number = (transcript.match(/class="speaker-tag /g) || []).length;
        expect(totalSpeakerTags).toBeGreaterThanOrEqual(2);
    });

    it("keeps *emphasis* markers in .md output", () => {
        const { config } = runValidation({ project: tempProject });
        runConversion(config!, tempProject);
        const result = runTranscript(config!, tempProject);

        const transcript: string = readFileSync(result.outputFiles[0], "utf-8");

        // Scene 02 has *settings icon* -- should be preserved in MD
        expect(transcript).toContain("*settings icon*");
    });

    it("separates blocks with blank lines in .md", () => {
        const { config } = runValidation({ project: tempProject });
        runConversion(config!, tempProject);
        const result = runTranscript(config!, tempProject);

        const transcript: string = readFileSync(result.outputFiles[0], "utf-8");

        // Speaker tag should be followed by a blank line then text
        expect(transcript).toMatch(/speaker-tag[^>]+>[^<]+<\/div>\n\n\S/);

        // Ends with a single newline
        expect(transcript).toMatch(/[^\n]\n$/);
    });

    it("generates valid HTML document", () => {
        const { config } = runValidation({ project: tempProject });
        runConversion(config!, tempProject);
        const result = runTranscript(config!, tempProject);

        const html: string = readFileSync(result.outputFiles[1], "utf-8");

        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain("<html>");
        expect(html).toContain("<body>");
        expect(html).toContain("</body>");
        expect(html).toContain("</html>");
        expect(html).toContain("<title>");
    });

    it("wraps text in <p> tags in HTML", () => {
        const { config } = runValidation({ project: tempProject });
        runConversion(config!, tempProject);
        const result = runTranscript(config!, tempProject);

        const html: string = readFileSync(result.outputFiles[1], "utf-8");

        // Text content should be wrapped in <p> tags
        expect(html).toMatch(/<p>.+<\/p>/);

        // Should not have bare text outside of tags (between actor div and p)
        expect(html).not.toMatch(/<\/div>\n[A-Z]/);
    });

    it("wraps speaker sections in actor divs in HTML", () => {
        const { config } = runValidation({ project: tempProject });
        runConversion(config!, tempProject);
        const result = runTranscript(config!, tempProject);

        const html: string = readFileSync(result.outputFiles[1], "utf-8");

        // Actor wrapping divs
        expect(html).toContain('class="actor-01 Narrator"');
        expect(html).toContain('class="actor-02 Aside"');

        // Speaker tags inside actor divs (simple class, no actor/name classes)
        expect(html).toMatch(/<div class="speaker-tag">Narrator<\/div>/);
        expect(html).toMatch(/<div class="speaker-tag">Aside<\/div>/);
    });

    it("converts *emphasis* to <em> in HTML", () => {
        const { config } = runValidation({ project: tempProject });
        runConversion(config!, tempProject);
        const result = runTranscript(config!, tempProject);

        const html: string = readFileSync(result.outputFiles[1], "utf-8");

        // Scene 02 has *settings icon* -- should become <em> in HTML
        expect(html).toContain("<em>settings icon</em>");

        // No raw *emphasis* markers should remain in HTML
        expect(html).not.toMatch(/\*[^*]+\*/);
    });

    it("wraps scenes in marker divs with odd/even classes", () => {
        const { config } = runValidation({ project: tempProject });
        runConversion(config!, tempProject);
        const result = runTranscript(config!, tempProject);

        const md: string = readFileSync(result.outputFiles[0], "utf-8");
        const html: string = readFileSync(result.outputFiles[1], "utf-8");

        // Scene markers in MD
        expect(md).toContain('class="video-scene scene-odd scene-1"');
        expect(md).toContain('class="video-scene scene-even scene-2"');
        expect(md).toContain('class="video-scene scene-odd scene-3"');
        expect(md).toContain('<div class="scene-marker">Scene 1</div>');
        expect(md).toContain('<div class="scene-marker">Scene 2</div>');
        expect(md).toContain('<div class="scene-marker">Scene 3</div>');
        expect(md).toContain('<div class="scene-body">');

        // Scene markers in HTML
        expect(html).toContain('class="video-scene scene-odd scene-1"');
        expect(html).toContain('class="video-scene scene-even scene-2"');
        expect(html).toContain('class="video-scene scene-odd scene-3"');
        expect(html).toContain('<div class="scene-marker">Scene 1</div>');
        expect(html).toContain('<div class="scene-body">');
    });

    it("opens actor div without speaker tag when speaker continues across scenes in HTML", () => {
        const { config } = runValidation({ project: tempProject });
        runConversion(config!, tempProject);
        const result = runTranscript(config!, tempProject);

        const html: string = readFileSync(result.outputFiles[1], "utf-8");

        // Scene 2 continues with narrator (no speaker change), so actor div
        // opens but no speaker-tag inside scene-2
        const scene2Match: RegExpMatchArray | null = html.match(
            /scene-2">\n\s+<div class="scene-marker">Scene 2<\/div>\n\s+<div class="scene-body">\n\s+<div class="actor-01 Narrator">\n\s+<p>/
        );
        expect(scene2Match).not.toBeNull();
    });

    it("fails gracefully when segments directory is missing", () => {
        const { config } = runValidation({ project: tempProject });
        expect(config).not.toBeNull();

        // Don't run convert, so segments dir doesn't exist
        const result = runTranscript(config!, tempProject);
        expect(result.success).toBe(false);
        expect(result.diagnostics).toHaveLength(1);
        expect(result.diagnostics[0].severity).toBe("error");
        expect(result.diagnostics[0].message).toContain("Segments directory not found");
    });
});
