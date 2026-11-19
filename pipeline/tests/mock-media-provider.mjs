import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const request=JSON.parse(await readFile(process.argv[2],'utf8'));
if(process.argv.includes('--fail')){console.error('simulated provider failure');process.exit(3);}
const input=request.extension==='mp4'?['-f','lavfi','-i','testsrc2=s=360x640:r=30:d=2','-an','-c:v','libx264','-pix_fmt','yuv420p']:['-f','lavfi','-i','color=c=teal:s=360x640','-frames:v','1'];
const result=spawnSync('ffmpeg',['-nostdin','-v','error','-y',...input,request.output],{windowsHide:true});
if(result.status!==0){process.stderr.write(result.stderr);process.exit(result.status||1);}
