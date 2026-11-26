/*
 * Integration (classic script; no automatic patches to the game):
 * - Load after animal-leads.js. Call initWildlifeCompanions() after
 *   initAnimalLeads(), before initCreativeInventory(). Late init also works.
 * - In mousedown, after the locked/loading/eating/UI guards, BEFORE the meat
 *   eating and tool-inventory branches: if(handleWildlifeCompanionClick(e))return;
 * - In updateHeldItem3D, before generic items:
 *   if(WILDLIFE_ITEMS[blockId]){heldItemGroup.add(buildWildlifeHeldItem(blockId));return;}
 * - Call updateWildlifeCompanions(delta) once per gameplay frame. It includes
 *   natural spawning, animation and moveWalkingMob; never add these to animals.
 * - Add wildlifeCompanions:saveWildlifeCompanions() to getWorldSaveData() AND
 *   snapshotDimension(). Restore with restoreWildlifeCompanions(data.wildlifeCompanions)
 *   after terrain/worldMap restoration (next to restoreFarmAnimals).
 * - Call clearWildlifeCompanions() in clearExpansionWorld (reset/file load).
 *   On portal travel: snapshot the OLD dimension first, then clear, then restore
 *   saved?.wildlifeCompanions AFTER restoring the destination terrain. Dogs stay
 *   in their own dimension, including sitting dogs; they do not teleport portals.
 * - In the pointer-lock unlock handler, skip the pause overlay while
 *   isWildlifeCompanionDialogOpen(). closeWildlifeCompanionDialog(false) is the
 *   lifecycle close hook; clear/restore already call it. No global key hooks.
 *
 * Interaction: right-click a wild wolf with Bone; right-click your dog to switch
 * sit/follow; Shift-right-click to edit name/order. Meat (39/40) heals owned dogs.
 * Custom accessibility rules: ONE bone always tames, and 1 Raw Meat -> 1 Bone is
 * a Survival workbench recipe. No Name Tag/anvil dependency. 251 unused; 252+ reserved.
 * References (behavior only; all models/icons are original procedural artwork):
 * https://www.minecraft.net/en-us/article/wolf
 * https://www.minecraft.net/en-us/article/taking-inventory--bone
 *
 * Limits: no breeding, combat AI, leads, or automatic teleport. These entities
 * deliberately stay out of livestock drops and generic spawnedMobs saves.
 * Ownership uses a persistent local profile UUID, not a shared "player" string.
 * Existing PeerJS IDs are session identities, not durable authenticated profiles.
 * Guests cannot spawn/tame/rename/order/simulate; host only commands its own dogs.
 * Snapshots can render on guests but live entity/command packets are NOT wired.
 * Save files are trusted local data, not multiplayer proof of ownership. Clearing
 * browser storage loses ownership; never silently adopt another profile's dogs.
 */
const WOLF_EGG_ID=249,BONE_ID=250;
const WILDLIFE_ITEMS={249:'Wolf Egg',250:'Bone'};
const wildlifeCompanions=[];
const WILDLIFE_LIMIT=32,WILDLIFE_TAME_LIMIT=16,WILDLIFE_HEIGHT=1.25,WILDLIFE_RADIUS=.74;
let wildlifeInitialized=false,wildlifeSpawnTime=6,wildlifeProfileId=null,wildlifeDialog=null,wildlifeEditing=null;
let wildlifeDialogFocus=null,wildlifeDialogResume=false;

