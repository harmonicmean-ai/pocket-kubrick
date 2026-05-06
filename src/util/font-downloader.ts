/**
 * On-demand Google Fonts downloader.
 *
 * Given one or more font family names, fetches the woff2 files from the
 * Google Fonts CSS API and writes them under `<projectRoot>/fonts/<slug>/`.
 * A small `manifest.json` records what's been downloaded so subsequent runs
 * skip the network entirely.
 *
 * Returns a manifest of `{ family, weight, src }` entries where `src` is a
 * project-root-relative path that can be passed to Remotion's `staticFile()`.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { verbose, warn } from "./logger.js";


export interface FontFile {
    weight: string;
    /** Path relative to the project root, suitable for `staticFile()`. */
    src: string;
}


export interface FontManifestEntry {
    family: string;
    weight: string;
    /** Path relative to the project root, suitable for `staticFile()`. */
    src: string;
}


interface PerFamilyManifest {
    family: string;
    weights: FontFile[];
}


// Modern Chrome UA so the API returns woff2 (older UAs get TTF).
const USER_AGENT: string =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const DEFAULT_WEIGHTS: string[] = ["400", "700"];

const FONTS_API_BASE: string = "https://fonts.googleapis.com/css2";


/**
 * Slugify a font family name for use as a directory/file basename.
 * "Open Sans" -> "open-sans", "Jura" -> "jura".
 */
export function fontSlug(family: string): string {
    return family.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}


/**
 * Make sure each requested font family has woff2 files in
 * `<projectRoot>/fonts/<slug>/`. Downloads any missing families.
 *
 * Returns a flat manifest of all (family, weight, src) entries — both
 * pre-existing and newly downloaded.
 */
export async function ensureFonts(
    families: string[],
    projectRoot: string,
    weights: string[] = DEFAULT_WEIGHTS,
): Promise<FontManifestEntry[]> {
    const fontsDir: string = join(projectRoot, "fonts");
    const manifest: FontManifestEntry[] = [];

    const uniqueFamilies: string[] = Array.from(new Set(families.map((f) => f.trim()).filter(Boolean)));

    for (const family of uniqueFamilies) {
        const slug: string = fontSlug(family);
        const familyDir: string = join(fontsDir, slug);
        const manifestPath: string = join(familyDir, "manifest.json");

        let perFamily: PerFamilyManifest | null = null;
        if (existsSync(manifestPath)) {
            try {
                perFamily = JSON.parse(readFileSync(manifestPath, "utf-8"));
            } catch {
                perFamily = null;
            }
        }

        const haveAllWeights: boolean = perFamily !== null
            && weights.every((w) => perFamily!.weights.some((entry) => entry.weight === w));

        if (!haveAllWeights) {
            verbose(`  Downloading font "${family}" (weights ${weights.join(", ")})...`);
            perFamily = await downloadFamily(family, weights, familyDir);
            mkdirSync(familyDir, { recursive: true });
            writeFileSync(manifestPath, JSON.stringify(perFamily, null, 2));
        } else {
            verbose(`  Font "${family}" already cached at fonts/${slug}/`);
        }

        for (const entry of perFamily!.weights) {
            manifest.push({ family, weight: entry.weight, src: entry.src });
        }
    }

    return manifest;
}


/**
 * Fetch a family's CSS from Google Fonts, then download each woff2 file
 * referenced by its @font-face rules. Filters to a single src per weight
 * (the first listed, which is the latin subset for Latin-supporting fonts).
 */
