const COBWEB=211,STRING_ITEM=212,FISHING_ROD=213,RAW_FISH=214,RICE_SEEDS=215,RICE_SHOOTS=216,RICE_GREEN=217,RICE_RIPE=218,RICE=219,FLOWER_RED=220,FLOWER_BLUE=221;
Object.assign(ECOLOGY_ITEMS,{211:'Cobweb',212:'String',213:'Fishing Rod',214:'Raw Fish',215:'Rice Seeds',216:'Rice Shoots',217:'Green Rice',218:'Ripe Rice',219:'Rice',220:'Poppy',221:'Cornflower'});
Object.assign(ECOLOGY_COLORS,{211:0xe1e7e8,212:0xe6dfca,213:0x90704c,214:0x8fbdbd,215:0xb7c46b,216:0x689747,217:0x72a44b,218:0xc9b962,219:0xece4bb,220:0xc85348,221:0x648cc4});
Object.assign(NATURE_ITEMS,ECOLOGY_ITEMS);
for(const id of [COBWEB,STRING_ITEM,FISHING_ROD,RAW_FISH,RICE_SEEDS,RICE_SHOOTS,RICE_GREEN,RICE_RIPE,RICE,FLOWER_RED,FLOWER_BLUE])NATURE_PLANTS.add(id);
for(const id of [RICE_SHOOTS,RICE_GREEN])GROWING_PLANTS.add(id);
PLANTABLE.add(RICE_SEEDS);EDIBLE_GARDEN.add(RAW_FISH);

function outdoorTexture(id,map){
    const ctx=map.image.getContext('2d');
    if(id===COBWEB){
        ctx.clearRect(0,0,64,64);ctx.strokeStyle='#dce6e6';ctx.lineWidth=1.6;
        for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.beginPath();ctx.moveTo(32,32);ctx.lineTo(32+45*Math.cos(a),32+45*Math.sin(a));ctx.stroke();}
        for(const r of [7,15,24,33,43]){
            ctx.beginPath();for(let j=0;j<=8;j++){const a=j*Math.PI/4;ctx.lineTo(32+r*Math.cos(a),32+r*Math.sin(a));}ctx.stroke();
        }
    }
    if([FLOWER_RED,FLOWER_BLUE].includes(id)){
        ctx.clearRect(0,0,64,64);ctx.fillStyle='#4d823b';ctx.fillRect(29,20,6,44);ctx.fillRect(17,43,13,6);ctx.fillRect(35,35,13,6);
        ctx.fillStyle=id===FLOWER_RED?'#d65746':'#6d94de';ctx.fillRect(17,9,30,17);ctx.fillRect(23,3,18,30);
        ctx.fillStyle='#e5ca65';ctx.fillRect(27,13,10,10);
    }
}
function outdoorGeometry(id,box,pieces){
    if(id<COBWEB||id>FLOWER_BLUE)return false;
    if(id===COBWEB||id===FLOWER_RED||id===FLOWER_BLUE){
        const size=id===COBWEB?1:.65;
        for(const a of [Math.PI/4,-Math.PI/4]){
            const g=new THREE.PlaneGeometry(size,size).toNonIndexed();g.rotateY(a);g.translate(0,-.5+size/2,0);pieces.push(g);
        }
    }else if(id===FISHING_ROD){
        const shaft=new THREE.BoxGeometry(.045,1.05,.045).toNonIndexed();shaft.rotateZ(-.3);pieces.push(shaft);
        box(.15,.16,.1,-.11,-.22,0);box(.012,.65,.012,.17,.15,0);
    }else if(id===STRING_ITEM){
        for(const y of [-.28,-.21,-.14,-.07])box(.27,.03,.15,0,y,0);
    }else if(id===RAW_FISH){
        box(.45,.19,.12,0,-.25,0);box(.1,.28,.08,-.26,-.25,0);
    }else if(id===RICE_SEEDS||id===RICE){
        for(const x of [-.13,0,.13])box(.06,.035,.13,x,-.47,0);
    }else{
        const h=id===RICE_SHOOTS?.22:id===RICE_GREEN?.6:.87;
        for(const [x,z] of [[-.2,-.2],[.2,-.2],[-.2,.2],[.2,.2],[0,0]]){
            box(.035,h,.035,x,-.5+h/2,z);box(.07,h*.7,.025,x+.06,-.5+h*.5,z);
            if(id===RICE_RIPE)for(let i=0;i<3;i++)box(.07,.07,.06,x+.055*i,h-.55-i*.08,z);
        }
    }
    return true;
}
function riceWaterNearby(x,y,z){return [[1,0],[-1,0],[0,1],[0,-1],[2,0],[-2,0],[0,2],[0,-2]].some(([a,b])=>isWaterType(getBlock(x+a,y-1,z+b)));}
function caveWeb(x,y,z){
    if(wildernessVersion<4||hash3(x,y,z,1801)>.025)return false;
    const h=getSurfaceHeight(x,z);
    return y<h-2&&wildernessCave(x,y,z,h)&&!wildernessCave(x,y+1,z,h);
}

