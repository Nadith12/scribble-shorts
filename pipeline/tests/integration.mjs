// Explicit local integration check. Does not use paid services or the uploader.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadConfig,ROOT} from '../config.mjs';
import {atomic,json,Budget,command} from '../io.mjs';
import {buildEpisode,runPath} from '../run.mjs';
import {prepareVisuals,planTimeline} from '../media.mjs';
import {prepareComposition,renderVideo} from '../render.mjs';
import {validateVideo} from '../quality.mjs';
import {scene,episode as fixture} from './fixtures.mjs';

const config=await loadConfig(),results={checkedAt:new Date().toISOString(),checks:[]};
const episode=await json(resolve(ROOT,'pipeline/examples/bridge-demo.json'));
const demoAsset=resolve(ROOT,'work/pipeline/demo-assets/fold-cross-section.png');
if(!existsSync(demoAsset))throw new Error('Demo illustration missing. Run "npm run demo:prepare" first (it needs paths.browser).');
const remotion=await import('remotion').then(()=>true).catch(()=>false);
const backends=remotion?['hyperframes','remotion']:['hyperframes'];
if(!remotion)results.checks.push({name:'Remotion (optional)',status:'skipped',reason:'Optional Remotion packages are not installed.'});

for(const backend of backends) {
  const result=await buildEpisode(episode,config,{offline:true,renderer:backend});
  const report=await json(resolve(result.run,'verification.json'));
  await atomic(resolve(result.run,`verification-${backend}.json`),report);
  results.checks.push({name:`Kokoro + image/diagram + ${backend}`,status:'passed',output:result.output,duration:result.timeline.duration,peakDb:report.peakDb});
}

const demoRun=runPath(episode.id),mediaRun=runPath('pipeline-media-test');await mkdir(mediaRun,{recursive:true});
const mediaConfig=structuredClone(config);mediaConfig.captions=true;
const adapter={executable:process.execPath,args:[resolve(ROOT,'pipeline/tests/mock-media-provider.mjs'),'{input}'],execution:'local',estimatedMaxCostUsd:0,model:'local-integration-fixture-v2'};
mediaConfig.video={...mediaConfig.video,enabled:true,command:adapter};mediaConfig.visuals={provider:'command',command:adapter};
const mediaEpisode=fixture();mediaEpisode.id='pipeline-media-test';
mediaEpisode.scenes=[scene('clip',{visual:{...scene().visual,kind:'video',videoJustification:'A moving test pattern verifies actual clip insertion and temporal seeking.',clipSeconds:2}}),scene('image',{visual:{...scene().visual,kind:'image'}})];
const audioFile=resolve(mediaRun,'test-audio.wav');
await command(config.paths.ffmpeg,['-nostdin','-v','error','-y','-i',resolve(demoRun,'audio/narration.wav'),'-t','6','-c:a','pcm_s16le',audioFile]);
const audio={file:audioFile,scenes:mediaEpisode.scenes.map(s=>({id:s.id,frames:90,duration:3,speechStart:0,speechEnd:3}))};
const visuals=await prepareVisuals(mediaEpisode,mediaConfig,mediaRun,{budget:new Budget(mediaConfig.external,resolve(mediaRun,'budget.json')),measuredScenes:audio.scenes});
assert.equal(visuals[0].kind,'video');assert.equal(visuals[1].kind,'image');
const timeline=planTimeline(mediaEpisode,audio,visuals,mediaConfig);
await atomic(resolve(mediaRun,'episode.json'),mediaEpisode);await atomic(resolve(mediaRun,'timeline.json'),timeline);
await prepareComposition(timeline,audio,mediaConfig,mediaRun);
for(const backend of backends) {
  const output=resolve(mediaRun,`media-${backend}.mp4`);
  await renderVideo(timeline,mediaConfig,mediaRun,output,{backend});
  const report=await validateVideo(output,timeline,mediaConfig,mediaRun,{});
  await atomic(resolve(mediaRun,`verification-${backend}.json`),report);
  const hashes=[];
  for(const t of ['0.3','1.3']){
    const result=await command(config.paths.ffmpeg,['-nostdin','-v','error','-ss',t,'-i',output,'-frames:v','1','-vf','crop=300:300:400:700','-f','md5','-']);
    hashes.push(result.stdout.trim());
  }
  assert.notEqual(hashes[0],hashes[1],`${backend} failed to advance the moving clip.`);
  results.checks.push({name:`${backend} portrait video + image + captions + temporal seeking`,status:'passed',output,duration:report.duration});
}

const legacyRun=runPath('legacy-compatibility-test');await mkdir(legacyRun,{recursive:true});
const legacy=resolve(ROOT,'outputs/Why a Raw Egg Starts Spinning Again.mp4');
if(existsSync(legacy)) {
  await validateVideo(legacy,{duration:22.8,fps:30,scenes:[]},config,legacyRun,{frames:false});
  results.checks.push({name:'Existing format-lab MP4 compatibility',status:'passed',output:legacy});
} else {
  results.checks.push({name:'Existing format-lab MP4 compatibility',status:'skipped',reason:'No sample MP4 in outputs/.'});
}
await atomic(resolve(ROOT,'work/pipeline/integration-results.json'),results);
console.log(JSON.stringify(results,null,2));
