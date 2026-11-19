export function candidate(patch={}) {
  return {
    id:'test-bridge',title:'Why Folding Paper Makes a Stronger Bridge',topicKey:'paper-bridge-folds',aliases:['folded paper bridge'],
    hook:'Same paper. Why does changing its shape help?',payoff:'A folded sheet resists bending more than a flat sheet.',expectation:'The same paper should bend the same amount.',explanation:'Folding changes the geometry of the sheet.',
    scores:{recognition:5,surprise:4,visual:5,simplicity:5,payoff:4},
    sources:[{id:'anu-bridge',url:'https://example.org/evidence',title:'Institutional bridge experiment',authority:'institutional'}],
    claims:[{id:'fold-strength',text:'Folding paper changes its shape and makes it more resistant to bending.',conditions:'Qualitative comparison of otherwise similar paper bridges; no universal load capacity is claimed.',evidence:[{sourceId:'anu-bridge',quote:'When the paper is folded, its shape changes and it becomes more resistant to bending.'}],verdict:'supported',reason:'The scoped claim follows the quoted explanation.'}],
    review:{reviewer:'test-fixture',decision:'approved',notes:'Synthetic evidence fixture for automated tests, not a published claim.'},...patch,
  };
}
export function scene(id='opening',patch={}) {
  return {id,narration:'The same paper can resist bending when its shape changes.',claimIds:['fold-strength'],goal:'Compare two shapes.',action:'Load the bridges.',result:'The shapes respond differently.',nextBecause:'Compare their geometry.',
    visual:{kind:'diagram',template:'comparison',heading:'Same paper. Different shape.',items:[{label:'Flat',detail:'Bends easily'},{label:'Folded',detail:'Resists bending'}],prompt:'',illustrative:true,videoJustification:'',clipSeconds:2,fallback:'diagram'},
    animation:{motion:'reveal',intensity:.65},host:'point',transition:'cut',onScreenText:'',...patch};
}
export const episode=()=>({...candidate(),schemaVersion:1,testOnly:true,scenes:[scene(),scene('payoff')]});
export const sourceHtml='<html><title>Evidence</title><main><h1>Paper bridge</h1><p>When the paper is folded, its shape changes and it becomes more resistant to bending.</p><p>Compare otherwise similar paper with different shapes. No exact capacity is established by this fixture.</p></main></html>';
