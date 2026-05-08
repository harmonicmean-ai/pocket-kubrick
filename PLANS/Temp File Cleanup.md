# Plan — Stop leaking temp files into `$TMPDIR`

## Problem

Pocket Kubrick (and Remotion underneath it) routinely leak large temporary directories into the user's OS temp folder. A single day of failed builds (caused by an out-of-disk crash on May 5–7) left **~15 GB** of orphaned files behind:

| Pattern | Count observed | Size | Source |
|---|---|---|---|
| `react-motion-render*` | 11 | 12 GB | Remotion `renderMedia()` per-frame PNGs |
| `remotion-webpack-bundle-*` | 95 | 2.9 GB | Remotion `bundle()` output |
| `pk-audio-*` | 430 | 325 MB | Our `concatenateAudio()` scratch dir |
| `remotion-v4*-assets*` | 12 | 20 MB | Remotion asset staging |
| `puppeteer_dev_chrome_profile-*` | 5 | 9.7 MB | Headless Chrome profile (Remotion) |
| `pk-combine-*` | 0 | — | Our `runCombine()` scratch dir (cleanup works) |

macOS only purges `$TMPDIR` entries on idle reboot after ~3 days, so leakage compounds quickly. The script must not be capable of silently filling someone's hard drive.

## Root causes

1.  **`audio-concat.ts:136-143` — `cleanupDir()` is broken in ESM.** The function calls `require("node:fs")` to obtain `rmSync`, but the package is `"type": "module"` (per `package.json:5`) and our project conventions forbid `require()`. `require` is undefined at runtime, the call throws `ReferenceError`, the bare `catch {}` swallows it, and the directory is never deleted. **Every** audio-concat run leaks one `pk-audio-*` directory. Some are empty (the run completed past the file writes but cleanup silently failed); some are populated (the run crashed before the `finally`).

2.  **`render.ts:126-129` — `bundle()` output is never deleted.** `@remotion/bundler`'s `bundle()` returns the path of a freshly-created webpack output dir (~30 MB) and the caller owns its lifecycle. `runRender()` has no `finally`, no `rmSync` on `bundleLocation`. Every render leaks one `remotion-webpack-bundle-*`.

3.  **Remotion's internal scratch dirs leak on crash.** `renderMedia()` creates `react-motion-render*` (per-frame PNGs, can be many GB) and `puppeteer_dev_chrome_profile-*` via direct `mkdtempSync(os.tmpdir(), ...)` calls (see `node_modules/@remotion/renderer/dist/render-media.js` and `open-browser.js`). These are normally cleaned by Remotion on success, but when `renderMedia()` is killed mid-render (ENOSPC, SIGINT, SIGKILL) the dirs orphan. We have no safety net catching this.

## Remotion API findings (verified against `@remotion/{bundler,renderer}@4.0.429`)

-   **`bundle()` accepts an `outDir: string | null` option** (`@remotion/bundler/dist/bundle.d.ts:6,47`). Passing a path makes Remotion write the bundle there instead of `mkdtemp`-ing a fresh `remotion-webpack-bundle-*`. **This is redirectable.**
-   **`bundle()` also exposes `onDirectoryCreated(dir)` callback** for cases where you don't pass `outDir` and want to know what path was used.
-   **`renderMedia()` does NOT expose any `outDir` / `tmpDir` / `frameDir` option** (full options surface checked in `render-media.d.ts`). The frame-cache and chrome-profile paths are hard-coded to `os.tmpdir()` with no env var override (no `REMOTION_TMP*` exists in the dist tree). **These are NOT redirectable** through the public API.
-   No public `cancelSignal`-driven hook lets us reliably get the path either; we have to discover it.

## Goals

1.  Zero leaked temp directories under normal completion.
2.  Zero leaked temp directories under expected failure modes (thrown exception, non-zero exit, SIGINT).
3.  Best-effort cleanup of Remotion's non-redirectable scratch dirs.
4.  No regression in correctness or performance.
5.  No surgical patches into `node_modules/@remotion/*`.

## Non-goals

