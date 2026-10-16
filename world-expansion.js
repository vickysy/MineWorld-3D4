const ENDER_EGG_ID = 72, FRIDGE_ID = 73, CONSOLE_ID = 74, HANDHELD_ID = 75;
const TV_ID = 76, COMPUTER_ID = 77, KEYBOARD_ID = 78, CHAIR_ID = 79;
const FRIDGE_TOP_ID = 80, NETHER_PORTAL_ID = 81;
const HOME_ITEMS = {73:'Refrigerator',74:'Game Console',75:'Handheld Console',76:'Television',77:'Desktop Computer',78:'Keyboard',79:'Office Chair'};
const waterAmounts = new Map(), activePortals = new Map(), dimensionWorlds = new Map();
const furnitureData = new Map(), furnitureMeshes = new Map();
let endermen = [], waterWriting = false, expansionReady = false, flowElapsed = 0;
let furnitureFocus = null, seatedAt = null, portalExitRequired = false, furnitureTick = 0;
let worldFloodHeight = null, commandJob = null, commandUndo = null, commandPreview = null, commandEditing = false;

function waterAmount(x,y,z) {
    return getBlock(x,y,z) === 24 ? (waterAmounts.get(`${x},${y},${z}`) ?? 8) : 0;
}

function queueFluidCell(x,y,z) {
    if (currentDimension === 'nether' || waterFlowQueue.length >= 8192) return;
    if (Math.abs(x-camera.position.x)>64 || Math.abs(z-camera.position.z)>64 || Math.abs(y-camera.position.y)>160) return;
    const key=`${x},${y},${z}`;
    if (!queuedWaterFlow.has(key)) { queuedWaterFlow.add(key);waterFlowQueue.push({x,y,z}); }
}

function queueFluidNeighbors(x,y,z) {
    queueFluidCell(x,y,z);
    for (const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0],[0,-1,0]]) queueFluidCell(x+dx,y+dy,z+dz);
}

function writeWater(x,y,z,amount,dirty) {
    const key=`${x},${y},${z}`, type=amount>0?24:0;
    setBlockNoRebuild(x,y,z,type,dirty);
    if (amount>0) waterAmounts.set(key,amount);else waterAmounts.delete(key);
    queueFluidNeighbors(x,y,z);
}

function tickWaterFlow(delta=0.1) {
    if (currentDimension==='nether' || commandJob) return;
    flowElapsed+=delta;
    if(flowElapsed<0.1 || !waterFlowQueue.length) return;
    flowElapsed=0;
    const dirty=new Set(), count=Math.min(48,waterFlowQueue.length);
    waterWriting=true;
    try {
        for(let i=0;i<count;i++) {
            const {x,y,z}=waterFlowQueue.shift();queuedWaterFlow.delete(`${x},${y},${z}`);
            let amount=waterAmount(x,y,z);
            if(!amount) continue;
            let lava=false;
            for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,-1,0],[0,1,0]]) {
                if(getBlock(x+dx,y+dy,z+dz)===LAVA_ID) {
                    setBlockNoRebuild(x+dx,y+dy,z+dz,OBSIDIAN_ID,dirty);lava=true;
                }
            }
            if(lava) queueFluidNeighbors(x,y,z);
            const below=getBlock(x,y-1,z);
            if([0,24,25,42].includes(below)) {
                const n=waterAmount(x,y-1,z), moved=Math.min(amount,8-n);
                if(moved>0) {
                    writeWater(x,y-1,z,n+moved,dirty);amount-=moved;
                    writeWater(x,y,z,amount,dirty);
                    if(!amount) continue;
                }
            }
            for(const [dx,dz] of [[1,0],[0,1],[-1,0],[0,-1]]) {
                const type=getBlock(x+dx,y,z+dz);
                if(![0,24,25,42].includes(type)) continue;
                const neighbor=waterAmount(x+dx,y,z+dz), moved=Math.floor((amount-neighbor)/2);
                if(moved<=0) continue;
                writeWater(x+dx,y,z+dz,neighbor+moved,dirty);amount-=moved;
                writeWater(x,y,z,amount,dirty);
            }
        }
    } finally {waterWriting=false;}
    addDirtyChunksToQueue(dirty);
}

function expansionBlockChanged(x,y,z,oldType,type) {
    if(!expansionReady) return;
    if(!waterWriting) {
        waterAmounts.delete(`${x},${y},${z}`);
        queueFluidNeighbors(x,y,z);
    }
    const key=`${currentDimension}|${x},${y},${z}`;
    if(oldType===FURNITURE_PART_ID && type!==oldType) {
        const owner=Array.from(furnitureData).find(([k,d])=>k.startsWith(currentDimension+'|')&&d.parts?.some(p=>p[0]===x&&p[1]===y&&p[2]===z));
        if(owner) setBlockNoRebuild(...owner[0].split('|')[1].split(',').map(Number),0,rebuildQueue);
    }
    if(oldType!==type && HOME_ITEMS[oldType]) {
        const data=furnitureData.get(key);
        if(!commandEditing) for(const contents of [data?.food,data?.storage]) for(const [id,count] of Object.entries(contents||{})) for(let i=0;i<Math.min(64,count);i++) spawnDroppedItem(x,y,z,Number(id));
        if(!commandEditing && data) {
            if(data.foodItem) spawnDroppedItem(x,y,z,data.foodItem);
            if(data.cooking>0) spawnDroppedItem(x,y,z,39);
            for(let i=0;i<Math.min(64,data.cooked||0);i++) spawnDroppedItem(x,y,z,40);
        }
        furnitureData.delete(key);
        for(const p of data?.parts||[]) if(getBlock(...p)===FURNITURE_PART_ID) setBlockNoRebuild(...p,0,rebuildQueue);
        if(furnitureFocus===key) closeFurniturePanel(false);
        if(seatedAt?.key===key) standFromChair();
        if(getBlock(x,y+1,z)===FRIDGE_TOP_ID) setBlockNoRebuild(x,y+1,z,0,rebuildQueue);
    }
    if(oldType===FRIDGE_TOP_ID && type!==oldType && HOME_ITEMS[getBlock(x,y-1,z)]) setBlockNoRebuild(x,y-1,z,0,rebuildQueue);
    for(const [id,portal] of activePortals) {
        if(!portal.frame.some(p=>p[0]===x && p[1]===y && p[2]===z)) continue;
        if(type===portal.material) continue;
        activePortals.delete(id);
        for(const p of portal.cells) if(getBlock(...p)===NETHER_PORTAL_ID) setBlockNoRebuild(...p,0,rebuildQueue);
    }
    furnitureTick=1;
}

function openPortal(frame,cells,material) {
    if(cells.some(p=>![0,42,NETHER_PORTAL_ID,LAVA_ID].includes(getBlock(...p)))) return false;
    const key=cells[0].join(',');
    if(activePortals.has(key)) return true;
    const dirty=new Set();
    activePortals.set(key,{frame,cells,material});
    for(const p of cells) setBlockNoRebuild(...p,NETHER_PORTAL_ID,dirty);
    addDirtyChunksToQueue(dirty);showToast('Nether portal opened.');return true;
}

function activatePortalNear(x,y,z) {
    let opened=false;
    // Support the original eight-table ring, including a center covered in grass.
    for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++) {
        const cx=x+dx,cz=z+dz,frame=[];
        for(let a=-1;a<=1;a++) for(let b=-1;b<=1;b++) if(a || b) frame.push([cx+a,y,cz+b]);
        if(frame.every(p=>getBlock(...p)===32)) opened=openPortal(frame,[[cx,y,cz],[cx,y+1,cz]],32)||opened;
    }
    // A conventional four-wide, five-high frame works in either vertical orientation.
    for(const axis of ['x','z']) for(let u=-3;u<=0;u++) for(let v=-4;v<=0;v++) {
        const bx=x+(axis==='x'?u:0),by=y+v,bz=z+(axis==='z'?u:0),frame=[],cells=[];
        for(let a=0;a<4;a++) for(let b=0;b<5;b++) {
            const p=[bx+(axis==='x'?a:0),by+b,bz+(axis==='z'?a:0)];
            if(a===0 || a===3 || b===0 || b===4) frame.push(p);else cells.push(p);
        }
        if(frame.every(p=>getBlock(...p)===OBSIDIAN_ID)) opened=openPortal(frame,cells,OBSIDIAN_ID)||opened;
    }
    return opened;
}

