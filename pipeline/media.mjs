import {copyFile, mkdir, readFile, stat} from 'node:fs/promises';
import {basename, extname, resolve} from 'node:path';
import {ROOT, projectPath} from './config.mjs';
import {atomic, command, digest, fileHash, json, checkAbort} from './io.mjs';
import {runAdapter} from './providers.mjs';
import {buildCaptionCues, emphasisTerms} from './captions.mjs';

export async function probe(path, config, signal) {
  const {stdout} = await command(config.paths.ffprobe, ['-v','error','-show_streams','-show_format','-of','json',path], {signal, timeoutMs: 30000});
  return JSON.parse(stdout);
}

export async function narrate(episode, config, run, {signal, budget}) {
  const directory = resolve(run, 'audio'); await mkdir(directory, {recursive: true});
  let records;
  if (config.tts.provider === 'kokoro') {
    const request = resolve(run, 'voice.request.json'), result = resolve(run, 'voice.result.json');
    const settings = {...config.tts, ...Object.fromEntries(['model','voices','dependencies'].map(k => [k, projectPath(config.tts[k])]))};
    await atomic(request, {config: settings, directory, result, ffmpeg: config.paths.ffmpeg, scenes: episode.scenes.map(({id,narration}) => ({id,narration}))});
    await command(config.paths.python, [resolve(ROOT,'pipeline/kokoro.py'), request], {signal, timeoutMs: config.resources.timeoutMs, log: resolve(run,'voice.log')});
    records = (await json(result)).scenes;
  } else {
    records = [];
    for (const scene of episode.scenes) {
      const imported = await runAdapter(config.tts.command, {text: scene.narration, voice: config.tts.voice, speed: config.tts.speed, extension: 'wav'}, {run: directory, name: scene.id, budget, signal, timeoutMs: config.resources.timeoutMs, kind: 'voice'});
      const normalized = resolve(directory, `${scene.id}-normalized.wav`);
      await command(config.paths.ffmpeg, ['-nostdin','-v','error','-y','-i',imported,'-af',`highpass=f=72,loudnorm=I=${config.tts.targetLufs}:TP=${config.tts.truePeak}:LRA=9`,'-ar','48000','-ac','1',normalized], {signal, timeoutMs: 120000});
      const meta = await probe(normalized,config,signal);
      records.push({id: scene.id, file: normalized, duration: Number(meta.format.duration), phonemes: [], speechStart: 0, speechEnd: Number(meta.format.duration)});
    }
  }
  if (records.length !== episode.scenes.length || records.some((r,i) => r.id !== episode.scenes[i].id || !(r.duration > 0))) throw new Error('Narration result does not match storyboard scenes.');
  // Pad each actual audio segment to a whole frame, then concatenate. No guessed scene durations.
  const padded = [];
  for (const record of records) {
    const frames = Math.ceil(record.duration * config.fps - 1e-6);
    const duration = frames / config.fps;
    const file = resolve(directory, `${record.id}-padded.wav`);
    await command(config.paths.ffmpeg, ['-nostdin','-v','error','-y','-i',record.file,'-af',`apad=whole_dur=${duration}`,'-t',String(duration),'-ar','48000','-ac','1','-c:a','pcm_s16le',file], {signal, timeoutMs: 120000});
    padded.push({...record, file, frames, duration});
  }
  // Concat protocol stays within generated workspace paths; no shell interpolation.
  const list = resolve(directory, 'concat.txt');
  await atomic(list, padded.map(r => `file '${r.file.replaceAll('\\','/').replaceAll("'", "'\\''")}'`).join('\n'));
  const combined = resolve(directory,'narration.wav');
  await command(config.paths.ffmpeg, ['-nostdin','-v','error','-y','-f','concat','-safe','0','-i',list,'-c:a','pcm_s16le',combined], {signal, timeoutMs: 120000});
  await atomic(resolve(run, 'audio.json'), {file: combined, scenes: padded});
  return {file: combined, scenes: padded};
}

async function cacheAsset(path, config, publicDir, signal, kind, maxSeconds, holdSeconds=0) {
  const size = (await stat(path)).size;
  if (size > config.resources.maxAssetBytes || !size) throw new Error('Visual asset exceeds byte limit or is empty.');
  if (kind === 'image' && !['.png','.jpg','.jpeg','.webp'].includes(extname(path).toLowerCase())) throw new Error('Imported images must be PNG/JPEG/WebP. SVG diagrams are generated programmatically.');
  const meta = await probe(path, config, signal);
  const video = meta.streams.find(s => s.codec_type === 'video');
  if (!video?.width || !video.height) throw new Error('Visual has no usable image/video stream.');
  if (kind === 'video' && !(Number(meta.format.duration) >= .5)) throw new Error('Clip duration is missing or too short.');
  if (kind === 'video' && video.width / video.height > 1) throw new Error('Generated clips must be portrait or square; fallback used.');
  const key = digest({hash: await fileHash(path), kind, maxSeconds, holdSeconds, fps: config.fps});
  const ext = kind === 'video' ? '.mp4' : '.png';
  const cached = resolve(ROOT, 'work/pipeline/cache/assets', key + ext);
  const receipt = await json(cached + '.json', null);
  let reusable = false;
  if (receipt) {try {reusable = receipt.hash === await fileHash(cached);} catch {}}
  if (!reusable) {
    await mkdir(resolve(ROOT, 'work/pipeline/cache/assets'), {recursive: true});
    const args = ['-nostdin','-v','error','-y','-i',path];
    if (kind === 'video') args.push('-t',String(holdSeconds||maxSeconds),'-an','-vf',`trim=duration=${maxSeconds},setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=${config.fps},tpad=stop_mode=clone:stop_duration=${holdSeconds}`,'-c:v','libx264','-pix_fmt','yuv420p','-crf','20');
    else args.push('-frames:v','1','-vf','scale=1080:1920:force_original_aspect_ratio=decrease');
    args.push(cached);
    await command(config.paths.ffmpeg,args,{signal,timeoutMs:120000});
    await atomic(cached+'.json',{hash:await fileHash(cached)});
  }
  await copyFile(cached,resolve(publicDir,basename(cached)));
  return {file: basename(cached), hash: await fileHash(cached), width: video.width, height: video.height, ...(kind === 'video' ? {duration: holdSeconds||Math.min(maxSeconds,Number(meta.format.duration))} : {})};
}