let fishingCast=null,photoMode=false,photoBusy=false;
function clearFishing(){
    if(fishingCast){disposeModModel(fishingCast.bob);scene.remove(fishingCast.line);fishingCast.line.geometry.dispose();fishingCast.line.material.dispose();fishingCast=null;}
}
function fishingClick(e){
    if(currentBlock!==FISHING_ROD)return false;
    if(e.button!==2)return true;
    if(!hasInventoryItem(FISHING_ROD)){showToast('Craft a fishing rod first.');return true;}
    if(fishingCast){
        const catchFish=fishingCast.age>=fishingCast.bite&&fishingCast.age<fishingCast.bite+3;
        if(catchFish){grantHarvest({id:RAW_FISH,count:1});showToast('Caught a fish!');}
        clearFishing();return true;
    }
    const hit=traceVoxelRay(camera.position,camera.getWorldDirection(new THREE.Vector3()),18,id=>isWaterType(id)||isSolidType(id));
    if(!hit||!isWaterType(hit.type)||isWaterType(getBlock(hit.x,hit.y+1,hit.z))){showToast('Cast onto the surface of the water.');return true;}
    const bob=new THREE.Group();addModelBox(bob,.12,.12,.12,0xd74c42,0,0,0);addModelBox(bob,.12,.055,.12,0xf2f1e6,0,.07,0);
    const level=hit.y-.5+waterAmount(hit.x,hit.y,hit.z)/8;
    bob.position.set(hit.x,level+.05,hit.z);scene.add(bob);
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(6),3));
    const line=new THREE.Line(g,new THREE.LineBasicMaterial({color:0xbfb6a0}));line.frustumCulled=false;scene.add(line);
    fishingCast={bob,line,x:hit.x,y:hit.y,z:hit.z,level,age:0,bite:4+Math.random()*5,dimension:currentDimension,notified:false};
    cancelMining();return true;
}
function updateFishing(dt){
    const f=fishingCast;if(!f)return;
    if(currentBlock!==FISHING_ROD||f.dimension!==currentDimension||f.bob.position.distanceTo(camera.position)>22||!isWaterType(getBlock(f.x,f.y,f.z))){clearFishing();return;}
    if(controls.isLocked&&!photoMode)f.age+=dt;
    const biting=f.age>=f.bite&&f.age<f.bite+3;
    if(biting&&!f.notified){showToast('Bite!');playSound('water');f.notified=true;}
    if(f.age>f.bite+3){f.bite=f.age+4+Math.random()*5;f.notified=false;}
    f.bob.position.y=f.level+.05+(biting?-.09+Math.sin(f.age*24)*.035:Math.sin(f.age*3)*.025);
    const tip=new THREE.Vector3(.35,-.1,-.7).applyQuaternion(camera.quaternion).add(camera.position);
    const p=f.line.geometry.attributes.position;p.setXYZ(0,tip.x,tip.y,tip.z);p.setXYZ(1,f.bob.position.x,f.bob.position.y,f.bob.position.z);p.needsUpdate=true;
}

