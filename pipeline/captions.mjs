const MAX_CHARS = 34;
const MAX_WORDS = 5;

const STOPWORDS = new Set(['the', 'and', 'that', 'this', 'with', 'from', 'have', 'your', 'they', 'what', 'when', 'where',
  'which', 'into', 'than', 'then', 'them', 'their', 'there', 'these', 'those', 'because', 'about', 'after', 'before',
  'over', 'under', 'more', 'most', 'less', 'very', 'just', 'only', 'also', 'does', 'did', 'are', 'was', 'were', 'been',
  'being', 'would', 'could', 'should', 'will', 'can', 'its', 'you', 'our', 'out', 'for', 'not', 'but', 'his', 'her',
  'how', 'why', 'all', 'any', 'each', 'every', 'some', 'such', 'even', 'like', 'near', 'onto', 'once', 'here']);

const edge = word => String(word).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
const normalize = word => edge(word).toLowerCase();
// Cheap singular fold so a heading's "cranberries" highlights "cranberry", and so on.
const singular = word => word.length > 4
  ? word.replace(/ies$/, 'y').replace(/(ches|shes|xes|zes|sses)$/, '').replace(/(?<![s])s$/, '')
  : word;

// Topical terms come from the scene's own on-screen copy: the words the diagram is already
// pointing at are the words worth lighting up when the narrator says them.
export function emphasisTerms(...texts) {
  const terms = new Set();
  const add = raw => {
    const token = edge(raw);
    if (!token) return;
    const clean = token.toLowerCase();
    const acronym = token.length >= 3 && token.length <= 6 && token === token.toUpperCase() && /^[\p{L}\p{N}]+$/u.test(token);
    if (!/\d/.test(clean) && (STOPWORDS.has(clean) || (clean.length < 4 && !acronym))) return;
    terms.add(clean);
    terms.add(singular(clean));
  };
  for (const text of texts.flat(3).filter(Boolean)) for (const raw of String(text).split(/\s+/)) add(raw);
  return [...terms];
}

function emphasises(word, terms) {
  const clean = normalize(word);
  if (!clean) return false;
  // Numbers, prices, percentages and dates always carry the point of a fact-driven Short.
  if (/\d/.test(clean)) return true;
  return terms.has(clean) || terms.has(singular(clean));
}

// Words are timed from Kokoro's per-phoneme records when the counts line up; otherwise the
// scene's measured speech interval is divided by character weight. Both paths stay inside
// the interval the audio actually occupies, so captions never outrun the voice.
export function wordTimings(narration, {speechStart = 0, speechEnd = 0, phonemes = []} = {}) {
  const words = String(narration).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const groups = [];
  if (Array.isArray(phonemes) && phonemes.length) {
    let current = null;
    for (const p of phonemes) {
      if (p.phoneme === ' ') { current = null; continue; }
      if (!current) { current = {start: Number(p.start), end: Number(p.end)}; groups.push(current); }
      else current.end = Number(p.end);
    }
  }
  const usable = groups.filter(g => Number.isFinite(g.start) && Number.isFinite(g.end) && g.end > g.start);
  if (usable.length === words.length) {
    return words.map((word, i) => ({word, start: usable[i].start, end: usable[i].end}));
  }
  const start = Number.isFinite(speechStart) ? speechStart : 0;
  const end = Number.isFinite(speechEnd) && speechEnd > start ? speechEnd : start + words.length * 0.35;
  const weights = words.map(w => Math.max(1, w.replace(/[^\p{L}\p{N}]/gu, '').length || w.length));
  const total = weights.reduce((a, b) => a + b, 0);
  const span = Math.max(0.2, end - start);
  let clock = start;
  return words.map((word, i) => {
    const duration = span * weights[i] / total;
    const item = {word, start: clock, end: clock + duration};
    clock += duration;
    return item;
  });
}

// One highlighted word per cue keeps the caption readable: a number carries the fact, a
// diagram label names the thing on screen, and only then does the heading supply a term.
function pickEmphasis(words, strong, weak) {
  const numeric = words.findIndex(w => /\d/.test(normalize(w.word)));
  if (numeric >= 0) return numeric;
  const labelled = words.findIndex(w => emphasises(w.word, strong));
  if (labelled >= 0) return labelled;
  return words.findIndex(w => emphasises(w.word, weak));
}

export function buildCaptionCues(narration, timing = {}) {
  const words = wordTimings(narration, timing);
  if (!words.length) return [];
  const terms = new Set((timing.terms || []).map(normalize));
  // Callers that pass only one term list get the old behaviour: every term is a strong match.
  const strong = new Set((timing.strongTerms || timing.terms || []).map(normalize));
  const weak = timing.strongTerms ? terms : new Set();
  const cues = [];
  let current = [];
  const flush = () => {
    if (!current.length) return;
    const emphasis = pickEmphasis(current, strong, weak);
    cues.push({
      text: current.map(w => w.word).join(' '),
      start: current[0].start,
      end: current[current.length - 1].end,
      words: current.map((w, i) => ({text: w.word, start: w.start, end: w.end, emphasis: i === emphasis})),
    });
    current = [];
  };
  for (const item of words) {
    const candidate = [...current, item];
    const chars = candidate.map(w => w.word).join(' ').length;
    if (current.length && (chars > MAX_CHARS || candidate.length > MAX_WORDS)) flush();
    current.push(item);
    if (/[.!?]$/.test(item.word) && current.length >= 2) flush();
  }
  flush();
  const speechEnd = Number.isFinite(timing.speechEnd) ? timing.speechEnd : cues.at(-1)?.end ?? 0;
  const round = value => Number(value.toFixed(3));
  return cues.map((cue, i) => {
    const next = cues[i + 1];
    // Hold a cue through a short natural gap, but hand over promptly when the next words start.
    const end = next ? Math.max(cue.end, Math.min(next.start, cue.end + 0.35)) : Math.max(cue.end, speechEnd);
    return {
      text: cue.text,
      start: round(cue.start),
      end: round(end),
      words: cue.words.map(w => ({...w, start: round(w.start), end: round(w.end)})),
    };
  });
}
