# Support Video CLI Cheat Sheet

All commands run from the repo root (`support-producer/`).

The `--project` flag accepts a full path or just the directory name. The CLI tries the base directory (`projects/` by default) as a fallback. Set `PROJECT_ROOT` in `.env` to override the base directory:

```bash
npx tsx src/index.ts <command> --project your-video-title

# With PROJECT_ROOT=../my-videos in .env, resolves to ../my-videos/your-video-title
```


## Commands

### init

Scaffold a new project.

```bash
npx tsx src/index.ts init "Your Video Title"
```

### validate

Check YAML config, scripts, assets, voices, and anchors.

```bash
npx tsx src/index.ts validate --project <name> [--verbose]
```

### convert

Parse Markdown scripts into TTS segment JSON files.

```bash
npx tsx src/index.ts convert --project <name> [--verbose]
```

### synthesize

Call Inworld TTS for each segment, concatenate audio, match anchors.

```bash
npx tsx src/index.ts synthesize --project <name> [--verbose] [--no-cache]
```

### resolve

Build `generated/timeline.json` from config + audio manifest + timepoints.

```bash
npx tsx src/index.ts resolve --project <name> [--verbose]
```

### render

Render video from `timeline.json` using Remotion.

```bash
npx tsx src/index.ts render --project <name> [--quality draft|standard|high] [--verbose]
```

Output goes to `output/` with timestamped filenames:
`{slug}_{YYYY-MM-DD}_{HHmmss}.{ext}`

### preview

Launch Remotion Studio for interactive browser-based preview.

```bash
npx tsx src/index.ts preview --project <name> [--port 3000] [--verbose]
```

Requires `resolve` to have been run first (needs `timeline.json`).

### keyframes

Generate a progressive flipbook of keyframe PNGs for each scene, showing how annotations build up one-by-one (or in groups sharing the same `at` anchor). Useful for verifying individual annotation positions without rendering the full video.

```bash
npx tsx src/index.ts keyframes --project <name> [--verbose]
```

Output goes to `{projectRoot}/output/keyframes/` with filenames like `scene-01_state-00.png`, `scene-01_state-01.png`, etc. The folder is cleared and regenerated on each run.

For each scene, states are built cumulatively:
- **State 0**: Base screenshot + any stampable annotations with no `at` field
- **State 1**: State 0 + annotations from the first distinct `at` value
- **State 2**: State 1 + annotations from the second distinct `at` value
- ...(and so on)

`children:` arrays on screenshot visuals are supported -- child annotations are rendered with coordinates offset by the parent screenshot's position. Inset screenshots include background dimming and border overlays in the keyframe output.

Supported annotation types: `arrow`, `highlight`, `circle`, `badge`, `cursor`, `text`, `stack`.

### combine

Concatenate two or more rendered videos into a single file. All source videos must share the same dimensions, FPS, and codec (no re-encoding — uses FFmpeg stream copy).

```bash
npx tsx src/index.ts combine <video1> <video2> [video3 ...] [--output-dir <path>] [--filename <name>] [--verbose]
```

| Option | Default | Notes |
|---|---|---|
| `--output-dir` | current directory | Where the combined file is written |
| `--filename` | `combined-video-{timestamp}` | Output filename without extension |
| `--verbose` | off | Show detailed logging |

Example — stitch three section videos together:

```bash
npx tsx src/index.ts combine output/section1.mp4 output/section2.mp4 output/section3.mp4 \
    --output-dir output --filename full-course
```


### transcript

Generate a speaker-attributed Markdown transcript from converted segments.

```bash
npx tsx src/index.ts transcript --project <name> [--verbose]
```

Outputs both `output/{slug}_transcript.md` and `output/{slug}_transcript.html` (named after the video title slug, like rendered videos). Each scene is wrapped in a `<div class="video-scene scene-{odd/even} scene-{n}">` with a `scene-marker` and `scene-body` div. Speaker tags use the voice key name (capitalized), not the underlying voice_id. The Markdown keeps `*emphasis*` markers for rendering; the HTML converts them to `<em>` tags and wraps content in proper `<p>` and actor `<div>` elements.


## build (Full Pipeline)

