import {z} from 'zod';

const text = z.string().trim().min(1).max(5000);
const id = z.string().regex(/^[a-z][a-z0-9-]{1,70}$/);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const Source = z.object({id, url: z.url(), title: text, authority: z.enum(['primary', 'institutional', 'other'])}).strict();
export const Claim = z.object({
  id, text, conditions: text,
  evidence: z.array(z.object({sourceId: id, quote: text}).strict()).min(1).max(6),
  verdict: z.enum(['supported', 'unresolved', 'rejected']), reason: text,
}).strict();
const visual = z.object({
  kind: z.enum(['diagram', 'image', 'video']),
  template: z.enum(['comparison', 'process', 'layers', 'callout', 'paper-bridge']),
  heading: z.string().max(95),
  items: z.array(z.object({label: z.string().min(1).max(80), detail: z.string().max(150), color: color.optional()}).strict()).min(1).max(5),
  prompt: z.string().max(3000).default(''),
  asset: z.string().max(1000).optional(),
  credit: z.string().max(400).optional(),
  license: z.string().max(400).optional(),
  illustrative: z.boolean().default(true),
  videoJustification: z.string().max(500).default(''),
  clipSeconds: z.number().min(0.5).max(10).default(3),
  fallback: z.enum(['diagram', 'image']).default('diagram'),
}).strict();
export const Scene = z.object({
  id, narration: z.string().trim().min(1).max(1200), claimIds: z.array(id).min(1),
  goal: text, action: text, result: text, nextBecause: text,
  visual,
  animation: z.object({motion: z.enum(['none', 'zoom', 'pan', 'reveal']), intensity: z.number().min(0).max(1).default(0.65)}).strict(),
  host: z.enum(['point', 'think', 'surprise', 'explain', 'draw']).default('point'),
  transition: z.enum(['cut', 'fade', 'slide']).default('cut'),
  onScreenText: z.string().max(100).default(''),
  estimatedSeconds: z.number().min(0.3).max(25).optional(),
}).strict();
export const Candidate = z.object({
  id, title: z.string().min(5).max(100), topicKey: text, aliases: z.array(text).default([]),
  hook: text, payoff: text, expectation: text, explanation: text,
  scores: z.object({recognition: z.number().int().min(0).max(5), surprise: z.number().int().min(0).max(5),
    visual: z.number().int().min(0).max(5), simplicity: z.number().int().min(0).max(5), payoff: z.number().int().min(0).max(5)}).strict(),
  sources: z.array(Source).min(1).max(6), claims: z.array(Claim).min(1).max(12),
  review: z.object({reviewer: text, decision: z.enum(['approved', 'hold', 'reject']), notes: text}).strict(),
}).strict();
export const Episode = Candidate.extend({
  schemaVersion: z.literal(1), testOnly: z.boolean().default(false),
  scenes: z.array(Scene).min(2).max(15),
}).strict().superRefine((episode, ctx) => {
  for (const [name, records] of [['sources', episode.sources], ['claims', episode.claims], ['scenes', episode.scenes]]) {
    if (new Set(records.map(x => x.id)).size !== records.length) ctx.addIssue({code: 'custom', message: `Duplicate ${name} IDs.`});
  }
  const sources = new Set(episode.sources.map(x => x.id)), claims = new Set(episode.claims.map(x => x.id));
  for (const claim of episode.claims) for (const evidence of claim.evidence) if (!sources.has(evidence.sourceId)) ctx.addIssue({code: 'custom', message: `Unknown source ${evidence.sourceId}`});
  for (const scene of episode.scenes) {
    for (const claimId of scene.claimIds) if (!claims.has(claimId)) ctx.addIssue({code: 'custom', message: `Unknown claim ${claimId}`});
    if (scene.visual.kind === 'video' && scene.visual.videoJustification.trim().length < 15) ctx.addIssue({code: 'custom', message: `Scene ${scene.id} must justify video.`});
    if (scene.visual.asset && (!scene.visual.credit || !scene.visual.license)) ctx.addIssue({code: 'custom', message: `Scene ${scene.id} needs asset credit and usage rights.`});
  }
});
export const Candidates = z.object({candidates: z.array(Candidate).min(2).max(12)}).strict();
export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(`Invalid structured data: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  return result.data;
}
export function jsonSchema(schema) {const result = z.toJSONSchema(schema); delete result.$schema; return result;}
