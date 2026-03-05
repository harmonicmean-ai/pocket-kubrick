import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../..");
const entryPoint = resolve(repoRoot, "src", "shared", "annotation-renderers.ts");
const outputDir = resolve(repoRoot, "src", "compose", "public", "js", "shared");
const outputFile = resolve(outputDir, "annotation-renderers.js");
let inflight: Promise<void> | null = null;
let tsModule: Promise<typeof import("typescript")> | null = null;

async function loadTypescript() {
    if (!tsModule) {
        tsModule = import("typescript");
    }
    return tsModule;
}

async function buildBundle(): Promise<void> {
    mkdirSync(outputDir, { recursive: true });
    const ts = await loadTypescript().catch((err) => {
        console.error("Failed to load TypeScript. Run `npm install` to install dev dependencies.");
        throw err;
    });
    const input = readFileSync(entryPoint, "utf8");
    const transpiled = ts.transpileModule(input, {
        compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2020,
            sourceMap: false,
        },
        fileName: "annotation-renderers.ts",
    });
    writeFileSync(outputFile, transpiled.outputText, "utf8");
}

export async function ensureComposeSharedBundle(): Promise<void> {
    if (!inflight) {
        inflight = buildBundle().finally(() => {
            inflight = null;
        });
    }
    await inflight;
}