function wildlifeOwnerId(){
    if(wildlifeProfileId)return wildlifeProfileId;
    const key='mc-wildlife-owner-v1';
    try{const saved=localStorage.getItem(key);if(/^local:[a-zA-Z0-9-]{16,80}$/.test(saved||''))wildlifeProfileId=saved;}catch(_error){}
    if(!wildlifeProfileId){
        wildlifeProfileId='local:'+THREE.MathUtils.generateUUID();
        try{localStorage.setItem(key,wildlifeProfileId);}catch(_error){}
    }
    return wildlifeProfileId;
}
function wildlifeAuthority(){return !multiplayerRoom||multiplayerRoom.role==='host';}
function wildlifeName(value){
    if(typeof value!=='string')return '';
    return Array.from(value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,'').trim()).slice(0,24).join('');
}
function wildlifeIcon(id){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=16;const c=canvas.getContext('2d');
    const rect=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
    if(id===WOLF_EGG_ID){
        rect(5,2,6,12,'#687170');rect(3,5,10,8,'#687170');rect(4,5,8,8,'#c4cbc8');rect(6,3,4,11,'#dce0da');
        rect(5,5,3,3,'#7c8582');rect(9,9,3,3,'#7c8582');rect(5,11,2,2,'#939e99');
    }else{
        for(let i=0;i<8;i++)rect(4+i,10-i,3,3,'#6f7776');
        rect(2,9,5,5,'#6f7776');rect(9,2,5,5,'#6f7776');
        for(let i=0;i<8;i++)rect(4+i,10-i,2,2,'#e5e7d9');
        for(const [x,y] of [[2,10],[4,12],[10,2],[12,4]])rect(x,y,2,2,'#f4f5ea');
    }
    return canvas;
}
function initWildlifeCompanions(){
    if(wildlifeInitialized)return;
    for(const [text,name] of Object.entries(WILDLIFE_ITEMS)){
        const id=Number(text);
        if(NATURE_ITEMS[id]&&NATURE_ITEMS[id]!==name)throw Error('Wildlife item ID already in use: '+id);
    }
    Object.assign(NATURE_ITEMS,WILDLIFE_ITEMS);
    Object.assign(COMMAND_ITEMS,{'wolf':WOLF_EGG_ID,'wolf egg':WOLF_EGG_ID,'bone':BONE_ID});
    recipes.push({ing:{39:1},out:BONE_ID,count:1});
    for(const [text,name] of Object.entries(WILDLIFE_ITEMS)){
        const id=Number(text),canvas=wildlifeIcon(id),map=new THREE.CanvasTexture(canvas);
        map.magFilter=map.minFilter=THREE.NearestFilter;
        materials[id]=new THREE.MeshLambertMaterial({map,transparent:true,alphaTest:.5});itemIcons.set(id,canvas.toDataURL());
        if(!TOOL_ITEMS.includes(id))TOOL_ITEMS.push(id);
        const slot=document.createElement('button');slot.type='button';slot.className='slot catalog-item';slot.id='inv-'+(id-12);
        slot.textContent=name;slot.dataset.item=id;slot.dataset.search=(name+(id===WOLF_EGG_ID?' dog companion':' tame wolf')).toLowerCase();
        const img=document.createElement('img');img.src=itemIcons.get(id);img.alt='';slot.prepend(img);
        slot.onclick=()=>chooseCatalogItem(id);slot.draggable=true;
        slot.ondragstart=e=>{chooseCatalogItem(id);e.dataTransfer.setData('text/plain',String(id));};
        document.getElementById(id===WOLF_EGG_ID?'tab-mods':'tab-weapon').append(slot);
    }
    createWildlifeCompanionDialog();wildlifeOwnerId();wildlifeInitialized=true;
    updateInventoryCounts();updateHotbarUI();
}
function buildWildlifeHeldItem(id){
    const group=buildFirstPersonRig(false);group.userData.modItem=true;
    if(id===BONE_ID){
        const bone=new THREE.Group();bone.rotation.z=-.6;group.add(bone);
        addModelBox(bone,.075,.36,.075,0xdfe3d5,0,.15,0);
        for(const y of [-.04,.34])for(const x of [-.045,.045])addModelBox(bone,.1,.1,.1,0xf1f2e7,x,y,0);
    }else if(id===WOLF_EGG_ID){
        const shell=skinMaterial('wildlife-egg',['#c4cbc8','#dce0da','#7c8582']);
        skinnedPart(group,.24,.3,.24,shell,0,.12,0);skinnedPart(group,.16,.08,.16,shell,0,.31,0);
        skinnedPart(group,.18,.05,.18,shell,0,-.055,0);
    }
    return group;
}
function buildWildlifeWolf(){
    const root=new THREE.Group(),coat=skinMaterial('wildlife-wolf-coat',['#c0c8c5','#c7cfcb','#b8c1be'],r=>{
        r(0,0,16,3,'#899690');r(2,3,3,2,'#a4afaa');r(10,7,4,2,'#d7ddd4');r(5,12,3,2,'#b0bbb5');
    });
    const pale=skinMaterial('wildlife-wolf-pale',['#e0e4db','#d7dfd4','#e7eadf']);
    skinnedPart(root,.47,.44,.8,coat,0,.06,-.04,'body');
    const head=new THREE.Group();head.position.set(0,.37,.4);root.add(head);root.userData.head=head;
    skinnedPart(head,.43,.4,.36,pale,0,0,0);
    skinnedPart(head,.28,.2,.24,pale,0,-.09,.21);
    addModelBox(head,.15,.09,.055,0x293331,0,-.04,.355);
    for(const x of [-.14,.14]){
        skinnedPart(head,.13,.22,.13,coat,x,.26,-.06);
        addModelBox(head,.07,.11,.015,0x9e9c91,x,.27,.013);
        addModelBox(head,.075,.065,.02,0x273c37,x,.025,.187);
        addModelBox(head,.025,.022,.023,0xf7f6e4,x-.012,.042,.19);
    }
    const collar=new THREE.Group();collar.position.set(0,.085,.39);root.add(collar);root.userData.collar=collar;
    addModelBox(collar,.5,.115,.14,0xc43e45,0,0,0);addModelBox(collar,.085,.09,.02,0xe5c064,0,-.015,.08);collar.visible=false;
    for(const [name,x,z] of [['leftLeg',-.16,.24],['rightLeg',.16,.24],['backLeftLeg',-.16,-.31],['backRightLeg',.16,-.31]])
        jointLeg(root,x,-.14,z,.14,.36,pale,name,0x8a9891);
    const tail=new THREE.Group();tail.position.set(0,.13,-.42);tail.rotation.x=-.85;root.add(tail);root.userData.tail=tail;
    skinnedPart(tail,.16,.43,.16,coat,0,-.2,0);skinnedPart(tail,.17,.12,.17,pale,0,-.39,0);
    root.userData.mobHeight=WILDLIFE_HEIGHT;root.userData.mobRadius=WILDLIFE_RADIUS;
    rememberOriginalMaterials(root);return root;
}
function wildlifeEntities(){return [...animals,...villagers,...zombies,...creepers,...endermen,...adventureMobs,...wildlifeCompanions];}
function wildlifeHazardAt(x,y,z){const id=getBlock(x,y,z);return isWaterType(id)||id===LAVA_ID||id===SPIKE_TRAP_ID;}
function wildlifeSafeVolume(p){
    if(mobBodyBlocked(p,WILDLIFE_HEIGHT,WILDLIFE_RADIUS))return false;
    for(let x=Math.floor(p.x-WILDLIFE_RADIUS+.5);x<=Math.floor(p.x+WILDLIFE_RADIUS+.5-1e-5);x++)
        for(let z=Math.floor(p.z-WILDLIFE_RADIUS+.5);z<=Math.floor(p.z+WILDLIFE_RADIUS+.5-1e-5);z++)
            for(let y=Math.floor(p.y-.01);y<=Math.floor(p.y+WILDLIFE_HEIGHT-1e-5);y++)if(wildlifeHazardAt(x,y,z))return false;
    return true;
}
function wildlifeSupported(p){
    const y=Math.floor(p.y-.01),r=WILDLIFE_RADIUS-.04;
    // A leading foot can support a step before the rest of the body clears it.
    return [[0,0],[-r,-r],[-r,r],[r,-r],[r,r]].some(([dx,dz])=>{
        const x=Math.round(p.x+dx),z=Math.round(p.z+dz);
        return isSolid(x,y,z)&&!wildlifeHazardAt(x,y,z)&&getBlock(x,y,z)!==98;
    });
}
function spawnWildlifeWolf(x,y,z,{natural=false,restoring=false}={}){
    if(![x,y,z].every(v=>Number.isFinite(v)&&Math.abs(v)<=100000)||wildlifeCompanions.length>=WILDLIFE_LIMIT)return null;
    if(!restoring&&!wildlifeAuthority()||!['overworld','nether','end'].includes(currentDimension))return null;
    const p=new THREE.Vector3(x,y,z);
    if(!wildlifeSafeVolume(p)||!restoring&&!wildlifeSupported(p))return null;
    if(!restoring){
        if(wildlifeEntities().filter(m=>!m.dying).length>=80)return null;
        if(wildlifeEntities().some(m=>!m.dying&&Math.abs(m.mesh.position.y-y)<WILDLIFE_HEIGHT&&
            Math.hypot(m.mesh.position.x-x,m.mesh.position.z-z)<WILDLIFE_RADIUS+(m.mesh.userData.mobRadius||.4)))return null;
        if(Math.hypot(camera.position.x-x,camera.position.z-z)<WILDLIFE_RADIUS+getPlayerRadius()&&
            y+WILDLIFE_HEIGHT-.5>camera.position.y-getPlayerHeight()&&y-.5<camera.position.y+.2*playerScale)return null;
    }
    const mesh=buildWildlifeWolf();mesh.position.copy(p);scene.add(mesh);
    const wolf={id:THREE.MathUtils.generateUUID(),mesh,type:'wolf',dimension:currentDimension,owner:null,name:'',state:'wild',natural:!!natural,
        hp:12,vx:0,vy:0,vz:0,onGround:false,timer:0,walkTime:0,hurtTimer:0,dying:false,steerTime:0,heading:null};
    wildlifeCompanions.push(wolf);return wolf;
}
function wildlifeCanReach(wolf){
    if(!wolf||!wildlifeCompanions.includes(wolf)||wolf.dying||wolf.dimension!==currentDimension||wolf.mesh.parent!==scene)return false;
    const target=wolf.mesh.position.clone().add(new THREE.Vector3(0,.2,0));
    return target.distanceTo(camera.position)<=6&&hasClearLineBetween(camera.position,target);
}
function canCommandWildlifeCompanion(wolf){return wildlifeAuthority()&&wildlifeCanReach(wolf)&&wolf.owner===wildlifeOwnerId();}
function tameWildlifeWolf(wolf){
    if(!wildlifeAuthority()||!wildlifeCanReach(wolf)||wolf.owner)return false;
    if(wildlifeCompanions.filter(w=>w.owner===wildlifeOwnerId()).length>=WILDLIFE_TAME_LIMIT){showToast('Companion limit reached.');return false;}
    if(!consumeInventoryItem(BONE_ID)){showToast('You need a Bone.');return false;}
    wolf.owner=wildlifeOwnerId();wolf.name='Dog';wolf.state='follow';wolf.natural=false;wolf.vx=wolf.vz=0;wolf.steerTime=0;
    updateWildlifeAppearance(wolf);updateInventoryCounts();updateHotbarUI();showToast('Wolf tamed.');return true;
}
function setWildlifeCompanionOrder(wolf,state){
    if(!canCommandWildlifeCompanion(wolf)||!['sit','follow'].includes(state))return false;
    wolf.state=state;wolf.vx=wolf.vz=0;wolf.steerTime=0;updateWildlifeAppearance(wolf);return true;
}
function renameWildlifeCompanion(wolf,name){
    const clean=wildlifeName(name);if(!clean||!canCommandWildlifeCompanion(wolf))return false;
    wolf.name=clean;updateWildlifeAppearance(wolf);return true;
}
function removeWildlifeLabel(wolf){
    const label=wolf.mesh.userData.nameLabel;if(!label)return;
    label.material.map.dispose();label.material.dispose();wolf.mesh.remove(label);delete wolf.mesh.userData.nameLabel;
}
function updateWildlifeAppearance(wolf){
    const u=wolf.mesh.userData;u.collar.visible=!!wolf.owner;
    if((u.labelName||'')!==(wolf.owner?wolf.name:'')){
        removeWildlifeLabel(wolf);u.labelName=wolf.owner?wolf.name:'';
        if(u.labelName){
            const canvas=document.createElement('canvas');canvas.width=512;canvas.height=64;const c=canvas.getContext('2d');
            let size=40;c.font=size+'px sans-serif';while(c.measureText(u.labelName).width>480&&size>12)c.font=--size+'px sans-serif';
            canvas.width=Math.min(512,Math.max(128,Math.ceil(c.measureText(u.labelName).width)+32));c.font=size+'px sans-serif';
            c.fillStyle='rgba(20,28,26,.85)';c.fillRect(0,0,canvas.width,64);c.fillStyle='#ffffff';c.textAlign='center';c.textBaseline='middle';c.fillText(u.labelName,canvas.width/2,32);
            const texture=new THREE.CanvasTexture(canvas),label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthWrite:false}));
            label.position.set(0,1.06,0);label.scale.set(canvas.width/200,.32,1);label.raycast=()=>{};wolf.mesh.add(label);u.nameLabel=label;
        }
    }
    const sit=wolf.state==='sit';u.body.position.y=sit?-.08:.06;u.body.rotation.x=sit?-.38:0;
    u.head.position.y=sit?.25:.37;u.collar.position.y=sit?-.035:.085;
    for(const name of ['backLeftLeg','backRightLeg']){u[name].position.y=sit?-.32:-.14;u[name].rotation.x=sit?-1.25:0;}
    for(const name of ['leftLeg','rightLeg'])u[name].rotation.x=0;
    u.tail.position.y=sit?-.15:.13;u.tail.rotation.x=sit?-1.5:wolf.owner?-1.15:-.85;
}
function traceWildlifeCompanion(origin,direction,range=5.5){
    const dir=direction.clone().normalize(),hit=traceCombatRay(origin,dir,range),ray=new THREE.Ray(origin,dir),point=new THREE.Vector3();
    let closest=hit.distance,wolf=null;
    for(const candidate of wildlifeCompanions){
        if(candidate.dying||candidate.dimension!==currentDimension||candidate.mesh.parent!==scene)continue;
        const p=candidate.mesh.position,box=new THREE.Box3(new THREE.Vector3(p.x-WILDLIFE_RADIUS,p.y-.5,p.z-WILDLIFE_RADIUS),
            new THREE.Vector3(p.x+WILDLIFE_RADIUS,p.y-.5+WILDLIFE_HEIGHT,p.z+WILDLIFE_RADIUS));
        if(ray.intersectBox(box,point)&&origin.distanceTo(point)<closest){closest=origin.distanceTo(point);wolf=candidate;}
    }
    return wolf;
}
function handleWildlifeCompanionClick(event){
    if(isWildlifeCompanionDialogOpen())return true;
    if(!isGameStarted||!controls.isLocked||worldLoading||isSleeping||eatingState)return false;
    if(event.button!==0&&event.button!==2)return false;
    const wolf=traceWildlifeCompanion(camera.position,camera.getWorldDirection(new THREE.Vector3()));
    if(wolf&&event.button===0){cancelMining();return true;} // No accidental pet damage or digging through a dog.
    if(event.button!==2)return !!WILDLIFE_ITEMS[currentBlock];
    if(!wolf&&currentBlock!==WOLF_EGG_ID&&currentBlock!==BONE_ID)return false;
    cancelMining();
    if(!wildlifeAuthority()){showToast('Companion changes are unavailable as a guest.');return true;}
    if(currentBlock===WOLF_EGG_ID){
        if(!hasInventoryItem(WOLF_EGG_ID)){showToast('You need a Wolf Egg.');return true;}
        if(wolf)return true;
        const hit=traceCombatRay(camera.position,camera.getWorldDirection(new THREE.Vector3()),5.5);
        if(hit.entity||!hit.block?.previous)return true;
        const spawned=spawnWildlifeWolf(...hit.block.previous);
        if(!spawned){showToast('Not enough safe space here.');return true;}
        if(!consumeInventoryItem(WOLF_EGG_ID)){removeWildlifeCompanion(spawned);return true;}
        updateInventoryCounts();updateHotbarUI();showToast('Wolf');return true;
    }
    if(!wolf)return true;
    if(!wolf.owner){if(currentBlock===BONE_ID)tameWildlifeWolf(wolf);else showToast('Wild Wolf');return true;}
    if(!canCommandWildlifeCompanion(wolf)){showToast('This dog belongs to another player.');return true;}
    if(event.shiftKey){openWildlifeCompanionDialog(wolf);return true;}
    if(currentBlock===39||currentBlock===40){
        if(wolf.hp>=12){showToast('Dog is healthy.');return true;}
        if(!consumeInventoryItem(currentBlock)){showToast('You need meat.');return true;}
        wolf.hp=Math.min(12,wolf.hp+(currentBlock===40?6:3));updateInventoryCounts();updateHotbarUI();showToast('Dog fed.');return true;
    }
    if(setWildlifeCompanionOrder(wolf,wolf.state==='sit'?'follow':'sit'))showToast(wolf.state==='sit'?'Sitting.':'Following.');
    return true;
}

