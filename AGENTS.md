# Working in this repo

- Read [PROJECT.md](PROJECT.md) for the channel brief and episode catalog, and [the editorial workflow](docs/topic-and-story-workflow.md) before choosing a topic.
- Choose topics from a live trend anchor (Stage 0). For batch requests, follow the batch playbook at the end of that document. A trend supplies the hook, never the evidence.
- Never invent a quotation. Fetch the page and copy the exact sentence; the runner rechecks it and rejects fabrications.
- Start from the existing Scribble rig and diagram templates. Do not add footage, logos, music or sound effects from the work being referenced.
- Put finished deliverables in `outputs/` and temporary media, caches and QA in `work/`.
- Render, inspect the actual QA frames, then record the review with `node shorts.mjs review`. A review is a claim about what was inspected, not an automatic approval.
- Run `node shorts.mjs finish --id <id>` only when the operator has asked to publish. It uploads to the configured channel and deletes the local MP4 after verification (unless `publication.deleteAfterPublish` is false).
- Never commit `work/youtube-auth/`, `shorts.config.local.json`, downloaded Kokoro assets or generated renders. Do not print tokens or client secrets.
- Record each published episode or reusable change in `PROJECT.md` so the next session can continue.
