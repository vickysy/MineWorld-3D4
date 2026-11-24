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
function playWorldRecording(kind,{position=null,gain=.22,rate=1,duration=null,ambient=false,lowpass=5200}={}){
    if(!audioCtx||audioCtx.state==='closed')return false;
    if(audioCtx.state==='suspended')audioCtx.resume();warmWorldAudio();
    const distance=position?position.distanceTo(camera.position):0;
    if(distance>=32||worldAudioVoices.size>=10)return false;
    if(ambient&&audioCtx.currentTime-worldAudioLastAnimal<1.1)return false;
    const choices=worldAudioBuffers.get(kind);if(!choices?.length){loadWorldAudio(kind);return false;}
    if(ambient)worldAudioLastAnimal=audioCtx.currentTime;
    const choice=choices[Math.floor(Math.random()*choices.length)],source=audioCtx.createBufferSource(),volume=audioCtx.createGain(),filter=audioCtx.createBiquadFilter();
    source.buffer=choice.buffer;source.playbackRate.value=rate*(.97+Math.random()*.06);
    filter.type='lowpass';filter.frequency.value=lowpass;
    const time=audioCtx.currentTime,length=Math.min(duration||choice.buffer.duration,choice.buffer.duration)/source.playbackRate.value;
    const attenuation=distance<=4?1:Math.max(0,1-(distance-4)/28)/(1+(distance-4)*.045),level=gain*choice.normal*attenuation;
    volume.gain.setValueAtTime(0,time);volume.gain.linearRampToValueAtTime(level,time+.008);
    volume.gain.setValueAtTime(level,time+Math.max(.008,length-.04));volume.gain.linearRampToValueAtTime(0,time+length);
    source.connect(filter);filter.connect(volume);
    const pan=audioCtx.createStereoPanner();if(position){const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);pan.pan.value=THREE.MathUtils.clamp(position.clone().sub(camera.position).dot(right)/12,-.8,.8);}
    volume.connect(pan);pan.connect(getSoundOutput());worldAudioVoices.add(source);
    source.onended=()=>{worldAudioVoices.delete(source);source.disconnect();filter.disconnect();volume.disconnect();pan.disconnect();};source.start(time);source.stop(time+length+.01);return true;
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
function playBlockSound(action,id,position=null){
    const family=blockSoundFamily(id);
    const hard=['stone','ceramic','metal'].includes(family);
    const kind=family==='cloth'?'wood_step':family==='ceramic'?'hard_place':family==='glass'&&action!=='break'?'glass_step':action==='step'&&['wood','stone'].includes(family)?family+'_step':action==='place'&&['dirt','stone'].includes(family)?(family==='dirt'?'place':'hard_place'):family;
    return playWorldRecording(kind,{position,gain:family==='cloth'?.09:action==='hit'?.085:action==='step'?.07:action==='place'?.18:.25,rate:hard?.82:action==='place'?.85:1,duration:action==='hit'?.13:action==='step'||family==='cloth'?.18:null,lowpass:hard?2200:family==='cloth'?1200:5200});
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
function playMobVoice(entity){
    const kind=entity.type|| (entity.kind==='villager'?'villager':null);
    if(kind)playWorldRecording(kind==='pig'?'pig':kind+'_hurt',{position:entity.mesh.position,gain:kind==='pig'?.48:.32,rate:kind==='pig'?1.12:1,duration:kind==='pig'?.42:null});
}
function clearWorldVoices(){for(const source of worldAudioVoices)source.stop();worldAudioVoices.clear();}