function wildlifeSteer(wolf,target,speed,delta){
    wolf.steerTime=Math.max(0,wolf.steerTime-delta);if(wolf.steerTime)return;
    wolf.steerTime=.12;wolf.vx=wolf.vz=0;
    const p=wolf.mesh.position,angle=Math.atan2(target.x-p.x,target.z-p.z);let best=null,score=-Infinity;
    // Reuse the lead steering pattern; the shared swept-volume solver owns steps.
    for(const turn of [0,.55,-.55,1.1,-1.1,1.55,-1.55]){
        const heading=angle+turn,next=p.clone().add(new THREE.Vector3(Math.sin(heading)*.75,0,Math.cos(heading)*.75));
        if(!wildlifeSafeVolume(next)){
            next.y+=1;if(!wolf.onGround||!wildlifeSafeVolume(next))continue;
        }
        if(!wildlifeSupported(next)){
            next.y-=1;if(!wildlifeSupported(next)||!wildlifeSafeVolume(next))continue;
        }
        const value=Math.cos(turn)+(wolf.heading===null?0:.35*Math.cos(heading-wolf.heading));
        if(value>score){best=heading;score=value;}
    }
    if(best!==null){wolf.heading=best;wolf.vx=Math.sin(best)*speed;wolf.vz=Math.cos(best)*speed;}
}
function spawnNaturalWildlifeWolf(){
    if(!wildlifeAuthority()||currentDimension!=='overworld'||['moon','desert','city'].includes(selectedTerrain)||
        wildlifeCompanions.filter(w=>w.natural&&!w.owner).length>=6)return null;
    for(let i=0;i<12;i++){
        const angle=Math.random()*Math.PI*2,distance=14+Math.random()*14;
        const x=Math.round(camera.position.x+Math.sin(angle)*distance),z=Math.round(camera.position.z+Math.cos(angle)*distance),y=getSurfaceHeight(x,z)+1;
        if(selectedTerrain==='random'&&!['snow','autumn','meadow'].includes(biomeColumn(x,z).biome))continue;
        if(![1,2,SNOW_LAYER_ID].includes(getBlock(x,y-1,z)))continue;
        const wolf=spawnWildlifeWolf(x,y,z,{natural:true});if(wolf)return wolf;
    }
    return null;
}
function updateWildlifeCompanions(delta){
    if(!Number.isFinite(delta)||delta<=0)return;
    for(const wolf of wildlifeCompanions)wolf.mesh.visible=wolf.dimension===currentDimension;
    if(!isGameStarted||worldLoading||!controls.isLocked||isSleeping||isWildlifeCompanionDialogOpen()||!wildlifeAuthority())return;
    delta=Math.min(delta,.1);
    wildlifeSpawnTime-=delta;if(wildlifeSpawnTime<=0){wildlifeSpawnTime=12;spawnNaturalWildlifeWolf();}
    for(const wolf of wildlifeCompanions.slice()){
        if(wolf.dimension!==currentDimension)continue;
        if(wolf.dying||wolf.mesh.position.y< -128){removeWildlifeCompanion(wolf);continue;}
        const p=wolf.mesh.position,dx=camera.position.x-p.x,dz=camera.position.z-p.z,distance=Math.hypot(dx,dz);
        if(!wolf.owner&&wolf.natural&&distance>96){removeWildlifeCompanion(wolf);continue;}
        const before=p.clone();
        if(wolf.owner){
            if(wolf.state==='follow'&&wolf.owner===wildlifeOwnerId()&&distance>2.2){
                wildlifeSteer(wolf,camera.position,Math.min(4.8,1.5+(distance-2.2)*.8),delta);
            }else{wolf.vx=wolf.vz=0;wolf.steerTime=0;}
        }else if(currentBlock===BONE_ID&&hasInventoryItem(BONE_ID)&&distance<7&&hasClearLineBetween(p.clone().add(new THREE.Vector3(0,.3,0)),camera.position)){
            if(distance>2)wildlifeSteer(wolf,camera.position,1.3,delta);else wolf.vx=wolf.vz=0;
        }else{
            wolf.timer-=delta;
            if(wolf.timer<=0){wolf.timer=2+Math.random()*3;const a=Math.random()*Math.PI*2;wolf.wander=p.clone().add(new THREE.Vector3(Math.sin(a)*4,0,Math.cos(a)*4));}
            wildlifeSteer(wolf,wolf.wander||p,.65,delta);
        }
        // Recheck the next movement volume each frame, including newly placed water.
        const next=p.clone().add(new THREE.Vector3(wolf.vx*delta,0,wolf.vz*delta));
        if(!wildlifeSafeVolume(next)){
            next.y+=1;if(!wolf.onGround||!wildlifeSafeVolume(next)){wolf.vx=wolf.vz=0;wolf.steerTime=0;}
        }
        if(!wildlifeSupported(next)){
            next.y-=1;if(!wildlifeSupported(next)||!wildlifeSafeVolume(next)){wolf.vx=wolf.vz=0;wolf.steerTime=0;}
        }
        moveWalkingMob(wolf,delta,WILDLIFE_HEIGHT,WILDLIFE_RADIUS);
        const moved=Math.hypot(p.x-before.x,p.z-before.z);
        if(wolf.state!=='sit')animateWalkingAnimal(wolf,moved,delta);
        wolf.mesh.userData.tail.rotation.z=wolf.owner&&wolf.state!=='sit'?Math.sin(wolf.walkTime+performance.now()*.006)*.12:0;
        if(moved<1e-5)wolf.steerTime=0;
    }
}
function removeWildlifeCompanion(wolf){
    const index=wildlifeCompanions.indexOf(wolf);if(index<0)return;
    if(wildlifeEditing===wolf)closeWildlifeCompanionDialog(false);
    removeWildlifeLabel(wolf);disposeModModel(wolf.mesh);wildlifeCompanions.splice(index,1);
}
function clearWildlifeCompanions(){
    closeWildlifeCompanionDialog(false);
    for(const wolf of wildlifeCompanions.slice())removeWildlifeCompanion(wolf);
    wildlifeSpawnTime=6;
}
function saveWildlifeCompanions(){
    return wildlifeCompanions.filter(w=>!w.dying&&w.dimension===currentDimension).slice(0,WILDLIFE_LIMIT).map(w=>({
        id:w.id,pos:w.mesh.position.toArray(),yaw:w.mesh.rotation.y,dimension:w.dimension,owner:w.owner,name:w.name,state:w.state,hp:w.hp,natural:w.natural
    }));
}
function restoreWildlifeCompanions(data){
    clearWildlifeCompanions();if(!Array.isArray(data))return 0;
    const seen=new Set();
    for(const entry of data.slice(0,WILDLIFE_LIMIT)){
        if(!entry||typeof entry.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(entry.id)||seen.has(entry.id)||entry.dimension!==currentDimension||
            !Array.isArray(entry.pos)||entry.pos.length!==3||!entry.pos.every(v=>Number.isFinite(v)&&Math.abs(v)<=100000))continue;
        const owned=typeof entry.owner==='string'&&/^[a-zA-Z0-9:_-]{1,128}$/.test(entry.owner);
        if(entry.owner!==null&&!owned||!['wild','sit','follow'].includes(entry.state)||owned===(entry.state==='wild'))continue;
        if(entry.hp!==undefined&&(!Number.isFinite(entry.hp)||entry.hp<=0))continue;
        const wolf=spawnWildlifeWolf(...entry.pos,{restoring:true,natural:!owned&&entry.natural===true});if(!wolf)continue;
        seen.add(entry.id);wolf.id=entry.id;wolf.owner=owned?entry.owner:null;wolf.name=owned?(wildlifeName(entry.name)||'Dog'):'';wolf.state=entry.state;
        wolf.hp=Math.max(1,Math.min(12,entry.hp??12));wolf.mesh.rotation.y=Number.isFinite(entry.yaw)?entry.yaw%(Math.PI*2):0;
        updateWildlifeAppearance(wolf);
    }
    return wildlifeCompanions.length;
}

