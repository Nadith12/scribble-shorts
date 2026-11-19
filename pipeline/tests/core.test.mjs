import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {defaults,loadConfig,merge,ROOT} from '../config.mjs';
import {atomic,Budget,command,fileHash,json,stage,inside} from '../io.mjs';
import {Episode,Candidates,parse,jsonSchema} from '../schema.mjs';
import {duplicateTopic,rankCandidates,fetchSource,verifyEvidence,discover,safeSourceUrl} from '../research.mjs';
import {generateStructured} from '../providers.mjs';
import {planTimeline} from '../media.mjs';
import {planEpisode,runPath,finishEpisode,recordReview,verifyPublication} from '../run.mjs';
import {digest} from '../io.mjs';
import {candidate,episode,sourceHtml,scene} from './fixtures.mjs';

const base=resolve(ROOT,'work/pipeline/test-runs');await mkdir(base,{recursive:true});
const temp=()=>mkdtemp(resolve(base,'test-'));
const clone=()=>structuredClone(defaults);
const fetchOk=async()=>new Response(sourceHtml,{headers:{'content-type':'text/html'}});

test('strict storyboards reject unknown fields, duplicate IDs and dangling evidence',()=>{
  assert.equal(parse(Episode,episode()).scenes.length,2);
  assert.throws(()=>parse(Episode,{...episode(),surpriseField:true}),/Unrecognized/);
  const e=episode();e.scenes[1].id=e.scenes[0].id;assert.throws(()=>parse(Episode,e),/Duplicate scenes/);
  const bad=episode();bad.scenes[0].claimIds=['imaginary'];assert.throws(()=>parse(Episode,bad),/Unknown claim/);
  assert.ok(jsonSchema(Episode).properties.scenes);
});
test('video requires justification and imported assets require credit and rights',()=>{
  const e=episode();e.scenes[0].visual.kind='video';assert.throws(()=>parse(Episode,e),/justify video/);
  e.scenes[0].visual.videoJustification='Moving footage demonstrates the action.';e.scenes[0].visual.asset='asset.mp4';assert.throws(()=>parse(Episode,e),/usage rights/);
});
test('duplicate topics include aliases and close title variations',()=>{
  assert.ok(duplicateTopic(candidate(),[{title:'Paper shapes',topicKey:'other',aliases:['folded paper bridge']}]));
  assert.ok(duplicateTopic(candidate(),[{title:'Why Folding Paper Makes a Stronger Bridge',topicKey:'old',aliases:[]}]));
  assert.equal(duplicateTopic(candidate(),[{title:'Why Mars Has Blue Sunsets',topicKey:'mars',aliases:[]}]),undefined);
});
test('ranked selection uses all five appeal dimensions',()=>{
  const high=candidate({id:'strong'}),low=candidate({id:'weak',scores:{recognition:1,surprise:1,visual:1,simplicity:1,payoff:1}});
  assert.equal(rankCandidates([low,high])[0].id,'strong');
});
test('public source fetching strips instructions/scripts, caches evidence and detects corruption',async()=>{
  const dir=await temp(),config=clone(),source=candidate().sources[0];let calls=0;
  const options={cacheRoot:dir,fetchImpl:async()=>{calls++;return fetchOk();}};
  const record=await fetchSource(source,config,options);assert.ok(record.text.includes('resistant to bending'));
  assert.equal((await fetchSource(source,config,{...options,offline:true})).textHash,record.textHash);assert.equal(calls,1);
  const files=await import('node:fs/promises').then(x=>x.readdir(dir));
  await atomic(resolve(dir,files[0]),{...record,text:'tampered'});
  await assert.rejects(fetchSource(source,config,{...options,offline:true}),/No valid cached evidence/);
});
test('unsupported verdicts and fabricated quotes cannot pass research',async()=>{
  const dir=await temp(),config=clone(),options={cacheRoot:dir,fetchImpl:fetchOk};
  const checked=await verifyEvidence(candidate(),config,options);assert.equal(checked.checks.length,1);
  const e=candidate();e.claims[0].evidence[0].quote='This fabricated claim does not appear anywhere in the source.';
  await assert.rejects(verifyEvidence(e,config,options),/Evidence quote/);
  const held=candidate();held.claims[0].verdict='unresolved';await assert.rejects(verifyEvidence(held,config,options),/unresolved/);
});
test('source redirects and unsupported source types fail closed',async()=>{
  assert.throws(()=>safeSourceUrl('file:///C:/secret'),/Invalid source/);
  assert.throws(()=>safeSourceUrl('https://127.0.0.1/source'),/public HTTPS/);
  const config=clone();config.resources.retries=0;
  await assert.rejects(fetchSource(candidate().sources[0],config,{cacheRoot:await temp(),fetchImpl:async()=>new Response('',{status:302,headers:{location:'http://127.0.0.1/'}})}),/public HTTPS/);
  await assert.rejects(fetchSource(candidate().sources[0],config,{cacheRoot:await temp(),fetchImpl:async()=>new Response('pdf',{headers:{'content-type':'application/pdf'}})}),/readable HTML/);
});
test('candidate comparison rejects duplicate and unsupported options before selecting',async()=>{
  const dir=await temp(),config=clone();
  const good=candidate({id:'new-option',title:'A completely new fixture mechanism',topicKey:'unique-test-topic',aliases:[]});
  const duplicate=candidate();
  const budget=new Budget(config.external,resolve(dir,'budget.json'));
  const result=await discover({config,budget,run:dir,imported:{candidates:[duplicate,good]},fetchOptions:{cacheRoot:resolve(dir,'sources'),fetchImpl:fetchOk}});
  assert.equal(result.selected.id,'new-option');assert.ok((await json(resolve(dir,'selection.json'))).rejected.length);
});
test('external budget is opt-in, bounded, persistent, and never refunded on failure',async()=>{
  const dir=await temp(),path=resolve(dir,'budget.json');
  await assert.rejects(new Budget(defaults.external,path).reserve('video',.01,'test'),/disabled/);
  const config={...defaults.external,enabled:true,maxCostUsd:.05,maxRequests:2};
  await new Budget(config,path).reserve('text',.03,'first');
  await assert.rejects(new Budget(config,path).reserve('text',.03,'second'),/cost budget/);
  await assert.rejects(new Budget(config,path).reserve('text',null,'unknown'),/bounded estimated cost/);
  assert.equal((await json(path)).reservations.length,1);
});
test('Responses API adapter uses configured model and strict local validation with mock transport',async()=>{
  const config=clone(),dir=await temp();config.external.enabled=true;config.research={...config.research,provider:'responses',routineModel:'account-configured-sol',keyEnv:'SHORTS_TEST_API_KEY',estimatedMaxCostUsd:0};
  const old=process.env.SHORTS_TEST_API_KEY;process.env.SHORTS_TEST_API_KEY='fixture-not-a-real-key';
  try {
    let body;
    const result=await generateStructured({config,schema:Candidates,task:'Return candidates',data:{},budget:new Budget(config.external,resolve(dir,'budget.json')),fetchImpl:async(url,options)=>{
      body=JSON.parse(options.body);assert.equal(new URL(url).pathname,'/v1/responses');
      return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({candidates:[candidate(),candidate({id:'other'})]})}]}]}),{headers:{'content-type':'application/json'}});
    }});
    assert.equal(result.data.candidates.length,2);assert.equal(body.model,'account-configured-sol');assert.equal(body.store,false);assert.equal(body.text.format.type,'json_schema');
    config.research.routineModel='';await assert.rejects(generateStructured({config,schema:Candidates,task:'x',data:{},budget:new Budget(config.external,resolve(dir,'budget.json'))}),/model ID/);
  }finally{if(old===undefined)delete process.env.SHORTS_TEST_API_KEY;else process.env.SHORTS_TEST_API_KEY=old;}
});
test('timeline uses measured scene lengths, contiguous integer frames and optional speech-bound captions',()=>{
  const e=parse(Episode,episode()),config=clone();config.captions=false;const records=e.scenes.map((s,i)=>({id:s.id,frames:i?131:103,duration:(i?131:103)/30,speechStart:.12,speechEnd:i?4.1:3.2}));
  const visuals=e.scenes.map(s=>({id:s.id,kind:'diagram',asset:null,events:[]}));
  const t=planTimeline(e,{scenes:records},visuals,config);assert.equal(t.durationInFrames,234);assert.equal(t.scenes[1].from,103);assert.equal(t.scenes[0].caption,'');
  config.captions=true;const c=planTimeline(e,{scenes:records},visuals,config).scenes[0];assert.equal(c.caption,e.scenes[0].narration);assert.ok(c.captions.length>0);assert.equal(c.captions.map(x=>x.text).join(' '),e.scenes[0].narration.replace(/\s+/g,' '));
});
test('resume verifies content hashes, reuses successes, and invalidates changed inputs or artifacts',async()=>{
  const dir=await temp(),path=resolve(dir,'artifact');let calls=0;
  const fn=async()=>{calls++;await atomic(path,'rendered');return{result:'done',files:[path]};};
  await stage(dir,'render',{version:1},fn);await stage(dir,'render',{version:1},fn);assert.equal(calls,1);
  await writeFile(path,'corrupt');await stage(dir,'render',{version:1},fn);assert.equal(calls,2);
  await stage(dir,'render',{version:2},fn);assert.equal(calls,3);
});
test('failed stages are recorded and retry from retained intermediates',async()=>{
  const dir=await temp();await assert.rejects(stage(dir,'assets',{},async()=>{throw new Error('provider unavailable');}),/unavailable/);
  assert.equal((await json(resolve(dir,'assets.stage.json'))).status,'failed');
  const file=resolve(dir,'kept');await atomic(file,'ok');
  assert.equal(await stage(dir,'assets',{},async()=>({result:'recovered',files:[file]})),'recovered');
});
test('timeouts and cancellation stop commands and report actionable failures',async()=>{
  await assert.rejects(command(process.execPath,['-e','setInterval(()=>{},1000)'],{timeoutMs:80}),/Timed out/);
  const abort=new AbortController();abort.abort();await assert.rejects(command(process.execPath,['-e',''],{signal:abort.signal}),/Cancelled/);
  assert.throws(()=>inside(base,resolve(ROOT,'PROJECT.md')),/escapes workspace/);
});
test('planning caches successful source selection and writing instead of repeating API requests',async()=>{
  const config=clone();config.external.enabled=true;
  config.research={...config.research,provider:'responses',routineModel:'configured-test-model',estimatedMaxCostUsd:0,keyEnv:'SHORTS_TEST_API_KEY'};
  const id='plan-cache-test-'+Date.now(),selected=candidate({id:'unique-planned-fixture',title:'A unique planning fixture question',topicKey:'unique-planning-fixture',aliases:[]});
  const written={...selected,schemaVersion:1,testOnly:false,scenes:[scene(),scene('payoff')]};
  const oldKey=process.env.SHORTS_TEST_API_KEY,oldFetch=globalThis.fetch;let requests=0;
  process.env.SHORTS_TEST_API_KEY='mock-only';
  globalThis.fetch=async(url,options)=>{
    if(String(url).endsWith('/responses')){requests++;const auditing=JSON.parse(options.body).input.startsWith('Audit the FINAL');return new Response(JSON.stringify({status:'completed',output_text:JSON.stringify(auditing?{decision:'approved',findings:[],reviewedClaimIds:['fold-strength']}:written)}));}
    return fetchOk();
  };
  try{
    const options={id,candidates:{candidates:[candidate(),selected]}};
    const first=await planEpisode(config,options),second=await planEpisode(config,options);
    assert.equal(first.episode.id,selected.id);assert.equal(second.episode.id,selected.id);assert.equal(requests,2);
  }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.SHORTS_TEST_API_KEY;else process.env.SHORTS_TEST_API_KEY=oldKey;}
});
test('even a supported topic is rejected when a core appeal dimension is weak',async()=>{
  const config=clone(),run=await temp(),weak=candidate({id:'weak-premise',title:'Unique weak test premise',topicKey:'unique-weak-topic',aliases:[],scores:{recognition:5,surprise:5,visual:0,simplicity:5,payoff:5}});
  await assert.rejects(discover({config,budget:new Budget(config.external,resolve(run,'budget.json')),run,imported:{candidates:[candidate(),weak]},fetchOptions:{fetchImpl:fetchOk,cacheRoot:resolve(run,'sources')}}),/No candidate/);
  assert.ok((await json(resolve(run,'selection.json'))).rejected.some(r=>r.reason.includes('core appeal')));
});
test('review is bound to the actual export, storyboard and timeline hashes',async()=>{
  const run=await temp(),file=resolve(run,'render.mp4'),e=episode(),timeline={id:e.id};
  await atomic(file,'fixture video bytes');await atomic(resolve(run,'episode.json'),e);await atomic(resolve(run,'timeline.json'),timeline);
  const frame=resolve(run,'frame.jpg');await atomic(frame,'fixture frame bytes');
  await atomic(resolve(run,'verification.json'),{status:'passed',file,sha256:await fileHash(file),timelineHash:digest(timeline),episodeHash:digest(e),snapshots:[{path:frame,sha256:await fileHash(frame)}]});
  await recordReview(run,{reviewer:'fixture',notes:'Test review record'});
  await atomic(resolve(run,'episode.json'),{...e,title:'Edited after verification'});
  await assert.rejects(recordReview(run,{reviewer:'fixture',notes:'Must not accept stale review'}),/changed after/);
});
test('technical samples cannot reach output promotion or the public uploader',async()=>{
  const e=episode();e.id='unpublishable-test-'+Date.now();const run=runPath(e.id);await atomic(resolve(run,'episode.json'),e);
  await assert.rejects(finishEpisode(e.id,clone()),/cannot be promoted or uploaded/);
});
test('concurrent reservations cannot bypass the shared request budget',async()=>{
  const path=resolve(await temp(),'budget.json'),config={...defaults.external,enabled:true,maxRequests:1};
  const settled=await Promise.allSettled([new Budget(config,path).reserve('text',0,'one'),new Budget(config,path).reserve('text',0,'two')]);
  assert.equal(settled.filter(x=>x.status==='fulfilled').length,1);assert.equal((await json(path)).reservations.length,1);
});
test('publication is complete only after intended-channel visibility and successful processing are verified',async()=>{
  const config=clone(),run=await temp(),receipt={id:'fixture-id',url:'https://www.youtube.com/watch?v=fixture-id',visibility:'public',status:'processing-pending'};let calls=0;
  const result=await verifyPublication(receipt,config,run,{probeStatus:async()=>({id:receipt.id,channelId:config.publication.channel,status:{privacyStatus:'public',uploadStatus:++calls>1?'processed':'uploaded'},processing:{processingStatus:calls>1?'succeeded':'processing'}}),wait:async()=>{}});
  assert.equal(result.status,'complete');assert.equal(calls,2);
  await assert.rejects(verifyPublication(receipt,config,run,{probeStatus:async()=>({channelId:'wrong',status:{privacyStatus:'public'}})}),/intended channel/);
});
