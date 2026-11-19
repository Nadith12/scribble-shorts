import React,{useRef,useLayoutEffect} from 'react';
import {registerRoot,Composition,AbsoluteFill,Sequence,Audio,Img,OffthreadVideo,staticFile,useCurrentFrame} from 'remotion';
import '../scene-art.js';
import '../../work/Scribble Character Kit/scribble.js';

function Host({state}) {
  const ref=useRef(null),rig=useRef(null);
  useLayoutEffect(()=>{
    if(!rig.current)rig.current=window.Scribble.create(ref.current,state.host);
    rig.current.place(state.host);rig.current.at(state.motion,state.hostTime);
  },[state]);
  return <svg ref={ref} viewBox="0 0 1080 1920" style={{position:'absolute',inset:0,width:'100%',height:'100%'}}/>;
}
function SceneView({scene,timeline}) {
  const frame=useCurrentFrame(),state=window.ScribbleScene.state(scene,frame,timeline);
  const media=scene.visual.asset;
  return <AbsoluteFill>
    <div style={{position:'absolute',inset:0,opacity:state.opacity,transform:state.transform,transformOrigin:'50% 48%'}}>
      {media ? <div style={{position:'absolute',left:75,top:445,width:930,height:870,borderRadius:34,overflow:'hidden'}}>
        {scene.visual.kind==='video'?<OffthreadVideo src={staticFile(media.file)} muted style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<Img src={staticFile(media.file)} style={{width:'100%',height:'100%',objectFit:'contain'}}/>}
      </div>:<div dangerouslySetInnerHTML={{__html:state.svg}}/>}
    </div>
    <div style={{position:'absolute',left:90,top:225,right:105,fontSize:57,lineHeight:1.12,fontWeight:700,color:timeline.style.ink,textShadow:'0 2px 4px #0000002b, 0 7px 20px #00000014'}}>{scene.visual.heading}</div>
    <Host state={state}/>
    {scene.onScreenText&&!scene.captions?.length&&<div style={{position:'absolute',left:390,right:110,top:1460,fontSize:36,lineHeight:1.2,color:timeline.style.accent,textShadow:'0 1px 0 #ffffff, 0 3px 9px #0000001f'}}>{scene.onScreenText}</div>}
    {state.caption&&<div style={{position:'absolute',left:300,right:90,bottom:320,padding:'14px 22px',fontSize:40,lineHeight:1.18,fontWeight:700,letterSpacing:'-.5px',textAlign:'center',background:'#ffffff',border:'2px solid #007e8430',boxShadow:'0 10px 30px #0000001c, 0 2px 6px #00000012',borderRadius:16,textShadow:'0 1px 2px #00000012'}} dangerouslySetInnerHTML={{__html:window.ScribbleScene.captionHtml(state.caption)}}/>}
    <div style={{position:'absolute',left:90,right:130,top:1660,fontSize:21,color:'#625c68',textShadow:'0 1px 2px #ffffffc0'}}>{scene.visual.kind==='video'&&scene.visual.illustrative?'AI-generated illustration · ':''}{scene.visual.credit||'Animated explanation · diagram simplified'}</div>
  </AbsoluteFill>;
}
function Short({timeline}) {
  return <AbsoluteFill style={{background:`radial-gradient(ellipse at 65% 30%,#ffffff,${timeline.style.background})`,fontFamily:'Inter,sans-serif',color:timeline.style.ink}}>
    <style>{`@font-face{font-family:Inter;src:url('${staticFile('inter-bold.woff2')}')}`}</style>
    {timeline.scenes.map(scene=><Sequence key={scene.id} from={scene.from} durationInFrames={scene.frames} layout="none"><SceneView scene={scene} timeline={timeline}/></Sequence>)}
    <Audio src={staticFile(timeline.audio)}/>
    {timeline.testOnly&&<div style={{position:'absolute',left:90,top:140,fontSize:22,letterSpacing:2,color:'#625c68'}}>PIPELINE VALIDATION SAMPLE</div>}
  </AbsoluteFill>;
}
const fallback={id:'preview',fps:30,width:1080,height:1920,durationInFrames:30,scenes:[],audio:'narration.wav',style:{background:'#fff9ed',accent:'#007e84',ink:'#25212b'}};
function Root(){return <Composition id="ScribbleShort" component={Short} width={1080} height={1920} fps={30} durationInFrames={30} defaultProps={{timeline:fallback}} calculateMetadata={({props})=>({durationInFrames:props.timeline.durationInFrames,fps:props.timeline.fps,width:props.timeline.width,height:props.timeline.height})}/>;}
registerRoot(Root);
