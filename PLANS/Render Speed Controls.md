# Plan — Render speed controls on the CLI

## Problem

`pocket-kubrick render` (and `build`) currently ships one quality preset axis (`--quality draft|standard|high`). It conflates "visual fidelity" with "wall time": `draft` is fast *because* it's low-fidelity (half resolution, 24fps, JPEG q=80); `standard`/`high` are slow *because* they use full-fidelity defaults (PNG q=100, full resolution).

There is no way today to ask for "high fidelity but fast." A 3-minute 1080p video of static screenshots takes ~20 minutes to render at the `standard` preset, even though several of the slow knobs (PNG over JPEG, half-CPU concurrency, software GL) have no visible effect on screencast output.

## Why "fast/slow" needs more than one bit

The render perf knobs live on different axes. Flagging just `--turbo` as a boolean conflates them:

| Knob | Today's default | Speed-only? | Risk if changed | Likely speedup |
|---|---|---|---|---|
| `imageFormat` (PNG vs JPEG) | PNG (in `standard`/`high`) | Mostly | JPEG ≥ q90 imperceptible for screenshots | ~3× |
| `concurrency` | half CPU cores | **Pure speed** | None | ~2× |
| `chromiumOptions.gl` | software (`swiftshader`) | **Pure speed** | Rare rasterization differences with `angle` | 1.5–2× |
| `x264Preset` | `medium` (libx264 default) | **Pure speed** | Larger output file | ~1.1–1.3× |
| `jpegQuality` | 100 (when JPEG selected) | Speed/quality | Below ~90 starts being visible | small |
| `scaleFactor` | 1.0 | **Pure quality** | Lower = blurrier output | (already in `--quality`) |
| `fps` | timeline fps | **Pure quality** | Visible motion judder | (already in `--quality`) |

Most of those are pure-speed (no visible impact). A small subset (`imageFormat`, `jpegQuality`) is speed-with-tiny-quality-impact for screencast content. The two genuinely visual-fidelity knobs (`scaleFactor`, `fps`) already live in the quality preset and shouldn't move.

This separation is what makes a single `--turbo` boolean awkward: the user is implicitly being asked to accept three or four trade-offs at once with no granularity, and the orthogonality with `--quality` gets muddled.

## Design options

### Option 1 — A second preset flag: `--speed`, orthogonal to `--quality`

Add `--speed careful|fast|turbo`, parallel to the existing `--quality draft|standard|high`. Each `--speed` value bundles `imageFormat`, `concurrency`, `gl`, and `x264Preset`. `--quality` continues to control `scaleFactor`, `fps`, and `crf`. The two compose freely.

```
--speed careful   PNG, half cores, software GL, x264 medium     (today's behavior)
--speed fast      JPEG q=92, all cores, software GL, x264 fast
--speed turbo     JPEG q=88, all cores, hardware GL (angle), x264 fast
```

**Pros:**
- Clean orthogonality maps directly to what the knobs actually do.
- Mirrors the existing `--quality` mental model — easy to teach, easy to compose ("`--quality high --speed turbo`" reads naturally).
- Three preset values cover the full spectrum without a flag explosion.
- Future-proof: adding a knob means picking which speed bucket it belongs in, not adding a CLI flag.

**Cons:**
- Two preset flags instead of one. Users have to learn that quality and speed are separable.
- Power users can't override an individual knob without us adding follow-on flags.
- Naming bikeshed: `careful` / `safe` / `compat` / `default` for the slowest setting are all defensible.

### Option 2 — Boolean `--turbo` (single switch)

Add a single `--turbo` flag. When passed, flip JPEG, all cores, hardware GL, x264 fast. Otherwise keep today's behavior.

**Pros:**
- Minimal CLI surface. One flag, on or off.
- Discoverable: `--help` shows it next to `--quality` and the meaning is obvious.

**Cons:**
- Binary collapses three independent trade-offs (format, concurrency, GL). User can't say "all cores but stay on software GL."
- No path to layering: if a "warp" mode is added later (skip frames, lower JPEG further), we either rename `--turbo` or stack flags.
- Doesn't compose with `--quality` cleanly: `--quality high --turbo` works but feels inconsistent (one is a preset name, one is a flag).

### Option 3 — Many granular flags

Expose each knob: `--image-format`, `--jpeg-quality`, `--concurrency`, `--gl`, `--x264-preset`. No bundled preset.

**Pros:**
- Maximum control. Every knob exposed individually.
- Trivially scriptable; CI pipelines can pin every value.