function snapshotDimension() {
    return {worldMap:Array.from(worldMap),modifiedColumns:Array.from(modifiedColumns),columnMinY:Array.from(columnMinY),
        microMined:Array.from(microMinedBlocks),microPlaced:Array.from(microPlacedBlocks),fineEdits:Array.from(fineVoxelEdits),
        chunkMaxY:Array.from(chunkMaxY),chunkScanYRanges:Array.from(chunkScanYRanges),waterAmounts:Array.from(waterAmounts),portals:Array.from(activePortals),pistons:Array.from(pistonDirections),
        companions:[...zombies,...creepers,...villagers].filter(m=>m.eggId&&!m.dying).map(m=>({id:m.eggId,pos:m.mesh.position.toArray(),hp:m.hp})),
        residents:villagers.filter(m=>m.cityResident&&!m.dying).map(m=>({pos:m.mesh.position.toArray(),hp:m.hp})),
        endermen:endermen.filter(m=>m.eggId&&!m.dying).map(m=>({pos:m.mesh.position.toArray(),hp:m.hp})),returnPoint:camera.position.toArray()};
}

function restoreDimension(data={}) {
    for(const [map,entries] of [[worldMap,data.worldMap],[columnMinY,data.columnMinY],[chunkMaxY,data.chunkMaxY],
        [chunkScanYRanges,data.chunkScanYRanges],[waterAmounts,data.waterAmounts],[activePortals,data.portals],[pistonDirections,data.pistons]]) {
        map.clear();for(const [k,v] of entries||[]) map.set(k,v);
    }
    modifiedColumns.clear();for(const key of data.modifiedColumns||[]) modifiedColumns.add(key);
    restoreMicroEdits(data.microMined||[],data.microPlaced||[]);restoreFineVoxelEdits(data.fineEdits||[]);
    railShapes.clear();
    waterFlowQueue.length=0;queuedWaterFlow.clear();
    for(const [key,type] of worldMap) if(type===24) queueFluidNeighbors(...key.split(',').map(Number));
}

function travelThroughPortal(next) {
    if(next===currentDimension) return;
    if(commandJob) {showToast('Wait for the command to finish.');return;}
    closeFurniturePanel(false);if(!leaveCityCar() || !standFromChair()) return;clearCombatState();resetPlayerFlight();
    dimensionWorlds.set(currentDimension,snapshotDimension());
    currentDimension=next;const saved=dimensionWorlds.get(next);
    restoreDimension(saved);
    for(const list of [zombies,creepers,villagers,animals,endermen,minecarts]) {for(const mob of list) scene.remove(mob.mesh);list.length=0;}
    ridingMinecart=null;
    for(const light of torchLights.values()) scene.remove(light);torchLights.clear();
    heightCache.clear();clearMicroVoxelOverlay();
    for(const meshes of chunkMeshes.values()) for(const mesh of Object.values(meshes)) scene.remove(mesh);
    chunkMeshes.clear();chunkQueue.length=0;rebuildQueue.clear();lastChunkX=lastChunkZ=-999;
    if(saved?.returnPoint) {
        camera.position.fromArray(saved.returnPoint);
        for(const m of saved.companions||[]) {if(next==='nether'&&m.id===67)continue;const mob=spawnMobFromEgg(m.id,...m.pos);mob.hp=m.hp;}
        for(const m of saved.endermen||[]) spawnEnderman(...m.pos,true,m.hp);
        if(next==='overworld') for(const m of saved.residents||[]) {spawnVillagerAt(...m.pos);Object.assign(villagers[villagers.length-1],{cityResident:true,hp:m.hp});}
    }
    else {
        const x=Math.round(camera.position.x),z=Math.round(camera.position.z);
        const y=Math.max(7,getSurfaceHeight(x,z)+1),dirty=new Set();
        for(let dx=-3;dx<=4;dx++) for(let dz=-3;dz<=3;dz++) {
            setBlockNoRebuild(x+dx,y-1,z+dz,3,dirty);
            for(let dy=0;dy<6;dy++) setBlockNoRebuild(x+dx,y+dy,z+dz,0,dirty);
        }
        for(let a=0;a<4;a++) for(let b=0;b<5;b++) if(a===0||a===3||b===0||b===4) setBlockNoRebuild(x+a,y+b,z,OBSIDIAN_ID,dirty);
        activatePortalNear(x,y,z);camera.position.set(x+1,y-0.5+getPlayerHeight(),z+2);
    }
    velocity.set(0,0,0);portalCooldown=3;portalExitRequired=true;
    for(const [key,type] of worldMap) if(type===16) {
        const light=new THREE.PointLight(0xffdd88,1.5,12);light.position.set(...key.split(',').map(Number));scene.add(light);torchLights.set(key,light);
    }
    updateChunks(camera.position);syncFurnitureMeshes();
    if(next==='nether') populateNetherEndermen();
    showToast(next==='nether'?'Entered the Nether.':'Returned to Overworld.');
}

function saveWorldExpansion() {
    return {city:saveHomeCity(),flood:worldFloodHeight,water:Array.from(waterAmounts),portals:Array.from(activePortals),dimensions:Array.from(dimensionWorlds),furniture:Array.from(furnitureData),
        endermen:endermen.filter(m=>!m.dying).map(m=>({x:m.mesh.position.x,y:m.mesh.position.y,z:m.mesh.position.z,eggId:m.eggId,hp:m.hp}))};
}

function clearExpansionWorld() {
    clearHomeCity();
    closeFurniturePanel(false);closeCommandPanel(false);seatedAt=null;
    for(const mob of endermen) disposeModModel(mob.mesh);endermen=[];
    for(const mesh of furnitureMeshes.values()) disposeModModel(mesh);furnitureMeshes.clear();
    for(const map of [waterAmounts,activePortals,dimensionWorlds,furnitureData]) map.clear();
    waterFlowQueue.length=0;queuedWaterFlow.clear();portalExitRequired=false;
    worldFloodHeight=null;commandJob=commandUndo=commandPreview=null;
}

function restoreWorldExpansion(data={}) {
    worldFloodHeight=Number.isFinite(data.flood)?data.flood:null;
    for(const [map,entries] of [[waterAmounts,data.water],[activePortals,data.portals],[dimensionWorlds,data.dimensions],[furnitureData,data.furniture]]) {
        map.clear();for(const [k,v] of entries||[]) map.set(k,v);
    }
    for(const m of data.endermen||[]) if([m.x,m.y,m.z].every(Number.isFinite)) spawnEnderman(m.x,m.y,m.z,m.eggId===ENDER_EGG_ID,m.hp);
    restoreHomeCity(data.city);
    for(const [key,type] of worldMap) if(type===24) queueFluidNeighbors(...key.split(',').map(Number));
    furnitureTick=1;
}

function createEndermanModel() {
    const group=new THREE.Group(), black=0x17151c;
    addModelBox(group,0.56,0.56,0.56,black,0,2.1,0,'head');
    addModelBox(group,0.47,0.92,0.3,black,0,1.35,0,'body');
    for(const [sign,name] of [[-1,'left'],[1,'right']]) {
        addModelBox(group,0.15,1.5,0.15,black,sign*0.39,0.9,0,name+'Arm');
        addModelBox(group,0.17,1.4,0.17,black,sign*0.16,0.2,0,name+'Leg');
        const eye=addModelBox(group,0.19,0.065,0.025,0xcc83ff,sign*0.14,2.12,0.291);
        eye.material.emissive.setHex(0x9933e0);
    }
    rememberOriginalMaterials(group);return group;
}

function spawnEnderman(x,y,z,friendly=false,hp=8) {
    const mesh=createEndermanModel();mesh.position.set(x,y,z);scene.add(mesh);
    const mob={mesh,kind:'enderman',friendly,eggId:friendly?ENDER_EGG_ID:undefined,hp:Math.max(1,Math.min(8,hp||8)),
        vx:0,vy:0,vz:0,hurtTimer:0,dying:false,walkTime:0,anger:0,teleportTimer:4,attackCooldown:0};
    if(friendly) addModelBox(mesh,0.52,0.08,0.34,0x46d9c2,0,1.75,0);
    rememberOriginalMaterials(mesh);endermen.push(mob);return mob;
}

