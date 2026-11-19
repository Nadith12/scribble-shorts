# Scribble Shorts

A reproducible pipeline for **trend-anchored, evidence-checked vertical Shorts**: write a structured storyboard, verify every quotation against the live source, synthesize measured narration locally, render a 1080 × 1920 animation, review the actual frames, then upload through the official YouTube Data API and verify the result.

It was extracted from a working channel workflow (HyperFrames + Kokoro + a hand-drawn Scribble presenter) and made portable: no personal paths, no channel ID, no credentials, no model downloads in Git.

- Editorial process: [`docs/topic-and-story-workflow.md`](docs/topic-and-story-workflow.md) — trend anchors, scoring, verification, story structure, batch playbook.
- YouTube setup: [`docs/youtube-setup.md`](docs/youtube-setup.md) — Google Cloud project, OAuth desktop client, channel ID, quota, token security.
- Storyboard contract: [`docs/storyboard-schema.md`](docs/storyboard-schema.md).
- Full example brief: [`pipeline/examples/bridge-demo.json`](pipeline/examples/bridge-demo.json) (marked `testOnly`, so it can never be published).

## How a Short is made

1. **Anchor** — start from something the audience is already paying attention to this week: a game or film launch, a match, a product, a seasonal moment. The trend supplies the reason to stop; it never supplies the evidence.
2. **Verify** — record the exact claim and its conditions, then copy exact quotations from primary or institutional pages. The runner refetches every citation and fails if a quote is absent. Presence proves provenance, not truth; a named reviewer still approves the claim.
3. **Storyboard** — one JSON file: sources, claims, scenes, narration, diagram choice, on-screen labels. Narration and visuals must describe the same causal chain.
4. **Narrate** — Kokoro (`am_michael`, 0.95 by default) runs on CPU. Each scene is measured from the rendered WAV, padded to a whole frame, then concatenated. No guessed scene durations.
5. **Render** — HyperFrames draws the diagram, captions, the Scribble presenter and the measured timeline. Remotion is an optional second renderer.
6. **Review** — the runner decodes frames at scene boundaries and midpoints, builds contact sheets, and checks codecs, geometry, frame rate, duration, audio level and full decode. A human (or an agent actually looking at the frames) records the review against the export hash.
7. **Publish** — `finish` copies the reviewed file to `outputs/`, records it, uploads it to the configured channel, polls YouTube, checks the channel ID and visibility, and only then removes the local MP4 (configurable).

## Requirements

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | 22+ | runner, renderer, uploader |
| FFmpeg + FFprobe | 6+ | on `PATH`, or set full paths |
| Python | 3.10–3.13 | Kokoro narration only |
| Chrome / Chromium | current | HyperFrames needs an executable |
| Disk | ~1 GB | Kokoro model ~325 MB, voice pack ~28 MB, node modules, renders |

Tested on Windows 11 with Node 22.22, Python 3.12 and FFmpeg 9. The code is OS-neutral, but macOS and Linux have not been exercised in this repository.

## Setup

```bash
git clone <this-repo> my-shorts
cd my-shorts
npm ci

# HyperFrames is a renderer, not a project dependency. Install it locally:
npm install --no-save --omit=optional hyperframes@0.9.59

# Kokoro Python dependencies, installed privately inside the repo:
python -m pip install --target vendor/kokoro-deps -r requirements-kokoro.txt

# Kokoro v1.0 model + 54 voices (~350 MB):
npm run setup:assets

cp shorts.config.example.json shorts.config.local.json
```

Then edit `shorts.config.local.json`:

- `paths.python` — `python`, `python3`, or an absolute interpreter path.
- `paths.ffmpeg` / `paths.ffprobe` — command names or absolute paths.
- `paths.browser` — absolute path to a Chrome/Chromium executable. Leave empty only if HyperFrames can find its own browser.
- `paths.hyperframes` — `node_modules/hyperframes/bin/hyperframes.mjs`, or the path to an existing HyperFrames install. Every non-render command works without it.
- `tts.model`, `tts.voices`, `tts.dependencies` — leave as the downloaded defaults unless you keep assets elsewhere.
- `publication.channel` — your YouTube channel ID (see the YouTube guide).

Check the installation without printing secrets:

```bash
npm run doctor
```

It reports the Node version, resolved paths, whether the Kokoro assets exist, whether the optional text provider key is present, and whether Remotion is installed.

### HyperFrames and the browser

If `npm install hyperframes` fails during esbuild's binary check (for example `Expected "0.28.2" but got "0.28.1"`), delete `node_modules/hyperframes` and install it in a separate folder:

```bash
mkdir -p tools && cd tools && npm init -y && npm install --omit=optional hyperframes@0.9.59
```

Then point `paths.hyperframes` at `tools/node_modules/hyperframes/bin/hyperframes.mjs`. This is how the original project kept rendering isolated from the rest of the toolchain.

HyperFrames renders through `puppeteer-core`, which does not ship a browser. Either point `paths.browser` at an installed Chrome, or download a headless shell into the repo:

```bash
npx @puppeteer/browsers install chrome-headless-shell@stable
# then set paths.browser to the printed executable path
```

## Make your first Short

The included demo is a technical sample, not a publishable episode:

```bash
npm run demo:prepare
node shorts.mjs run --brief pipeline/examples/bridge-demo.json
```

The first run fetches the ANU source page, synthesizes narration, renders, verifies, and writes frames to `work/pipeline/pipeline-bridge-demo/qa/`. Inspect them, then record a real review:

