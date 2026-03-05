# pocket-kubrick

Automated screencast video producer. Takes human-authored scripts and assets, synthesizes narration via Inworld TTS (account/key required), and renders videos using Remotion.

Note that only Inworld is supported for voice synthesis currently. And, it's the only third party service. Everything else is open source.

**Contributors welcome!**


## Nifty Features

- `compose` command — opens a web browser letting you edit video annotations (does not save at this point, so it requires copy/pasting YAML)
- `keyframes` command — exports frame grabs to see where and in what order annotations will land (does not treat items in text stacks as separate keyframes at this time)
- automatic transcript generation – run `build` with the `--from transcript` flag (or just the whole thing) to generate both Markdown and HTML versions of your script, suitable for framing!
- `inworld_sampler.py` — quick and dirty CLI tool to get sample audio from Inworld
- `.env` variables — if you consistently want a non-default folder for your input and output assets, put the path in `PROJECT_ROOT` for convenience


## My First Kubrick

- do the [Getting Started](#getting-started) steps below
- run `init`
- open the `video-config.yaml` file and make changes: change the script, add a scene, add annotations, whatever
- run `build --project YOUR_PROJECT_PATH`
- look in the `output` folder and marvel at the results


## Compiling

You can use the `npx tsx` flavor of script invocation (see below), but you can also build and link the project to use the `pocket-kubrick` command instead. It's slightly nicer that way.

```bash
npm run build    # compile TypeScript to dist/
npm link         # create a global symlink so "pocket-kubrick" is on your PATH
```

After that, you can use `pocket-kubrick` anywhere instead of `npx tsx src/index.ts`:

```bash
# Before compiling (development):
npx tsx src/index.ts build --project my-video-project

# After build + link:
pocket-kubrick build --project my-video-project
```


## Documentation

- **[Video Production Guide](DOCS/Full%20Guide%20To%20Video%20Production.md)** — End-to-end reference for creating videos: project setup, script format, asset organization, YAML configuration, visual types, and pipeline output.
- **[CLI Cheat Sheet](DOCS/CLI%20Cheat%20Sheet.md)** — Quick command reference for every stage of the pipeline (`init`, `validate`, `convert`, `synthesize`, `resolve`, `render`, `build`, etc.).


## Prerequisites

- Node.js 20+
- FFmpeg on PATH
- An [Inworld](https://inworld.ai/) API key


## Getting Started

**Set up your environment:**

Create a .env file (in the root) with your Inworld key, required for voice generation:

```bash
INWORLD_APY_KEY=<your-inworld-api-key>
```

Projects live in `projects/` by default (gitignored to prevent accidental commits of large assets). To use a different base directory, set `PROJECT_ROOT` in your `.env`:

```bash
PROJECT_ROOT=../my-videos
```

When `PROJECT_ROOT` is set, both `init` and `--project` resolution use it instead of `projects/`. You can always pass a fully-qualified path to `--project` to bypass the base directory entirely.

Then install dependencies:

```bash
npm install

# Scaffold a new video project
npx tsx src/index.ts init my-video

# Run the full pipeline (validate -> convert -> synthesize -> resolve -> render)
npx tsx src/index.ts build --project my-video
```

To use the Python sampler script, create and activate a virtual environment, then install its dependencies:

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Sample a voice (default voice and output)
python inworld_sampler.py

# Sample with your chosen voice
python inworld_sampler.py --voice Craig --output voice_sample.mp3
```


## Development

```bash
npm run dev -- <command> [options]   # Run CLI via tsx
npm run build                        # Compile to dist/
npm test                             # Run tests
npm run test:watch                   # Watch mode
```


## Known Issues

* There are several rough edges and QoL improvement possibilites. Example: keystroke for copy activates a tool in the composer.
* See: [Future Enhancements And Annoyances](PLANS/Future%20Enhancements.md)