function setPhotoMode(on){
    if(on&&(!isGameStarted||isInventoryOpen||isSleeping))return;
    photoMode=on;document.body.classList.toggle('photo-mode',on);document.getElementById('photo-tools').hidden=!on;
    heldItemGroup.visible=!on&&!activeMech;
    cancelMining();clearMovementInput();
    if(on){controls.unlock();blocker.style.display='none';}else if(isGameStarted)controls.lock();
}
function captureLandscape(){
    if(!photoMode||photoBusy)return;photoBusy=true;
    const visible=heldItemGroup.visible;heldItemGroup.visible=false;
    try{
        renderer.render(scene,activeMech?mechCamera:camera);
        renderer.domElement.toBlob(blob=>{
            photoBusy=false;if(!blob){showToast('Photo could not be saved.');return;}
            const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;
            a.download='Daniel-Game-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
        },'image/png');
    }finally{heldItemGroup.visible=visible;}
}
function initOutdoors(){
    recipes.push({ing:{4:3,[STRING_ITEM]:2},out:FISHING_ROD,count:1},{ing:{[RICE]:1},out:RICE_SEEDS,count:2});
    Object.assign(COMMAND_ITEMS,{'鱼竿':FISHING_ROD,'钓鱼竿':FISHING_ROD,'蜘蛛网':COBWEB,'线':STRING_ITEM,'水稻':RICE_SEEDS,'秧苗':RICE_SEEDS,'花':FLOWER_RED});
    const rod=document.getElementById('inv-'+(FISHING_ROD-12)),icon=rod.querySelector('img');
    const canvas=document.createElement('canvas');canvas.width=canvas.height=24;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#b98a50';
    for(let i=0;i<8;i++)ctx.fillRect(3+i,20-i*2,3,3);
    ctx.fillStyle='#e4cc9e';ctx.fillRect(3,20,4,3);ctx.fillStyle='#c4dce3';
    ctx.fillRect(13,5,1,15);ctx.fillRect(13,19,4,1);ctx.fillRect(16,17,1,3);
    ctx.fillStyle='#8eabae';ctx.fillRect(6,17,4,3);icon.src=canvas.toDataURL();
    const label=document.createElement('span');label.textContent='钓鱼竿 / Fishing Rod';
    rod.replaceChildren(icon,label);rod.setAttribute('aria-label',label.textContent);rod.title='钓鱼竿 / Fishing Rod - Wood x3 + String x2';
    document.getElementById('tab-weapon').prepend(rod,document.getElementById('inv-'+(STRING_ITEM-12)));
    updateInventoryCounts();
    for(const id of [COBWEB,FLOWER_RED,FLOWER_BLUE]){materials[id].transparent=false;materials[id].alphaTest=.5;materials[id].side=THREE.DoubleSide;}
    for(const id of [RICE_SHOOTS,RICE_GREEN,RICE_RIPE])document.getElementById('inv-'+(id-12)).hidden=true;
    const bar=document.createElement('div');bar.id='photo-tools';bar.hidden=true;
    const shutter=document.createElement('button');shutter.type='button';shutter.innerHTML='&#9673;';shutter.title='Take Photo';shutter.setAttribute('aria-label','Take Photo');shutter.onclick=captureLandscape;
    const close=document.createElement('button');close.type='button';close.innerHTML='&#10005;';close.title='Exit Photo Mode';close.setAttribute('aria-label','Exit Photo Mode');close.onclick=()=>setPhotoMode(false);
    bar.append(shutter,close);document.body.append(bar);
    const style=document.createElement('style');style.textContent='#photo-tools{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);display:flex;gap:16px;z-index:11000}#photo-tools[hidden]{display:none}#photo-tools button{width:56px;height:56px;padding:0;border:2px solid white;border-radius:50%;background:#182224dd;color:white;font-size:30px;cursor:pointer}.photo-mode #hud-container,.photo-mode #crosshair,.photo-mode #info-panel,.photo-mode #command-button,.photo-mode #toast-msg,.photo-mode #room-code-float{visibility:hidden!important}';document.head.append(style);
    renderer.domElement.addEventListener('pointermove',e=>{if(photoMode&&e.buttons===1){camera.rotation.y-=e.movementX*.002;camera.rotation.x=THREE.MathUtils.clamp(camera.rotation.x-e.movementY*.002,-1.5,1.5);}});
}