function safeEndermanSpot(x,y,z) {
    return isSolid(x,y-1,z) && [0,42].includes(getBlock(x,y,z)) &&
        getBlock(x,y+1,z)===0 && getBlock(x,y+2,z)===0;
}

function teleportEnderman(mob) {
    for(let i=0;i<24;i++) {
        const x=Math.round(mob.mesh.position.x+(Math.random()-0.5)*16),z=Math.round(mob.mesh.position.z+(Math.random()-0.5)*16);
        const y=getSurfaceHeight(x,z)+1;
        if(!safeEndermanSpot(x,y,z) || Math.hypot(x-camera.position.x,z-camera.position.z)<2) continue;
        for(const p of [mob.mesh.position.clone(),new THREE.Vector3(x,y,z)])
            for(let j=0;j<8;j++) combatFlash(p.clone().add(new THREE.Vector3((Math.random()-0.5)*0.8,Math.random()*2,(Math.random()-0.5)*0.8)),0xb86cff,0.07,0.6);
        mob.mesh.position.set(x,y,z);mob.vy=0;mob.teleportTimer=4;return true;
    }
    return false;
}

let endermanSpawnTimer=0;
function updateEndermen(delta) {
    if(!controls.isLocked || !isGameStarted || isSleeping) return;
    endermanSpawnTimer+=delta;
    if(endermanSpawnTimer>12) {
        endermanSpawnTimer=0;
        if((currentDimension==='nether'||!isCreativeMode()&&isNightTime()) && endermen.filter(m=>!m.friendly).length<4) {
            const angle=Math.random()*Math.PI*2,x=Math.round(camera.position.x+Math.cos(angle)*18),z=Math.round(camera.position.z+Math.sin(angle)*18);
            const y=getSurfaceHeight(x,z)+1;if(safeEndermanSpot(x,y,z)) spawnEnderman(x,y,z);
        }
    }
    for(let i=endermen.length-1;i>=0;i--) {
        const m=endermen[i];
        if(updateMobDamageState(m,delta)) {disposeModModel(m.mesh);endermen.splice(i,1);continue;}
        if(m.dying) continue;
        m.teleportTimer-=delta;m.attackCooldown=Math.max(0,m.attackCooldown-delta);
        const eye=m.mesh.position.clone().add(new THREE.Vector3(0,2.1,0)),toward=eye.clone().sub(camera.position),forward=new THREE.Vector3();
        camera.getWorldDirection(forward);
        if(!m.friendly && !isCreativeMode() && toward.length()<16 && forward.dot(toward.normalize())>0.995 && hasClearLineBetween(camera.position,eye)) m.anger=15;
        m.anger=Math.max(0,m.anger-delta);
        if(getBlock(Math.round(m.mesh.position.x),Math.round(m.mesh.position.y),Math.round(m.mesh.position.z))===24 ||
            (m.teleportTimer<=0 && m.anger>0 && m.mesh.position.distanceTo(camera.position)>10)) teleportEnderman(m);
        const target=m.friendly?findCompanionEnemy(m):null;
        const dest=target?target.mesh.position:camera.position;
        const dx=dest.x-m.mesh.position.x,dz=dest.z-m.mesh.position.z,d=Math.hypot(dx,dz);
        const moving=(m.friendly||m.anger>0) && d>(target?1.2:m.friendly?3:1.5);
        m.vx=moving?dx/d*1.8:0;m.vz=moving?dz/d*1.8:0;
        tryMoveEntityFlat(m,m.vx*delta,m.vz*delta,2.9,0.3,1);
        m.vy-=25*delta;m.mesh.position.y+=m.vy*delta;m.onGround=false;
        if(isSolid(Math.round(m.mesh.position.x),Math.round(m.mesh.position.y-1),Math.round(m.mesh.position.z))) {
            m.mesh.position.y=Math.round(m.mesh.position.y-1)+1;m.vy=0;m.onGround=true;
        }
        if(moving) {m.walkTime+=delta*5;m.mesh.rotation.y=Math.atan2(dx,dz);}
        for(const [name,sign] of [['leftArm',1],['rightArm',-1],['leftLeg',-1],['rightLeg',1]])
            m.mesh.userData[name].rotation.x=moving?Math.sin(m.walkTime)*0.2*sign:0;
        if(m.attackCooldown===0 && d<1.8 && hasClearLineBetween(m.mesh.position.clone().add(new THREE.Vector3(0,1,0)),dest)) {
            if(target) {damageMob(target,2,'companion');m.attackCooldown=1;}
            else if(!m.friendly && m.anger>0 && !isCreativeMode()) {takeDamage(2);m.attackCooldown=1;}
        }
    }
}

function createFurnitureModel(id,data={}) {
    const group=new THREE.Group(),box=(w,h,d,c,x,y,z,name)=>addModelBox(group,w,h,d,c,x,y,z,name);
    const silver=0xc7cdd0,white=0xeff2f2,dark=0x20252b;
    const screen=(w,h,x,y,z)=>{
        box(w+0.08,h+0.08,0.09,dark,x,y,z-0.02);
        const canvas=document.createElement('canvas');canvas.width=256;canvas.height=144;
        const texture=new THREE.CanvasTexture(canvas);texture.magFilter=THREE.NearestFilter;
        const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture}));
        mesh.position.set(x,y,z+0.035);group.add(mesh);group.userData.screen={canvas,texture};
    };
    if(id===FRIDGE_ID) {
        box(0.88,1.9,0.78,silver,0,0.45,0);
        box(0.8,1.8,0.05,0x91a5ac,0,0.45,0.405);
        const door=new THREE.Group();door.position.set(-0.45,0.45,0.44);group.add(door);
        addModelBox(door,0.88,1.86,0.09,white,0.44,0,0);
        addModelBox(door,0.035,0.43,0.055,dark,0.74,0.14,0.07);
        addModelBox(door,0.85,0.025,0.01,0x889195,0.44,0.37,0.055);
        for(const y of [-0.25,0.2,0.65,1.02]) box(0.74,0.035,0.12,white,0,y,0.46);
        for(const [x,c] of [[-0.24,0xd34944],[0,0x73a858],[0.24,0xd0a747]]) box(0.12,0.16,0.1,c,x,0.32,0.47);
        group.userData.door=door;
    } else if(id===CONSOLE_ID) {
        box(0.34,0.86,0.54,dark,0,-0.03,0);
        for(const x of [-0.22,0.22]) {const p=box(0.08,0.96,0.6,white,x,-0.01,0);p.rotation.z=x>0?-0.08:0.08;}
        box(0.03,0.77,0.02,0x4aafff,-0.17,-0.03,0.29);
        box(0.035,0.23,0.02,0x101318,0.22,-0.2,0.32);
        box(0.63,0.06,0.68,dark,0,-0.46,0);
        box(0.42,0.1,0.17,white,0,-0.36,0.38);
        for(const x of [-0.1,0.1]) box(0.055,0.025,0.055,dark,x,-0.295,0.39);
    } else if(id===HANDHELD_ID) {
        screen(0.57,0.33,0,-0.09,0.02);
        for(const [x,c] of [[-0.39,0x29bcd5],[0.39,0xee594e]]) {
            box(0.17,0.45,0.14,c,x,-0.09,0);
            box(0.06,0.06,0.04,dark,x,0.02,0.095);
            for(const [dx,dy] of [[0,0.03],[0,-0.03],[-0.03,0],[0.03,0]]) box(0.025,0.025,0.02,dark,x+dx,-0.2+dy,0.087);
        }
        box(0.5,0.08,0.3,dark,0,-0.45,0);
        box(0.08,0.22,0.08,dark,0,-0.31,-0.03);
    } else if(id===TV_ID || id===COMPUTER_ID) {
        screen(0.91,id===TV_ID?0.52:0.48,0,0.02,0);
        if(id===COMPUTER_ID) {
            box(1,0.12,0.12,0x9dbdc3,0,-0.3,-0.01);
            box(0.14,0.23,0.1,silver,0,-0.34,-0.08);
            box(0.44,0.035,0.31,silver,0,-0.48,0);
        } else for(const x of [-0.32,0.32]) {
            box(0.045,0.21,0.05,dark,x,-0.35,0);box(0.22,0.035,0.22,dark,x,-0.48,0);
        }
    } else if(id===KEYBOARD_ID) {
        box(0.92,0.06,0.34,silver,0,-0.45,0);
        for(let row=0;row<4;row++) for(let col=0;col<12;col++) box(0.058,0.022,0.055,white,-0.4+col*0.073,-0.41,-0.12+row*0.075);
        box(0.3,0.022,0.045,white,0,-0.41,0.19);
    } else if(id===CHAIR_ID) {
        box(0.69,0.13,0.65,0x335664,0,0.08,0);
        box(0.64,0.73,0.1,0x335664,0,0.48,-0.29);
        for(const x of [-0.4,0.4]) {box(0.06,0.28,0.06,dark,x,0.23,0);box(0.1,0.06,0.48,dark,x,0.39,0);}
        box(0.09,0.48,0.09,silver,0,-0.21,0);
        for(let i=0;i<5;i++) {
            const a=i*Math.PI*2/5,arm=box(0.06,0.055,0.43,dark,Math.sin(a)*0.19,-0.41,Math.cos(a)*0.19);
            arm.rotation.y=a;
            box(0.11,0.1,0.11,0x111418,Math.sin(a)*0.39,-0.45,Math.cos(a)*0.39);
        }
    }
    if(EXTRA_HOME_ITEMS[id] || id===14) buildExtraFurniture(group,id,data);
    group.userData.itemId=id;group.userData.modItem=true;
    paintDeviceScreen(group,data,0);return group;
}

