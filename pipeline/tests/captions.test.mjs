import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCaptionCues, emphasisTerms, wordTimings} from '../captions.mjs';

test('caption cues stay short and readable', () => {
  const cues = buildCaptionCues('Water is densest at about four degrees Celsius, so the coldest water floats on top.', {speechStart: 0, speechEnd: 6});
  assert.ok(cues.length >= 3);
  for (const cue of cues) {
    assert.ok(cue.text.split(' ').length <= 5, `too many words: ${cue.text}`);
    assert.ok(cue.text.length <= 40, `too long: ${cue.text}`);
  }
});

test('captions stay inside the measured speech interval and do not overlap', () => {
  const cues = buildCaptionCues('Grand theft auto is set in fictional Florida. The real state has no hills.', {speechStart: 0.12, speechEnd: 5.4});
  assert.ok(cues[0].start >= 0.11);
  assert.equal(cues.at(-1).end, 5.4);
  for (let i = 1; i < cues.length; i++) assert.ok(cues[i].start >= cues[i - 1].start);
});

test('word timings use phoneme boundaries when the counts match', () => {
  const phonemes = [
    {start: 0.1, end: 0.2, phoneme: 'h'},
    {start: 0.2, end: 0.3, phoneme: 'a'},
    {start: 0.3, end: 0.4, phoneme: 'i'},
    {start: 0.4, end: 0.45, phoneme: ' '},
    {start: 0.5, end: 0.7, phoneme: 'ð'},
    {start: 0.7, end: 0.9, phoneme: 'e'}
  ];
  const words = wordTimings('hi there', {speechStart: 0, speechEnd: 1, phonemes});
  assert.deepEqual(words.map(w => w.word), ['hi', 'there']);
  assert.equal(words[0].start, 0.1);
  assert.equal(words[1].start, 0.5);
});

test('topical and numeric words are flagged for the lime highlight', () => {
  const terms = emphasisTerms('Why $9.99 Feels Cheaper Than $10', 'left-digit effect');
  const cues = buildCaptionCues('Your brain reads 9.99 as a whole dollar cheaper.', {speechStart: 0, speechEnd: 3, terms});
  const words = cues.flatMap(c => c.words);
  const emphasis = words.filter(w => w.emphasis).map(w => w.text.replace(/[^\p{L}\p{N}.]/gu, '').replace(/\.$/, ''));
  assert.ok(emphasis.includes('9.99'), `price should be highlighted: ${emphasis}`);
  assert.ok(emphasis.includes('cheaper'), `topical word should be highlighted: ${emphasis}`);
  assert.equal(words.find(w => w.text === 'brain').emphasis, false);
  for (const word of words) {
    assert.equal(typeof word.start, 'number');
    assert.equal(typeof word.end, 'number');
    assert.ok(word.end >= word.start);
  }
});

test('acronyms and measured values count as topical terms', () => {
  const terms = emphasisTerms('F1 brakes and GTA VI', 'a 350–550 °C window');
  assert.ok(terms.includes('gta'));
  assert.ok(terms.includes('brakes'));
  const cues = buildCaptionCues('The GTA trailer broke records with 90 million views.', {speechStart: 0, speechEnd: 4, terms});
  const words = cues.flatMap(c => c.words);
  assert.ok(words.find(w => w.text === 'GTA').emphasis);
  assert.ok(words.find(w => w.text === '90').emphasis);
  assert.equal(words.find(w => w.text === 'trailer').emphasis, false);
});

test('word timings fall back to proportional timing when phoneme counts differ', () => {
  const words = wordTimings('one two three four', {speechStart: 0.5, speechEnd: 2.5, phonemes: [{start: 0.1, end: 0.2, phoneme: 'x'}]});
  assert.equal(words.length, 4);
  assert.ok(words[0].start >= 0.5);
  assert.ok(Math.abs(words.at(-1).end - 2.5) < 1e-6);
  for (let i = 1; i < words.length; i++) assert.ok(words[i].start >= words[i - 1].end - 1e-9);
});
