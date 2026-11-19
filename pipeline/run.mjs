import {copyFile,mkdir,readFile,readdir,stat,open,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {basename,resolve} from 'node:path';
import {ROOT,projectPath} from './config.mjs';
import {atomic,Budget,command,digest,fileHash,json,locked,stage,inside} from './io.mjs';
import {parse,Episode} from './schema.mjs';
import {duplicateTopic,episodeIndex,verifyEvidence,discover,writeStoryboard,auditStoryboard} from './research.mjs';
import {narrate,prepareVisuals,planTimeline} from './media.mjs';
import {prepareComposition,renderVideo} from './render.mjs';
import {validateVideo,recordReview} from './quality.mjs';

export function runPath(id) {
  if(!/^[a-z][a-z0-9-]{1,70}$/.test(id))throw new Error('Invalid episode ID. Use lowercase letters, numbers and hyphens.');
  return inside(resolve(ROOT,'work/pipeline'),resolve(ROOT,'work/pipeline',id));
}
async function implementationHash() {
  const files=(await readdir(resolve(ROOT,'pipeline'))).filter(p=>/\.(mjs|js|py)$/.test(p)).sort();
  const contents=await Promise.all(files.map(p=>readFile(resolve(ROOT,'pipeline',p))));
  contents.push(await readFile(resolve(ROOT,'pipeline/remotion/index.jsx')));
  return digest(Buffer.concat(contents));
}
async function fingerprints(paths) {
  return Promise.all(paths.filter(Boolean).map(async p=>{try {const s=await stat(projectPath(p));return {path:projectPath(p),bytes:s.size,mtime:s.mtimeMs};}catch{return {path:p,missing:true};}}));
}

export async function buildEpisode(raw,config,{signal,offline=false,allowRepeat=false,renderer,stopAfter,fetchOptions={},budgetFile}={}) {
  const episode=parse(Episode,raw),run=runPath(episode.id);
  await mkdir(run,{recursive:true});
  return locked(resolve(run,'.run.lock'),async()=>{
    const old=await json(resolve(run,'episode.json'),null);
    if(old && old.title!==episode.title)throw new Error('Episode ID already belongs to another title. Use a new ID.');
    if(!episode.testOnly&&!allowRepeat) {
      const other=(await episodeIndex()).filter(e=>e.id!==episode.id);
      const duplicate=duplicateTopic(episode,other);if(duplicate)throw new Error(`Topic already exists: ${duplicate.title}. For an intentional remake use --allow-repeat.`);
    }
    await atomic(resolve(run,'episode.json'),episode);
    const savedBudget=await json(resolve(run,'budget-location.json'),{});
    const budgetPath=inside(resolve(ROOT,'work/pipeline'),budgetFile??savedBudget.path??resolve(run,'budget.json'));
    await atomic(resolve(run,'budget-location.json'),{path:budgetPath});
    const version=await implementationHash(),budget=new Budget(config.external,budgetPath);
    // Evidence is rechecked on every invocation (cached source text can be used explicitly offline).
    const evidence=await verifyEvidence(episode,config,{signal,offline,...fetchOptions});
    await atomic(resolve(run,'evidence.json'),evidence);
    if(stopAfter==='research')return {run,status:'research-checked'};
    const audio=await stage(run,'narration',{version,scenes:episode.scenes.map(({id,narration})=>({id,narration})),tts:config.tts,fps:config.fps,assets:await fingerprints([config.tts.model,config.tts.voices,config.tts.dependencies])},async()=>{
      const result=await narrate(episode,config,run,{signal,budget});
      return {result,files:[result.file,resolve(run,'audio.json'),...result.scenes.map(x=>x.file)]};
    },signal);
    if(stopAfter==='narration')return {run,status:'narration-ready'};
    const imported=await Promise.all(episode.scenes.filter(s=>s.visual.asset).map(async s=>({id:s.id,hash:await fileHash(projectPath(s.visual.asset))})));
    const visuals=await stage(run,'visuals',{version,scenes:episode.scenes.map(x=>({id:x.id,visual:x.visual})),durations:audio.scenes.map(x=>x.duration),config:{visuals:config.visuals,video:config.video,style:config.style,fps:config.fps},imported},async()=>{
      const result=await prepareVisuals(episode,config,run,{signal,budget,measuredScenes:audio.scenes});
      return {result,files:[resolve(run,'visuals.json'),...result.filter(x=>x.asset).map(x=>resolve(run,'public',x.asset.file))]};
    },signal);
    const timeline=planTimeline(episode,audio,visuals,config);
    await atomic(resolve(run,'timeline.json'),timeline);
    await prepareComposition(timeline,audio,config,run);
    if(stopAfter==='compose')return {run,status:'composition-ready',timeline};
    const backend=renderer??config.renderer;
    const output=resolve(run,`render-${backend}.mp4`);
    await stage(run,`render-${backend}`,{version,timeline,backend,audio:await fileHash(audio.file),paths:config.paths,workers:config.resources.workers},async()=>{
      await renderVideo(timeline,config,run,output,{signal,backend});return {result:output,files:[output]};
    },signal);
    const report=await json(resolve(run,'verification.json'),null);
    if(!report||report.sha256!==await fileHash(output)||report.timelineHash!==digest(timeline)||report.episodeHash!==digest(episode)){
      const checked=await validateVideo(output,timeline,config,run,{signal});
      checked.episodeHash=digest(episode);await atomic(resolve(run,'verification.json'),checked);
    }
    console.log(`Ready for visual review: ${resolve(run,'qa')}`);
    return {run,status:'awaiting-visual-review',output,timeline};
  });
}

export async function planEpisode(config,{signal,candidates,theme,id='discovery',offline=false}={}) {
  const run=runPath(id);await mkdir(run,{recursive:true});
  return locked(resolve(run,'.run.lock'),async()=>{
    const budget=new Budget(config.external,resolve(run,'budget.json'));
    const version=await implementationHash();
    const {selected,evidence}=await stage(run,'selection',{version,candidates,theme,research:config.research,catalog:await episodeIndex(),freshnessBucket:Math.floor(Date.now()/(config.research.sourceCacheHours*3600000))},async()=>{
      const result=await discover({config,budget,run,theme,signal,imported:candidates,fetchOptions:{offline}});
      return {result,files:['selection.json','selected.json','evidence.json'].map(p=>resolve(run,p))};
    },signal);
    const episode=await stage(run,'writing',{version,selected,evidence,research:config.research,style:config.style},async()=>{
      const result=await writeStoryboard({selected,evidence,config,budget,signal});
      const audit=await auditStoryboard({episode:result,evidence,config,budget,signal});
      await atomic(resolve(run,'storyboard.json'),result);
      await atomic(resolve(run,'story-review.json'),audit);
      return {result,files:[resolve(run,'storyboard.json'),resolve(run,'story-review.json')]};
    },signal);
    return {run,brief:resolve(run,'storyboard.json'),episode};
  });
}

// The user's standing rule: once an upload is verified, the local MP4 is removed permanently
// (unlink, never the Recycle Bin). Timeline, evidence, QA frames and receipts stay for records.
async function discardShort(paths) {
  const deleted=[];
  for(const path of [...new Set(paths.filter(Boolean))]){
    try{await unlink(path);deleted.push(path);}
    catch(e){if(e.code!=='ENOENT')throw new Error(`Upload verified, but ${path} could not be deleted permanently: ${e.message}`);}
  }
  return deleted;
}

export async function finishEpisode(id,config,{signal}={}) {
  const run=runPath(id);
  return locked(resolve(run,'.run.lock'),async()=>{
    const episode=parse(Episode,await json(resolve(run,'episode.json')));
    if(episode.testOnly)throw new Error('Technical validation samples cannot be promoted or uploaded as episodes.');if(!config.publication.channel)throw new Error('No YouTube channel configured. Run "node upload-youtube.mjs auth", then set publication.channel in shorts.config.local.json.');
    const report=await json(resolve(run,'verification.json'));
    const finishedPath=resolve(run,'finished.json'),finished=await json(finishedPath,null);
    const uploaded=await json(resolve(run,'upload.json'),null);
    // Re-running finish after a verified publish must not fail on files this rule already deleted;
    // it also retries a deletion that was blocked earlier.
    if(uploaded?.status==='complete'){
      if(config.publication.deleteAfterPublish!==false){
        const deleted=await discardShort([finished?.output,finished?.render,report?.file]);
        if(deleted.length&&finished)await atomic(finishedPath,{...finished,deleted:true,deletedAt:new Date().toISOString()});
      }
      return uploaded;
    }
    const timeline=await json(resolve(run,'timeline.json'));
    if(report.status!=='passed'||report.visualReview!=='passed')throw new Error('Complete technical and actual visual review before finishing.');
    if(report.sha256!==await fileHash(report.file)||report.timelineHash!==digest(timeline)||report.episodeHash!==digest(episode))throw new Error('Verified export, storyboard or timeline changed; rebuild and review.');
    await verifyEvidence(episode,config,{signal,offline:true});
    const name=episode.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'').trim().replace(/[. ]+$/g,'');
    if(!name)throw new Error('Title cannot form an output filename.');
    const output=inside(resolve(ROOT,'outputs'),resolve(ROOT,'outputs',`${name}.mp4`));
    await mkdir(resolve(ROOT,'outputs'),{recursive:true});
    try {await copyFile(report.file,output,constants.COPYFILE_EXCL);}
    catch(e){if(e.code!=='EEXIST'||await fileHash(output)!==report.sha256)throw new Error('Output already exists with different content. Existing finished files were preserved.');}
    const marker=`<!-- pipeline-episode:${episode.id} -->`;
    let project=await readFile(resolve(ROOT,'PROJECT.md'),'utf8');
    if(!project.includes(marker))await atomic(resolve(ROOT,'PROJECT.md'),project+`\n\n${marker}\n**${episode.title}** · Rendered and reviewed; ${timeline.duration.toFixed(2)}s at ${timeline.width} × ${timeline.height}, ${timeline.fps} fps. [MP4](<outputs/${basename(output)}>) · [Production records](<work/pipeline/${id}/episode.json>). Public upload is pending.\n`);
    const record={output,render:report.file,sha256:report.sha256,at:new Date().toISOString()};
    await atomic(finishedPath,record);
    const receipt=await publishEpisode(episode,output,run,config,{signal});
    if(receipt?.status==='complete'&&config.publication.deleteAfterPublish!==false){
      const deleted=await discardShort([output,report.file]);
      await atomic(finishedPath,{...record,...(deleted.length?{deleted:true,deletedAt:new Date().toISOString()}:{})});
    }
    return receipt;
  });
}