function paintDeviceScreen(model,data,time) {
    const screen=model.userData.screen;if(!screen) return;
    const ctx=screen.canvas.getContext('2d');ctx.fillStyle=data.on?'#60c5df':'#111b25';ctx.fillRect(0,0,256,144);
    if(data.on) {
        if(data.channel===1) {
            ctx.fillStyle='#172d42';ctx.fillRect(0,0,256,144);ctx.fillStyle='#eff6fa';ctx.font='bold 17px sans-serif';
            ctx.fillText('DANIEL WORLD',18,30);ctx.font='14px sans-serif';ctx.fillText(`Day ${Math.floor(time/1200)+1}`,18,59);
            ctx.fillText(`${getTerrainName(selectedTerrain)}`,18,85);
        } else {
            ctx.fillStyle='#f7df72';ctx.fillRect(190,14,22,22);
            ctx.fillStyle='#6aaf58';ctx.fillRect(0,96,256,48);
            ctx.fillStyle='#3f7e49';for(let i=0;i<7;i++) ctx.fillRect((i*48-time*12)%310-25,72,35,30);
            ctx.fillStyle='#d45653';ctx.fillRect(106+Math.sin(time)*34,75,15,22);
        }
        if([COMPUTER_ID,94,96].includes(model.userData.itemId) && data.note) {
            ctx.fillStyle='#f5f7f2';ctx.fillRect(18,12,220,112);ctx.fillStyle='#263743';ctx.font='12px sans-serif';
            String(data.note).slice(0,120).match(/.{1,29}/g)?.slice(0,7).forEach((line,i)=>ctx.fillText(line,25,29+i*13));
        }
    }
    screen.texture.needsUpdate=true;
}

function syncFurnitureMeshes() {
    const visible=new Set();
    for(const [xyz,id] of worldMap) {
        if(!HOME_ITEMS[id]) continue;
        const [x,y,z]=xyz.split(',').map(Number),key=`${currentDimension}|${xyz}`;
        if(Math.abs(x-camera.position.x)>64 || Math.abs(z-camera.position.z)>64) continue;
        visible.add(key);
        if(!furnitureData.has(key)) furnitureData.set(key,{id,yaw:0,on:false,food:{},note:''});
        const data=furnitureData.get(key);
        if(!furnitureMeshes.has(key)) {
            const model=createFurnitureModel(id,{...data,live:true});model.position.set(x,y,z);model.rotation.y=data.yaw||0;scene.add(model);furnitureMeshes.set(key,model);
        }
    }
    for(const [key,model] of furnitureMeshes) if(!visible.has(key)) {disposeModModel(model);furnitureMeshes.delete(key);}
}

function furnitureRecord(x,y,z) {
    if(getBlock(x,y,z)===FURNITURE_PART_ID) {
        const owner=Array.from(furnitureData).find(([k,d])=>k.startsWith(currentDimension+'|')&&d.parts?.some(p=>p[0]===x&&p[1]===y&&p[2]===z));
        if(owner) [x,y,z]=owner[0].split('|')[1].split(',').map(Number);
    }
    if(getBlock(x,y,z)===FRIDGE_TOP_ID) y--;
    const id=getBlock(x,y,z),key=`${currentDimension}|${x},${y},${z}`;
    if(!HOME_ITEMS[id]) return null;
    if(!furnitureData.has(key)) furnitureData.set(key,{id,yaw:0,food:{},on:false,note:''});
    return {key,id,x,y,z,data:furnitureData.get(key)};
}

function closeFurniturePanel(resume=true) {
    furnitureFocus=null;
    const panel=document.getElementById('home-panel');if(panel) panel.hidden=true;
    if(resume && isGameStarted) controls.lock();
}

function openFurniturePanel(record) {
    furnitureFocus=record.key;
    const panel=document.getElementById('home-panel');panel.hidden=false;
    document.getElementById('home-title').textContent=HOME_ITEMS[record.id];
    const content=document.getElementById('home-content');content.replaceChildren();
    if(controls.isLocked) controls.unlock();
    blocker.style.display='none';
    const button=(label,action,parent=content)=>{const b=document.createElement('button');b.textContent=label;b.onclick=action;parent.appendChild(b);return b;};
    const data=record.data;
    if(record.id===FRIDGE_ID) {
        for(const id of [39,40,...Object.keys(KITCHEN_FOOD).map(Number)]) {
            const row=document.createElement('div');row.className='home-row';content.appendChild(row);
            const label=document.createElement('span');label.textContent=`${getBlockName(id)}: ${data.food?.[id]||0} / 64`;row.appendChild(label);
            button('Store',()=>{if((data.food?.[id]||0)>=64 || !hasInventoryItem(id)) return;
                consumeInventoryItem(id);data.food=data.food||{};data.food[id]=(data.food[id]||0)+1;
                updateInventoryCounts();openFurniturePanel(record);},row);
            button('Take',()=>{if(!(data.food?.[id]>0)) return;data.food[id]--;playerInventory[id]=(playerInventory[id]||0)+1;
                updateInventoryCounts();openFurniturePanel(record);},row);
        }
    } else if(record.id===COMPUTER_ID || record.id===KEYBOARD_ID) {
        const label=document.createElement('label');label.textContent='Notes';content.appendChild(label);
        const input=document.createElement('textarea');input.rows=7;input.maxLength=2000;input.value=data.note||'';input.setAttribute('aria-label','Notes');
        input.oninput=()=>{data.note=input.value;data.on=true;};content.appendChild(input);input.focus();
        button('Save',()=>{data.note=input.value;data.on=true;showToast('Notes saved.');});
    } else if(record.id===TV_ID || record.id===93) {
        const label=document.createElement('label'),power=document.createElement('input');power.type='checkbox';power.checked=!!data.on;
        power.onchange=()=>{data.on=power.checked;};label.append(power,document.createTextNode(' Power'));content.appendChild(label);
        const select=document.createElement('select');select.setAttribute('aria-label','Channel');
        for(const [value,name] of [[0,'World Adventure'],[1,'World News']]) {const option=document.createElement('option');option.value=value;option.textContent=name;select.appendChild(option);}
        select.value=data.channel||0;select.onchange=()=>{data.channel=Number(select.value);data.on=true;power.checked=true;};content.appendChild(select);
    } else if(record.id===CONSOLE_ID || record.id===HANDHELD_ID) {
        data.on=true;let score=0,target=Math.floor(Math.random()*9);
        const result=document.createElement('p');result.textContent='Score: 0';content.appendChild(result);
        const grid=document.createElement('div');grid.className='home-game';content.appendChild(grid);
        const redraw=()=>{for(let i=0;i<9;i++) {grid.children[i].classList.toggle('lit',i===target);grid.children[i].textContent=i===target?'◆':'';}result.textContent=`Score: ${score}`;};
        for(let i=0;i<9;i++) button('',()=>{if(i!==target)return;score++;target=(target+1+Math.floor(Math.random()*8))%9;redraw();playSound('pickup');},grid).setAttribute('aria-label',`Tile ${i+1}`);
        redraw();
    } else openExtraFurniture(record,content,button);
}

