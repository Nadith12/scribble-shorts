import {readFile,copyFile,mkdir,stat,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {ROOT,projectPath} from './config.mjs';
import {atomic,command,checkAbort,inside} from './io.mjs';

const htmlEscape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function prepareComposition(timeline,audio,config,run) {
  const publicDir=resolve(run,'public');await mkdir(publicDir,{recursive:true});
  for(const[name,path]of [['narration.wav',audio.file],['inter-bold.woff2',projectPath(config.paths.font)],['scribble.js',projectPath(config.paths.scribble)],['gsap.min.js',projectPath(config.paths.gsap)],['scene-art.js',resolve(ROOT,'pipeline/scene-art.js')]])await copyFile(path,resolve(publicDir,name));
  await atomic(resolve(publicDir,'timeline.json'),timeline);
  const mediaMarkup=timeline.scenes.filter(s=>s.visual.asset).map(s=>s.visual.kind==='video'
    ? `<video id="media-${s.id}" class="scene-media" src="public/${htmlEscape(s.visual.asset.file)}" muted preload="auto" data-start="${s.from/timeline.fps}" data-duration="${s.frames/timeline.fps}" data-media-start="0" data-track-index="0"></video>`
    : `<img id="media-${s.id}" class="scene-media" src="public/${htmlEscape(s.visual.asset.file)}"/>`).join('');
  const encoded=JSON.stringify(timeline).replaceAll('<','\\u003c');
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>${htmlEscape(timeline.title)}</title><script src="public/gsap.min.js"></script><script src="public/scribble.js"></script><script src="public/scene-art.js"></script><style>
  @font-face{font-family:Inter;src:url('public/inter-bold.woff2')}*{box-sizing:border-box}body{margin:0;overflow:hidden}#root{position:relative;width:1080px;height:1920px;font-family:Inter,sans-serif;background:radial-gradient(ellipse at 65% 30%,#fff,${timeline.style.background});color:${timeline.style.ink}}#art,#host,#media-layer{position:absolute;inset:0;width:1080px;height:1920px}#art{transform-origin:50% 48%}.scene-media{position:absolute;left:75px;top:445px;width:930px;height:870px;object-fit:contain;border-radius:34px;visibility:hidden}.scene-media video{object-fit:cover}#heading{position:absolute;left:90px;top:225px;right:105px;font-size:57px;line-height:1.12;font-weight:700;text-shadow:0 2px 4px #0000002b,0 7px 20px #00000014}#label{position:absolute;left:390px;right:110px;top:1460px;font-size:36px;line-height:1.2;color:${timeline.style.accent};text-shadow:0 1px 0 #ffffff,0 3px 9px #0000001f}#credit{position:absolute;left:90px;right:130px;top:1660px;font-size:21px;color:#625c68;text-shadow:0 1px 2px #ffffffc0}#caption{position:absolute;left:300px;right:90px;bottom:320px;padding:14px 22px;background:#ffffff;border:2px solid #007e8430;box-shadow:0 10px 30px #0000001c,0 2px 6px #00000012;font-size:40px;line-height:1.18;font-weight:700;letter-spacing:-.5px;text-align:center;border-radius:16px;text-shadow:0 1px 2px #00000012}#test{position:absolute;left:90px;top:140px;font-size:22px;letter-spacing:2px;color:#625c68;text-shadow:0 1px 2px #ffffffc0}</style></head><body><main id="root" data-composition-id="${timeline.id}" data-duration="${timeline.duration}" data-start="0" data-fps="${timeline.fps}" data-width="1080" data-height="1920"><div id="scene"><div id="art"></div><div id="media-layer">${mediaMarkup}</div><div id="heading"></div><div id="label"></div><div id="credit"></div><div id="caption"></div></div><svg id="host" viewBox="0 0 1080 1920"></svg><div id="test">${timeline.testOnly?'PIPELINE VALIDATION SAMPLE':''}</div><audio id="narration" src="public/narration.wav" data-start="0" data-duration="${timeline.duration}" data-track-index="1" data-volume="1"></audio></main><script>
  const timeline=${encoded},el=id=>document.getElementById(id),host=Scribble.create(el('host'));window.__timelines={};
  window.renderFrame=function(seconds){const frame=Math.min(timeline.durationInFrames-1,Math.max(0,Math.floor(seconds*timeline.fps+0.0001)));const scene=timeline.scenes.find(s=>frame>=s.from&&frame<s.from+s.frames);if(!scene)return;const local=frame-scene.from,state=ScribbleScene.state(scene,local,timeline);el('art').innerHTML=scene.visual.asset?'':state.svg;el('art').style.transform=state.transform;el('scene').style.opacity=state.opacity;el('heading').textContent=scene.visual.heading;el('label').textContent=scene.captions?.length?'':scene.onScreenText;el('caption').innerHTML=state.caption?ScribbleScene.captionHtml(state.caption):'';el('caption').style.display=state.caption?'block':'none';el('credit').textContent=(scene.visual.kind==='video'&&scene.visual.illustrative?'AI-generated illustration · ':'')+(scene.visual.credit||'Animated explanation · diagram simplified');host.place(state.host);host.at(state.motion,state.hostTime);
  el('media-layer').style.transform=state.transform;
  document.querySelectorAll('.scene-media').forEach(element=>{element.style.visibility=element.id==='media-'+scene.id?'visible':'hidden';});
  };const clock={time:0};const tl=gsap.timeline({paused:true});tl.to(clock,{time:timeline.duration,duration:timeline.duration,ease:'none',onUpdate:()=>renderFrame(clock.time)});window.__timelines[timeline.id]=tl;renderFrame(0);</script></body></html>`;
  await atomic(resolve(run,'index.html'),html);
  return resolve(run,'index.html');
}

export async function renderVideo(timeline,config,run,output,{signal,backend=config.renderer}={}) {
  checkAbort(signal);await mkdir(resolve(output,'..'),{recursive:true});
  // Render to an intermediate target; promotion happens only after validation.
  if(backend==='hyperframes') {
    await command(process.execPath,[projectPath(config.paths.hyperframes),'render',run,'--output',output,'--workers',String(config.resources.workers),'--quality','high','--strict'],{
      signal,timeoutMs:config.resources.timeoutMs,log:resolve(run,'render-hyperframes.log'),cwd:ROOT,
      env:{HYPERFRAMES_CONFIG_DIR:resolve(ROOT,'work/hyperframes-config'),HYPERFRAMES_CACHE_DIR:resolve(ROOT,'work/hyperframes-cache'),HYPERFRAMES_NO_TELEMETRY:'1',...(config.paths.browser?{HYPERFRAMES_BROWSER_PATH:projectPath(config.paths.browser)}:{})},
    });
  } else if(backend==='remotion') {
    const {bundle}=await import('@remotion/bundler').catch(()=>{throw new Error('Remotion is optional. Install optional npm dependencies or use --renderer hyperframes.');});
    const {renderMedia,selectComposition,makeCancelSignal}=await import('@remotion/renderer');
    const serveUrl=await bundle({entryPoint:resolve(ROOT,'pipeline/remotion/index.jsx'),outDir:resolve(run,'bundle'),publicDir:resolve(run,'public'),onProgress:()=>{}});
    checkAbort(signal);
    const {cancelSignal,cancel}=makeCancelSignal();
    let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;cancel();},config.resources.timeoutMs);
    const abort=()=>cancel();signal?.addEventListener('abort',abort,{once:true});
    try {
      const inputProps={timeline};
      const composition=await selectComposition({serveUrl,id:'ScribbleShort',inputProps,browserExecutable:projectPath(config.paths.browser)});
      await renderMedia({serveUrl,composition,inputProps,codec:'h264',audioCodec:'aac',pixelFormat:'yuv420p',crf:18,
        outputLocation:output,concurrency:config.resources.workers,browserExecutable:projectPath(config.paths.browser),cancelSignal,
        chromiumOptions:{gl:'swangle'},logLevel:'warn',muted:true,
      });
    }catch(e){if(timedOut)throw new Error('Remotion render timed out; intermediates retained.');throw e;}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
    await finalizeNarration(output,resolve(run,'public/narration.wav'),timeline,config,run,{signal});
  } else throw new Error(`Unknown renderer: ${backend}`);
  if(!(await stat(output)).size)throw new Error('Renderer produced an empty file.');
  return output;
}

export async function finalizeNarration(output,audio,timeline,config,run,{signal}={}) {
  const delivery=inside(run,output+'.delivery.mp4');
  // The composition previews audio, but FFmpeg owns delivery audio. Preserve the measured,
  // normalized mono narration instead of accepting a renderer-specific stereo downmix.
  await command(config.paths.ffmpeg,['-nostdin','-v','error','-y','-i',output,'-i',audio,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-t',String(timeline.duration),'-movflags','+faststart',delivery],{signal,timeoutMs:config.resources.timeoutMs,log:resolve(run,'delivery-audio.log')});
  checkAbort(signal);await rename(delivery,output);return output;
}
