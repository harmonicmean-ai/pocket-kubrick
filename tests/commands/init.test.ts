import { describe, it, expect, afterEach } from "vitest";
import { existsSync, rmSync, rmdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initProject } from "../../src/scaffold/init-project.js";


const TEST_DIR: string = resolve(import.meta.dirname, "../fixtures");
const PROJECTS_DIR: string = resolve(TEST_DIR, "projects");
const CREATED_PROJECT: string = resolve(PROJECTS_DIR, "test-init-project");


describe("initProject", () => {
    afterEach(() => {
        if (existsSync(CREATED_PROJECT)) {
            rmSync(CREATED_PROJECT, { recursive: true });
        }
        // Remove the projects/ dir if it's now empty
        try { rmdirSync(PROJECTS_DIR); } catch { /* not empty or doesn't exist */ }
    });

    it("creates project directory with correct structure", () => {
        const projectRoot: string = initProject("Test Init Project", TEST_DIR);
        expect(projectRoot).toBe(CREATED_PROJECT);

        expect(existsSync(resolve(projectRoot, "video-config.yaml"))).toBe(true);
        expect(existsSync(resolve(projectRoot, "inbox", "assets", "screenshots"))).toBe(true);
        expect(existsSync(resolve(projectRoot, "generated", "segments"))).toBe(true);

        // Script should be inline in the YAML, not a separate file
        const yaml: string = readFileSync(resolve(projectRoot, "video-config.yaml"), "utf-8");
        expect(yaml).toContain("script: |");
    });

    it("throws if directory already exists", () => {
        initProject("Test Init Project", TEST_DIR);
        expect(() => initProject("Test Init Project", TEST_DIR)).toThrow("already exists");
    });
});
