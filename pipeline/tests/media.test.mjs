import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {defaults,ROOT} from '../config.mjs';
import {Budget} from '../io.mjs';
import {prepareVisuals} from '../media.mjs';
import {episode,scene} from './fixtures.mjs';
const base=resolve(ROOT,'work/pipeline/test-runs');await mkdir(base,{recursive:true});
const dir=()=>mkdtemp(resolve(base,'media-'));
const adapter={executable:process.execPath,args:[resolve(ROOT,'pipeline/tests/mock-media-provider.mjs'),'{input}'],execution:'local',estimatedMaxCostUsd:0,model:'mock-local-fixture'};
test('optional video failure falls back to a diagram without stopping production',async()=>{
  const config=structuredClone(defaults),run=await dir(),e=episode();
  e.scenes=[scene('clip',{visual:{...scene().visual,kind:'video',videoJustification:'A moving demonstration would clarify the action.'}})];
  config.video={...config.video,enabled:true,command:{...adapter,args:[...adapter.args,'--fail']}};
  const result=await prepareVisuals(e,config,run,{budget:new Budget(config.external,resolve(run,'budget.json'))});
  assert.equal(result[0].kind,'diagram');assert.match(result[0].events[0],/fallback/);
});
test('disabled video does not invoke a configured generation provider',async()=>{
  const config=structuredClone(defaults),run=await dir(),e=episode();e.scenes[0].visual.kind='video';
  config.video.command={...adapter,executable:'does-not-exist'};
  const result=await prepareVisuals(e,config,run,{budget:new Budget(config.external,resolve(run,'budget.json'))});
  assert.equal(result[0].kind,'diagram');assert.match(result[0].events[0],/disabled/);
});
test('local command adapters insert actual portrait video and cache normalized assets',async()=>{
  const config=structuredClone(defaults),run=await dir(),e=episode();e.scenes=[scene('clip',{visual:{...scene().visual,kind:'video',videoJustification:'A moving demonstration would clarify the action.'}})];
  config.video={...config.video,enabled:true,command:adapter};
  const result=await prepareVisuals(e,config,run,{budget:new Budget(config.external,resolve(run,'budget.json'))});
  assert.equal(result[0].kind,'video');assert.ok(result[0].asset.duration>0);assert.ok((await readFile(resolve(run,'public',result[0].asset.file))).length>1000);
});
test('image provider returns a real image usable by both compositions',async()=>{
  const config=structuredClone(defaults),run=await dir(),e=episode();e.scenes=[scene('still',{visual:{...scene().visual,kind:'image'}})];
  config.visuals={provider:'command',command:adapter};
  const result=await prepareVisuals(e,config,run,{budget:new Budget(config.external,resolve(run,'budget.json'))});
  assert.equal(result[0].kind,'image');assert.ok(result[0].asset.file.endsWith('.png'));
});
