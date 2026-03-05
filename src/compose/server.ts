import express from "express";
import { join, dirname, resolve } from "node:path";
import { existsSync, createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { extractProjectData, extractSceneSummaries, extractSceneData } from "./scene-loader.js";
import { verbose } from "../util/logger.js";
import type { VideoConfig } from "../schema/types.js";
import type { Express, Request, Response } from "express";


/**
 * Create the Express application for the compose editor.
 * The caller is responsible for calling .listen().
 */
export function createComposeServer(config: VideoConfig, projectRoot: string): Express {
    const app: Express = express();

    // Resolve path to static assets
    const currentDir: string = dirname(fileURLToPath(import.meta.url));
    const publicDir: string = resolve(currentDir, "public");

    // Serve static files
    app.use(express.static(publicDir));

    // --- API routes ---

    app.get("/api/project", (_req: Request, res: Response) => {
        const project = extractProjectData(config);
        res.json(project);
    });

    app.get("/api/scenes", (_req: Request, res: Response) => {
        const summaries = extractSceneSummaries(config, projectRoot);
        res.json(summaries);
    });

    app.get("/api/scenes/:index", (req: Request, res: Response) => {
        const index: number = parseInt(String(req.params.index), 10);
        if (isNaN(index)) {
            res.status(400).json({ error: "Invalid scene index" });
            return;
        }

        const scene = extractSceneData(config, index, projectRoot);
        if (!scene) {
            res.status(404).json({ error: `Scene ${index} not found` });
            return;
        }

        res.json(scene);
    });

    app.get("/api/screenshot/*path", (req: Request, res: Response) => {
        // Extract the path after /api/screenshot/
        // In Express 5, splat params may be returned as an array of path segments
        const rawPath: string | string[] = req.params.path;
        const relativePath: string = Array.isArray(rawPath)
            ? rawPath.map((s: string) => decodeURIComponent(s)).join("/")
            : decodeURIComponent(String(rawPath ?? ""));
        if (!relativePath) {
            res.status(400).json({ error: "No path specified" });
            return;
        }

        const absolutePath: string = join(projectRoot, relativePath);

        // Guard against path traversal
        if (!absolutePath.startsWith(projectRoot)) {
            res.status(403).json({ error: "Access denied" });
            return;
        }

        if (!existsSync(absolutePath)) {
            verbose(`Screenshot not found: ${absolutePath}`);
            res.status(404).json({ error: "Screenshot not found" });
            return;
        }

        // Determine content type from extension
        const ext: string = absolutePath.split(".").pop()?.toLowerCase() ?? "";
        const contentTypes: Record<string, string> = {
            png: "image/png",
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            gif: "image/gif",
            webp: "image/webp",
        };

        res.setHeader("Content-Type", contentTypes[ext] ?? "application/octet-stream");
        createReadStream(absolutePath).pipe(res);
    });

    return app;
}