function sitInChair(record) {
    if(activeMech || playerScale!==1 || drivingCar) {showToast('Return to normal player size to sit.');return;}
    const eye=new THREE.Vector3(record.x,record.y+1,record.z);
    const headType=getBlock(Math.round(eye.x),Math.round(eye.y+0.2),Math.round(eye.z));
    if(isSolidType(headType) && headType!==FRIDGE_TOP_ID) {showToast('Not enough headroom.');return;}
    seatedAt={key:record.key,returnPosition:camera.position.clone()};resetPlayerFlight();camera.position.copy(eye);
}

function standFromChair() {
    if(!seatedAt) return true;
    const previous=camera.position.clone(),returnPosition=seatedAt.returnPosition;
    for(const p of [returnPosition,...[[1.2,0],[-1.2,0],[0,1.2],[0,-1.2]].map(([x,z])=>new THREE.Vector3(previous.x+x,previous.y+0.7,previous.z+z))]) {
        if(checkCollision(p)) continue;
        camera.position.copy(p);seatedAt=null;clearMovementInput();return true;
    }
    showToast('No room to stand up.');return false;
}

function expansionRay(includeWater=false) {
    const dir=new THREE.Vector3();camera.getWorldDirection(dir);
    let previous=null;
    for(let d=0;d<7;d+=0.025) {
        const p=camera.position.clone().addScaledVector(dir,d),cell=[Math.round(p.x),Math.round(p.y),Math.round(p.z)];
        const type=getBlock(...cell);
        if(type!==0 && type!==25 && (type!==24 || includeWater)) return {x:cell[0],y:cell[1],z:cell[2],type,previous};
        previous=cell;
    }
    return null;
}

function placeFurniture(id,x,y,z) {
    if(!HOME_ITEMS[id] || ![0,42].includes(getBlock(x,y,z))) return false;
    const height=[FRIDGE_ID,CHAIR_ID,88,112].includes(id)?2:1;
    let yaw=Math.round(Math.atan2(camera.position.x-x,camera.position.z-z)/(Math.PI/2))*(Math.PI/2);
    if(id===83||id===126) for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const neighbor=furnitureRecord(x+dx,y,z+dz);
        if(neighbor && [83,126].includes(neighbor.id)) {yaw=neighbor.data.yaw||0;break;}
    }
    const parts=kitchenParts(id).map(([dx,dy,dz])=>[x+Math.round(dx*Math.cos(yaw)+dz*Math.sin(yaw)),y+dy,z+Math.round(-dx*Math.sin(yaw)+dz*Math.cos(yaw))]);
    for(const [px,py,pz] of parts) if(![0,42].includes(getBlock(px,py,pz)) ||
        Math.abs(px-camera.position.x)<0.5+getPlayerRadius()&&Math.abs(pz-camera.position.z)<0.5+getPlayerRadius()&&py+0.5>camera.position.y-getPlayerHeight()&&py-0.5<camera.position.y+0.2) {showToast('Not enough space.');return false;}
    for(let dy=0;dy<height;dy++) {
        if(![0,42].includes(getBlock(x,y+dy,z))) {showToast('Not enough space.');return false;}
        if(Math.abs(x-camera.position.x)<0.5+getPlayerRadius() && Math.abs(z-camera.position.z)<0.5+getPlayerRadius() &&
            y+dy+0.5>camera.position.y-getPlayerHeight() && y+dy-0.5<camera.position.y+0.2*playerScale) return false;
    }
    if(!consumeInventoryItem(id)) {showToast('Not enough materials.');return false;}
    const key=`${currentDimension}|${x},${y},${z}`,dirty=new Set();
    setBlockNoRebuild(x,y,z,id,dirty);if(height===2) setBlockNoRebuild(x,y+1,z,FRIDGE_TOP_ID,dirty);
    furnitureData.set(key,{id,yaw,parts,food:{},on:false,note:''});
    for(const p of parts) setBlockNoRebuild(...p,FURNITURE_PART_ID,dirty);
    addDirtyChunksToQueue(dirty);syncFurnitureMeshes();updateInventoryCounts();playSound('place');return true;
}

function handleExpansionClick(e) {
    if(drivingCar) return true;
    if(e.button===2 && !isToolItem(currentBlock) && tryTradeWithMerchant()) return true;
    if(CAR_ITEMS[currentBlock]) {if(e.button===2) placeCityCarItem(currentBlock);return true;}
    if(e.button===2 && !isToolItem(currentBlock) && tryEnterCityCar()) return true;
    if(e.button===0 && seatedAt) return true;
    if(currentBlock===ENDER_EGG_ID) {
        if(e.button===2) useSpawnEgg(ENDER_EGG_ID);return true;
    }
    if(e.button===0) {
        const dir=new THREE.Vector3();camera.getWorldDirection(dir);
        const hit=traceCombatRay(camera.position,dir,4);
        if(hit.entity?.kind==='enderman') {damageMob(hit.entity,isToolItem(currentBlock)?2:1);return true;}
        return false;
    }
    if(e.button!==2) return false;
    const hit=expansionRay(currentBlock===BUCKET_ID);if(!hit) return false;
    if(placeFoodOnPlate(hit,currentBlock)) return true;
    if(currentBlock===BUCKET_ID && hit.type===24) {
        if(!consumeInventoryItem(BUCKET_ID)) return true;
        setBlock(hit.x,hit.y,hit.z,0);playerInventory[WATER_BUCKET_ID]=(playerInventory[WATER_BUCKET_ID]||0)+1;updateInventoryCounts();return true;
    }
    if(hit.type===NETHER_PORTAL_ID || hit.type===32 || hit.type===OBSIDIAN_ID) {
        if(hit.type!==NETHER_PORTAL_ID) activatePortalNear(hit.x,hit.y,hit.z);
        const portal=Array.from(activePortals.values()).find(p=>[...p.cells,...p.frame].some(c=>c[0]===hit.x&&c[1]===hit.y&&c[2]===hit.z));
        if(portal && portalCooldown===0 && currentBlock!==32 && currentBlock!==OBSIDIAN_ID) {
            travelThroughPortal(currentDimension==='nether'?'overworld':'nether');return true;
        }
    }
    const record=furnitureRecord(hit.x,hit.y,hit.z);
    if(record && !HOME_ITEMS[currentBlock] && !isToolItem(currentBlock)) {
        if([CHAIR_ID,83,126].includes(record.id)) sitInChair(record);
        else {
            if(record.id===KEYBOARD_ID) {
                const computer=Array.from(furnitureData).find(([key,data])=>data.id===COMPUTER_ID && key.startsWith(currentDimension+'|') &&
                    new THREE.Vector3(...key.split('|')[1].split(',').map(Number)).distanceTo(new THREE.Vector3(hit.x,hit.y,hit.z))<3);
                if(computer) {openFurniturePanel({...record,key:computer[0],id:COMPUTER_ID,data:computer[1]});return true;}
            }
            openFurniturePanel(record);
        }
        return true;
    }
    if(HOME_ITEMS[currentBlock]) {
        if(isTinyMode()) {showToast('Return to normal size to place full-size furniture.');return true;}
        const cell=hit.type===42?[hit.x,hit.y,hit.z]:hit.previous;
        if(cell) placeFurniture(currentBlock,...cell);return true;
    }
    return false;
}

