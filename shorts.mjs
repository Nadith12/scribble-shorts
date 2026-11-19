#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadConfig,projectPath,ROOT} from './pipeline/config.mjs';
import {atomic,json,command} from './pipeline/io.mjs';
import {buildEpisode,planEpisode,finishEpisode,runPath,recordReview} from './pipeline/run.mjs';

const abort=new AbortController();process.once('SIGINT',()=>abort.abort());process.once('SIGTERM',()=>abort.abort());
const help=`Scribble Shorts — evidence-checked vertical Shorts with measured narration

node shorts.mjs doctor [--config shorts.config.local.json]
node shorts.mjs plan --theme "everyday mechanisms" [--candidates pack.json] [--id discovery]
node shorts.mjs produce --theme "everyday mechanisms" [--id discovery-job]
node shorts.mjs run --brief storyboard.json [--renderer hyperframes|remotion] [--offline]
node shorts.mjs run --id episode-id [--stop-after research|narration|compose]
node shorts.mjs review --id episode-id --reviewer "name" --notes "what was inspected"
node shorts.mjs finish --id episode-id

plan: optional text provider; compare candidates, fetch sources, verify and write a storyboard.
run: fetch sources, synthesize locally, render, decode and create review frames.
review: record an actual editorial/visual review bound to the export and timeline hashes.
finish: upload, verify, then permanently delete the local MP4; records stay in work/.
Test-only storyboards stay in work/ and cannot be published. External providers are disabled by default.
Use --allow-repeat only for an intentional remake. Ctrl+C retains successful intermediates.
`;
async function main(){
  const {positionals,values}=parseArgs({allowPositionals:true,options:{config:{type:'string'},brief:{type:'string'},id:{type:'string'},theme:{type:'string'},candidates:{type:'string'},renderer:{type:'string'},offline:{type:'boolean'},'allow-repeat':{type:'boolean'},'stop-after':{type:'string'},reviewer:{type:'string'},notes:{type:'string'},help:{type:'boolean'}}});
  if(values.help||!positionals.length){console.log(help);return;}
  const config=await loadConfig(values.config),signal=abort.signal,action=positionals[0];
  if(values.renderer&&!['hyperframes','remotion'].includes(values.renderer))throw new Error('Renderer must be hyperframes or remotion.');
  if(values['stop-after']&&!['research','narration','compose'].includes(values['stop-after']))throw new Error('Invalid --stop-after stage.');
  if(action==='doctor'){
    const report={node:process.version,root:ROOT,renderer:config.renderer,paths:{},kokoro:{},textProvider:{provider:config.research.provider,model:config.research.useComplex?config.research.complexModel:config.research.routineModel,keyConfigured:Boolean(process.env[config.research.keyEnv]),enabled:config.external.enabled},optionalVideo:config.video.enabled};
    for(const[key,path]of Object.entries(config.paths)){
      if(['ffmpeg','ffprobe'].includes(key)){report.paths[key]=(await command(path,['-version'],{timeoutMs:10000})).stdout.split('\n')[0];continue;}
      const bare=Boolean(path)&&!/[\\/]/.test(path)&&!/^[a-zA-Z]:/.test(path);
      const shown=bare?path:(path?projectPath(path):'(not set)');
      report.paths[key]={path:shown,exists:Boolean(path)&&(bare?true:existsSync(shown))};
      if(key==='python'&&bare&&path){
        try{const version=await command(path,['--version'],{timeoutMs:10000});report.paths[key].version=(version.stdout||version.stderr).trim();}
        catch{report.paths[key].exists=false;report.paths[key].error='not found on PATH';}
      }
    }
    for(const key of ['model','voices','dependencies'])report.kokoro[key]={path:projectPath(config.tts[key]),exists:existsSync(projectPath(config.tts[key]))};
    report.hyperframes={path:projectPath(config.paths.hyperframes),exists:existsSync(projectPath(config.paths.hyperframes))};
    try{report.remotion=(await import('remotion')).VERSION;}catch{report.remotion='not installed (optional)';}
    console.log(JSON.stringify(report,null,2));return;
  }
  if(action==='plan'){const result=await planEpisode(config,{signal,theme:values.theme,id:values.id,candidates:values.candidates?await json(resolve(values.candidates)):undefined,offline:values.offline});console.log(`Storyboard: ${result.brief}`);return;}
  if(action==='produce'){
    const plan=await planEpisode(config,{signal,theme:values.theme,id:values.id,candidates:values.candidates?await json(resolve(values.candidates)):undefined,offline:values.offline});
    const result=await buildEpisode(plan.episode,config,{signal,renderer:values.renderer,offline:values.offline,stopAfter:values['stop-after'],budgetFile:resolve(plan.run,'budget.json')});
    console.log(JSON.stringify({status:result.status,run:result.run,output:result.output},null,2));return;
  }
  if(!values.id&&!values.brief)throw new Error('Provide --brief or --id.');
  if(action==='run'){
    const brief=values.brief?await json(resolve(values.brief)):await json(resolve(runPath(values.id),'episode.json'));
    const result=await buildEpisode(brief,config,{signal,renderer:values.renderer,offline:values.offline,allowRepeat:values['allow-repeat'],stopAfter:values['stop-after']});
    console.log(JSON.stringify({status:result.status,run:result.run,output:result.output,warnings:result.timeline?.warnings},null,2));return;
  }
  if(action==='review'){console.log(await recordReview(runPath(values.id),{reviewer:values.reviewer,notes:values.notes}));return;}
  if(action==='finish'){console.log(await finishEpisode(values.id,config,{signal}));return;}
  throw new Error(`Unknown command ${action}. Use --help.`);
}
main().catch(e=>{console.error(e.message);process.exitCode=abort.signal.aborted?130:1;});
