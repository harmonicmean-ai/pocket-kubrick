# Video Production Guide

This is the authoritative reference for creating support videos with the `pocket-kubrick` pipeline. It covers what a human needs to prepare, how to hand it off for generation, and what comes out the other side.

As the pipeline grows through later phases (timeline resolution, video rendering), this document will be updated to match.


## Prerequisites

### System

- **Node.js 20+** -- the pipeline uses built-in `fetch()` and other Node 20 features.
- **FFmpeg** -- must be on your PATH. Used to concatenate audio segments into scene and full-project MP3s.

### API Key

The pipeline calls the **Inworld TTS API** to synthesize narration audio. You need a valid API key set in a `.env` file in the working directory (the CLI auto-loads it via `dotenv`):

```
INWORLD_APY_KEY=your-key-here
```

If the variable is not set, the build will fail with a clear error message.


## Creating a New Project

From the repo root (`support-producer/`):

```bash
npx tsx src/index.ts init "Your Video Title Here"
```

By default, projects are created under `projects/` (which is gitignored). You can override this by setting `PROJECT_ROOT` in your `.env` file:

```bash
# .env
PROJECT_ROOT=../my-videos
```

With the above, `init` would create `../my-videos/your-video-title-here/` instead. You can also pass a fully-qualified path to `--project` at any time (e.g., `--project /Users/me/videos/my-video`) to bypass the base directory entirely.

This creates:

```
projects/your-video-title-here/
    video-config.yaml                  <-- main configuration
    inbox/
        scripts/
            01-intro.md             <-- starter script
        assets/
            screenshots/
            icons/
            overlays/
    generated/
        segments/
        audio/
    .pocket-kubrick/
        cache/
        history/
```

The title is slugified to produce the directory name (lowercase, spaces become hyphens, special characters stripped).


## What the Human Provides

Everything the human creates goes into `inbox/`. Nothing in `generated/` should be edited by hand -- the pipeline overwrites it on every run.

### Scripts (`inbox/scripts/*.md`)

Each scene gets its own Markdown file. Name them with a numeric prefix to keep ordering clear: `01-intro.md`, `02-settings-icon.md`, etc.

Scripts are **narration text**, not documentation. Write them the way you want the voice to speak. The pipeline sends each sentence to the TTS API, so plain conversational prose works best.

#### What counts as plain text