export async function prepareVisuals(episode, config, run, {signal, budget, measuredScenes=[]}) {
  const publicDir=resolve(run,'public'); await mkdir(publicDir,{recursive:true});
  const records=[];
  for (const scene of episode.scenes) {
    checkAbort(signal);
    const visual=scene.visual, result={id:scene.id,kind:'diagram',asset:null,events:[]};
    const request = {prompt: visual.prompt, style: config.style, aspectRatio:'9:16', seconds: Math.min(visual.clipSeconds,config.video.maxDuration), extension:visual.kind==='video'?'mp4':'png', model: visual.kind==='video'?config.video.command?.model:config.visuals.command?.model};
    let source;
    try {
      if (visual.asset) source=projectPath(visual.asset);
      else if (visual.kind==='video' && config.video.enabled && config.video.command) source=await runAdapter(config.video.command,request,{run,name:`visual-${scene.id}`,budget,signal,timeoutMs:config.resources.timeoutMs,kind:'video'});
      else if (visual.kind==='image' && config.visuals.provider==='command') source=await runAdapter(config.visuals.command,request,{run,name:`visual-${scene.id}`,budget,signal,timeoutMs:config.resources.timeoutMs,kind:'image'});
      if (source && (visual.kind!=='video' || config.video.enabled || visual.asset)) {
        result.asset=await cacheAsset(source,config,publicDir,signal,visual.kind,request.seconds,measuredScenes.find(x=>x.id===scene.id)?.duration??0);
        result.kind=visual.kind;
      } else if (visual.kind!=='diagram') result.events.push(`${visual.kind} unavailable/disabled; explanatory diagram used.`);
    } catch (e) {
      if(signal?.aborted)throw e;
      result.events.push(`${visual.kind} failed: ${e.message}; fallback used.`);
      if(visual.kind==='video'&&visual.fallback==='image'&&config.visuals.provider==='command') {
        try {
          const still=await runAdapter(config.visuals.command,{...request,extension:'png'},{run,name:`fallback-${scene.id}`,budget,signal,timeoutMs:config.resources.timeoutMs,kind:'image'});
          result.asset=await cacheAsset(still,config,publicDir,signal,'image');result.kind='image';
        }catch(fallback){if(signal?.aborted)throw fallback;result.events.push(`Image fallback failed: ${fallback.message}; diagram used.`);}
      }
    }
    records.push(result);
  }
  await atomic(resolve(run,'visuals.json'),records);
  return records;
}

export function planTimeline(episode,audio,visuals,config) {
  let frame=0;
  const scenes=episode.scenes.map((scene,i)=>{
    const segment=audio.scenes[i];
    if(segment.id!==scene.id||!Number.isInteger(segment.frames)||segment.frames<1)throw new Error('Missing measured narration timing.');
    const result={...scene, visual:{...scene.visual, ...visuals[i]}, from:frame, frames:segment.frames,
      speechStart:segment.speechStart, speechEnd:segment.speechEnd,
      caption:config.captions?scene.narration:'',
      captions:config.captions?buildCaptionCues(scene.narration,{speechStart:segment.speechStart,speechEnd:segment.speechEnd,phonemes:segment.phonemes,terms:emphasisTerms(scene.visual.heading,scene.onScreenText),strongTerms:emphasisTerms(scene.visual.items?.map(item=>item.label))}):[],
      transitionFrames:scene.transition==='cut'?0:Math.min(Math.round(config.fps*.22),Math.floor(segment.frames*.12))};
    frame+=segment.frames;return result;
  });
  return {schemaVersion:1,id:episode.id,title:episode.title,testOnly:episode.testOnly,fps:config.fps,width:config.width,height:config.height,
    durationInFrames:frame,duration:frame/config.fps,audio:'narration.wav',style:config.style,animationIntensity:config.animationIntensity,
    scenes, warnings: frame/config.fps<config.minDuration||frame/config.fps>config.maxDuration?[`Runtime ${(frame/config.fps).toFixed(2)}s is outside target ${config.minDuration}–${config.maxDuration}s; review pacing instead of time-stretching.`]:[]};
}