// The old shader used view-space Z, making fog weaker towards the corners.
for(const name of ['fog_pars_vertex','fog_pars_fragment'])THREE.ShaderChunk[name]=THREE.ShaderChunk[name].replace('varying float fogDepth;','varying vec3 fogPosition;');
THREE.ShaderChunk.fog_vertex='#ifdef USE_FOG\n fogPosition = mvPosition.xyz;\n#endif';
THREE.ShaderChunk.fog_fragment=THREE.ShaderChunk.fog_fragment.replace('#ifdef USE_FOG','#ifdef USE_FOG\n float fogDepth = length(fogPosition);');

let weatherClock=0,weatherVisual=null,villageResidentTick=0;
const rainColumns=new Map(),villageResidentKeys=new Set();
function weatherKind(){
    if(currentDimension!=='overworld'||selectedTerrain==='moon')return 'clear';
    const cycle=Math.floor(weatherClock/240),wet=weatherClock%240>140&&hash(seed+cycle,703)>.2;
    if(!wet)return 'clear';
    return selectedTerrain==='random'&&biomeColumn(camera.position.x,camera.position.z).biome==='snow'?'snow':'rain';
}
function weatherColumn(x,z,snow=false){
    const low=Math.floor(camera.position.y-22),key=[x,z,snow,low].join(','),cached=rainColumns.get(key);
    if(cached&&weatherClock-cached.at<.8)return cached;
    const top=Math.max(getSurfaceHeight(x,z)+2,chunkMaxY.get(Math.floor(x/16)+','+Math.floor(z/16))??-Infinity,Math.ceil(camera.position.y+15));
    const result={at:weatherClock,top:low,type:0};
    for(let y=top;y>=low;y--){
        const id=getBlock(x,y,z);
        if(!snow&&(id===1||id===2||HIDDEN_BLOCKS[id]?.base===1||HIDDEN_BLOCKS[id]?.base===2))continue;
        if(isWaterType(id)||id===LAVA_ID||isSolidType(id)){
            result.top=y+(id===SNOW_LAYER_ID?-.5+SNOW_LAYER_HEIGHT:.5);result.type=id;break;
        }
    }
    if(rainColumns.size>2500)rainColumns.clear();rainColumns.set(key,result);return result;
}
function initWeatherVisual(){
    const drops=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:0x9ebbc8,transparent:true,opacity:.55,depthWrite:false}),300);
    const splashes=new THREE.InstancedMesh(new THREE.BoxGeometry(.025,.025,.025),drops.material,96);
    for(const m of [drops,splashes]){m.frustumCulled=false;m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.instanceMatrix.array.fill(0);scene.add(m);}
    return weatherVisual={drops,splashes,particles:[],spray:[],matrix:new THREE.Matrix4(),kind:'clear'};
}
function updateWeather(dt){
    if(!isGameStarted)return;
    if((controls.isLocked||photoMode)&&!isSleeping)weatherClock+=Math.min(dt,.2);
    const kind=weatherKind();if(!weatherVisual&&kind==='clear')return;
    const w=weatherVisual||initWeatherVisual(),snow=kind==='snow';
    if(w.kind!==kind){w.particles.length=0;w.spray.length=0;w.kind=kind;w.drops.material.color.setHex(snow?0xffffff:0xa9c4d2);w.drops.material.opacity=snow?.85:.55;}
    w.drops.visible=w.splashes.visible=kind!=='clear';
    if(kind==='clear')return;
    const count=snow?190:300;
    for(let i=0;i<count;i++){
        let p=w.particles[i];
        if(!p||p.y<camera.position.y-20||Math.hypot(p.x-camera.position.x,p.z-camera.position.z)>24){
            const x=camera.position.x+(Math.random()-.5)*42,z=camera.position.z+(Math.random()-.5)*42,roof=weatherColumn(Math.round(x),Math.round(z),snow);
            const y=camera.position.y+6+Math.random()*9;
            p=w.particles[i]={x,z,y,stop:roof.top,type:roof.type,hidden:roof.top>=y};
        }
        const oldY=p.y;p.y-=dt*(snow?1.4:16);
        if(p.y<=p.stop){
            if(!p.hidden&&!snow&&!isWaterType(p.type)&&p.type!==LAVA_ID&&w.spray.length<90){
                for(let j=0;j<3;j++)w.spray.push({x:p.x,y:p.stop+.025,z:p.z,vx:(Math.random()-.5)*.9,vz:(Math.random()-.5)*.9,vy:.8,age:0});
            }
            w.particles[i]=null;p.hidden=true;
        }else if(!p.hidden){
            for(let y=Math.round(oldY);y>=Math.round(p.y);y--){
                const id=getBlock(Math.round(p.x),y,Math.round(p.z));
                if((snow||id!==1&&id!==2)&&isSolidType(id)){p.stop=y+.5;break;}
            }
        }
        const s=p.hidden?0:snow?.055:.022;
        w.matrix.makeScale(s,p.hidden?0:snow?.055:.42,s);w.matrix.setPosition(p.x,p.y,p.z);w.drops.setMatrixAt(i,w.matrix);
    }
    w.drops.count=count;w.drops.instanceMatrix.needsUpdate=true;
    for(let i=w.spray.length-1;i>=0;i--){
        const p=w.spray[i];p.age+=dt;if(p.age>.24){w.spray.splice(i,1);continue;}
        p.x+=p.vx*dt;p.z+=p.vz*dt;p.y+=p.vy*dt;p.vy-=5*dt;
    }
    w.spray.forEach((p,i)=>{w.matrix.makeTranslation(p.x,p.y,p.z);w.splashes.setMatrixAt(i,w.matrix);});
    w.splashes.count=w.spray.length;w.splashes.instanceMatrix.needsUpdate=true;
}
function saveOutdoors(){return {weatherClock,residents:villagers.filter(v=>v.villageRoute&&!v.dying).map(v=>({key:v.villageKey,route:v.villageRoute,index:v.routeIndex,pos:v.mesh.position.toArray(),hp:v.hp})),residentKeys:[...villageResidentKeys]};}
function restoreOutdoors(data={}){
    clearFishing();rainColumns.clear();weatherClock=Number.isFinite(data.weatherClock)?Math.max(0,data.weatherClock):0;
    villageResidentKeys.clear();for(const key of data.residentKeys||[])villageResidentKeys.add(key);
    if(currentDimension==='overworld')for(const v of (data.residents||[]).slice(0,48)){
        if(!Array.isArray(v.pos)||!v.pos.every(Number.isFinite)||!v.route?.every(p=>p.length===2&&p.every(Number.isFinite)))continue;
        spawnVillagerAt(...v.pos);Object.assign(villagers.at(-1),{villageKey:v.key,villageRoute:v.route,routeIndex:v.index||0,hp:v.hp||4});
    }
    if(weatherVisual){weatherVisual.kind='clear';weatherVisual.particles.length=0;weatherVisual.spray.length=0;weatherVisual.drops.visible=weatherVisual.splashes.visible=false;}
}
function updateOutdoors(dt){
    updateFishing(dt);updateWeather(dt);
    villageResidentTick+=dt;if(villageResidentTick>=1){villageResidentTick=0;populateVillagePaths();}
}