Runs all 6 stages in sequence: **validate -> convert -> synthesize -> resolve -> render -> transcript**.

```bash
npx tsx src/index.ts build --project <name> [--verbose] [--no-cache] [--quality draft|standard|high]
```

### Selective stages with --from / --through

Skip earlier stages or stop early. Validate always runs regardless.

```bash
npx tsx src/index.ts build --project <name> --from <stage> --through <stage>
```

Valid stage names: `validate`, `convert`, `synthesize`, `resolve`, `render`, `transcript`.

| Scenario | Command |
|---|---|
| Full pipeline (default) | `build --project foo` |
| Changed visuals only, reuse audio | `build --project foo --from resolve` |
| Audio iteration only | `build --project foo --through synthesize` |
| Just re-render | `build --project foo --from render` |
| Just re-resolve | `build --project foo --from resolve --through resolve` |
| Re-generate transcript only | `build --project foo --from transcript` |
| Full build without transcript | `build --project foo --through render` |


## Video-Level Settings

These go under the `video:` key in `video-config.yaml`.

| Field       | Default        | Notes                                             |
|-------------|----------------|---------------------------------------------------|
| `title`     | (required)     | Human-readable title                              |
| `resolution`| `"1920x1080"`  | `WIDTHxHEIGHT`                                   |
| `fps`       | `30`           | 24, 25, 30, or 60                                 |
| `format`    | `["mp4"]`      | `mp4`, `webm`, `mov`, `gif` (array)              |
| `quality`   | `"standard"`   | `draft`, `standard`, `high`                       |
| `hold_last` | `1.0`          | Seconds to hold on the final frame after audio ends. `0` to disable. |
| `theme`     | (defaults)     | `background`, `accent`, `font`, `font_size`, `padding` |

The video always holds the last visual state at the end rather than fading to black. `hold_last` controls how long that hold lasts.


## Quality Presets

| Preset | CRF | Resolution | FPS | Frames |
|---|---|---|---|---|
| `draft` | 28 | 50% | 24 | JPEG 80% |
| `standard` | 23 | 100% | 30 | PNG (lossless) |
| `high` | 18 | 100% | 30/60 | PNG (lossless) |


## Output Formats

Configured in `video-config.yaml` under `video.format` (array). The first format is rendered natively; additional formats are transcoded via FFmpeg.

| Format | Codec |
|---|---|
| `mp4` | H.264 |
| `webm` | VP8 + Opus |
| `mov` | ProRes |
| `gif` | GIF |


## Visual Types

| Type          | Purpose                                       |
|---------------|-----------------------------------------------|
| `screenshot`  | Product screenshot as scene background or inset overlay (with border, clipping, dimming). Supports `children:` array for nested annotations. |
| `text`        | Text overlay at a fixed position               |
| `stack`       | Vertical text list with automatic spacing      |
| `circle`      | Circle annotation around a target point        |
| `arrow`       | Arrow from one point to another                |
| `highlight`   | Highlighted rectangular region                 |
| `cursor`      | Animated cursor with optional click            |
| `zoom`        | Magnified view of a region                     |
| `badge`       | Numbered/icon badge                            |

The `stack` type is useful for bullet lists -- it uses CSS flexbox so the browser handles text height automatically. Each item can have its own `at` anchor for staggered reveal. See the [Production Guide](production-guide.md) for full field reference.


## Project Structure

```
projects/your-video-title/
    video-config.yaml              # Configuration
    inbox/
        scripts/*.md            # Narration scripts (human-authored)
        assets/
            screenshots/        # Product screenshots
            icons/              # Icon overlays
            overlays/           # Other overlays
    generated/                  # Machine-generated (do not edit)
        segments/*.json         # Parsed TTS segments
        audio/
            *.mp3               # Per-scene audio
            *.timepoints.json   # Anchor timestamps
            full.mp3            # Concatenated audio
            manifest.json       # Build summary
        timeline.json           # Frame-accurate visual timeline
    output/                     # Final deliverables
        *.mp4                   # Rendered video files
        {slug}_transcript.md    # Speaker-attributed transcript (Markdown)
        {slug}_transcript.html  # Speaker-attributed transcript (HTML)
    .pocket-kubrick/
        cache/                  # TTS response cache
```
