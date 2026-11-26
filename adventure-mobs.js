const adventureMobs=[];
const villageRaidVisits=new Set();
const PILLAGER_PARTY_MIN=3,PILLAGER_PARTY_MAX=5,NATURAL_ADVENTURE_LIMIT=8;
let nextPillagerPartyId=1;
let ridingHorse=null,horseReturnPosition=null,adventureSpawnTime=0;
const adventurePlayerLast=new THREE.Vector3();
function buildPillager(){
    const g=new THREE.Group(),cloth=skinMaterial('pillager-coat',['#59464c','#655159','#514047']);
    const skin=skinMaterial('pillager-skin',['#8e9694','#949b99','#89918f']),face=skinMaterial('pillager-face',['#969e9b','#909895'],r=>{
        r(0,0,16,2,'#7e8785');r(2,2,4,2,'#a0a7a3');r(2,6,12,2,'#3c4543');
        r(2,8,4,2,'#e1e4dc');r(10,8,4,2,'#e1e4dc');r(4,8,2,2,'#466653');r(10,8,2,2,'#466653');
        r(0,10,2,4,'#7a8481');r(14,10,2,4,'#7a8481');r(6,14,4,2,'#53605b');
    });
    const head=skinnedPart(g,.54,.62,.5,[skin,skin,skin,skin,face,skin],0,1.2,0,'head');
    const nose=skinMaterial('pillager-nose',['#808c86','#85918a'],r=>{r(2,12,4,2,'#5c6b61');r(10,12,4,2,'#5c6b61');});
    skinnedPart(head,.135,.31,.22,nose,0,-.09,.34,'nose');
    skinnedPart(g,.64,.9,.38,cloth,0,.43,0,'body');addModelBox(g,.65,.12,.4,0x342f32,0,.07,0);addModelBox(g,.14,.14,.025,0xb9ad8b,0,.07,.215);
    for(const x of [-.4,.4]){skinnedPart(g,.2,.66,.22,cloth.clone(),x,.45,.16).rotation.x=-.6;addModelBox(g,.2,.15,.2,0x9d9f96,x,.21,.36);}
    const bow=buildWeaponModel(CROSSBOW_ID);bow.scale.setScalar(.85);bow.position.set(0,.47,.55);bow.rotation.x=Math.PI/2;g.add(bow);
    jointLeg(g,-.16,.08,0,.23,.58,cloth,'leftLeg');jointLeg(g,.16,.08,0,.23,.58,cloth,'rightLeg');rememberOriginalMaterials(g);return g;
}
function buildWarden(){
    const g=new THREE.Group(),skin=skinMaterial('warden-hide',['#17363e','#1b3f46','#20444a'],r=>{r(3,4,3,2,'#347276');r(11,10,2,3,'#305b61');});
    skinnedPart(g,1.15,1.35,.65,skin,0,1,0,'body');skinnedPart(g,.82,.65,.62,skin.clone(),0,2,0,'head');
    addModelBox(g,.48,.14,.03,0x101e23,0,1.91,.33);
    for(const side of [-1,1]){
        addModelBox(g,.17,.55,.18,0x4ba2a2,side*.57,2.2,0);addModelBox(g,.3,.14,.18,0x83c9c1,side*.62,2.48,0);
        for(let n=0;n<3;n++)addModelBox(g,.36,.09,.08,0xd2d8bd,side*.3,1.36-n*.21,.37);
        const arm=new THREE.Group();arm.position.set(side*.82,1.6,0);g.add(arm);g.userData[side<0?'leftArm':'rightArm']=arm;
        skinnedPart(arm,.39,1.4,.43,skin.clone(),0,-.65,0);addModelBox(arm,.4,.24,.44,0x133039,0,-1.3,.03);
    }
    const heart=new THREE.Mesh(new THREE.BoxGeometry(.3,.48,.06),new THREE.MeshLambertMaterial({color:0x58d9ce,emissive:0x164e50}));heart.position.set(0,1.08,.36);g.add(heart);g.userData.heart=heart;
    jointLeg(g,-.34,.4,0,.42,.9,skin,'leftLeg',0x10282f);jointLeg(g,.34,.4,0,.42,.9,skin,'rightLeg',0x10282f);
    rememberOriginalMaterials(g);return g;
}
function spawnAdventureMob(id,x,y,z,restoring=false){
    if(id===HORSE_EGG){if(!restoring&&!isAnimalSpawnSafe(x,y,z)||mobBodyBlocked(new THREE.Vector3(x,y,z),1.95,.76)||!spawnAnimal('horse',x,y,z,restoring))return null;const h=animals.at(-1);h.eggId=id;return h;}
    if(![PILLAGER_EGG,WARDEN_EGG].includes(id)||adventureMobs.length>=20)return null;
    const warden=id===WARDEN_EGG,mesh=warden?buildWarden():buildPillager();mesh.position.set(x,y,z);
    if(mobBodyBlocked(mesh.position,warden?3.05:1.98,warden?.95:.42)){disposeModModel(mesh);return null;}
    scene.add(mesh);const mob={mesh,kind:warden?'warden':'pillager',eggId:id,hp:warden?40:12,vx:0,vy:0,vz:0,onGround:false,timer:0,walkTime:0,hurtTimer:0,dying:false,attackTimer:1,heard:0,dimension:currentDimension};adventureMobs.push(mob);return mob;
}
function useAdventureEgg(id){
    if(!hasInventoryItem(id))return false;
    const mobs=[...animals,...adventureMobs,...villagers,...zombies,...creepers,...endermen];
    if(mobs.length>=80){showToast('Mob limit reached.');return true;}
    const hit=traceVoxelRay(camera.position,camera.getWorldDirection(new THREE.Vector3()),7,(type,x,y,z)=>isSolid(x,y,z));if(!hit?.previous)return true;
    const [x,y,z]=hit.previous;if(!isSolid(x,y-1,z))return true;
    const radius=id===WARDEN_EGG?.95:id===HORSE_EGG?.76:.42,height=id===WARDEN_EGG?3.05:1.98;
    if(Math.hypot(x-camera.position.x,z-camera.position.z)<getPlayerRadius()+radius&&y+height-.5>camera.position.y-getPlayerHeight()&&y-.5<camera.position.y+.2*playerScale||mobs.some(m=>m.mesh.position.distanceTo(new THREE.Vector3(x,y,z))<radius+(m.mesh.userData.mobRadius||.45))){showToast('Leave room around the spawn point.');return true;}
    const mob=spawnAdventureMob(id,x,y,z);
    if(mob){consumeInventoryItem(id);updateInventoryCounts();showToast(getBlockName(id));}else showToast('Not enough room here.');return true;
}
function panicAnimal(animal,origin){
    if(!animal.type||animal.dying)return;animal.panicTime=4;animal.fleeFrom=origin.clone();animal.timer=0;animal.panicSteerTime=0;
}
function updateAnimalPanic(animal,delta){
    if(!(animal.panicTime>0))return false;animal.panicTime=Math.max(0,animal.panicTime-delta);
    animal.panicSteerTime=Math.max(0,(animal.panicSteerTime||0)-delta);
    if(animal.panicSteerTime>0)return true;
    animal.panicSteerTime=.28;
    const p=animal.mesh.position,away=p.clone().sub(animal.fleeFrom||camera.position);away.y=0;
    if(away.lengthSq()<.01)away.set(1,0,0);away.normalize();
    const angle=Math.atan2(away.x,away.z),speed=animal.type==='horse'?5:3.6;
    const previous=Math.hypot(animal.vx,animal.vz)>.1?Math.atan2(animal.vx,animal.vz):angle;
    let best=null,bestScore=-Infinity;
    for(const turn of [0,.65,-.65,1.3,-1.3,Math.PI]){
        const a=angle+turn,next=p.clone().add(new THREE.Vector3(Math.sin(a),0,Math.cos(a)).multiplyScalar(.65));
        const x=Math.round(next.x),z=Math.round(next.z),y=Math.round(p.y);
        if(animalWouldEnterWater(x,y,z)||getBlock(x,y,z)===LAVA_ID||!isSolid(x,y-1,z)&&!isSolid(x,y,z))continue;
        if(mobBodyBlocked(next,animal.mesh.userData.mobHeight,animal.mesh.userData.mobRadius)){
            next.y+=1;
            if(!animal.onGround||mobBodyBlocked(next,animal.mesh.userData.mobHeight,animal.mesh.userData.mobRadius))continue;
        }
        const score=Math.cos(turn)+.65*Math.cos(a-previous);
        if(score>bestScore){best=a;bestScore=score;}
    }
    animal.vx=best===null?0:Math.sin(best)*speed;animal.vz=best===null?0:Math.cos(best)*speed;
    animal.timer=.2;return true;
}
function animateWalkingAnimal(animal,distance,delta){
    const moving=distance>1e-5;
    if(moving){
        animal.walkTime+=distance*4;
        const target=Math.atan2(animal.vx,animal.vz),angle=animal.mesh.rotation.y;
        const turn=Math.atan2(Math.sin(target-angle),Math.cos(target-angle));
        animal.mesh.rotation.y+=THREE.MathUtils.clamp(turn,-6*delta,6*delta);
    }
    const stride=moving?Math.sin(animal.walkTime)*.35:0;
    for(const [name,sign] of [['leftLeg',1],['rightLeg',-1],['backLeftLeg',-1],['backRightLeg',1]]){
        const leg=animal.mesh.userData[name];if(leg)leg.rotation.x+=(stride*sign-leg.rotation.x)*Math.min(1,delta*22);
    }
}
function addHorseSaddle(mesh){
    if(mesh.userData.saddle)return;
    const saddle=new THREE.Group();addModelBox(saddle,.75,.12,.6,0x6b4131,0,.89,-.12);for(const x of [-.39,.39])addModelBox(saddle,.04,.38,.12,0x9f9d8d,x,.66,-.12);mesh.add(saddle);mesh.userData.saddle=saddle;
}
function mountHorse(horse){
    if(ridingHorse||drivingCar||seatedAt||ridingMinecart||activeMech||playerScale!==1||horse.dying)return false;
    if(mobBodyBlocked(horse.mesh.position,3,.95)){showToast('Not enough headroom to ride.');return false;}
    releaseAnimalLead(horse,true);
    horseReturnPosition=camera.position.clone();ridingHorse=horse;horse.eggId=HORSE_EGG;horse.vx=horse.vz=0;horse.panicTime=0;resetPlayerFlight();velocity.set(0,0,0);
    addHorseSaddle(horse.mesh);
    camera.position.copy(horse.mesh.position).add(new THREE.Vector3(0,2.1,0));showToast('Horse');return true;
}
function dismountHorse(force=false){
    if(!ridingHorse)return true;const h=ridingHorse,p=h.mesh.position;
    let target=null;
    for(const r of [1.8,2.6,3.5])for(let i=0;i<8&&!target;i++){
        const x=p.x+Math.cos(i*Math.PI/4)*r,z=p.z+Math.sin(i*Math.PI/4)*r;
        for(let y=Math.floor(p.y+1);y>=Math.floor(p.y-3);y--){
            const pos=new THREE.Vector3(x,y+.5+getPlayerHeight(),z);
            if(isSolid(Math.round(x),y,Math.round(z))&&!checkScaledCollision(pos)){target=pos;break;}
        }
    }
    if(!target&&force){target=horseReturnPosition?.clone()||camera.position.clone();if(checkScaledCollision(target))target=camera.position.clone();}
    if(!target){showToast('No safe place to dismount.');return false;}
    ridingHorse=null;horseReturnPosition=null;camera.position.copy(target);velocity.set(0,0,0);h.vx=h.vz=0;clearMovementInput();return true;
}
function updateHorseRiding(delta){
    const h=ridingHorse;if(!h)return;if(h.dying||h.mesh.parent!==scene){dismountHorse(true);return;}
    const forward=camera.getWorldDirection(new THREE.Vector3());forward.y=0;forward.normalize();const right=new THREE.Vector3(-forward.z,0,forward.x);
    const motion=forward.multiplyScalar(Number(moveForward)-Number(moveBackward)).addScaledVector(right,Number(moveRight)-Number(moveLeft));motion.normalize();
    const speed=sprintKeys.size?8:6;h.vx=motion.x*speed;h.vz=motion.z*speed;
    const next=h.mesh.position.clone().addScaledVector(motion,.9),type=getBlock(Math.round(next.x),Math.round(next.y-1),Math.round(next.z));
    if(isWaterType(type)||type===LAVA_ID){h.vx=h.vz=0;}
    if(holdingSpace&&h.onGround){h.vy=9;h.onGround=false;}holdingSpace=false;
    const before=h.mesh.position.clone();moveWalkingMob(h,Math.min(delta,.1),3,.95);
    const moved=h.mesh.position.distanceToSquared(before)>.00001;if(motion.lengthSq())h.mesh.rotation.y=Math.atan2(motion.x,motion.z);
    h.walkTime+=moved?delta*10:0;for(const [name,sign] of [['leftLeg',1],['rightLeg',-1],['backLeftLeg',-1],['backRightLeg',1]])h.mesh.userData[name].rotation.x=moved?Math.sin(h.walkTime)*.5*sign:0;
    camera.position.copy(h.mesh.position).add(new THREE.Vector3(0,2.1,0));velocity.set(0,0,0);
}
function handleAdventureClick(e){
    if(ADVENTURE_EGGS.has(currentBlock)){if(e.button===2)useAdventureEgg(currentBlock);return true;}
    if(e.button===2&&!e.shiftKey&&!isToolItem(currentBlock)){
        const hit=traceCombatRay(camera.position,camera.getWorldDirection(new THREE.Vector3()),3.5);
        if(hit.entity?.type==='horse'){mountHorse(hit.entity);return true;}
    }
    if(e.button!==0)return false;
    if([SHRINK_POTION_ID,GROW_POTION_ID,39,40].includes(currentBlock)||KITCHEN_FOOD[currentBlock]||currentBlock>=67&&currentBlock<=71)return false;
    if(activeMech)return false;
    const hit=traceCombatRay(camera.position,camera.getWorldDirection(new THREE.Vector3()),3.2*playerScale);
    const ray=new THREE.Ray(camera.position,camera.getWorldDirection(new THREE.Vector3()));
    for(let i=minecarts.length-1;i>=0;i--){
        const cart=minecarts[i];cart.mesh.updateMatrixWorld(true);const p=ray.intersectBox(new THREE.Box3().setFromObject(cart.mesh),new THREE.Vector3());
        if(p&&p.distanceTo(camera.position)<hit.distance){if(!beginHandSwing())return true;if(ridingMinecart===cart)ridingMinecart=null;disposeModModel(cart.mesh);minecarts.splice(i,1);return true;}
    }
    if(hit.entity){if(beginHandSwing())damageMob(hit.entity,getHeldWeaponDamage());cancelMining();return true;}
    beginHandSwing();
    return false;
}
function firePillagerArrow(mob,target=mob.encounterTarget){
    if(!target||!encounterTargetVisible(mob,target,{range:24,originHeight:.8}))return false;
    const origin=mob.mesh.position.clone().add(new THREE.Vector3(0,.8,0)),aim=encounterTargetPosition(target).sub(origin),range=Math.hypot(aim.x,aim.z);
    const speed=22,gravity=9,discriminant=speed**4-gravity*(gravity*range*range+2*aim.y*speed*speed);
    if(discriminant<0)return false;
    const velocity=new THREE.Vector3();
    if(range<.01)velocity.set(0,Math.sign(aim.y||1)*speed,0);
    else{
        const slope=(speed*speed-Math.sqrt(discriminant))/(gravity*range),horizontal=speed/Math.sqrt(1+slope*slope);
        velocity.set(aim.x/range*horizontal,horizontal*slope,aim.z/range*horizontal);
    }
    const mesh=createFlyingArrow(CROSSBOW_ID);mesh.position.copy(origin);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),velocity.clone().normalize());scene.add(mesh);
    flyingArrows.push({mesh,velocity,life:6,damage:2,enemy:true,shooter:mob,target,dimension:currentDimension,stuck:null});
    while(flyingArrows.length>48){disposeModModel(flyingArrows.shift().mesh);}return true;
}
function nearbyPillagerVillage(){
    if(selectedTerrain==='random'&&wildernessVersion>=4){
        const home=villageRegion(camera.position.x,camera.position.z);
        if(home&&Math.hypot(home.x-camera.position.x,home.z-camera.position.z)<70&&villagers.some(v=>v.villageRoute&&!v.dying))return {...home,farm:true};
    }
    const resident=villagers.find(v=>!v.eggId&&!v.dying&&!v.merchantId&&v.mesh.position.distanceTo(camera.position)<55);
    if(!resident)return null;
    return resident.raidHome||(resident.raidHome={x:Math.round(resident.mesh.position.x),y:Math.round(resident.mesh.position.y-1),z:Math.round(resident.mesh.position.z),farm:false});
}
function villageRaidCrop(home){
    if(!home.farm)return null;
    // Only visit the generated village fields, never a player's chests or buildings.
    for(const [xmin,xmax,zmin,zmax] of [[6,18,-10,2],[-18,-6,14,25]])for(let a=xmin;a<=xmax;a++)for(let b=zmin;b<=zmax;b++){
        const x=home.x+a,y=home.y+1,z=home.z+b;
        if([WHEAT_RIPE,RICE_RIPE].includes(getBlock(x,y,z)))return [x,y,z];
    }
    return null;
}
function spawnPillagerParty(destination,{home=null,radius=22}={}){
    const room=Math.min(NATURAL_ADVENTURE_LIMIT-adventureMobs.filter(m=>!m.eggId).length,20-adventureMobs.length);
    if(room<PILLAGER_PARTY_MIN||gameDifficulty==='peaceful'||currentDimension!=='overworld'||!thermalAuthority())return null;
    const size=Math.min(room,PILLAGER_PARTY_MIN+Math.floor(Math.random()*(PILLAGER_PARTY_MAX-PILLAGER_PARTY_MIN+1)));
    const startAngle=Math.random()*Math.PI*2,formation=[[0,0],[-1.8,1.8],[1.8,1.8],[-.9,3.6],[.9,3.6]];
    const occupied=[...zombies,...creepers,...villagers,...animals,...endermen,...adventureMobs].filter(m=>!m.dying);
    for(let attempt=0;attempt<8;attempt++){
        const angle=startAngle+attempt*Math.PI/4,rx=Math.cos(angle),rz=Math.sin(angle),sx=-rz,sz=rx;
        const anchor=[destination[0]+rx*radius,destination[1],destination[2]+rz*radius],positions=[],offsets=[];
        for(const [side,back] of formation.slice(0,size)){
            const offset=[sx*side+rx*back,sz*side+rz*back],x=Math.round(anchor[0]+offset[0]),z=Math.round(anchor[2]+offset[1]),y=getSurfaceHeight(x,z)+1;
            const floor=getBlock(x,y-1,z),p=new THREE.Vector3(x,y,z);
            if(!isSolid(x,y-1,z)||isWaterType(floor)||floor===LAVA_ID||mobBodyBlocked(p,1.98,.42))continue;
            if(positions.length&&Math.abs(y-positions[0][1])>2)continue;
            if(p.distanceTo(camera.position)<2||occupied.some(m=>m.mesh.position.distanceToSquared(p)<2.25)||positions.some(v=>p.distanceToSquared(new THREE.Vector3(...v))<2.25))continue;
            positions.push([x,y,z]);offsets.push(offset);
        }
        if(positions.length<PILLAGER_PARTY_MIN)continue;
        const party={id:nextPillagerPartyId++,destination:home?(villageRaidCrop(home)||destination.slice()):destination.slice(),home:home?{...home}:null,time:home?75:100,leaving:false,members:[]};
        for(let i=0;i<positions.length;i++){
            const m=spawnAdventureMob(PILLAGER_EGG,...positions[i]);if(!m)continue;
            m.eggId=null;m.party=party;m.partyOffset=[offsets[i][0]-offsets[0][0],offsets[i][1]-offsets[0][1]];m.partyExit=positions[i];m.attackTimer=.8+i*.3;party.members.push(m);
            if(home)m.raid={home:party.home,exit:m.partyExit,time:party.time,target:party.destination,loot:null,leaving:false};
        }
        if(party.members.length>=PILLAGER_PARTY_MIN)return party;
        for(const m of party.members){disposeModModel(m.mesh);adventureMobs.splice(adventureMobs.indexOf(m),1);}
    }
    return null;
}
function updatePillagerParties(delta){
    const parties=new Set(adventureMobs.map(m=>m.party).filter(Boolean));
    for(const party of parties){
        party.time-=delta;
        if(party.time<10||gameDifficulty==='peaceful'||party.home&&!isNightTime())party.leaving=true;
        for(const m of party.members)if(m.raid){m.raid.time=party.time;m.raid.leaving=party.leaving;}
    }
}
function guidePillagerParty(mob){
    const party=mob.party,p=mob.mesh.position;
    if(!party.leaving&&party.home&&p.distanceTo(new THREE.Vector3(...party.destination))<1.5&&thermalAuthority()){
        if([WHEAT_RIPE,RICE_RIPE].includes(getBlock(...party.destination))){
            mob.raid.loot=harvestPlant(...party.destination);
            if(mob.raid.loot)rememberOriginalMaterials(addModelBox(mob.mesh,.35,.48,.22,0xb99557,0,.52,-.31));
        }
        party.leaving=true;
    }
    if(mob.raid)mob.raid.leaving=party.leaving;
    const target=party.leaving?mob.partyExit:[party.destination[0]+mob.partyOffset[0],party.destination[1],party.destination[2]+mob.partyOffset[1]];
    const dx=target[0]-p.x,dz=target[2]-p.z,d=Math.hypot(dx,dz);
    if(party.time< -30||party.leaving&&d<1.3&&Math.abs(target[1]-p.y)<1.5){dropRaidLoot(mob);mob.partyDone=true;return true;}
    if(d>.65)steerEncounterMob(mob,dx,dz,1.3,1.98,.42);
    return true;
}
function startVillageRaid(home){
    // Creative protects the player, not village crops. Only Peaceful disables visits.
    if(!isNightTime()||gameDifficulty==='peaceful'||currentDimension!=='overworld'||!thermalAuthority())return false;
    const key=home.farm?`farm:${home.x},${home.z}`:`village:${Math.round(home.x/128)},${Math.round(home.z/128)}`;
    if(villageRaidVisits.has(key))return false;
    const party=spawnPillagerParty([home.x,home.y+1,home.z],{home});
    if(party){villageRaidVisits.add(key);showToast('Pillagers are approaching the village.');}return !!party;
}
function dropRaidLoot(mob){
    const loot=mob.raid?.loot;if(!loot)return;
    spawnDroppedItem(...mob.mesh.position.toArray(),loot.id,loot.count);mob.raid.loot=null;
}
function guidePillagerVisit(mob,delta){
    if(mob.party)return guidePillagerParty(mob);
    const raid=mob.raid;if(!raid)return false;
    raid.time-=delta;if(!isNightTime()||gameDifficulty==='peaceful'||raid.time<10)raid.leaving=true;
    if(!raid.target&&!raid.leaving)raid.target=villageRaidCrop(raid.home)||[raid.home.x,raid.home.y+1,raid.home.z];
    const target=raid.leaving?raid.exit:raid.target,p=mob.mesh.position,dx=target[0]-p.x,dz=target[2]-p.z,d=Math.hypot(dx,dz);
    if(d<1.3&&Math.abs(target[1]-p.y)<1.5){
        if(raid.leaving){dropRaidLoot(mob);raid.done=true;return true;}
        if(thermalAuthority()&&[WHEAT_RIPE,RICE_RIPE].includes(getBlock(...target))){
            raid.loot=harvestPlant(...target);
            if(raid.loot)rememberOriginalMaterials(addModelBox(mob.mesh,.35,.48,.22,0xb99557,0,.52,-.31));
        }
        raid.leaving=true;return true;
    }
    if(raid.time< -30){dropRaidLoot(mob);raid.done=true;return true;}
    const angle=Math.atan2(dx,dz);
    for(const offset of [0,.65,-.65,1.3,-1.3]){
        const a=angle+offset,next=p.clone().add(new THREE.Vector3(Math.sin(a)*.7,0,Math.cos(a)*.7));
        if(mobBodyBlocked(next,1.98,.42))continue;
        if(!isSolid(Math.round(next.x),Math.round(next.y-1),Math.round(next.z)))continue;
        mob.vx=Math.sin(a)*1.3;mob.vz=Math.cos(a)*1.3;mob.mesh.rotation.y=a;break;
    }
    return true;
}
function updateAdventureMobs(delta){
    if(!controls.isLocked||!isGameStarted||isSleeping)return;
    if(!isNightTime())villageRaidVisits.clear();
    updatePillagerParties(delta);
    const noisy=camera.position.distanceToSquared(adventurePlayerLast)>.0004||handSwing>0;adventurePlayerLast.copy(camera.position);
    for(let i=adventureMobs.length-1;i>=0;i--){
        const m=adventureMobs[i],warden=m.kind==='warden';
        if(updateMobDamageState(m,delta)||m.dimension!==currentDimension){if(m.dimension===currentDimension)dropRaidLoot(m);disposeModModel(m.mesh);adventureMobs.splice(i,1);continue;}if(m.dying)continue;
        updateSpikeDamage(m,delta);if(m.dying)continue;m.attackTimer=Math.max(0,m.attackTimer-delta);m.heard=Math.max(0,m.heard-delta);
        if(!warden)updateHostileVoice(m,delta);
        const p=m.mesh.position,dx=camera.position.x-p.x,dz=camera.position.z-p.z,d=Math.hypot(dx,dz);
        if(warden&&hostileMobsEnabled()&&((noisy&&d<14)||d<3))m.heard=5;
        m.vx=m.vz=0;
        if(warden&&hostileMobsEnabled()&&d<24&&Math.abs(camera.position.y-p.y)<10&&m.heard>0){
            m.mesh.rotation.y=Math.atan2(dx,dz);
            const origin=p.clone().add(new THREE.Vector3(0,1.7,0)),clear=hasClearLineBetween(origin,camera.position);
            if(d>1.8||!clear){m.vx=dx/Math.max(.1,d)*2.1;m.vz=dz/Math.max(.1,d)*2.1;}
            if(clear&&!m.attackTimer&&d<2.3){takeDamage(4);m.attackTimer=1.5;}
        }else if(!warden){
            if(m.raid)guidePillagerVisit(m,delta);else if(m.party)guidePillagerParty(m);
            if(m.raid?.done||m.partyDone){disposeModModel(m.mesh);adventureMobs.splice(i,1);continue;}
            const leaving=m.party?.leaving||m.raid?.leaving;
            const target=leaving?(m.encounterTarget=null):selectHostileTarget(m,{range:m.raid?18:24,originHeight:.8});
            if(target){
                m.vx=m.vz=0;const point=encounterTargetPosition(target),tx=point.x-p.x,tz=point.z-p.z,distance=Math.hypot(tx,tz);
                m.mesh.rotation.y=Math.atan2(tx,tz);
                if(distance>9)steerEncounterMob(m,tx,tz,1.3,1.98,.42);
                if(distance<18&&!m.attackTimer&&firePillagerArrow(m,target))m.attackTimer=2.3;
            }else if(!m.raid&&!m.party&&gameDifficulty!=='peaceful')wanderEncounterMob(m,delta,.45);
            if(!target&&Math.hypot(m.vx,m.vz)>.05)m.mesh.rotation.y=Math.atan2(m.vx,m.vz);
        }
        const moving=moveWalkingMob(m,delta,warden?3.05:1.98,warden?.95:.42);m.walkTime+=delta*(moving?6:1);
        const step=moving?Math.sin(m.walkTime)*.3:0;m.mesh.userData.leftLeg.rotation.x=step;m.mesh.userData.rightLeg.rotation.x=-step;
        if(warden){m.mesh.userData.heart.material.emissiveIntensity=.7+Math.sin(m.walkTime*3)*.25;for(const arm of ['leftArm','rightArm'])m.mesh.userData[arm].rotation.x=m.attackTimer>1.1?-.8:step*.5;}
    }
    adventureSpawnTime+=delta;
    if(adventureSpawnTime<20)return;adventureSpawnTime=0;
    if(gameDifficulty==='peaceful'||!thermalAuthority()||currentDimension!=='overworld'||selectedTerrain==='moon')return;
    const village=isNightTime()?nearbyPillagerVillage():null;
    if(village){startVillageRaid(village);return;}
    if(!hostileMobsEnabled())return;
    const deep=camera.position.y<getSurfaceHeight(camera.position.x,camera.position.z)-12;
    if(!deep&&selectedTerrain!=='desert')return;
    if(!deep){spawnPillagerParty([camera.position.x,camera.position.y-getPlayerHeight()+.5,camera.position.z],{radius:22});return;}
    if(adventureMobs.filter(m=>!m.eggId).length>=3)return;
    for(let i=0;i<12;i++){
        const a=Math.random()*Math.PI*2,x=Math.round(camera.position.x+Math.cos(a)*18),z=Math.round(camera.position.z+Math.sin(a)*18);
        const y=deep?Math.round(camera.position.y-getPlayerHeight()+.5):getSurfaceHeight(x,z)+1;
        if(!isSolid(x,y-1,z))continue;const m=spawnAdventureMob(deep?WARDEN_EGG:PILLAGER_EGG,x,y,z);if(m){m.eggId=null;break;}
    }
}
function clearAdventureMobs(){dismountHorse(true);for(const m of adventureMobs)disposeModModel(m.mesh);adventureMobs.length=0;villageRaidVisits.clear();adventureSpawnTime=0;nextPillagerPartyId=1;handSwing=handCooldown=0;}
