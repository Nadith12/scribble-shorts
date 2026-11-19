# Storyboard contract

A storyboard is one JSON file validated by [`pipeline/schema.mjs`](../pipeline/schema.mjs). Unknown fields are rejected. The complete worked example is [`pipeline/examples/bridge-demo.json`](../pipeline/examples/bridge-demo.json); it is `testOnly`, so it can never be published.

## Top level

| Field | Type | Notes |
| --- | --- | --- |
| `schemaVersion` | `1` | fixed |
| `id` | slug | lowercase letters, digits, hyphens; becomes `work/pipeline/<id>/` |
| `testOnly` | boolean | `true` blocks `finish` and uploads |
| `title` | string | used as the YouTube title and output filename |
| `topicKey` | string | duplicate-detection identity |
| `aliases` | string[] | extra names for duplicate detection |
| `hook` | string | first line of the YouTube description |
| `payoff` | string | what the viewer will have understood |
| `expectation` | string | the plausible expectation the episode overturns |
| `explanation` | string | one-sentence mechanism |
| `scores` | object | `recognition`, `surprise`, `visual`, `simplicity`, `payoff`, each 0–5 |
| `sources` | array | 1–6 sources |
| `claims` | array | 1–12 claims |
| `review` | object | `{reviewer, decision: "approved"|"hold"|"reject", notes}` |
| `scenes` | array | 2–15 scenes |

`review.decision` must be `approved`; a `hold` or `reject` stops production before any rendering.

## Sources

```json
{
  "id": "nhs-motion",
  "url": "https://www.nhs.uk/conditions/motion-sickness/",
  "title": "Motion sickness",
  "authority": "institutional"
}
```

`authority` is `primary`, `institutional` or `other`. At least one source must be `primary` or `institutional`. Only public HTTPS pages are fetched. Pages behind a bot check, a paywall or a PDF-only viewer will fail, and the brief must be changed rather than bypassed.

## Claims

```json
{
  "id": "conflict-signal",
  "text": "When visual motion conflicts with the balance signal, the mismatch can cause motion sickness.",
  "conditions": "General explanation of motion sickness in susceptible people; not a diagnosis or a universal threshold.",
  "evidence": [
    {
      "sourceId": "nhs-motion",
      "quote": "Motion sickness is caused by a conflict between the movement you see and the movement your body feels."
    }
  ],
  "verdict": "supported",
  "reason": "The institutional page states the conflict explanation directly."
}
```

Rules enforced by the runner:

- every `sourceId` must exist;
- every quote must be at least 25 characters and must appear **verbatim** on the fetched page, after whitespace normalization;
- every claim must have `verdict: "supported"`;
- quotes are re-fetched on every `run` and on `finish` (from cache offline).

A quote proves the page contains that text. It does not prove the page is right, current, or being used within its scope. Record that judgement in `review.notes`.

## Scenes

```json
{
  "id": "mismatch",
  "narration": "Your eyes see motion. Your inner ear feels stillness. The mismatch is what makes you queasy.",
  "claimIds": ["conflict-signal"],
  "goal": "Show the two conflicting signals.",
  "action": "Split the frame into eyes and inner ear.",
  "result": "The signals disagree.",
  "nextBecause": "The disagreement explains the symptom.",
  "visual": {
    "kind": "diagram",
    "template": "comparison",
    "heading": "Two signals, one mismatch",
    "items": [
      {"label": "Eyes", "detail": "See movement"},
      {"label": "Inner ear", "detail": "Feels stillness"}
    ],
    "prompt": "",
    "illustrative": true,
    "clipSeconds": 3,
    "fallback": "diagram"
  },
  "animation": {"motion": "reveal", "intensity": 0.65},
  "host": "explain",
  "transition": "cut",
  "onScreenText": "Two signals disagree"
}
```

- `claimIds` must reference existing claims. Every factual sentence in the narration needs coverage.
- `visual.kind`: `diagram`, `image` or `video`.
- `visual.template`: `comparison`, `process`, `layers`, `callout` or `paper-bridge`.
- `visual.items`: 1–5 entries; `label` ≤80 characters, `detail` ≤150.
- `animation.motion`: `none`, `zoom`, `pan`, `reveal`; `host`: `point`, `think`, `surprise`, `explain`, `draw`.
- With captions on (default), the scene's `onScreenText` is suppressed and the narration is shown as short cues instead.
- `image` and `video` assets require `asset`, `credit` and `license`. `video` also requires a concrete `videoJustification` (≥15 characters).
- Imported files are relative to the repo root and must be PNG/JPEG/WebP (images) or MP4 (video).

## Practical authoring rules

1. **One central question per episode.** A 30–60 second Short cannot carry two.
2. **Write the payoff before the middle.** Every line should earn its place on the way to that payoff.
3. **Narration and diagram must show the same thing.** A label that implies a quantity or a mechanism the source does not support is a factual error.
4. **Keep labels short.** The renderer has fixed positions; long text overflows silently in the HTML and visibly in the MP4. Inspect frames.
5. **No copyrighted frames.** Do not use game footage, film stills, logos, box art, music or sound effects from the trend you are riding. Name the work in narration or the description; draw a generic stand-in.
6. **Use a new `id` and `topicKey`.** The duplicate check compares against `PROJECT.md`, `work/*/episodes.json` and `work/pipeline/*/episode.json`. `--allow-repeat` exists only for an intentional remake.

## Validation and failures

`node shorts.mjs run --brief <file>` fails before rendering when:

- the schema is invalid (`Unrecognized key`, `Duplicate scenes`, `Unknown claim`);
- a source cannot be fetched as readable HTML;
- a quote is absent from the page;
- a claim is not `supported`;
- a video scene lacks a justification, or an imported asset lacks credit/license;
- the topic duplicates an existing one.

Fix the brief and re-run. Do not hand-edit generated files in `work/pipeline/<id>/`.
