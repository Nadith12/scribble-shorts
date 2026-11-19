/* Shared deterministic scene drawing: HyperFrames and Remotion use identical geometry. */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = n => Math.max(0, Math.min(1, n));
  const ease = n => {n=clamp(n);return n*n*(3-2*n);};
  const wrap = (s, limit = 24) => {
    const words=String(s).split(/\s+/), lines=[''];
    for(const word of words) {const last=lines.length-1;if((lines[last]+' '+word).trim().length>limit&&lines[last])lines.push(word);else lines[last]=(lines[last]+' '+word).trim();}
    return lines;
  };
  function label(x,y,value,{size=40,color='#25212b',width=25,anchor='middle'}={}) {
    return `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${color}" font-family="Inter, sans-serif" font-weight="700" font-size="${size}" filter="url(#labelShadow)">${wrap(value,width).map((s,i)=>`<tspan x="${x}" dy="${i?size*1.23:0}">${esc(s)}</tspan>`).join('')}</text>`;
  }
  const box=(x,y,w,h,fill,stroke='#25212b',r=28)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="5"/>`;
  const line=(x,y,X,Y,stroke,w=8)=>`<path d="M${x} ${y}L${X} ${Y}" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;
  function diagram(scene,frame,timeline) {
    const v=scene.visual, ink=timeline.style.ink, accent=timeline.style.accent;
    const elapsed=frame/timeline.fps, duration=scene.frames/timeline.fps;
    const p=ease(elapsed/Math.min(1.1,duration*.25));
    const reveal=i=>scene.animation.motion==='reveal'?ease((elapsed-i*.35)/.6):1;
    let svg='';
    if(v.template==='paper-bridge') {
      const folded=scene.visual.items.some(x=>/fold|ridge/i.test(x.label));
      const comparison=scene.visual.items.length>1;
      const slots=comparison?[{x:280,folded:false},{x:745,folded:true}]:[{x:510,folded}];
      slots.forEach(({x,folded},i)=>{
        const y=880, sag=folded?5:95*p,L=x-170,R=x+170;
        svg+=`<ellipse cx="${x+20}" cy="1170" rx="185" ry="24" fill="${ink}" opacity=".08"/>`;
        svg+=box(L,y+8,80,240,'#d8c8aa',ink,12)+box(R-80,y+8,80,240,'#d8c8aa',ink,12);
        if(folded){
          // One continuous corrugated sheet: connected end profiles and longitudinal ridges.
          const left=[],right=[];
          for(let j=0;j<=8;j++){const dx=(8-j)*5,dy=(j-8)*9-(j%2?28:0);left.push([L+dx,y+dy]);right.push([R+dx,y+dy]);}
          for(let j=0;j<8;j++)svg+=`<path d="M${left[j]} L${right[j]} L${right[j+1]} L${left[j+1]} Z" fill="${j%2?'#d6e9dd':'#fffdf8'}" stroke="${accent}" stroke-width="2.5"/>`;
          svg+=`<polyline points="${left.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${ink}" stroke-width="4"/><polyline points="${right.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${ink}" stroke-width="4"/>`;
        }else{
          svg+=`<path d="M${L+40} ${y-72} Q${x+40} ${y-72+sag} ${R+40} ${y-72} L${R} ${y} Q${x} ${y+sag} ${L} ${y} Z" fill="#fffdf8" stroke="${ink}" stroke-width="5"/>`;
        }
        const drop=80*(1-p),coinY=y-50+sag*.5-drop;
        svg+=`<ellipse cx="${x+18}" cy="${coinY+9}" rx="38" ry="13" fill="#b99538" stroke="${ink}" stroke-width="4"/><ellipse cx="${x+18}" cy="${coinY}" rx="38" ry="13" fill="#f1cc62" stroke="${ink}" stroke-width="4"/>`;
        svg+=label(x+15,590,comparison?(i?'FOLDED':'FLAT'):v.items[0].label,{size:45,color:accent,width:15});
        if(elapsed>1)svg+=label(x+15,1260,comparison?(i?'Resists bending':'Bends more'):v.items[0].detail,{size:31,width:18});
      });
      if(/cross|ridge|depth/i.test(v.heading)) {
        svg+=`<path d="M245 760 L305 680 L365 760 L425 680 L485 760 L545 680 L605 760 L665 680 L725 760 L785 680 L845 760" fill="none" stroke="${accent}" stroke-width="12" stroke-linejoin="round"/>`;
      }
    } else if(v.template==='comparison') {
      v.items.slice(0,2).forEach((item,i)=>{
        const x=100+i*490, opacity=reveal(i);
        svg+=`<g opacity="${opacity}" transform="translate(0 ${30*(1-opacity)})">`+box(x,590,390,580,'#ffffff',ink)+`<circle cx="${x+195}" cy="760" r="80" fill="${item.color||accent}" opacity=".15"/>`+label(x+195,780,String(i+1),{size:80,color:item.color||accent})+label(x+195,945,item.label,{size:43,width:15})+label(x+195,1060,item.detail,{size:30,width:21})+'</g>';
      });
    } else if(v.template==='process') {
      v.items.forEach((item,i)=>{
        const y=520+i*(760/Math.max(1,v.items.length)), opacity=reveal(i);
        if(i)svg+=line(540,y-60,540,y-18,accent,9);
        svg+=`<g opacity="${opacity}">`+box(190,y,700,140,'#ffffff',ink,22)+`<circle cx="255" cy="${y+70}" r="32" fill="${item.color||accent}"/>`+label(255,y+81,i+1,{size:30,color:'#ffffff'})+label(590,y+53,item.label,{size:35,width:25})+label(590,y+103,item.detail,{size:26,width:34})+'</g>';
      });
    } else if(v.template==='layers') {
      v.items.forEach((item,i)=>{
        const x=160+i*30,y=560+i*155,opacity=reveal(i);
        svg+=`<g opacity="${opacity}" transform="translate(0 ${40*(1-opacity)})">`+box(x,y,740,135,item.color||'#e0eeea',ink,18)+label(x+370,y+55,item.label,{size:40,width:28})+label(x+370,y+102,item.detail,{size:28,width:35})+'</g>';
      });
    } else {
      svg+=`<circle cx="540" cy="840" r="260" fill="${accent}" opacity=".08"/>`;
      v.items.forEach((item,i)=>{const y=660+i*190;svg+=`<g opacity="${reveal(i)}">`+label(540,y,item.label,{size:56,color:item.color||accent,width:22})+label(540,y+90,item.detail,{size:34,width:32})+'</g>';});
    }
    // Every diagram label carries a soft drop shadow so type stays legible over shapes and fills.
    const defs='<defs><filter id="labelShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="2.6" flood-color="#000000" flood-opacity="0.3"/></filter></defs>';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">${defs}${svg}</svg>`;
  }
  // Return the active cue as styled words: topical ones keep a lime chip, the word being
  // spoken right now gets a brighter glow so the caption tracks the voice.
  function activeCaption(scene,seconds) {
    if (Array.isArray(scene.captions) && scene.captions.length) {
      const cue = scene.captions.find(c => seconds >= c.start && seconds <= c.end);
      if (!cue) return null;
      const source = Array.isArray(cue.words) && cue.words.length ? cue.words : cue.text.split(/\s+/).map(text => ({text}));
      let spoken = -1;
      source.forEach((word, i) => { if (Number.isFinite(word.start) && seconds >= word.start) spoken = i; });
      return {text:cue.text,words:source.map((word,i)=>({text:word.text||word.word,emphasis:!!word.emphasis,active:i===spoken}))};
    }
    if (scene.caption && seconds >= scene.speechStart && seconds <= scene.speechEnd) {
      return {text:scene.caption,words:scene.caption.split(/\s+/).map(text=>({text,emphasis:false,active:false}))};
    }
    return null;
  }
  function captionHtml(caption) {
    if (!caption) return '';
    return caption.words.map(word => {
      const styles = ['display:inline-block','padding:0 .07em','border-radius:.18em'];
      // Keep trailing punctuation outside the chip so the highlight sits on the word itself.
      const [, core, tail] = String(word.text).match(/^(.*?)([.,!?;:]*)$/u) || [word.text, word.text, ''];
      if (word.emphasis) styles.push('color:#22300a',
        'background:linear-gradient(180deg,#e6ff9a,#bdf23a)',
        'padding:0 .14em','margin:0 .015em',
        'box-shadow:0 0 14px #b9f227aa,0 2px 5px #6f8f0033');
      if (word.active) styles.push('transform:translateY(-1px)',
        word.emphasis
          ? 'box-shadow:0 0 24px #b9f227ee,0 0 44px #d9ff5e99,0 2px 6px #6f8f0055'
          : 'color:#1b2804','background:#f2ffcd','box-shadow:0 0 12px #c9f24a66');
      return `<span style="${styles.join(';')}">${esc(core)}</span>${tail?`<span style="margin-left:-.12em">${esc(tail)}</span>`:''}`;
    }).join(' ');
  }
  function state(scene,frame,timeline) {
    const seconds=frame/timeline.fps, progress=clamp(frame/Math.max(1,scene.frames-1));
    const intensity=scene.animation.intensity*timeline.animationIntensity;
    const scale=scene.animation.motion==='zoom'?1+progress*.065*intensity:1;
    const x=scene.animation.motion==='pan'?(progress-.5)*50*intensity:0;
    const enter=scene.transitionFrames?ease(frame/scene.transitionFrames):1;
    const opacity=scene.transition==='fade'?enter:1;
    const shift=scene.transition==='slide'?65*(1-enter):0;
    // Play each acting beat once, then hold. Avoid unrelated looping gesture clocks.
    const motion=scene.host==='draw'?'point':scene.host;
    const hostTime=Math.min(1.15,seconds*.85+.05);
    return {svg:diagram(scene,frame,timeline),transform:`translate(${x}px,${shift}px) scale(${scale})`,opacity,motion,hostTime,
      host:{x:35,y:1380,scale:.52,direction:1},caption:activeCaption(scene,seconds)};
  }
  window.ScribbleScene={state,esc,label,captionHtml};
})();
