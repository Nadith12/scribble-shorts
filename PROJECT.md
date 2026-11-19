# Channel brief

The pipeline reads this file for duplicate detection and appends one record per published episode. Fill in your own channel and format before the first episode.

## Channel

- **Display name:** (your channel)
- **Channel ID:** set `publication.channel` in `shorts.config.local.json` after `npm run youtube:auth`
- **Standing publishing decision:** none by default. Nothing is uploaded until the operator asks for it and `node shorts.mjs finish --id <id>` is run.
- **Audience:** general (not made for kids), unless you change `publication.audience`.

## Format

- 1080 × 1920, 30 fps, 30–60 seconds.
- Scribble performs the experiment or directs attention in every scene.
- Kokoro `am_michael` at 0.95, narration only, no background music.
- Captions on: short cues, one accent-coloured highlight term per cue.
- Diagrams are simplified and labelled; no copyrighted footage, logos, music or sound effects.
- Finished MP4s go to `outputs/`; temporary media and QA go to `work/`.
- Publish publicly only when the batch request or the operator authorizes it.

## Episode catalog

| Title | Topic key | Published | Notes |
| --- | --- | --- | --- |
| Why Folding Paper Makes a Stronger Bridge | paper-bridge-folds | — | Test-only demo used by the automated tests; never published. |

Published episodes are also recorded automatically by `finish` below this section.
