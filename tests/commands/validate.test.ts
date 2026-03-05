import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { runValidation } from "../../src/commands/validate.js";


const VALID_PROJECT: string = resolve(import.meta.dirname, "../fixtures/valid-project");
const INVALID_PROJECT: string = resolve(import.meta.dirname, "../fixtures/invalid-project");


describe("runValidation", () => {
    it("passes for valid project", () => {
        const result = runValidation({ project: VALID_PROJECT });
        expect(result.success).toBe(true);
        expect(result.config).not.toBeNull();
        expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    });

    it("fails for invalid project (bad fps, missing scripts)", () => {
        const result = runValidation({ project: INVALID_PROJECT });
        expect(result.success).toBe(false);
        expect(result.diagnostics.some((d) => d.severity === "error")).toBe(true);
    });

    it("fails for nonexistent project path", () => {
        const result = runValidation({ project: "/tmp/does-not-exist-pocket-kubrick" });
        expect(result.success).toBe(false);
        expect(result.diagnostics.some((d) => d.severity === "error")).toBe(true);
    });
});