function initWorldExpansion() {
    for(const id of Object.keys(HOME_ITEMS)) materials[id]=new THREE.MeshLambertMaterial({color:0xd4d9da});
    materials[ENDER_EGG_ID]=new THREE.MeshLambertMaterial({color:0x30263f});
    materials[FRIDGE_TOP_ID]=materials[FRIDGE_ID];
    materials[FURNITURE_PART_ID]=materials[93];
    for(const id of Object.keys(CAR_ITEMS))materials[id]=new THREE.MeshLambertMaterial({color:CAR_MODELS[CAR_ITEMS[id]].color});
    materials[NETHER_PORTAL_ID]=new THREE.MeshBasicMaterial({color:0xb86df0,transparent:true,opacity:0.58,depthWrite:false});
    matWater.map.wrapS=matWater.map.wrapT=THREE.RepeatWrapping;
    const homeRecipes=[{ing:{36:4,6:1,28:1},out:73,count:1},{ing:{51:2,36:2,28:2,38:1},out:74,count:1},
        {ing:{36:2,6:1,28:1,38:1},out:75,count:1},{ing:{6:3,36:2,28:1},out:76,count:1},
        {ing:{36:3,6:2,28:2},out:77,count:1},{ing:{36:1,28:2},out:78,count:1},{ing:{4:3,36:2},out:79,count:1}];
    homeRecipes.push(...extraHomeRecipes());recipes.push(...homeRecipes);
    const style=document.createElement('style');style.textContent=`
        #inventory-tabs{flex-wrap:wrap} #tab-home .slot{width:108px;height:100px;flex-direction:column;gap:4px;box-sizing:border-box}
        #tab-home .slot img{width:54px;height:54px;object-fit:contain} #tab-home .recipes{flex-basis:100%;text-align:left;font-size:13px}
        #tab-home .recipe{display:flex;gap:8px;align-items:center;justify-content:space-between;border-top:1px solid #555;padding:9px 0}
        #inventory-ui{z-index:10020;background:#101414} #toast-msg{z-index:10060} #sleep-ui{z-index:10100!important}
        #cooked-meat-ui,#trade-ui{z-index:10050!important;box-sizing:border-box;max-width:calc(100vw - 32px)}
        #home-panel,#command-panel{position:fixed;z-index:10040;inset:0;background:#0009;display:grid;place-items:center;padding:16px;box-sizing:border-box}
        #home-panel[hidden],#command-panel[hidden]{display:none}.world-dialog{box-sizing:border-box;width:min(560px,100%);max-height:85vh;overflow:auto;background:#202728;color:white;border:2px solid #7f9799;border-radius:6px;padding:20px;text-align:left}
        .world-dialog header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.world-dialog h2{font-size:22px;margin:0}
        .world-dialog button,.world-dialog select{padding:9px 12px;background:#385b63;color:white;border:1px solid #9cbbbf;border-radius:4px;cursor:pointer}
        .world-dialog textarea,.world-dialog input[type=text]{box-sizing:border-box;width:100%;font:16px sans-serif;background:#11191d;color:white;border:1px solid #9cbbbf;padding:12px;margin:10px 0}
        .home-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:12px 0}.home-row span{flex:1;min-width:120px}
        #home-content{display:grid;gap:12px}.home-game{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.home-game button{height:70px;font-size:26px}.home-game button.lit{background:#cf933e;color:#fff7ca}
    `;document.head.appendChild(style);
    const tab=document.createElement('button');tab.className='tab-btn';tab.textContent='Home';tab.onclick=()=>switchTab('home',tab);document.getElementById('inventory-tabs').appendChild(tab);
    const items=document.createElement('div');items.id='tab-home';items.className='slot-container';items.style.display='none';inventoryUI.appendChild(items);
    const iconRenderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});iconRenderer.setSize(128,128);
    const iconScene=new THREE.Scene();iconScene.add(new THREE.AmbientLight(0xffffff,0.9));const light=new THREE.DirectionalLight(0xffffff,0.8);light.position.set(2,4,5);iconScene.add(light);
    const iconCamera=new THREE.PerspectiveCamera(35,1,0.01,10);iconCamera.position.set(1.9,1.7,3.1);iconCamera.lookAt(0,0.2,0);
    for(const [idText,name] of Object.entries({...HOME_ITEMS,...Object.fromEntries(Object.entries(CAR_ITEMS).map(([id,key])=>[id,CAR_MODELS[key].name])),14:'Bed',[ENDER_EGG_ID]:'Enderman Egg'})) {
        const id=Number(idText),slot=document.createElement('button');slot.className='slot';slot.id=id===14?'home-bed':`inv-${id-12}`;slot.onclick=()=>selectSlot(id===14?10:id-12);
        const model=CAR_ITEMS[id]?createCityCar(undefined,CAR_ITEMS[id]):id===ENDER_EGG_ID?createEndermanModel():createFurnitureModel(id,{on:true});if(id===ENDER_EGG_ID){model.scale.setScalar(0.6);model.position.y=-0.3;}
        if(CAR_ITEMS[id]){model.scale.setScalar(0.52);model.position.y=-0.2;}
        if([93,118,126].includes(id)){model.scale.setScalar(id===118?0.65:0.8);model.position.x=-0.4;if(id===118)model.position.z=-0.35;}
        iconScene.add(model);iconRenderer.render(iconScene,iconCamera);const img=document.createElement('img');img.alt='';img.src=iconRenderer.domElement.toDataURL();slot.append(img,document.createTextNode(name));
        (id===ENDER_EGG_ID?document.getElementById('tab-mods'):items).appendChild(slot);iconScene.remove(model);disposeModModel(model);
    }
    iconRenderer.dispose();
    homeRecipes.push({ing:{2:1,4:1},out:14,count:1});
    for(const id of Object.keys(CAR_ITEMS))homeRecipes.push({ing:{36:6,6:2,28:1},out:Number(id),count:1});
    const list=document.createElement('details');list.className='recipes';const summary=document.createElement('summary');summary.textContent='Recipes';list.appendChild(summary);items.appendChild(list);
    for(const recipe of homeRecipes) {
        const row=document.createElement('div');row.className='recipe';const label=document.createElement('span');
        label.textContent=`${getBlockName(recipe.out)}: ${Object.entries(recipe.ing).map(([id,n])=>`${getBlockName(Number(id))} x${n}`).join(', ')}`;
        const craft=document.createElement('button');craft.textContent='Craft';craft.onclick=()=>{
            if(!isCreativeMode() && Object.entries(recipe.ing).some(([id,n])=>(playerInventory[id]||0)<n)) {showToast('Not enough materials.');return;}
            for(const [id,n] of Object.entries(recipe.ing)) consumeInventoryItem(Number(id),n);
            playerInventory[recipe.out]=(playerInventory[recipe.out]||0)+recipe.count;selectSlot(recipe.out===14?10:recipe.out-12);updateInventoryCounts();playSound('place');
        };row.append(label,craft);list.appendChild(row);
    }
    const panel=document.createElement('section');panel.id='home-panel';panel.hidden=true;
    panel.innerHTML='<div class="world-dialog" role="dialog" aria-modal="true" aria-labelledby="home-title"><header><h2 id="home-title"></h2><button id="close-home" aria-label="Close">&#215;</button></header><div id="home-content"></div></div>';
    document.body.appendChild(panel);document.getElementById('close-home').onclick=()=>closeFurniturePanel();
    expansionReady=true;initWorldCommands();initHomeCity();updateInventoryCounts();
}

function updateWorldExpansion(delta) {
    if(!expansionReady || !isGameStarted) return;
    updateEndermen(delta);tickCommandJob();updateHomeCity(delta);
    matWater.map.offset.x=(matWater.map.offset.x+delta*0.025)%1;
    matWater.map.offset.y=(matWater.map.offset.y+delta*0.018)%1;
    materials[NETHER_PORTAL_ID].opacity=0.5+Math.sin(performance.now()*0.003)*0.13;
    furnitureTick+=delta;
    if(furnitureTick<0.15) return;
    const elapsed=Math.min(0.5,furnitureTick);furnitureTick=0;
    syncFurnitureMeshes();
    for(const [key,model] of furnitureMeshes) {
        const data=furnitureData.get(key)||{};
        if(model.userData.door) model.userData.door.rotation.y=furnitureFocus===key?-Math.PI*0.55:0;
        if(seatedAt?.key===key && model.userData.itemId===CHAIR_ID) model.rotation.y=camera.rotation.y;
        paintDeviceScreen(model,data,performance.now()/1000);
        updateExtraFurniture(model,data,elapsed);
    }
}