**Cons:**
- Five new flags for a CLI that has thirteen commands. Cognitive load grows quickly.
- No "just make it fast" affordance — the user has to learn what each flag does and which combinations are sensible.
- Easy to misconfigure: setting `--gl=angle` without bumping `--concurrency` leaves most of the win on the table.

### Option 4 — Profile file with named entries

Add `~/.config/pocket-kubrick/profiles.yaml` (or `<projectRoot>/.pocket-kubrick/profiles.yaml`) defining named perf profiles, picked via `--profile=my-laptop-fast`. Ship a few defaults out of the box.

```yaml
profiles:
    careful:    { imageFormat: png,  concurrency: half, gl: swiftshader, x264Preset: medium }
    fast:       { imageFormat: jpeg, jpegQuality: 92, concurrency: all,  gl: swiftshader, x264Preset: fast }
    turbo:      { imageFormat: jpeg, jpegQuality: 88, concurrency: all,  gl: angle,        x264Preset: fast }
    my-mbp-m4:  { imageFormat: jpeg, jpegQuality: 92, concurrency: 10,   gl: angle,        x264Preset: fast }
```

**Pros:**
- Infinitely extensible. New knobs go in the schema, never in the CLI.
- User-customizable profile names ("my-mbp-m4") express intent.
- Same machinery would work for the existing quality preset, unifying both axes under one config concept.

**Cons:**
- Heavyweight for ~4 knobs. We're not at the size where file-based config pays off.
- Adds: schema, validator, loader, error messages, docs, default-installation logic, lookup-order semantics (project file vs. user file vs. built-in).
- Discoverability suffers — `--help` can't list the user's named profiles.
- Easy to end up with stale profiles that drift from current best-practice defaults.

### Option 5 — Replace `--quality` with a single combined `--mode` flag

Collapse quality + speed into one preset axis: `--mode draft | preview | publish | publish-fast` (or similar). Each mode picks all seven knobs.

**Pros:**
- One flag. Simplest possible UX.
- Captures the realistic combinations users want: "preview while editing", "final publish".

**Cons:**
- Combinatorial explosion: 3 quality × 3 speed = 9 modes if we want to be complete. Naming nine things distinguishably is harder than naming three + three.
- Loss of orthogonality: "high quality but fast" requires a new mode rather than composing two flags.
- Breaking change to existing `--quality` flag.

## Recommendation

**Option 1 — second preset flag `--speed careful|fast|turbo`, orthogonal to `--quality`.** It matches the actual structure of the knobs (two independent axes), it mirrors the existing CLI pattern (so muscle memory transfers), and it cleanly defers Options 3 and 4 to "if power users ask, layer them on top later."

If we later want individual overrides we can add a small number of escape-hatch flags (Option 3-style) without breaking the preset model: `--concurrency`, `--gl` are the obvious candidates. Profile files (Option 4) become useful only if the knob count grows past ~6 — at which point we add them on top of the preset (`--profile=name` would just resolve to a `(quality, speed)` pair plus overrides).

## Spec for the recommended option

### CLI shape

`render` and `build` both accept a new optional flag:

```
--speed <careful|fast|turbo>   Performance preset (default: TBD, see open question below)
```

Existing `--quality` is unchanged.

### Preset definitions

```ts
interface SpeedPreset {
    imageFormat: "png" | "jpeg";
    jpegQuality: number;        // ignored if imageFormat=png
    concurrency: number | string | null;   // null = Remotion default; "100%" = all cores
    gl: "swiftshader" | "angle" | "swangle" | null;  // null = Remotion default
    x264Preset: "ultrafast" | "veryfast" | "fast" | "medium" | "slow" | null;
}

const SPEED_PRESETS: Record<string, SpeedPreset> = {
    careful: { imageFormat: "png",  jpegQuality: 100, concurrency: null,  gl: null,    x264Preset: null },
    fast:    { imageFormat: "jpeg", jpegQuality: 92,  concurrency: "100%", gl: null,    x264Preset: "fast" },
    turbo:   { imageFormat: "jpeg", jpegQuality: 88,  concurrency: "100%", gl: "angle", x264Preset: "fast" },
};
```

### Interaction with `--quality`

`--quality` continues to control `scaleFactor`, `fps`, and `crf`. `--speed` controls everything else listed in the table. If the same field appeared in both (today: `imageFormat` and `jpegQuality` are in the quality preset), the speed preset wins and the field is removed from the quality preset definition. The quality preset shrinks to:

```ts
draft:    { crf: 28, scaleFactor: 0.5, fps: 24 }
standard: { crf: 23, scaleFactor: 1.0, fps: null }
high:     { crf: 18, scaleFactor: 1.0, fps: null }
```

### Wiring into `renderMedia()`

In `src/commands/render.ts:192-204`, the `renderMedia()` call gains four new fields drawn from the speed preset:

```ts
await renderMedia({
    /* existing fields ... */
    imageFormat: speed.imageFormat,
    jpegQuality: speed.imageFormat === "jpeg" ? speed.jpegQuality : undefined,
    concurrency: speed.concurrency,
    chromiumOptions: speed.gl ? { gl: speed.gl } : undefined,
    x264Preset: speed.x264Preset ?? undefined,
});
```

### Build chaining

`src/commands/build.ts` already takes `--quality` and forwards it. Add a parallel `--speed` parameter on `BuildOptions` and forward it to `runRender`. No other stage of the pipeline cares about it.

### Help text

`--quality` and `--speed` get adjacent help blocks so the orthogonality is obvious from `--help`:

```
--quality <draft|standard|high>     Visual fidelity (resolution, fps, encoder CRF).
--speed   <careful|fast|turbo>      Compute strategy (image format, cores, GL, encoder preset).
```

## Open questions

1. **What is the default `--speed` value?** Two reasonable answers:
    - `careful` — preserve today's behavior exactly. Users opt into speed.
    - `fast` — improve perf for everyone immediately. The visual difference (JPEG q=92 vs PNG q=100 on a screencast) is essentially nil; the worst plausible regression is a CI machine where JPEG decoding behaves slightly differently in some downstream tool.
   
   I lean `fast` as the new default — the change is invisible for the project's stated content type, and the speedup is large. But it is a behavior change and worth flagging on a release note. Worst-case fallback: ship as `careful` initially and switch the default in a follow-up after we have data.

2. **Naming.** `careful` is precise but unfamiliar; `safe` / `compat` / `default` are alternatives. I prefer `careful` because `safe` falsely implies the others are unsafe and `default` is meaningless once we change defaults. `slow` is honest but reads pejoratively in `--help`. Open to bikeshed.

3. **Should `--turbo` be a recognized shortcut for `--speed=turbo`?** Cheap to add, mildly redundant. I'd skip it for now to keep one canonical spelling.

4. **Auto-detect `gl: angle` viability per platform.** `angle` is broadly supported on macOS Apple Silicon. On Linux / older Intel Macs results vary. We could probe at startup and warn if the chosen GL backend isn't likely to work. Probably overengineering for v1; document the caveat in `--help` instead.

## Out of scope / future work

1. **Profile file (Option 4 above)** — defer until the knob count grows or users start asking. The two-preset model already covers the realistic combinations.
2. **Individual override flags** — `--concurrency`, `--gl`, `--image-format`, `--jpeg-quality`, `--x264-preset` as escape hatches on top of the preset. Add only as users request them. Mechanics: each override, if set, replaces the corresponding preset field.
3. **Render-time speed reporting** — print the chosen preset values at the start of render, and the achieved frames-per-second at the end. Helps users diagnose "why is this slow on my machine."
4. **GPU detection / preflight** — small startup probe that confirms the requested `gl` backend actually loaded, with a graceful fallback.
5. **`build` macros** — once both flags are stable, consider top-level `--draft` (≡ `--quality=draft --speed=fast`) and `--publish` (≡ `--quality=high --speed=careful`) one-flag conveniences. Pure sugar.

## Implementation footprint (estimate)

Single PR. Changes:

| File | Change |
|---|---|
| `src/commands/render.ts` | Add `SPEED_PRESETS`, accept `options.speed`, plumb four fields into `renderMedia()`. Strip `imageFormat`/`jpegQuality` from `QUALITY_PRESETS`. |
| `src/commands/build.ts` | Add `speed` to `BuildOptions`, forward to `runRender`. |
| `src/index.ts` (or wherever Commander wiring lives) | Register `--speed` on `render` and `build` subcommands with help text. |
| `tests/commands/render.test.ts` | Cases: each preset combination produces the expected `renderMedia` arg shape; unknown value rejected with helpful error. |
| `DOCS/` | One-paragraph note describing the two-axis model. |

No data migration. No breaking change unless we move the default to `fast` (open question 1).
