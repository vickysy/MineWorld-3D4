const worldAudioBuffers=new Map(),worldAudioPending=new Map(),worldAudioVoices=new Set();
let worldAudioReady=false,worldAudioLastAnimal=-Infinity;
let soundOutput=null,soundVolume=.7,footstepDistance=0;
try{const saved=localStorage.getItem('daniel-sound-volume');if(saved!==null&&Number.isFinite(Number(saved)))soundVolume=Math.max(0,Math.min(1,Number(saved)));}catch{}
function getSoundOutput(){
    if(!soundOutput){soundOutput=audioCtx.createGain();soundOutput.gain.value=soundVolume;soundOutput.connect(audioCtx.destination);}
    return soundOutput;
}
function setSoundVolume(value){
    soundVolume=Math.max(0,Math.min(1,Number(value)||0));
    if(soundOutput)soundOutput.gain.setTargetAtTime(soundVolume,audioCtx.currentTime,.015);
    try{localStorage.setItem('daniel-sound-volume',soundVolume);}catch{}
    document.getElementById('sound-volume-value').textContent=Math.round(soundVolume*100)+'%';
}
function initSoundControls(){document.getElementById('sound-volume').value=soundVolume;setSoundVolume(soundVolume);}
function loadWorldAudio(kind){
    if(worldAudioBuffers.has(kind))return Promise.resolve(worldAudioBuffers.get(kind));
    if(worldAudioPending.has(kind))return worldAudioPending.get(kind);
    if(!audioCtx||!WORLD_AUDIO_DATA[kind])return Promise.resolve([]);
    const task=Promise.all(WORLD_AUDIO_DATA[kind].map(async b64=>{
        const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
        const buffer=await audioCtx.decodeAudioData(bytes.buffer);
        let peak=0;for(let c=0;c<buffer.numberOfChannels;c++)for(const sample of buffer.getChannelData(c))peak=Math.max(peak,Math.abs(sample));
        return {buffer,normal:peak>.001?Math.min(3,.8/peak):1};
    })).then(buffers=>{worldAudioBuffers.set(kind,buffers);return buffers;}).catch(()=>[]);
    worldAudioPending.set(kind,task);return task;
}
function warmWorldAudio(){if(!audioCtx||worldAudioReady)return;worldAudioReady=true;for(const kind of Object.keys(WORLD_AUDIO_DATA))loadWorldAudio(kind);}
function playWorldRecording(kind,{position=null,gain=.22,rate=1,duration=null,ambient=false,lowpass=5200,offset=0,filterQ=1,onStart=null}={}){
    if(!audioCtx||audioCtx.state==='closed')return false;
    if(audioCtx.state==='suspended')audioCtx.resume();warmWorldAudio();
    const distance=position?position.distanceTo(camera.position):0;
    if(distance>=32||worldAudioVoices.size>=10)return false;
    if(ambient&&audioCtx.currentTime-worldAudioLastAnimal<1.1)return false;
    const choices=worldAudioBuffers.get(kind);if(!choices?.length){loadWorldAudio(kind);return false;}
    if(ambient)worldAudioLastAnimal=audioCtx.currentTime;
    const choice=choices[Math.floor(Math.random()*choices.length)],source=audioCtx.createBufferSource(),volume=audioCtx.createGain(),filter=audioCtx.createBiquadFilter();
    source.buffer=choice.buffer;source.playbackRate.value=rate*(.97+Math.random()*.06);
    filter.type='lowpass';filter.frequency.value=lowpass;filter.Q.value=filterQ;
    const start=Math.max(0,Math.min(Number.isFinite(offset)?offset:0,Math.max(0,choice.buffer.duration-.01)));
    const time=audioCtx.currentTime,length=Math.min(duration||choice.buffer.duration,choice.buffer.duration-start)/source.playbackRate.value;
    const attenuation=distance<=4?1:Math.max(0,1-(distance-4)/28)/(1+(distance-4)*.045),level=gain*choice.normal*attenuation;
    volume.gain.setValueAtTime(0,time);volume.gain.linearRampToValueAtTime(level,time+.008);
    volume.gain.setValueAtTime(level,time+Math.max(.008,length-.04));volume.gain.linearRampToValueAtTime(0,time+length);
    source.connect(filter);filter.connect(volume);
    const pan=audioCtx.createStereoPanner();if(position){const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);pan.pan.value=THREE.MathUtils.clamp(position.clone().sub(camera.position).dot(right)/12,-.8,.8);}
    volume.connect(pan);pan.connect(getSoundOutput());worldAudioVoices.add(source);
    source.onended=()=>{worldAudioVoices.delete(source);source.disconnect();filter.disconnect();volume.disconnect();pan.disconnect();};source.start(time,start);source.stop(time+length+.01);
    if(onStart)onStart(()=>{if(worldAudioVoices.has(source)){volume.gain.cancelScheduledValues(audioCtx.currentTime);volume.gain.setTargetAtTime(0,audioCtx.currentTime,.012);source.stop(audioCtx.currentTime+.06);}});
    return true;
}
function blockSoundFamily(id){
    id=HIDDEN_BLOCKS[id]?.base||id;
    if([1,5,25,42].includes(id)||LEAF_TYPES.has(id)||NATURE_PLANTS.has(id))return 'grass';
    if(id===2)return 'dirt';if([23,SANDSTONE,SNOW_LAYER_ID,154].includes(id))return 'sand';
    if([14,15,83,84,91,92,97,117,126,149].includes(id))return 'cloth';
    if([4,7,8,9,10,11,12,82,88,111,118,151,152,TRAPDOOR,TRAPDOOR_OPEN,CHEST_ID,OAK_PLANKS_ID].includes(id))return 'wood';
    if([6,87,112,GLASS_SENSOR_DOOR_BOTTOM_ID,GLASS_SENSOR_DOOR_TOP_ID,GLASS_SENSOR_DOOR_OPEN_ID,SHOWER_DOOR_ID].includes(id))return 'glass';
    if([85,86,90,108,113,119].includes(id))return 'ceramic';
    if([17,18,19,20,GOLD_BLOCK,SILVER_BLOCK,IRON_BLOCK,GOLD_PYRAMID,SILVER_PYRAMID,26,27,PISTON_ID].includes(id)||HOME_ITEMS[id]||CAR_ITEMS[id])return 'metal';
    return 'stone';
}
const BLOCK_SOUND_PROFILES={
    dirt:{hit:'dirt_step',step:'dirt_step',break:'dirt_break',place:'place',rate:1,lowpass:3800},
    grass:{hit:'grass_step',step:'grass_step',break:'grass_break',place:'grass_step',rate:.95,lowpass:4000},
    stone:{hit:'hard_place',step:'stone_step',break:'stone',place:'hard_place',rate:.84,lowpass:2200},
    wood:{hit:'wood_step',step:'wood_step',break:'wood',place:'wood',rate:.9,lowpass:3000},
    sand:{hit:'sand',step:'sand',break:'dirt_break',place:'sand',rate:.9,lowpass:3600},
    glass:{hit:'glass_step',step:'glass_step',break:'glass',place:'glass_step',rate:.9,lowpass:4000},
    cloth:{hit:'wood_step',step:'wood_step',break:'wood_step',place:'wood_step',rate:.82,lowpass:900},
    ceramic:{hit:'hard_place',step:'stone_step',break:'stone',place:'hard_place',rate:.96,lowpass:2700},
    metal:{hit:'hard_place',step:'stone_step',break:'metal',place:'hard_place',rate:.88,lowpass:2600}
};
function playBlockSound(action,id,position=null){
    const family=blockSoundFamily(id),p=BLOCK_SOUND_PROFILES[family],quiet=family==='cloth';
    if(family==='dirt'&&(action==='hit'||action==='break')){
        // Short grain/scrape excerpts from the existing attributed recordings, without a resonant peak.
        const hit=action==='hit';
        return playWorldRecording(hit?'sand':'dirt_break',{position,gain:hit?.085:.17,rate:hit?.74:.78,
            duration:hit?.09:.18,offset:hit?.02:.012,lowpass:hit?1400:1700,filterQ:.55});
    }
    return playWorldRecording(p[action]||p.hit,{position,gain:(quiet?.45:1)*({hit:.105,step:.065,place:.19,break:.26}[action]||.1),
        rate:p.rate,duration:action==='hit'?.16:action==='step'?.22:action==='place'?.3:quiet?.24:.65,lowpass:p.lowpass});
}
function updateFootstepSound(before,grounded){
    if(!grounded||creativeFlying||activeMech||ridingMinecart){footstepDistance=0;return;}
    const distance=Math.hypot(camera.position.x-before.x,camera.position.z-before.z);
    if(distance>2*Math.max(playerScale,.01)){footstepDistance=0;return;}
    footstepDistance+=distance;
    if(footstepDistance<1.65*playerScale)return;footstepDistance=0;
    const p=camera.position,id=getBlock(Math.round(p.x),Math.floor(p.y-getPlayerHeight()+.49),Math.round(p.z));
    if(id&&!isWaterType(id)&&id!==LAVA_ID)playBlockSound('step',id);
}
function updateAnimalVoice(entity,delta){
    entity.voiceTimer=(entity.voiceTimer??(1+Math.random()*7))-delta;
    if(entity.voiceTimer>0||entity.dying)return;
    if(playWorldRecording(entity.type||'villager',{position:entity.mesh.position,gain:entity.type==='pig'?.58:.4,ambient:true}))entity.voiceTimer=5+Math.random()*9;
    else entity.voiceTimer=1+Math.random()*3;
}
function playMobVoice(entity,phase='hurt'){
    if(['zombie','pillager','creeper'].includes(entity.kind))return playHostileVoice(entity,phase);
    const kind=entity.type|| (entity.kind==='villager'?'villager':null);
    if(kind)playWorldRecording(kind==='pig'?'pig':kind+'_hurt',{position:entity.mesh.position,gain:kind==='pig'?.48:.32,rate:kind==='pig'?1.12:1,duration:kind==='pig'?.42:null});
}
function playHostileVoice(entity,phase='idle'){
    const kind=entity.kind;
    if(!['zombie','pillager','creeper'].includes(kind))return false;
    if(kind==='creeper'&&phase!=='death')return false;
    const clip=kind==='pillager'&&phase==='death'?'pillager_hurt':phase==='idle'?kind:kind+'_'+phase;
    return playWorldRecording(clip,{position:entity.mesh.position,ambient:phase==='idle',gain:phase==='idle'?.21:.29,
        rate:kind==='zombie'?.92:1,lowpass:kind==='zombie'?2600:3500});
}
function updateHostileVoice(entity,delta){
    entity.voiceTimer=(entity.voiceTimer??(3+Math.random()*5))-delta;
    if(entity.voiceTimer>0||entity.dying)return;
    const audible=entity.mesh.position.distanceTo(camera.position)<18&&playHostileVoice(entity,'idle');
    entity.voiceTimer=audible?7+Math.random()*9:2;
}
function startCreeperHiss(entity){
    if(entity.stopHiss)return;
    playWorldRecording('creeper_fuse',{position:entity.mesh.position,gain:.22,duration:1.55,lowpass:4800,onStart:stop=>entity.stopHiss=stop});
}
function stopCreeperHiss(entity){if(entity.stopHiss){entity.stopHiss();entity.stopHiss=null;}}
function clearWorldVoices(){for(const source of worldAudioVoices)source.stop();worldAudioVoices.clear();}