async function publishEpisode(episode,output,run,config,{signal}) {
  const path=resolve(run,'upload.json'),previous=await json(path,null);
  if(previous?.url&&previous.status==='complete')return previous;
  if(previous?.url)return verifyPublication(previous,config,run,{signal});
  if(previous)throw new Error('A previous upload may have reached YouTube. Reconcile upload.json and the channel before any retry.');
  await atomic(path,{status:'started',sha256:await fileHash(output),at:new Date().toISOString()});
  let result;
  try {
    result=await command(process.execPath,[resolve(ROOT,'upload-youtube.mjs'),'upload',output,'--channel',config.publication.channel,'--title',episode.title,'--audience',config.publication.audience,'--visibility',config.publication.visibility,
      '--description',`${episode.hook}\n\n${episode.explanation}\n\nOriginal Scribble animation. Illustrations and diagrams are simplified.\nSources:\n${episode.sources.map(s=>s.url).join('\n')}\n#Shorts #Science #Scribble`],{signal,timeoutMs:config.resources.timeoutMs,log:resolve(run,'upload.log')});
  }catch(e){await atomic(path,{status:'needs-reconciliation',error:e.message,at:new Date().toISOString()});throw e;}
  const url=(result.stdout+'\n'+result.stderr).match(/https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]+/)?.[0];
  if(!url)throw new Error('Uploader returned no URL. Inspect upload.log; do not blindly retry.');
  const receipt={status:'processing-pending',id:new URL(url).searchParams.get('v'),url,visibility:config.publication.visibility,sha256:await fileHash(output),at:new Date().toISOString()};
  await atomic(path,receipt);
  let project=await readFile(resolve(ROOT,'PROJECT.md'),'utf8');
  project+=`\nPipeline upload for **${episode.title}**: [YouTube](${url}), requested ${receipt.visibility}; processing verification pending. Receipt: work/pipeline/${episode.id}/upload.json.\n`;
  await atomic(resolve(ROOT,'PROJECT.md'),project);
  return verifyPublication(receipt,config,run,{signal});
}