function isWildlifeCompanionDialogOpen(){return !!wildlifeDialog?.open;}
function createWildlifeCompanionDialog(){
    const style=document.createElement('style');style.textContent=`
        #wildlife-companion-dialog{box-sizing:border-box;width:360px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);overflow:auto;padding:20px;border:2px solid #81958a;border-radius:6px;background:#202724;color:#f4f6ee;font:16px/1.4 sans-serif;letter-spacing:0}
        #wildlife-companion-dialog::backdrop{background:rgba(0,0,0,.6)}
        #wildlife-companion-dialog h2{margin:0 0 16px;font-size:21px;overflow-wrap:anywhere}
        #wildlife-companion-dialog label{display:block}
        #wildlife-companion-dialog input[type=text]{box-sizing:border-box;width:100%;min-width:0;padding:10px;margin:6px 0 14px;border:1px solid #a0aca3;border-radius:3px;background:#121915;color:white;font:inherit}
        #wildlife-companion-dialog fieldset{display:flex;gap:20px;flex-wrap:wrap;margin:0;padding:12px;border:1px solid #738478;border-radius:3px}
        #wildlife-companion-dialog input[type=radio]{accent-color:#a8ce8d}
        #wildlife-companion-dialog footer{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}
        #wildlife-companion-dialog button{min-height:42px;padding:8px 16px;border:1px solid #94a58e;border-radius:3px;background:#344b3a;color:white;font:inherit;cursor:pointer}
        #wildlife-companion-dialog :focus-visible{outline:3px solid #e6c466;outline-offset:3px}
        #wildlife-companion-error{min-height:1.4em;color:#ffb5ad;overflow-wrap:anywhere;margin:10px 0}
    `;document.head.append(style);
    const dialog=document.createElement('dialog');dialog.id='wildlife-companion-dialog';dialog.setAttribute('aria-labelledby','wildlife-companion-title');
    dialog.innerHTML='<form><h2 id="wildlife-companion-title">Dog</h2><label for="wildlife-companion-name">Name</label><input id="wildlife-companion-name" type="text" maxlength="24" required autocomplete="off" aria-describedby="wildlife-companion-error"><fieldset><legend>Order</legend><label><input type="radio" name="order" value="follow"> Follow</label><label><input type="radio" name="order" value="sit"> Sit</label></fieldset><p id="wildlife-companion-error" role="status" aria-live="polite"></p><footer><button type="button" id="wildlife-companion-cancel">Cancel</button><button type="submit">Save</button></footer></form>';
    for(const type of ['keydown','keyup','mousedown','mouseup','click','wheel'])dialog.addEventListener(type,event=>event.stopPropagation());
    dialog.addEventListener('keydown',event=>{
        if(event.key!=='Tab')return;
        const fields=dialog.querySelectorAll('input[type=text],input[type=radio]:checked,button'),first=fields[0],last=fields[fields.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
    dialog.addEventListener('cancel',event=>{event.preventDefault();closeWildlifeCompanionDialog();});
    dialog.querySelector('#wildlife-companion-cancel').onclick=()=>closeWildlifeCompanionDialog();
    dialog.querySelector('form').onsubmit=event=>{
        event.preventDefault();const wolf=wildlifeEditing,name=wildlifeName(dialog.querySelector('input[type=text]').value);
        const error=dialog.querySelector('#wildlife-companion-error');
        if(!canCommandWildlifeCompanion(wolf)){error.textContent='This dog is no longer available.';return;}
        if(!name){error.textContent='Enter a name.';dialog.querySelector('input[type=text]').focus();return;}
        const order=dialog.querySelector('input[name=order]:checked')?.value;
        if(!['sit','follow'].includes(order))return;
        renameWildlifeCompanion(wolf,name);setWildlifeCompanionOrder(wolf,order);closeWildlifeCompanionDialog();
    };
    document.body.append(dialog);wildlifeDialog=dialog;
}
function openWildlifeCompanionDialog(wolf){
    if(!canCommandWildlifeCompanion(wolf))return false;
    if(!wildlifeDialog)createWildlifeCompanionDialog();
    if(wildlifeDialog.open)return false;
    wildlifeEditing=wolf;wildlifeDialogFocus=document.activeElement;wildlifeDialogResume=controls.isLocked;
    const input=wildlifeDialog.querySelector('input[type=text]');input.value=wolf.name;
    wildlifeDialog.querySelector('input[value='+wolf.state+']').checked=true;
    wildlifeDialog.querySelector('#wildlife-companion-error').textContent='';
    clearMovementInput();cancelMining();cancelEating();wildlifeDialog.showModal();controls.unlock();input.focus();input.select();return true;
}
function closeWildlifeCompanionDialog(resume=true){
    if(!wildlifeDialog?.open){wildlifeEditing=null;return;}
    wildlifeDialog.close();wildlifeEditing=null;clearMovementInput();
    if(wildlifeDialogFocus?.isConnected)wildlifeDialogFocus.focus();wildlifeDialogFocus=null;
    const relock=resume&&wildlifeDialogResume&&isGameStarted&&!worldLoading&&!isSleeping;wildlifeDialogResume=false;
    if(relock)controls.lock();
}
