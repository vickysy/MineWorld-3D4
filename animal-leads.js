const LEAD_ID=248,LEAD_POST_ID=98,MAX_FARM_ANIMALS=80;
const leadVisuals=new Map();
function initAnimalLeads(){
    NATURE_ITEMS[LEAD_ID]='Lead';TOOL_ITEMS.push(LEAD_ID);
    Object.assign(COMMAND_ITEMS,{'牵引绳':LEAD_ID,'拴绳':LEAD_ID,'绳子':LEAD_ID,'栅栏':LEAD_POST_ID});
    recipes.push({ing:{[STRING_ITEM]:4},out:LEAD_ID,count:1});
    const canvas=document.createElement('canvas');canvas.width=canvas.height=16;const c=canvas.getContext('2d');
    c.strokeStyle='#58402c';c.lineWidth=3;c.strokeRect(3,3,8,7);c.beginPath();c.moveTo(10,9);c.lineTo(13,12);c.lineTo(11,14);c.stroke();
    c.strokeStyle='#c59a61';c.lineWidth=1;c.strokeRect(3,3,8,7);c.beginPath();c.moveTo(10,9);c.lineTo(13,12);c.lineTo(11,14);c.stroke();
    const map=new THREE.CanvasTexture(canvas);map.magFilter=map.minFilter=THREE.NearestFilter;
    materials[LEAD_ID]=new THREE.MeshLambertMaterial({map,transparent:true,alphaTest:.5});itemIcons.set(LEAD_ID,canvas.toDataURL());
    const slot=document.createElement('button');slot.className='slot';slot.id='inv-'+(LEAD_ID-12);slot.textContent='Lead';slot.onclick=()=>selectSlot(LEAD_ID-12);
    document.getElementById('tab-weapon').append(slot);
}
function buildHeldLead(){
    const group=buildFirstPersonRig(false),rope=new THREE.Mesh(new THREE.TorusGeometry(.13,.024,4,12),new THREE.MeshLambertMaterial({color:0xae8351}));
    rope.position.y=.09;group.add(rope);
    const tail=new THREE.Mesh(new THREE.BoxGeometry(.035,.23,.035),rope.material.clone());tail.position.set(.12,-.08,0);tail.rotation.z=.2;group.add(tail);return group;
}
function removeLeadVisual(animal){
    const visual=leadVisuals.get(animal);if(!visual)return;
    scene.remove(visual);visual.geometry.dispose();visual.material.dispose();leadVisuals.delete(animal);
}
function clearAnimalLeadVisuals(){for(const animal of leadVisuals.keys())removeLeadVisual(animal);}
function releaseAnimalLead(animal,returnToHand=false){
    const lead=animal.lead;if(!lead)return;
    animal.lead=null;animal.timer=0;removeLeadVisual(animal);
    if(lead.consumed){
        if(returnToHand){playerInventory[LEAD_ID]=(playerInventory[LEAD_ID]||0)+1;updateInventoryCounts();updateHotbarUI();}
        else {const p=animal.mesh.position;spawnDroppedItem(p.x,p.y,p.z,LEAD_ID);}
    }
}
function releaseCarriedLeads(){for(const a of animals)if(a.lead&&!a.lead.anchor)releaseAnimalLead(a,true);}
function attachAnimalLead(animal){
    if(!animals.includes(animal)||animal.dying||!['cow','sheep','pig','horse'].includes(animal.type))return false;
    if(animal.lead)return true;
    if(animals.filter(a=>a.lead&&!a.lead.anchor).length>=8){showToast('Eight animals are already following.');return false;}
    if(!animal.farmAnimal&&animals.filter(a=>a.farmAnimal).length>=MAX_FARM_ANIMALS){showToast('This farm is full.');return false;}
    const consumed=!isCreativeMode();
    if(!consumeInventoryItem(LEAD_ID)){showToast('You need a Lead.');return false;}
    animal.farmAnimal=true;animal.lead={anchor:null,consumed};animal.panicTime=0;animal.timer=0;
    updateInventoryCounts();updateHotbarUI();return true;
}
function handleLeadClick(event){
    if(currentBlock!==LEAD_ID||event.button!==2)return false;
    cancelMining();
    const hit=traceCombatRay(camera.position,camera.getWorldDirection(new THREE.Vector3()),5.5);
    if(hit.entity&&animals.includes(hit.entity)){
        const animal=hit.entity;
        if(animal.lead){
            if(animal.lead.anchor&&!event.shiftKey){
                if(animals.filter(a=>a.lead&&!a.lead.anchor).length>=8){showToast('Eight animals are already following.');return true;}
                animal.lead.anchor=null;showToast('Following.');
            }else{releaseAnimalLead(animal,true);showToast('Lead removed.');}
        }else if(attachAnimalLead(animal))showToast('Following.');
    }else if(hit.block?.type===LEAD_POST_ID){
        const anchor=[hit.block.x,hit.block.y,hit.block.z];let count=0;
        for(const a of animals)if(a.lead&&!a.lead.anchor&&a.mesh.position.distanceTo(new THREE.Vector3(...anchor))<=8){a.lead.anchor=anchor.slice();a.timer=0;count++;}
        if(count)showToast('Tied to railing.');
        else{
            const tied=animals.filter(a=>a.lead?.anchor?.every((v,i)=>v===anchor[i]));
            const room=8-animals.filter(a=>a.lead&&!a.lead.anchor).length;
            for(const a of tied.slice(0,room))a.lead.anchor=null;
            if(tied.length)showToast(room>0?'Following.':'Eight animals are already following.');
        }
    }
    updateAnimalLeadVisuals();return true;
}
function leadTarget(animal){
    return animal.lead.anchor?new THREE.Vector3(...animal.lead.anchor):
        new THREE.Vector3(camera.position.x,camera.position.y-getPlayerHeight()+.5,camera.position.z);
}
function updateLedAnimal(animal,delta){
    if(!animal.lead)return false;
    const p=animal.mesh.position,target=leadTarget(animal),distance=p.distanceTo(target);
    if(animal.lead.anchor&&getBlock(...animal.lead.anchor)!==LEAD_POST_ID||distance>14){releaseAnimalLead(animal);return false;}
    animal.panicTime=Math.max(0,(animal.panicTime||0)-delta);animal.timer=1;
    const dx=target.x-p.x,dz=target.z-p.z,horizontal=Math.hypot(dx,dz),stop=animal.lead.anchor?2.3:2;
    if(horizontal<=stop||ridingHorse===animal){animal.vx=animal.vz=0;animal.lead.steerTime=0;return true;}
    animal.lead.steerTime=Math.max(0,(animal.lead.steerTime||0)-delta);
    if(animal.lead.steerTime>0)return true;
    animal.lead.steerTime=.12;animal.vx=animal.vz=0;
    const angle=Math.atan2(dx,dz),height=animal.mesh.userData.mobHeight,radius=animal.mesh.userData.mobRadius;
    let best=null,bestScore=-Infinity;
    // Small steering probes choose a walkable direction; the normal collision solver still performs every move.
    for(const turn of [0,.55,-.55,1.1,-1.1,1.55,-1.55]){
        const heading=angle+turn,next=p.clone().add(new THREE.Vector3(Math.sin(heading),0,Math.cos(heading)).multiplyScalar(.8));
        const x=Math.round(next.x),y=Math.round(p.y),z=Math.round(next.z);
        if(animalWouldEnterWater(x,y,z)||[LAVA_ID,SPIKE_TRAP_ID].includes(getBlock(x,y,z)))continue;
        if(mobBodyBlocked(next,height,radius)){
            next.y+=1;if(!animal.onGround||mobBodyBlocked(next,height,radius))continue;
        }
        if(!isSolid(x,Math.round(next.y)-1,z)&&!isSolid(x,Math.round(next.y)-2,z))continue;
        const score=Math.cos(turn)+(animal.lead.heading===undefined?0:.35*Math.cos(heading-animal.lead.heading));
        if(score>bestScore){best=heading;bestScore=score;}
    }
    if(best!==null){const speed=Math.min(4.8,1.4+(horizontal-stop)*1.1);animal.vx=Math.sin(best)*speed;animal.vz=Math.cos(best)*speed;animal.lead.heading=best;}
    return true;
}
function updateAnimalLeadVisuals(){
    for(const [animal] of leadVisuals)if(!animals.includes(animal)||!animal.lead||animal.dying)removeLeadVisual(animal);
    for(const animal of animals){
        if(!animal.lead||animal.dying)continue;
        let line=leadVisuals.get(animal);
        if(!line){
            const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(13*3),3).setUsage(THREE.DynamicDrawUsage));
            line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0x806040}));line.raycast=()=>{};line.frustumCulled=false;
            leadVisuals.set(animal,line);scene.add(line);
        }
        animal.mesh.updateMatrixWorld(true);
        const from=animal.mesh.localToWorld(new THREE.Vector3(0,.48,.5)),to=leadTarget(animal);
        if(animal.lead.anchor)to.y+=.3;
        else {camera.updateMatrixWorld(true);to.copy(heldItemGroup.localToWorld(new THREE.Vector3()));}
        const positions=line.geometry.attributes.position,sag=Math.min(.7,from.distanceTo(to)*.12);
        for(let i=0;i<13;i++){const t=i/12;positions.setXYZ(i,from.x+(to.x-from.x)*t,from.y+(to.y-from.y)*t-Math.sin(t*Math.PI)*sag,from.z+(to.z-from.z)*t);}
        positions.needsUpdate=true;
    }
}
function saveFarmAnimals(){
    return animals.filter(a=>a.farmAnimal&&!a.dying).slice(0,MAX_FARM_ANIMALS).map(a=>({type:a.type,pos:a.mesh.position.toArray(),hp:a.hp,eggId:a.eggId,
        lead:a.lead?{anchor:a.lead.anchor?.slice()||null,consumed:a.lead.consumed===true}:null}));
}
function restoreFarmAnimals(data,restoreCarried=true){
    if(currentDimension!=='overworld'||!Array.isArray(data))return;
    for(const entry of data.slice(0,MAX_FARM_ANIMALS)){
        if(!entry||!['cow','sheep','pig','horse'].includes(entry.type)||!Array.isArray(entry.pos)||entry.pos.length!==3||!entry.pos.every(v=>Number.isFinite(v)&&Math.abs(v)<=100000))continue;
        if(!spawnAnimal(entry.type,...entry.pos,true))continue;
        const animal=animals[animals.length-1];animal.farmAnimal=true;animal.hp=Math.max(1,Math.min(animal.hp,Number(entry.hp)||animal.hp));
        if(entry.type==='horse'&&entry.eggId===HORSE_EGG)animal.eggId=HORSE_EGG;
        const anchor=entry.lead?.anchor;
        if(Array.isArray(anchor)&&anchor.length===3&&anchor.every(Number.isSafeInteger)&&getBlock(...anchor)===LEAD_POST_ID&&animal.mesh.position.distanceTo(new THREE.Vector3(...anchor))<=14)
            animal.lead={anchor:anchor.slice(),consumed:entry.lead.consumed===true};
        else if(entry.lead&&anchor===null&&restoreCarried&&animals.filter(a=>a.lead&&!a.lead.anchor).length<8)
            animal.lead={anchor:null,consumed:entry.lead.consumed===true};
    }
}