- Regular paragraphs become narration.
- Paragraph breaks insert a 700ms pause.
- Line breaks (two trailing spaces or `\`) insert a 400ms pause.
- Thematic breaks (`---`) insert a 1000ms pause.
- `*emphasis*` is preserved and passed to the TTS engine (it affects prosody).
- `**strong**` is downgraded to `*emphasis*` (Inworld doesn't support strong).
- Inline code (`` `ABC` ``) is spelled out letter by letter ("A B C").
- Code blocks (triple backtick) are skipped entirely (the validator warns you if it finds any).

#### Bracket directives

These are inline instructions to the TTS engine, written inside square brackets.

**`[pause DURATION]`** -- insert silence.
```markdown
Welcome to Shrex. [pause 1.5s] Let's get started.
```
Duration accepts seconds (`2s`, `1.5s`), milliseconds (`500ms`), or bare numbers (treated as seconds).

**`[voice NAME]...[/voice]`** -- switch to a different voice for the enclosed text. The name must match a key defined in the `voices` section of `video-config.yaml`.
```markdown
And that's the main setting.
[voice aside]Tip: you can change this later from the same panel.[/voice]
```

**`[rate VALUE]...[/rate]`** -- change speaking rate for the enclosed text.
```markdown
[rate slow]Pay close attention to this next step.[/rate]
```
Named values: `x-slow` (0.5), `slow` (0.75), `medium` (1.0), `fast` (1.25), `x-fast` (1.5). Or use a numeric value directly (0.5--1.5).

**`[say-as characters]...[/say-as]`** -- spell out character by character.
```markdown
Navigate to the [say-as characters]URL[/say-as] bar.
```
Also accepts `spell-out` as a synonym for `characters`.

**`[sub ALIAS]...[/sub]`** -- pronunciation override.
```markdown
Click on [sub /ˈwɪdʒɪt/]widget[/sub] to continue.
```
If the alias starts and ends with `/`, it's treated as IPA. Otherwise it's wrapped in IPA delimiters for the Inworld engine.

**`[pitch VALUE]...[/pitch]`** -- deprecated, has no effect with Inworld. Content is preserved but the validator will warn you to remove it.

#### Anchor phrases

Anchor phrases connect visual events to exact moments in the narration. In `video-config.yaml`, a visual's `at:` field contains a phrase that must appear verbatim in the script:

```yaml
# In video-config.yaml:
visuals:
  - type: circle
    at: "settings icon"
```

```markdown
# In the script:
First, tap the *settings icon* in the top right corner.
```

Matching is case-insensitive and ignores punctuation. Hyphens are normalized to spaces. If a phrase appears more than once in a script, the first occurrence is used (and the validator warns about it).


### Assets (`inbox/assets/`)

Drop image files into the appropriate subdirectory:

| Subdirectory     | Purpose                                       |
|------------------|-----------------------------------------------|
| `screenshots/`   | Product screenshots used as scene backgrounds |
| `icons/`         | Icon overlays                                 |
| `overlays/`      | Other graphical overlays                      |

Supported formats: `.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`. The validator warns on anything else.

#### Asset resolution

Visual events reference assets via a `src:` field. The resolver accepts three forms:

```yaml
# 1. Bare filename -- searches inbox/assets/ then each subdirectory
src: "main-screen.png"

# 2. Subdirectory-relative -- looks in inbox/assets/<subdir>/<file>
src: screenshots/main-screen.png

# 3. Full path (starts with inbox/) -- used as-is, no searching
src: inbox/assets/screenshots/main-screen.png
```

Bare filenames are convenient but ambiguous if the same name exists in multiple subdirectories -- the first match wins (searched in directory-listing order). Subdirectory-relative paths are unambiguous and recommended for clarity.


## Configuring the Project (`video-config.yaml`)

This is the central configuration file. It lives at the project root (e.g., `projects/your-video-title/video-config.yaml`).

### `video` section

| Field        | Type      | Default        | Notes                                       |
|--------------|-----------|----------------|---------------------------------------------|
| `title`      | string    | (required)     | Human-readable title                        |
| `resolution` | string    | `"1920x1080"`  | Format: `WIDTHxHEIGHT`                      |
| `fps`        | number    | `30`           | Must be 24, 25, 30, or 60                   |
| `format`     | string[]  | `["mp4"]`      | One or more of: `mp4`, `webm`, `mov`, `gif` |
| `quality`    | string    | `"standard"`   | `draft`, `standard`, or `high`              |
| `theme`      | object    | (see below)    | Colors, fonts, spacing                      |
| `hold_last`  | number    | `1.0`          | Seconds to hold on the final frame after audio ends. Set to `0` to end immediately. |

**Theme defaults:**

| Field       | Default        |
|-------------|----------------|
| `background` | `"#121212"` |
| `accent`     | `"#07C107"` |
| `font`       | `"Open Sans"` |
| `font_size`  | `48`          |
| `padding`    | `40`          |

Theme values can be referenced in visual events as `$background`, `$accent`, `$font`. Color refs support an opacity suffix (e.g., `$accent20` for 20% opacity).

### `voices` section

A map of named voice profiles. At least one is required.

| Field          | Type    | Default                  | Notes                           |
|----------------|---------|--------------------------|---------------------------------|
| `voice_id`     | string  | (required)               | Inworld voice name              |
| `provider`     | string  | `"inworld"`              | Only `inworld` currently        |
| `model_id`     | string  | `"inworld-tts-1.5-max"`  | Inworld model version           |
| `speaking_rate` | number | `1.0`                    | 0.5 (slow) to 1.5 (fast)        |
| `temperature`  | number  | `1.1`                    | 0.0 (exclusive) to 2.0          |

**List of available Inworld preset voices:** See the [Inworld portal](https://platform.inworld.ai/v2/workspaces/)

### `default_voice`

A string that must match one of the keys in `voices`. This voice is used for any scene or text that doesn't specify an override.

### `scenes` section

An ordered array. Each scene maps to one script file and defines how visuals overlay the narration.

| Field                 | Type     | Default   | Notes                                           |
|-----------------------|----------|-----------|-------------------------------------------------|
| `script`              | string   | (required)| Relative path, e.g. `inbox/scripts/01-intro.md` |
| `voice`               | string   | (none)    | Override `default_voice` for this scene         |
| `transition`          | string   | `"cut"`   | `fade`, `cut`, `slide-left`, `slide-right`, `wipe-down` |
| `transition_duration` | number   | `0.5`     | Seconds                                         |
| `pause_before`        | number   | `0`       | Seconds of silence before this scene            |
| `pause_after`         | number   | `0.3`     | Seconds of silence after this scene             |
| `visuals`             | array    | `[]`      | Visual events overlaid on the narration         |

**Visual event fields** (common to all types):

| Field              | Type           | Default | Notes                               |
|--------------------|----------------|---------|-------------------------------------|
| `type`             | string         | (req.)  | Visual type (see below)             |
| `at`               | string/number  | (none)  | Anchor phrase or timestamp          |
| `duration`         | number         | (none)  | How long to show (seconds)          |
| `animate`          | string         | (none)  | Animation type                      |
| `animate_duration` | number         | `0.4`   | Animation duration (seconds)        |
| `z_index`          | integer        | `0`     | Stacking order                      |

Additional fields are type-specific and passed through. Visual types: `text`, `screenshot`, `circle`, `arrow`, `highlight`, `cursor`, `zoom`, `badge`, `stack`.

**Percentage values:** Any coordinate or dimension field (`position`, `size`, `region`, `from`, `to`, `target.x`, `target.y`) accepts a percentage string like `"50%"` in addition to a pixel number. Percentages are resolved against the video resolution before rendering -- `x` and `w` resolve against width, `y` and `h` against height. Quote percentage values in YAML so they're parsed as strings: `{ x: "25%", y: 300 }`.

**Animation types:** `fade-in`, `fade-out`, `slide-left`, `slide-right`, `slide-up`, `slide-down`, `scale-in`, `pulse`, `draw`, `pop`, `none`.

#### The `screenshot` visual type

A `screenshot` displays an image file from `inbox/assets/`. By default it fills the entire frame, making it the standard way to set a scene background.

**Full-frame vs. inset screenshots:** A screenshot with a `position` field is an "inset" -- it layers on top of whatever is already rendered. Inset screenshots automatically get a border, clip to the frame edges, and dim the background to focus attention on the overlaid content.

**Children:** Annotations can be nested inside a screenshot using a `children:` array. Child coordinates are relative to the screenshot's top-left origin -- a child at `{x: 40, y: 60}` on a screenshot at `{x: 100, y: 100}` appears at absolute video position `{x: 140, y: 160}`. Percentages still resolve against video dimensions. Children inherit the screenshot's clipping/scaling behavior.

```yaml
visuals:
  # Full-frame background
  - type: screenshot
    src: screenshots/main-screen.png

  # Inset overlay with child annotations
  - type: screenshot
    src: screenshots/detail-view.png
    position: { x: 100, y: 80 }
    z_index: 1
    at: "take a closer look"
    animate: fade-in
    # overflow: clip       # default -- clips at frame edges
    # border: "4px solid black"  # default for inset screenshots
    # dim_beneath: 10      # default -- dims the base layer by 10%
    children:
      - type: circle
        target: { x: 400, y: 300, r: 30 }
        color: $accent
        at: "this button"
        animate: pulse
      - type: arrow
        from: { x: 350, y: 350 }
        to: { x: 400, y: 310 }
        at: "this button"
        animate: draw
      - type: highlight
        region: { x: 200, y: 250, w: 500, h: 100 }
        at: "entire row"
```

**Screenshot fields:**

| Field           | Type    | Default                  | Notes                                                              |
|-----------------|---------|--------------------------|-------------------------------------------------------------------|
| `src`           | string  | (required)               | Bare filename, subdirectory-relative path, or full path (see [asset resolution](#asset-resolution) below) |
| `position`      | object  | (none)                   | `{ x, y }` -- top-left offset. Accepts pixels (`120`) or percentages (`"50%"`). Makes the screenshot an "inset". |
| `size`          | object  | (none)                   | `{ w, h }` -- container dimensions. Accepts pixels or percentages. If omitted, fills 100% of the frame. |
| `fit`           | string  | `"contain"`              | How the image scales inside the container: `contain`, `cover`, or `fill` |
| `shadow`        | boolean | `false`                  | Drop shadow behind the image                                      |
| `border_radius` | number  | `0`                      | Rounded corners in pixels                                          |
| `overflow`      | string  | `"clip"`                 | `"clip"` -- content extends beyond frame and is cropped. `"resize"` -- content is scaled to fit the remaining space. |
| `border`        | string  | `"4px solid black"` (inset), `null` (full-frame) | CSS border shorthand string. Set to `null` to disable. |
| `dim_beneath`   | number  | `10` (inset), `0` (full-frame)  | Percentage opacity reduction on the base layer. Cumulative across multiple insets. Set to `0` to disable. |
| `children`      | array   | (none)                   | Array of annotation visuals with coordinates relative to the screenshot's origin. Cannot contain `screenshot` types. |

**Clip vs. resize modes:**

- `overflow: clip` (default): The screenshot renders at full video resolution from its offset position, extending beyond the frame boundary. The frame clips the overflow, so the right and bottom borders are hidden. Children inside also clip at the frame edge.
- `overflow: resize`: The screenshot is scaled down so it fits entirely within the remaining space. All 4 borders are visible. Children scale with the screenshot.

**Background dimming:** When an inset screenshot has `dim_beneath` set (default `10`), a semi-transparent black overlay is rendered on top of all previous content before the inset appears. Multiple insets in the same scene accumulate their dim values -- two insets with `dim_beneath: 10` result in 20% dimming behind the second inset. Set `dim_beneath: 0` to disable.

**Layering:** Use `children:` for annotations that belong to a specific screenshot rather than z_index tricks. Children are rendered inside the screenshot's clipping container and use screenshot-relative coordinates, making them easier to author and maintain.

#### The `stack` visual type

A `stack` groups multiple text items into a vertical column with automatic spacing. The browser handles text height, so you don't need to calculate pixel offsets for each line. Each item can have its own `at` anchor for staggered reveal.

```yaml
visuals:
  - type: stack
    position: { x: 200, y: 240 }
    gap: 50
    items:
      - content: "Key Shrex Concepts"
        style: title
        animate: slide-right
        color: $accent
      - content: "• Works over email"
        animate: fade-in
        at: "only user interface"
      - content: "• Near-human language comprehension"
        animate: fade-in
        at: "you converse with"
```

**Stack-level fields:**

| Field      | Type   | Default | Notes                             |
|------------|--------|---------|-----------------------------------|
| `position` | object | (req.)  | `{ x, y }` -- anchors the stack  |
| `gap`      | number | `40`    | Pixel spacing between items       |

**Per-item fields:**

| Field       | Type   | Default     | Notes                                |
|-------------|--------|-------------|--------------------------------------|
| `content`   | string | (required)  | Text to display                      |
| `style`     | string | `"caption"` | `title`, `caption`, `callout`, `label` |
| `animate`   | string | (none)      | Animation for this item              |
| `at`        | string | (none)      | Anchor phrase for staggered reveal   |
| `color`     | string | `"#FFFFFF"` | Text color (supports `$variable` refs) |
| `font_size` | number | (none)      | Override the style preset's font size |
| `align`     | string | `"left"`    | `left`, `center`, `right`            |

Items that haven't reached their `at` timestamp are hidden but still reserve layout space, so later items don't jump when earlier ones appear.

#### The `arrow` visual type

An `arrow` draws a line with an arrowhead between two points. You can define it in two ways:

**Explicit form** -- specify `from` (tail) and `to` (arrowhead tip) for full control. The arrowhead always appears at the `to` end:

```yaml
visuals:
  - type: arrow
    from: { x: 1750, y: 120 }    # tail (no arrowhead)
    to: { x: 1820, y: 75 }       # tip (arrowhead points here)
    at: "top-right"
    animate: draw
    color: $accent
```

**Shorthand form** -- specify a single `position` to get a short arrow that points downward at that spot. The arrowhead tip lands at the given `{x, y}` coordinate and the tail extends 80px straight up:

```yaml
visuals:
  - type: arrow
    position: { x: 200, y: 640 }
    at: "Did you notice"
```

This is equivalent to writing `from: { x: 200, y: 560 }` and `to: { x: 200, y: 640 }`. Use the shorthand when you just want to point at something and don't care about the arrow's origin. Use the explicit form when you need a specific angle or length.

**Arrow fields:**

| Field          | Type   | Default    | Notes                                              |
|----------------|--------|------------|----------------------------------------------------|
| `from`         | object | (see below)| `{ x, y }` -- tail (plain line end)                |
| `to`           | object | (see below)| `{ x, y }` -- tip (arrowhead end)                  |
| `position`     | object | (none)     | Shorthand: `{ x, y }` -- arrowhead tip, tail 80px above |
| `color`        | string | `$accent`  | Stroke color (supports `$variable` refs)           |
| `stroke_width` | number | `10`       | Line thickness in pixels                           |
| `head_size`    | number | `stroke_width * 3` | Arrowhead size in pixels (scales with line) |

Either `from`+`to` or `position` is required. If `position` is provided, `from` and `to` are ignored.

### Complete example

See the working project at `projects/how-to-configure-notifications/video-config.yaml` for a real-world three-scene configuration.


## Running the Pipeline

All commands are run from the repo root.

### Full build (recommended)

```bash
npx tsx src/index.ts build --project projects/your-video-title --verbose
```

This runs six stages in sequence:
1. **Validate** -- checks YAML schema, script files, assets, voices, and anchors.
2. **Convert** -- parses Markdown scripts into TTS segment JSON files.
3. **Synthesize** -- calls the Inworld API for each segment and concatenates audio.
4. **Resolve** -- builds a frame-accurate `timeline.json` from config + audio artifacts.
5. **Render** -- renders the final video using Remotion.
6. **Transcript** -- generates speaker-attributed transcripts (`output/{slug}_transcript.md` and `output/{slug}_transcript.html`).

Use `--from <stage>` and `--through <stage>` to run a subset (e.g., `--from resolve` to skip audio regeneration). See the [CLI Cheat Sheet](Using%20support-producer.md) for all options.

If any stage produces errors, the build aborts with exit code 1. Warnings are printed but do not block the build.

The `--project` flag accepts a full path or just the project directory name. The CLI tries the base directory (`projects/` by default, or `PROJECT_ROOT` from `.env`) as a fallback:

```bash
# These are equivalent when PROJECT_ROOT is not set:
npx tsx src/index.ts build --project projects/your-video-title
npx tsx src/index.ts build --project your-video-title

# With PROJECT_ROOT=../my-videos in .env:
npx tsx src/index.ts build --project your-video-title
# resolves to ../my-videos/your-video-title

# Fully-qualified paths always work regardless of PROJECT_ROOT:
npx tsx src/index.ts build --project /Users/me/videos/my-video
```

### Individual stages

You can run stages independently for debugging:

```bash
# Validate only
npx tsx src/index.ts validate --project your-video-title --verbose

# Convert only (requires valid config)
npx tsx src/index.ts convert --project your-video-title --verbose

# Synthesize only (requires segments from a prior convert)
npx tsx src/index.ts synthesize --project your-video-title --verbose

# Transcript only (requires segments from a prior convert)
npx tsx src/index.ts transcript --project your-video-title --verbose
```

### Caching

TTS responses are cached in `.pocket-kubrick/cache/` by default. The cache key is a SHA256 hash of the text, voice ID, model ID, speaking rate, and temperature. If the script text doesn't change, repeated builds reuse cached audio instead of calling the API again.

Cache entries older than 90 days are automatically pruned.

To force fresh synthesis (e.g., after changing a voice ID to the same name), pass `--no-cache`:

```bash
npx tsx src/index.ts build --project your-video-title --no-cache
```


## What Comes Out

After a successful build, the `generated/` directory contains:

```
generated/
    segments/
        01-intro.json               <-- parsed TTS segments
        02-settings-icon.json
        03-notification-panel.json
    audio/
        01-intro.mp3                <-- per-scene audio
        01-intro.timepoints.json    <-- anchor timestamps for this scene
        02-settings-icon.mp3
        02-settings-icon.timepoints.json
        03-notification-panel.mp3
        03-notification-panel.timepoints.json
        full.mp3                    <-- all scenes concatenated
        manifest.json               <-- summary of the build
    timeline.json                   <-- frame-accurate visual timeline
output/
    {slug}_2026-02-25_143025.mp4    <-- rendered video (timestamped)
    {slug}_transcript.md            <-- speaker-attributed transcript (Markdown)
    {slug}_transcript.html          <-- speaker-attributed transcript (HTML)
```

### Segment JSON

Each segment file contains the parsed narration for one scene:

```json
{
    "sceneIndex": 0,
    "scriptFile": "inbox/scripts/01-intro.md",
    "defaultVoice": "narrator",
    "segments": [
        {
            "text": "Welcome to Shrex.",
            "pauseAfterMs": 700
        },
        {
            "text": "In this quick guide, we'll show you how to set up notifications.",
            "voiceId": "aside"
        }
    ],
    "anchors": ["settings-icon", "top-right"]
}
```

### Timepoints JSON

Maps anchor phrases to exact timestamps in the synthesized audio:

```json
{
    "scene": "02-settings-icon",
    "durationSeconds": 4.82,
    "marks": [
        { "name": "settings-icon", "timeSeconds": 1.23 },
        { "name": "top-right", "timeSeconds": 3.01 }
    ]
}
```

These are the bridge between narration and visual events -- when the video renderer (Phase 4) builds the final video, it uses these timestamps to trigger animations at the right moment.

### Manifest JSON

A build-level summary:

```json
{
    "scenes": [
        {
            "name": "01-intro",
            "audioFile": "generated/audio/01-intro.mp3",
            "durationSeconds": 5.2,
            "timepoints": []
        }
    ],
    "totalApiCalls": 6,
    "totalCacheHits": 0
}
```

### Audio format

All audio output is MP3, 48 kHz sample rate, 128 kbps.

### Transcript

The transcript stage produces two files, named after the video title slug (same as rendered videos):

- **`output/{slug}_transcript.md`** -- Markdown with speaker-tag divs and `*emphasis*` markers preserved (renders as italics in Markdown viewers)
- **`output/{slug}_transcript.html`** -- a standalone HTML document with `<p>` tags, `<em>` for emphasis, and actor-wrapping `<div>` elements

Each scene is wrapped in a `video-scene` div with a `scene-marker` and a `scene-body` div. The `scene-body` div lets CSS target scene content separately from the marker (e.g., for indentation). Scenes alternate `scene-odd` / `scene-even` classes for zebra-striping.

Example HTML structure:

```html
<div class="video-scene scene-odd scene-1">
    <div class="scene-marker">Scene 1</div>
    <div class="scene-body">
        <div class="actor-01 Narrator">
            <div class="speaker-tag">Narrator</div>
            <p>Penda here again. Let's talk about ad hoc observation reports in <em>Bex</em>.</p>
            <p>We call this a <em>looseleaf</em> report, and Bex treats it like any other.</p>
        </div>
    </div>
</div>
<div class="video-scene scene-even scene-2">
    <div class="scene-marker">Scene 2</div>
    <div class="scene-body">
        <div class="actor-01 Narrator">
            <p>Next, open the observation form and fill in the details.</p>
        </div>
        <div class="actor-02 Darlene">
            <div class="speaker-tag">Darlene</div>
            <p>I'll walk you through each field.</p>
        </div>
    </div>
</div>
```

Speaker names come from the **key** in the YAML `voices` map, capitalized (e.g., `narrator` becomes `Narrator`, not the underlying `voice_id` like `Craig`). The `actor-NN` class is numbered by order of first appearance (01-based). Actor divs only close and reopen when the speaker changes; when the same speaker continues into a new scene, the actor div opens without a speaker tag.

#### Styling transcripts

The generated HTML includes minimal default CSS. For production use, add a `<link>` to your own stylesheet or override the built-in styles. The class structure is designed for easy CSS targeting:

```css
/* Add colon after scene markers */
.scene-marker::after {
    content: ":";
}

/* Indent scene content, but not the marker */
.scene-body {
    margin-left: 2em;
}

/* Un-bold a secondary speaker */
.actor-02 .speaker-tag {
    font-weight: normal;
}

/* Color a specific speaker's tag */
.Darlene .speaker-tag {
    color: red;
}

/* Hide the primary narrator's speaker tag */
.actor-01 .speaker-tag {
    display: none;
}
```


## Telling Claude Code to Run a Build

If you're working with a Claude Code agent in this repo, the short version is:

> Run a build for the project "your-video-title" with verbose output.

Or more specifically:

> Run `npx tsx src/index.ts build --project your-video-title --verbose` and show me the output.

Make sure `INWORLD_APY_KEY` is set in your `.env` file (the CLI loads it automatically).


## Validation Rules at a Glance

The validator checks the following before any audio is generated:

| Check                   | Severity | What it catches                                              |
|------------------------|----------|---------------------------------------------------------------|
| YAML schema             | error    | Missing required fields, invalid values, bad types            |
| Theme variable refs     | error    | Unknown `$variable` references (only `$background`, `$accent`, `$font`) |
| Script file exists      | error    | `script:` path points to a file that doesn't exist            |
| Bracket directive balance | error  | Unclosed `[voice]`, `[rate]`, etc.                           |
| Voice references        | error    | `default_voice`, scene `voice:`, or `[voice]` directives reference undefined voice keys |
| Anchor phrases          | error    | `at:` phrase not found in the scene's script (includes `stack` item anchors) |
| Asset files             | error    | `src:` path points to a file that doesn't exist under `inbox/assets/` |
| Code blocks in scripts  | warning  | Triple-backtick blocks are skipped during narration           |
| Unknown voice_id        | warning  | `voice_id` is not a known Inworld preset (may still work if it's a cloned voice) |
| Duplicate anchors       | warning  | Same anchor phrase used multiple times in one scene's visuals  |
| Unsupported image ext   | warning  | Asset file has an extension other than png/jpg/jpeg/webp/svg   |
| Deprecated [pitch]      | warning  | `[pitch]` directive has no effect with Inworld                |
| Screenshot children type | error   | `children` array contains a `type: "screenshot"` entry        |


## Iteration Workflow

A typical cycle looks like this:

1. **Prepare content** -- Write or revise scripts in `inbox/scripts/`. Take new screenshots and drop them in `inbox/assets/screenshots/`.

2. **Update configuration** -- Edit `video-config.yaml` to add/modify scenes, adjust voices, define visual events and anchor phrases.

3. **Validate** -- Run `validate` to catch errors before spending API credits:
   ```bash
   npx tsx src/index.ts validate --project your-video-title --verbose
   ```

4. **Build** -- Run the full pipeline:
   ```bash
   npx tsx src/index.ts build --project your-video-title --verbose
   ```

5. **Review** -- Listen to `generated/audio/full.mp3`. Check timepoints in the JSON files. If something sounds wrong, revise the script and re-run. Changed text will hit the API; unchanged text will use the cache.

6. **Repeat** -- Iterate on scripts and visuals until the narration is solid. The cache keeps re-runs fast and cheap.

The pipeline now includes three additional stages -- `resolve` (build a frame-accurate visual timeline from timepoints), `render` (produce the final video via Remotion), and `transcript` (generate a speaker-attributed Markdown transcript). See the [CLI Cheat Sheet](Using%20support-producer.md) for the complete command reference, including `--from`/`--through` flags for selective stage execution.