export async function verifyPublication(receipt,config,run,{signal,probeStatus,wait}={}) {
  const probe=probeStatus??(async()=>{
    // Reuse the existing authenticated read implementation; do not duplicate OAuth handling.
    const response=await command(process.execPath,[resolve(ROOT,'youtube-status.mjs'),receipt.id],{signal,timeoutMs:30000,log:resolve(run,'youtube-status.log')});
    return JSON.parse(response.stdout).find(x=>x.id===receipt.id);
  });
  const delay=wait??(ms=>new Promise((done,fail)=>{
    if(signal?.aborted){fail(new Error('Cancelled while YouTube processing is pending.'));return;}
    const abort=()=>{clearTimeout(timer);fail(new Error('Cancelled while YouTube processing is pending.'));};
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);done();},ms);signal?.addEventListener('abort',abort,{once:true});
  }));
  for(let attempt=0;attempt<config.publication.processingAttempts;attempt++){
    const live=await probe();
    if(!live||live.channelId!==config.publication.channel)throw new Error('YouTube status did not identify the intended channel/video. Upload retained for reconciliation.');
    await atomic(resolve(run,'youtube-status.json'),{checkedAt:new Date().toISOString(),item:live});
    if(live.status.privacyStatus!==receipt.visibility)throw new Error('YouTube visibility differs from the requested setting. No duplicate upload will be attempted.');
    if(['failed','rejected'].includes(live.status.uploadStatus)||['failed','terminated'].includes(live.processing?.processingStatus))throw new Error('YouTube processing failed. Inspect youtube-status.json; the upload will not be repeated.');
    if(live.status.uploadStatus==='processed'&&live.processing?.processingStatus==='succeeded'){
      const result={...receipt,status:'complete',verifiedAt:new Date().toISOString()};
      await atomic(resolve(run,'upload.json'),result);
      if(!probeStatus){let project=await readFile(resolve(ROOT,'PROJECT.md'),'utf8');project+=`\nPipeline publishing verified: [YouTube](${receipt.url}), ${receipt.visibility}, upload processed and processing succeeded.\n`;await atomic(resolve(ROOT,'PROJECT.md'),project);}
      return result;
    }
    if(attempt+1<config.publication.processingAttempts)await delay(config.publication.processingIntervalMs);
  }
  throw new Error('Upload exists; YouTube processing is still pending. Run finish again to check status without uploading again.');
}

export {recordReview};