async function downloadFamily(
    family: string,
    weights: string[],
    familyDir: string,
): Promise<PerFamilyManifest> {
    const slug: string = fontSlug(family);
    const familyParam: string = encodeURIComponent(family.trim()).replace(/%20/g, "+");
    const weightsParam: string = weights.join(";");
    const cssUrl: string = `${FONTS_API_BASE}?family=${familyParam}:wght@${weightsParam}&display=swap`;

    const cssResponse: Response = await fetch(cssUrl, {
        headers: { "User-Agent": USER_AGENT },
    });
    if (!cssResponse.ok) {
        throw new Error(`Google Fonts CSS request failed for "${family}": ${cssResponse.status} ${cssResponse.statusText}`);
    }
    const css: string = await cssResponse.text();

    const blocks: FontFaceBlock[] = parseFontFaceBlocks(css);
    if (blocks.length === 0) {
        throw new Error(`No @font-face rules found in CSS for "${family}". Family may be misspelled or unavailable from Google Fonts.`);
    }

    mkdirSync(familyDir, { recursive: true });

    // Pick the "latin" subset for each weight. Google's CSS includes one
    // @font-face block per (weight, subset) pair (cyrillic, greek, latin, ...);
    // we filter to latin so the weight files contain the Latin glyphs we
    // actually need rather than a 2KB Cyrillic-only fragment.
    const latinBlocks: FontFaceBlock[] = blocks.filter((b) => b.subset === "latin");
    const blocksToUse: FontFaceBlock[] = latinBlocks.length > 0 ? latinBlocks : blocks;

    // Many Google Fonts are variable fonts that serve a single woff2 for
    // the entire weight axis -- the CSS hands out the same URL for both
    // weight 400 and weight 700. Dedupe by URL so we don't download or
    // store the same bytes twice; multiple manifest entries can share src.
    const seenWeights: Set<string> = new Set();
    const urlToSrc: Map<string, string> = new Map();
    const downloaded: FontFile[] = [];

    for (const block of blocksToUse) {
        if (seenWeights.has(block.weight)) {
            continue;
        }
        if (!weights.includes(block.weight)) {
            continue;
        }

        let src: string | undefined = urlToSrc.get(block.url);
        if (src === undefined) {
            const filename: string = `${slug}-${block.weight}.woff2`;
            const outPath: string = join(familyDir, filename);

            const fontResponse: Response = await fetch(block.url);
            if (!fontResponse.ok) {
                warn(`  Failed to download ${block.url}: ${fontResponse.status} ${fontResponse.statusText}`);
                continue;
            }
            const buf: ArrayBuffer = await fontResponse.arrayBuffer();
            writeFileSync(outPath, Buffer.from(buf));

            src = `fonts/${slug}/${filename}`;
            urlToSrc.set(block.url, src);
            verbose(`    Wrote ${src}`);
        } else {
            verbose(`    Reusing ${src} for weight ${block.weight} (variable font)`);
        }

        downloaded.push({ weight: block.weight, src });
        seenWeights.add(block.weight);
    }

    if (downloaded.length === 0) {
        throw new Error(`Could not download any weights for "${family}". Requested: ${weights.join(", ")}.`);
    }

    return { family, weights: downloaded };
}


interface FontFaceBlock {
    weight: string;
    url: string;
    /** Subset name from the `/* latin *\/`-style comment preceding the block. */
    subset: string;
}


/**
 * Pull `font-weight`, the woff2 `src: url(...)`, and the preceding
 * `/* subset *\/` comment out of each @font-face block in a Google Fonts
 * CSS response. Returns blocks in source order.
 */
function parseFontFaceBlocks(css: string): FontFaceBlock[] {
    const blocks: FontFaceBlock[] = [];
    // Match an optional /* subset */ comment, then the @font-face block.
    const blockRe: RegExp = /(?:\/\*\s*([a-z0-9-]+)\s*\*\/\s*)?@font-face\s*\{([^}]+)\}/g;
    let match: RegExpExecArray | null;

    while ((match = blockRe.exec(css)) !== null) {
        const subset: string = match[1] ?? "unknown";
        const body: string = match[2];

        const weightMatch: RegExpMatchArray | null = body.match(/font-weight:\s*(\d+)/);
        const urlMatch: RegExpMatchArray | null = body.match(/src:\s*url\((https?:\/\/[^)]+\.woff2)\)/);

        if (weightMatch && urlMatch) {
            blocks.push({ weight: weightMatch[1], url: urlMatch[1], subset });
        }
    }

    return blocks;
}
