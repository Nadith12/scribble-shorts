import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {loadConfig,ROOT} from '../config.mjs';
import {json,atomic} from '../io.mjs';
import {finalizeNarration} from '../render.mjs';
import {validateVideo} from '../quality.mjs';
const config=await loadConfig(),results=await json(resolve(ROOT,'work/pipeline/integration-results.json'));
for(const[id,file]of [['pipeline-bridge-demo','render-remotion.mp4'],['pipeline-media-test','media-remotion.mp4']]){
  const run=resolve(ROOT,'work/pipeline',id),timeline=await json(resolve(run,'timeline.json')),path=resolve(run,file);
  await finalizeNarration(path,resolve(run,'public/narration.wav'),timeline,config,run,{});
  const report=await validateVideo(path,timeline,config,run,{});
  assert.ok(report.peakDb>-2.1&&report.peakDb<-.5,'Delivery must preserve the normalized, unclipped narration level.');
  await atomic(resolve(run,'verification-remotion.json'),report);
  results.checks.push({name:`FFmpeg measured narration delivery: ${id}`,status:'passed',output:path,peakDb:report.peakDb});
}
await atomic(resolve(ROOT,'work/pipeline/integration-results.json'),results);
console.log('Remotion delivery audio: both samples passed normalization, duration and decode checks.');