-   Cleaning up directories created by *prior* (already-crashed) runs. That is a separate idea — see "Future work" below — and would belong in a `pocket-kubrick clean` subcommand that can be invoked deliberately.
-   Concurrency-safe execution of multiple `pocket-kubrick render` processes from the same shell. (We don't currently support it; sweep step would need refinement if we ever do.)
-   Replacing Remotion's tempfile strategy.

## Design

Three coordinated changes, each with a clear scope:

### A. One run-dir per command invocation

Each top-level command that creates temp files (`render`, `synthesize`, `combine`) opens a single parent directory at the start and removes it in a top-level `finally`. All scratch work goes underneath:

```
$TMPDIR/pk-run-{command}-{uuid}/
    bundle/      # Remotion bundle (passed as outDir)
    audio/       # pk-audio scratch (replaces pk-audio-{uuid})
    combine/     # pk-combine scratch (replaces pk-combine-{uuid})
```

A new helper module `src/util/run-dir.ts` exposes:

```ts
export interface RunDir {
    root: string;                       // absolute path of pk-run-*
    child(name: string): string;        // mkdir + return absolute path of subdir
    cleanup(): void;                    // rmSync(root, { recursive: true, force: true })
}
export function createRunDir(commandName: string): RunDir;
```

The signature deliberately mirrors what we already do inline so adoption is one-import-and-three-line per command.

### B. Redirect Remotion's bundle into the run-dir

In `render.ts:126`:

```ts
bundleLocation = await bundle({
    entryPoint,
    publicDir: projectRoot,
    outDir: runDir.child("bundle"),   // <-- new
});
```

When `runDir.cleanup()` fires in `finally`, the bundle is removed transitively. No separate per-bundle cleanup needed. The 30 MB-per-render leak goes away.

### C. Snapshot-and-sweep Remotion's non-redirectable scratch dirs

For `react-motion-render*`, `puppeteer_dev_chrome_profile-*`, and `remotion-v4*-assets*` (which we cannot redirect), `runRender()` does:

1.  Immediately before `renderMedia()`, snapshot existing `$TMPDIR` entries matching those three patterns into a `Set<string>`.
2.  In `finally`, list the same patterns again and `rmSync` any path **not** in the snapshot. Wrap each `rmSync` in its own try/catch — best effort.

This is small, dumb, and dependable. It correctly handles:

-   `renderMedia()` succeeded and Remotion already cleaned the dirs → snapshot diff is empty, sweep is a no-op.
-   `renderMedia()` threw → orphan exists, we delete it.
-   `renderMedia()` was SIGKILL'd → process is dead, no `finally` runs (covered separately, see SIGINT below).

Concurrency caveat: if another Pocket Kubrick render starts *between* the snapshot and the sweep on the same machine, we could delete its in-flight dir. Today we don't run concurrent renders. The plan files this under "future work" to revisit if/when we do.

### D. Fix the broken `cleanupDir()` in `audio-concat.ts`

Independent of the run-dir change, fix the immediate bug:

-   Add `rmSync` to the top-level `import { ... } from "node:fs"` statement.
-   Replace the `require`-based `cleanupDir()` with a direct call.

After the run-dir refactor lands, `audio-concat.ts` will receive its scratch path from the caller (so the function no longer creates `pk-audio-*` itself). The `cleanupDir()` helper goes away entirely. But fixing the bug first is a one-line change that cuts losses immediately, even before the larger refactor.

### E. SIGINT/SIGTERM handler

Node doesn't run `finally` blocks when the process is killed by signal. Add a one-time signal handler at the top of each command:

```ts
const cleanupHandler = () => { runDir.cleanup(); process.exit(130); };
process.once("SIGINT", cleanupHandler);
process.once("SIGTERM", cleanupHandler);
```

This catches the common Ctrl-C case. SIGKILL is unkillable by definition, and crash-on-OOM falls in the same bucket; those are addressed by the "future work" startup-prune.

## File-by-file changes

| File | Change |
|---|---|
| `src/util/run-dir.ts` | **New.** `createRunDir(name)` helper plus the `RunDir` interface described above. |
| `src/util/remotion-temp-sweep.ts` | **New.** `snapshotRemotionTemp(): Set<string>` and `sweepRemotionTemp(snapshot: Set<string>): void`. Patterns hard-coded to `react-motion-render`, `puppeteer_dev_chrome_profile-`, `remotion-v4`. Best-effort, swallows errors with logging via `verbose()`. |
| `src/synthesizer/audio-concat.ts` | (1) Add `rmSync` to top-level fs import. (2) Change `concatenateAudio()` and `concatenateSceneFiles()` to accept an optional `tempDir: string` parameter. When provided, the caller owns cleanup; when omitted, behave as today (still creating `pk-audio-{uuid}` and cleaning it via the now-fixed `rmSync`). (3) Remove the broken `cleanupDir()` helper entirely. |
| `src/commands/synthesize.ts` | Open a run-dir at the top of `runSynthesis()`. Pass `runDir.child("audio")` to `concatenateAudio()` and `concatenateSceneFiles()`. `finally { runDir.cleanup() }`. Install signal handler. |
| `src/commands/combine.ts` | Replace inline `pk-combine-*` mkdir with `runDir.child("combine")`. `finally { runDir.cleanup() }`. Install signal handler. |
| `src/commands/render.ts` | Open a run-dir at top of `runRender()`. Pass `runDir.child("bundle")` to `bundle()` as `outDir`. Snapshot Remotion temp dirs before `renderMedia()`. In `finally`: sweep new ones, then `runDir.cleanup()`. Install signal handler. |
| `src/commands/build.ts` | No change. Each chained command manages its own run-dir; nesting is fine because each child command handles its own scratch space. |
| `tests/util/run-dir.test.ts` | **New.** Unit tests: dir is created, `child()` is idempotent, `cleanup()` removes recursively, `cleanup()` on already-deleted dir is a no-op. |
| `tests/util/remotion-temp-sweep.test.ts` | **New.** Unit tests: snapshot captures preexisting dirs, sweep removes only dirs not in snapshot, sweep tolerates missing entries. |

## Testing strategy

1.  **Unit tests** for `run-dir.ts` and `remotion-temp-sweep.ts` (above).
2.  **Integration smoke test** — run `pocket-kubrick build` against `projects/samplevid` end-to-end. Before and after, snapshot `$TMPDIR`. Assert the diff is empty for all six patterns.
3.  **Crash-path test** — manually inject a `throw new Error("boom")` into the middle of `runRender()` (between `bundle()` and `renderMedia()`), run, confirm the run-dir was removed and `remotion-webpack-bundle-*` count is unchanged.
4.  **SIGINT test** — start a long render, Ctrl-C it, confirm cleanup ran (run-dir gone, no new `react-motion-render*`).
5.  **`audio-concat.ts` regression** — existing audio synthesis tests must continue to pass. Manually inspect that no `pk-audio-*` remains in `$TMPDIR` after the test suite.

## Rollout

Single PR. No flag, no migration, no DB. Backwards-compatible: the optional `tempDir` parameter on `concatenateAudio` defaults to today's behavior so any direct caller (none currently in the repo, but defensive) still works.

## Future work (out of scope for this PR)

1.  **Startup-time stale prune.** On any command start, find `pk-run-*` directories in `$TMPDIR` older than N hours with no live process holding them, and remove them. Same for the Remotion patterns. This handles SIGKILL / OOM / power loss — anything where our `finally` and signal handlers can't run. Would benefit from a `pocket-kubrick clean` subcommand for manual invocation as well.
2.  **Concurrency-safe sweep.** If we ever support running multiple renders simultaneously, replace the snapshot-and-sweep with a per-render mtime cutoff or an explicit handle map.
3.  **Upstream Remotion proposal.** File an issue requesting a `tmpDir` / `frameDir` option on `renderMedia()`, mirroring the existing `outDir` on `bundle()`. If accepted, we drop the snapshot-and-sweep entirely.
4.  **Disk-space preflight.** `runRender()` could `statvfs` `$TMPDIR` before `renderMedia()` and refuse to start if free space is below a threshold proportional to expected output (frames × resolution × image format). This addresses the original failure mode that motivated this whole plan.
