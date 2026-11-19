import {mkdir,stat,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {atomic,command,fileHash,digest,json} from './io.mjs';
import {probe} from './media.mjs';

export async function validateVideo(file,timeline,config,run,{signal,frames=true}={}) {
  const metadata=await probe(file,config,signal);
  const video=metadata.streams.find(s=>s.codec_type==='video'),audio=metadata.streams.find(s=>s.codec_type==='audio');
  if(!video||!audio)throw new Error('Final video must contain video and narration streams.');
  // FFprobe calls full-range 8-bit 4:2:0 "yuvj420p"; Remotion may emit that valid H.264 variant.
  if(video.codec_name!=='h264'||audio.codec_name!=='aac'||!['yuv420p','yuvj420p'].includes(video.pix_fmt))throw new Error('Expected H.264 8-bit 4:2:0 video and AAC audio.');
  if(video.width!==config.width||video.height!==config.height)throw new Error('Unexpected output dimensions.');
  const[n,d]=video.r_frame_rate.split('/').map(Number);
  if(Math.abs(n/d-timeline.fps)>.001)throw new Error('Unexpected frame rate.');
  const duration=Number(metadata.format.duration), videoDuration=Number(video.duration),audioDuration=Number(audio.duration);
  if(Math.abs(duration-timeline.duration)>.12||Math.abs(videoDuration-audioDuration)>.12)throw new Error('Audio/video duration does not match the measured timeline.');
  const decode=await command(config.paths.ffmpeg,['-nostdin','-v','error','-i',file,'-f','null','-'],{signal,timeoutMs:config.resources.timeoutMs,log:resolve(run,'decode.log')});
  if(decode.stderr.trim())throw new Error('FFmpeg reported decode errors; inspect decode.log.');
  const level=await command(config.paths.ffmpeg,['-nostdin','-hide_banner','-i',file,'-vn','-af','volumedetect','-f','null','-'],{signal,timeoutMs:120000,log:resolve(run,'levels.log')});
  const peak=Number(level.stderr.match(/max_volume:\s*([\d.-]+)/)?.[1]);
  if(!Number.isFinite(peak)||peak>=0||peak < -55)throw new Error(`Narration is silent, too quiet or clipped (peak ${peak}).`);
  const snapshots=[];
  const exportHash=await fileHash(file);
  if(frames) {
    const times=new Set([0]);
    for(const scene of timeline.scenes) for(const offset of [Math.min(6,scene.frames-1),Math.floor(scene.frames*.5),Math.max(0,scene.frames-2)])times.add((scene.from+offset)/timeline.fps);
    const dir=resolve(run,'qa',exportHash.slice(0,12));await mkdir(dir,{recursive:true});
    let i=0;
    for(const t of [...times].sort((a,b)=>a-b)) {
      const path=resolve(dir,`frame-${String(i++).padStart(3,'0')}.jpg`);
      await command(config.paths.ffmpeg,['-nostdin','-v','error','-y','-ss',String(t),'-i',file,'-frames:v','1','-vf','scale=360:640',path],{signal,timeoutMs:30000});
      snapshots.push({time:t,path,sha256:await fileHash(path)});
    }
    // Contact sheets are review aids; they never constitute automatic visual approval.
    for(let page=0;page<Math.ceil(snapshots.length/12);page++) {
      const pattern=resolve(dir,'frame-%03d.jpg'),sheet=resolve(dir,`contact-${page+1}.jpg`);
      await command(config.paths.ffmpeg,['-nostdin','-v','error','-y','-start_number',String(page*12),'-i',pattern,'-vf','tile=4x3','-frames:v','1',sheet],{signal,timeoutMs:30000});
    }
  }
  const result={status:'passed',file,sha256:exportHash,bytes:(await stat(file)).size,timelineHash:digest(timeline),duration,videoDuration,audioDuration,
    fps:timeline.fps,dimensions:[video.width,video.height],codecs:[video.codec_name,audio.codec_name],pixelFormat:video.pix_fmt,colorRange:video.color_range,peakDb:peak,decode:'passed',
    narrationTiming:'Scene boundaries are measured from generated audio; optional captions use scene speech intervals, not guessed word timestamps.',
    visualReview:'pending',snapshots,checkedAt:new Date().toISOString()};
  await atomic(resolve(run,'verification.json'),result);
  return result;
}

export async function recordReview(run,{reviewer,notes}) {
  if(!reviewer?.trim()||!notes?.trim())throw new Error('Provide the actual reviewer and concrete visual/timing review notes.');
  const report=await json(resolve(run,'verification.json'));
  const timeline=await json(resolve(run,'timeline.json'));
  const episode=await json(resolve(run,'episode.json'));
  if(report.sha256!==await fileHash(report.file)||report.timelineHash!==digest(timeline)||report.episodeHash!==digest(episode))throw new Error('Export, storyboard or timeline changed after technical verification.');
  if(!report.snapshots.length)throw new Error('No decoded review frames exist.');
  for(const snapshot of report.snapshots)if(snapshot.sha256!==await fileHash(snapshot.path))throw new Error('Review frames changed after verification; regenerate the QA evidence.');
  report.visualReview='passed';report.reviewer=reviewer;report.reviewNotes=notes;report.reviewedAt=new Date().toISOString();
  await atomic(resolve(run,'verification.json'),report);
  return report;
}