```bash
node shorts.mjs review --id pipeline-bridge-demo --reviewer "Your name" \
  --notes "Checked every scene boundary and midpoint: no overflow, labels legible, diagram matches narration."
```

`finish` refuses this episode because it is `testOnly`. That is intentional.

### A real episode

1. Write `work/my-batch/ep-01-short-slug.json` following [`docs/storyboard-schema.md`](docs/storyboard-schema.md), or have an agent write it from the editorial workflow. Use a unique `id` and `topicKey`, and real quotations from pages you actually fetched.
2. Render:

   ```bash
   node shorts.mjs run --brief work/my-batch/ep-01-short-slug.json
   ```

3. Inspect `work/pipeline/<id>/qa/` and the MP4, then record the review.
4. Publish (this is the step that uploads publicly):

   ```bash
   node shorts.mjs finish --id <id>
   ```

`finish` verifies that the reviewed file, storyboard and timeline hashes still match, copies the export to `outputs/`, appends a record to `PROJECT.md`, uploads to `publication.channel` with `publication.visibility`, then polls the API until the upload is processed. If processing is still pending, run `finish` again — it reconciles the existing upload instead of uploading a second copy.

By default `publication.deleteAfterPublish` is `true`, so the verified local MP4 is permanently unlinked after a successful publish. Set it to `false` if you want to keep the file. Production records (timeline, evidence, QA frames, receipts) are always kept under `work/pipeline/<id>/`.

## Commands

| Command | What it does |
| --- | --- |
| `npm run doctor` | Environment and path report; never prints keys |
| `node shorts.mjs run --brief <json>` | Validate, verify sources, narrate, render, verify |
| `node shorts.mjs run --id <id>` | Resume a run from its saved episode/stages |
| `node shorts.mjs review --id <id> ...` | Record the actual visual/timing review |
| `node shorts.mjs finish --id <id>` | Publish, verify, then delete the local MP4 |
| `node shorts.mjs plan --candidates <json> --id <job>` | Optional: compare imported candidates with a configured text model |
| `npm run youtube:auth` | One-time OAuth consent |
| `npm run youtube:status` | Show the authorized channel |
| `node youtube-status.mjs <videoId>` | Status/processing details for uploaded videos |
| `npm test` | Unit tests; no network or paid calls |
| `npm run test:integration` | Optional renderer/media integration check |

Useful flags: `--renderer remotion`, `--offline` (reuse cached source text), `--stop-after research|narration|compose`, `--allow-repeat` (intentional remake only).

## Batch workflow

The editorial document ends with a **batch playbook** for requests such as "make five Shorts and publish them". In short:

1. Check the uploader before rendering anything (`npm run youtube:status`).
2. Read `PROJECT.md` and `work/pipeline/*/episode.json` for the catalog.
3. Produce N+2 live anchors with dates, links and decay windows; write `work/<batch>/trend-scan.md`.
4. Score, reject duplicates, verify exact quotations, write one brief per episode.
5. Render sequentially, inspect every scene, record the review, `finish` each one.
6. Add one dated batch section to `PROJECT.md` with URLs, durations, hashes and what was not checked.

Nothing is published just because a file exists: `finish` is the publishing action, and it should only be run when the operator has asked for it.

## Configuration reference

`shorts.config.example.json` contains every commonly changed value. The defaults live in [`pipeline/config.mjs`](pipeline/config.mjs).

- `renderer` — `hyperframes` (default) or `remotion`.
- `captions` — short cues (≤5 words) timed to measured speech; one accent-coloured highlight term per cue.
- `style` — background, accent and ink colours used by the diagrams and captions.
- `resources.workers` — parallel render workers (1–8).
- `research` — optional Responses-compatible text provider for `plan`/`produce`. Disabled by default; external spending is separately bounded.
- `tts` — Kokoro voice, speed, model paths; or `provider: "command"` with an adapter.
- `visuals` / `video` — optional image/video provider adapters. Diagrams need no provider and cost nothing.
- `publication` — channel, visibility, audience (`general`/`kids`), polling, and whether to delete local MP4s after a verified publish.

## Project layout

```
assets/                 Scribble rig, font, GSAP, downloaded Kokoro assets (ignored)
docs/                   editorial workflow, YouTube setup, storyboard contract
outputs/                finished deliverables (ignored)
pipeline/               schemas, research, narration, renderers, QA
  examples/             test-only demo brief
  tests/                unit and integration checks
scripts/setup-assets.mjs
shorts.mjs              CLI entry point
upload-youtube.mjs      OAuth + resumable upload
youtube-status.mjs      channel/video read helper
work/                   episodes, caches, QA, receipts (ignored)
PROJECT.md              your channel brief and episode catalog
```

## Honest limits

- **Exact quotations are a provenance check, not fact-checking.** Source authority, scope, contradictions and visual implications still need a reviewer.
- **The visual review is not automatic.** `review` records what a person or agent actually inspected, bound to hashes. Sampling a few frames is not proof that every frame is correct.
- **No performance data is included.** The editorial document's guidance is a starting hypothesis, not a tested retention strategy.
- **YouTube rules change.** The API's unverified-project upload restriction was lifted on 2 November 2026; the OAuth testing-mode token limit and quota rules still apply. Recheck the linked official pages before depending on them.
- **The channel's own defaults can override an upload's requested visibility.** The uploader compares YouTube's response with what it requested and fails loudly on a mismatch.
- **Scribble is a specific visual brand.** Replace `assets/scribble.js` and the scene art if you want a different presenter.
- **No license file is included.** Add one before redistributing the code; the bundled third-party assets keep their own licenses (see [`THIRD_PARTY.md`](THIRD_PARTY.md)).