function floodBlockType(x,y,z,type) {
    return currentDimension==='overworld' && worldFloodHeight!==null && y<=worldFloodHeight && (type===0||type===42) ? 24 : type;
}

function generateCityChunk(cx,cz) {
    const marker=`city_${cx},${cz}`;if(worldMap.has(marker)) return;worldMap.set(marker,true);
    if(generateCityLake(cx,cz))return;
    if(generateCityDistrict(cx,cz))return;
    const sx=cx*CHUNK_SIZE,sz=cz*CHUNK_SIZE,base=16;
    for(let x=0;x<CHUNK_SIZE;x++) for(let z=0;z<CHUNK_SIZE;z++) {
        const road=x<3 || z<3;
        setGenBlock(sx+x,base,sz+z,road?(x===1&&z%4===0 || z===1&&x%4===0?51:61):63);
        for(let y=base+1;y<=base+2;y++) setGenBlock(sx+x,y,sz+z,0);
    }
    if(hash(cx*2.7,cz*3.1)<0.15) {
        for(let x=6;x<=12;x++) for(let z=6;z<=12;z++) setGenBlock(sx+x,base,sz+z,1);
        for(const [x,z] of [[6,6],[12,12]]) {setGenBlock(sx+x,base+1,sz+z,4);setGenBlock(sx+x,base+2,sz+z,5);}
        return;
    }
    const floors=3+Math.floor(hash(cx+11,cz-17)*4),wall=hash(cx+9,cz+7)>0.48?51:59;
    const bx=sx+5,bz=sz+5,width=10,roof=base+floors*4;
    for(let x=0;x<width;x++) for(let z=0;z<width;z++) for(let y=base;y<=roof;y++) {
        const edge=x===0||z===0||x===width-1||z===width-1;
        let type=y===base||(y-base)%4===0?63:edge?wall:0;
        if(edge && (y-base)%4>=2 && x!==0 && x!==width-1) type=6;
        if(edge && (y-base)%4>=2 && z!==0 && z!==width-1) type=6;
        setGenBlock(bx+x,y,bz+z,type);
    }
    setGenBlock(bx+5,base+1,bz,8);setGenBlock(bx+5,base+2,bz,9);
    for(let floor=0;floor<floors;floor++) {
        const y=base+floor*4;
        for(let step=1;step<=4;step++) {
            for(let z=2;z<=3;z++) {
                setGenBlock(bx+step,y+step,bz+z,63);
                if(step<4) setGenBlock(bx+step,y+4,bz+z,0);
                for(let head=1;head<=2;head++) setGenBlock(bx+step,y+step+head,bz+z,0);
            }
        }
        setGenBlock(bx+7,y+3,bz+7,62);
    }
    for(let y=base+1;y<=roof+1;y++) setGenBlock(bx+8,y,bz+8,7);
    for(let x=0;x<width;x++) for(let z=0;z<width;z++) if(x===0||z===0||x===width-1||z===width-1) setGenBlock(bx+x,roof+1,bz+z,6);
    furnishCityBuilding(bx,base,bz,floors,wall);
}

const COMMAND_ITEMS = {
    '冰箱':73,'游戏机':74,'ps5':74,'switch':75,'掌机':75,'电视':76,'电脑':77,'苹果电脑':77,'显示器':77,'键盘':78,'椅子':79,'转椅':79,
    '末影人':72,'村民':67,'苦力怕':68,'僵尸':69,'擎天柱':70,'大黄蜂':71,'变形金刚':70,'水':24,'水桶':65,'海绵':64,
    '附魔台':32,'黑曜石':44,'缩小药水':46,'变大药水':66,'梯子':7,'玻璃':6,'白砖':51,'砖块':59,'火把':16,'床':14
};

function parseWorldCommand(text) {
    const normalized=text.trim().toLowerCase().replace(/[＊*xX乘]/g,'×').replace(/\s/g,'');
    if(/^(撤销|取消上一个命令)/.test(normalized)) return {kind:'undo',label:'撤销上一个命令'};
    if(/(取消|撤掉|清除).*(全世界|整个世界|全游戏|城市).*水/.test(normalized)) return {kind:'flood',height:null,label:'取消全世界统一水位'};
    if(/^(去|到|找到|寻找|传送到)(学校|市场|地摊|足球场)$/.test(normalized)) {
        const landmark=normalized.includes('学校')?'school':normalized.includes('足球场')?'football':'market';
        return {kind:'landmark',landmark,label:'前往城市出生点附近的'+(landmark==='school'?'学校':landmark==='market'?'市场':'足球场')+'，不会重建或删除现有建筑。'};
    }
    if(/(找|查找|寻找|搜索)/.test(normalized)) {
        const entry=Object.entries(COMMAND_ITEMS).sort((a,b)=>b[0].length-a[0].length).find(([name])=>normalized.includes(name));
        if(entry) return {kind:'find',id:entry[1],label:`找到 ${getBlockName(entry[1])}`};
        const match=Object.entries(getInventorySlotMapping()).find(([,id])=>normalized.includes(getBlockName(id).toLowerCase().replace(/\s/g,'')));
        if(match) return {kind:'find',id:match[1],label:`找到 ${getBlockName(match[1])}`};
        throw new Error('没有找到这个物品。可以输入“查找冰箱”或“查找末影人”。');
    }
    if(/(创建|生成|建造|做一个|做个).*(城市)/.test(normalized)) return {kind:'city',label:'生成新的城市世界。当前世界会重建，请先下载存档。'};
    if(/(水)/.test(normalized) && /(全世界|整个世界|全游戏|城市)/.test(normalized) && /(填|淹|灌)/.test(normalized)) {
        const height=Math.max(48,Math.ceil(camera.position.y)+16);
        return {kind:'flood',height,label:`将整个主世界的水位升到 ${height} 格，保留建筑和地形。新生成的区域也会填水。`};
    }
    const sizes=normalized.match(/(\d+)×(\d+)(?:×(\d+))?/);
    if(sizes && /(空间|房间|区域|水)/.test(normalized)) {
        const width=Number(sizes[1]),depth=Number(sizes[2]),height=Number(sizes[3]||6);
        if(width<2||depth<2||height<3||width>64||depth>64||height>32||width*depth*(height+1)>60000) throw new Error('范围需为 2–64 格，层高 3–32 格，总量不超过 60000 格。');
        const kind=/水/.test(normalized)?'water':/房间/.test(normalized)?'room':'space';
        return {kind,width,depth,height,label:`${kind==='water'?'填水':kind==='room'?'建房间':'清理空间'}：${width} × ${depth} × ${height}。可以撤销。`};
    }
    throw new Error('暂不支持这条命令。可用：创建20×20空间、建20×20×6房间、用水把20×20区域填满、用水把全世界填满、查找物品、生成城市、撤销。');
}

function openCommandPanel() {
    if(!isGameStarted) return;
    closeFurniturePanel(false);document.getElementById('command-panel').hidden=false;
    if(controls.isLocked) controls.unlock();blocker.style.display='none';
    document.getElementById('world-command').focus();
}

function closeCommandPanel(resume=true) {
    const panel=document.getElementById('command-panel');if(panel) panel.hidden=true;
    if(resume&&isGameStarted) controls.lock();
}

function showCommandStatus(message) {document.getElementById('command-result').textContent=message;}

function executeWorldCommand(plan) {
    if(commandJob) {showCommandStatus('正在执行，请等当前命令完成。');return false;}
    if(plan.kind==='find') {
        const slot=Object.entries(getInventorySlotMapping()).find(([,id])=>id===plan.id)?.[0];
        if(!slot) return false;
        closeCommandPanel(false);blocker.style.display='flex';document.getElementById('start-menu').style.display='none';document.getElementById('pause-menu').style.display='none';
        isInventoryOpen=true;inventoryUI.style.display='block';
        const tab=document.getElementById(`inv-${slot}`).parentElement.id.replace('tab-','');switchTab(tab);
        if(tab==='home') {const search=document.querySelector('[aria-label="Search Home"]'),category=document.querySelector('[aria-label="Home category"]');category.value='All';search.value='';search.dispatchEvent(new Event('input'));}
        selectSlot(Number(slot));return true;
    }
    if(plan.kind==='city') {closeCommandPanel(false);setTerrainChoice('city');window.startNewGame(true,'city');return true;}
    if(plan.kind==='landmark') return visitCityLandmark(plan.landmark);
    if(plan.kind==='flood') {
        commandUndo={kind:'flood',height:worldFloodHeight};worldFloodHeight=plan.height;
        for(const key of chunkMeshes.keys()) {if(plan.height!==null) chunkMaxY.set(key,Math.max(chunkMaxY.get(key)||0,plan.height));rebuildQueue.add(key);}
        showCommandStatus('已设置水位。输入“撤销”可恢复。');return true;
    }
    if(plan.kind==='undo') {
        if(!commandUndo) {showCommandStatus('没有可以撤销的命令。');return false;}
        if(commandUndo.kind==='flood') {worldFloodHeight=commandUndo.height;for(const key of chunkMeshes.keys()) rebuildQueue.add(key);commandUndo=null;showCommandStatus('已撤销。');return true;}
        if(commandUndo.dimension!==currentDimension) {showCommandStatus('请回到执行命令的世界再撤销。');return false;}
        commandJob={undo:true,index:0,changes:commandUndo.cells,restore:commandUndo};commandUndo=null;return true;
    }
    const {width,depth,height}=plan,x0=Math.round(camera.position.x)-Math.floor(width/2),z0=Math.round(camera.position.z)-Math.floor(depth/2);
    const y0=Math.round(camera.position.y-getPlayerHeight()-0.5),changes=[];
    for(let cx=Math.floor(x0/CHUNK_SIZE);cx<=Math.floor((x0+width-1)/CHUNK_SIZE);cx++)
        for(let cz=Math.floor(z0/CHUNK_SIZE);cz<=Math.floor((z0+depth-1)/CHUNK_SIZE);cz++) {generateHouseData(cx,cz);generateTrees(cx,cz);}
    for(let x=0;x<width;x++) for(let z=0;z<depth;z++) for(let y=0;y<=height;y++) {
        let type=y===0?63:plan.kind==='water'?24:0;
        if(plan.kind==='room' && (x===0||z===0||x===width-1||z===depth-1||y===height)) type=51;
        if(plan.kind==='room' && z===0 && x===Math.floor(width/2) && y>=1 && y<=2) type=y===1?8:9;
        changes.push([x0+x,y0+y,z0+z,type]);
    }
    // Capture linked cells before any edit can remove the other half of a furniture item or a portal.
    const affected=new Map(changes.map(([x,y,z])=>[`${x},${y},${z}`,[x,y,z]]));
    for(const [x,y,z] of Array.from(affected.values())) {
        const type=getBlock(x,y,z);
        if(HOME_ITEMS[type] && getBlock(x,y+1,z)===FRIDGE_TOP_ID) affected.set(`${x},${y+1},${z}`,[x,y+1,z]);
        if(type===FRIDGE_TOP_ID) affected.set(`${x},${y-1},${z}`,[x,y-1,z]);
        const furniture=furnitureRecord(x,y,z);
        if(furniture) {affected.set(`${furniture.x},${furniture.y},${furniture.z}`,[furniture.x,furniture.y,furniture.z]);for(const p of furniture.data.parts||[])affected.set(p.join(','),p);}
    }
    for(const portal of activePortals.values()) if(portal.frame.some(p=>affected.has(p.join(','))))
        for(const p of portal.cells) affected.set(p.join(','),p);
    const before=Array.from(affected.values(),([x,y,z])=>[x,y,z,getBlock(x,y,z),waterAmounts.get(`${x},${y},${z}`)]);
    commandJob={index:0,changes,plan,floor:y0,undo:false,before,dimension:currentDimension,
        micro:Array.from(microMinedBlocks),placed:Array.from(microPlacedBlocks),fine:Array.from(fineVoxelEdits),
        furniture:JSON.parse(JSON.stringify(Array.from(furnitureData))),portals:Array.from(activePortals),position:camera.position.toArray()};
    showCommandStatus('正在执行：0%');return true;
}

function tickCommandJob() {
    if(!commandJob) return;
    const job=commandJob,dirty=new Set(),end=Math.min(job.index+256,job.changes.length);
    if(job.dimension && job.dimension!==currentDimension) {commandJob=null;return;}
    commandEditing=true;
    for(;job.index<end;job.index++) {
        const [x,y,z,type,amount]=job.changes[job.index],key=`${x},${y},${z}`;
        setBlockNoRebuild(x,y,z,type,dirty);
        if(job.undo && amount!==undefined) waterAmounts.set(key,amount);
    }
    commandEditing=false;
    addDirtyChunksToQueue(dirty);showCommandStatus(`正在执行：${Math.round(job.index/job.changes.length*100)}%`);
    if(job.index<job.changes.length) return;
    if(job.undo) {
        restoreMicroEdits(job.restore.micro,job.restore.placed);restoreFineVoxelEdits(job.restore.fine);
        furnitureData.clear();for(const [k,v] of job.restore.furniture) furnitureData.set(k,v);
        activePortals.clear();for(const [k,v] of job.restore.portals) activePortals.set(k,v);
        camera.position.fromArray(job.restore.position);
        for(const model of furnitureMeshes.values()) disposeModModel(model);furnitureMeshes.clear();
    }
    else {
        commandUndo={kind:'cells',cells:job.before,dimension:job.dimension,micro:job.micro,placed:job.placed,fine:job.fine,
            furniture:job.furniture,portals:job.portals,position:job.position};
        camera.position.y=job.floor+0.5+getPlayerHeight();velocity.set(0,0,0);
    }
    commandJob=null;showCommandStatus(job.undo?'已撤销。':'已完成。');
}

function initWorldCommands() {
    TERRAIN_NAMES.city='City';
    for(const id of ['terrain-select','pause-terrain-select']) {
        const option=document.createElement('option');option.value='city';option.textContent='Terrain: City';document.getElementById(id).appendChild(option);
    }
    const trigger=document.createElement('button');trigger.id='command-button';trigger.textContent='命令';trigger.onclick=openCommandPanel;
    trigger.style.cssText='position:fixed;bottom:112px;left:12px;z-index:12;padding:9px 14px;color:white;background:#294c56;border:1px solid #99babe;border-radius:4px;cursor:pointer';document.body.appendChild(trigger);
    const panel=document.createElement('section');panel.id='command-panel';panel.hidden=true;
    panel.innerHTML='<div class="world-dialog" role="dialog" aria-modal="true" aria-labelledby="command-title"><header><h2 id="command-title">中文命令</h2><button id="close-command" aria-label="关闭">&#215;</button></header><form id="command-form"><input id="world-command" type="text" maxlength="180" aria-label="输入中文命令" placeholder="输入中文命令" autocomplete="off"><button type="submit">检查命令</button></form><div class="home-row" id="command-presets"></div><p id="command-result" role="status"></p><button id="execute-command" disabled>执行</button></div>';
    document.body.appendChild(panel);document.getElementById('close-command').onclick=()=>closeCommandPanel();
    const preview=()=>{try{commandPreview=parseWorldCommand(document.getElementById('world-command').value);showCommandStatus(commandPreview.label);document.getElementById('execute-command').disabled=false;}
        catch(error){commandPreview=null;showCommandStatus(error.message);document.getElementById('execute-command').disabled=true;}};
    document.getElementById('command-form').onsubmit=e=>{e.preventDefault();preview();};
    document.getElementById('execute-command').onclick=()=>{if(commandPreview) executeWorldCommand(commandPreview);};
    document.getElementById('world-command').oninput=()=>{commandPreview=null;document.getElementById('execute-command').disabled=true;};
    for(const label of ['创建20×20空间','用水把全世界填满','查找冰箱','生成城市','撤销']) {
        const b=document.createElement('button');b.textContent=label;b.onclick=()=>{document.getElementById('world-command').value=label;preview();};document.getElementById('command-presets').appendChild(b);
    }
}
