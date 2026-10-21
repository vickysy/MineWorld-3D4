const LAVA_BUCKET_ID=140, LIGHTER_ID=141, CAMPFIRE_ID=142, FIRE_ID=143;
const THERMAL_ITEMS={140:'Lava Bucket',141:'Flint and Steel',142:'Campfire'};
HOME_ITEMS[CAMPFIRE_ID]=EXTRA_HOME_ITEMS[CAMPFIRE_ID]=THERMAL_ITEMS[CAMPFIRE_ID];
Object.assign(COMMAND_ITEMS,{'岩浆桶':140,'打火器':141,'打火石':141,'篝火':142});
const lavaAmounts=new Map(),lavaQueue=new Map(),burningBlocks=new Map(),fireVisuals=new Map(),craterColumns=new Map();
const HEAT_OFFSETS=[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,-1,0],[0,1,0]];
const LAVA_BUCKET_VOLUME=128;
const LAVA_FLOW_INTERVAL=0.05,LAVA_FLOW_BATCH=256,LAVA_FALL_CELLS=4;
const NUKE_BLAST_RADIUS=10;
const FIRE_FUEL=new Set([4,5,7,8,9,10,11,12,14,15,16,25,42,82,83,84,90,91,92,97,118,126,137]);
let lavaWriting=false,thermalBulkWrite=false,lavaElapsed=0,fireElapsed=0,thermalScanElapsed=0,nukeJobs=[];

function lavaAmount(x,y,z) {return getBlock(x,y,z)===LAVA_ID?(lavaAmounts.get(`${x},${y},${z}`)??8):0;}
function liquidAmount(type,x,y,z) {return type===LAVA_ID?lavaAmount(x,y,z):waterAmount(x,y,z);}
function thermalAuthority() {return !multiplayerRoom||multiplayerRoom.role==='host';}
function nearThermalPlayer(x,y,z) {
    const near=p=>Math.abs(x-p.x)<=64&&Math.abs(z-p.z)<=64&&Math.abs(y-p.y)<=160;
    return near(camera.position)||(multiplayerRoom?.role==='host'&&Array.from(multiplayerRoom.positions.values()).some(p=>p.dimension===currentDimension&&near(p)));
}

function queueLavaCell(x,y,z) {
    if(lavaQueue.size>=4096||!nearThermalPlayer(x,y,z))return;
    if(getBlock(x,y,z)===LAVA_ID)lavaQueue.set(`${x},${y},${z}`,[x,y,z]);
}
function queueLavaNeighbors(x,y,z) {
    queueLavaCell(x,y,z);
    for(const [dx,dy,dz] of HEAT_OFFSETS)queueLavaCell(x+dx,y+dy,z+dz);
}
function thermalBlockChanged(x,y,z,oldType,type) {
    const key=`${x},${y},${z}`;
    if(!lavaWriting||type!==LAVA_ID)lavaAmounts.delete(key);
    if(oldType!==type&&burningBlocks.has(key))burningBlocks.delete(key);
    if(type!==LAVA_ID)lavaQueue.delete(key);
    if(type===24)for(const [dx,dy,dz] of HEAT_OFFSETS)extinguishBurning(x+dx,y+dy,z+dz);
    if(!thermalBulkWrite)queueLavaNeighbors(x,y,z);
}

function extinguishBurning(x,y,z) {
    const key=`${x},${y},${z}`,fire=burningBlocks.get(key);if(!fire)return;
    burningBlocks.delete(key);broadcastRoomThermal('extinguish',[x,y,z]);
    if(fire.fuel===FIRE_ID&&getBlock(x,y,z)===FIRE_ID)setBlockNoRebuild(x,y,z,0,rebuildQueue);
}
function writeLava(x,y,z,amount,dirty) {
    const key=`${x},${y},${z}`;
    lavaWriting=true;
    try {if(setBlockNoRebuild(x,y,z,amount>0?LAVA_ID:0,dirty)===false)return false;} finally {lavaWriting=false;}
    if(amount>0)lavaAmounts.set(key,amount);else lavaAmounts.delete(key);
    queueLavaNeighbors(x,y,z);
    return true;
}

function quenchLava(x,y,z,dirty) {
    if(getBlock(x,y,z)!==LAVA_ID)return false;
    const water=HEAT_OFFSETS.map(([dx,dy,dz])=>[x+dx,y+dy,z+dz]).find(p=>isWaterType(getBlock(...p)));
    if(!water)return false;
    if(setBlockNoRebuild(x,y,z,OBSIDIAN_ID,dirty)===false)return false;
    // Water reacts before heat can remove it. A little steam leaves some of the water behind.
    writeWater(...water,Math.max(0,waterAmount(...water)-1),dirty);
    if(Math.hypot(x-camera.position.x,y-camera.position.y,z-camera.position.z)<24)spawnExplosionParticles(x,y+0.5,z,7);
    return true;
}

function canLavaFall(x,y,z) {
    const below=getBlock(x,y-1,z);
    return below===0||below===LAVA_ID&&lavaAmount(x,y-1,z)<8;
}

function transferLava(from,to,amount,dirty) {
    const source=lavaAmount(...from),target=lavaAmount(...to),moved=Math.min(amount,source,8-target);
    if(moved<=0||!lockedBlockWriteAllowed(...from,source===moved?0:LAVA_ID)||!lockedBlockWriteAllowed(...to,LAVA_ID))return 0;
    writeLava(...from,source-moved,dirty);writeLava(...to,target+moved,dirty);
    quenchLava(...to,dirty);return moved;
}

function stepLavaFlow(dirty) {
    // Drain lower cells first. Falling lava cannot spread into a suspended horizontal sheet.
    const cells=Array.from(lavaQueue.entries()).slice(0,LAVA_FLOW_BATCH).sort((a,b)=>a[1][1]-b[1][1]);
    for(const [key,[x,y,z]] of cells) {
        lavaQueue.delete(key);let amount=lavaAmount(x,y,z);if(!amount||!nearThermalPlayer(x,y,z))continue;
        if(quenchLava(x,y,z,dirty))continue;
        let landing=y;
        for(let step=0;step<LAVA_FALL_CELLS;step++) {
            const next=landing-1,type=getBlock(x,next,z);
            if(type!==0&&!(type===LAVA_ID&&lavaAmount(x,next,z)<8))break;
            if(!lockedBlockWriteAllowed(x,next,z,LAVA_ID))break;
            landing=next;
            // Inspect every crossed cell so fast flow never tunnels through water or a wall.
            if(type===LAVA_ID||HEAT_OFFSETS.some(([dx,dy,dz])=>getBlock(x+dx,landing+dy,z+dz)===24))break;
        }
        if(landing<y) {transferLava([x,y,z],[x,landing,z],amount,dirty);continue;}
        if(canLavaFall(x,y,z))continue;
        const neighbors=[[1,0],[0,1],[-1,0],[0,-1]].map(([dx,dz])=>({at:[x+dx,y,z+dz],down:canLavaFall(x+dx,y,z+dz)}));
        neighbors.sort((a,b)=>Number(b.down)-Number(a.down));
        for(const {at,down} of neighbors) {
            if(![0,LAVA_ID].includes(getBlock(...at)))continue;
            const n=lavaAmount(...at),moved=down?Math.min(amount,8-n):Math.floor((amount-n)/2);
            amount-=transferLava([x,y,z],at,moved,dirty);
            if(!amount)break;
        }
        // Writes wake adjacent cells. A settled pool can sleep until its surroundings change.
    }
}

function tickLavaFlow(delta) {
    if(!thermalAuthority()||commandJob||nukeJobs.length)return;
    lavaElapsed=Math.min(0.2,lavaElapsed+delta);
    if(lavaElapsed+1e-9<LAVA_FLOW_INTERVAL)return;
    const dirty=new Set(),editing=commandEditing;commandEditing=true;
    try {
        while(lavaElapsed+1e-9>=LAVA_FLOW_INTERVAL) {
            lavaElapsed=Math.max(0,lavaElapsed-LAVA_FLOW_INTERVAL);stepLavaFlow(dirty);
        }
    } finally {commandEditing=editing;addDirtyChunksToQueue(dirty,true);}
}

function startBurning(x,y,z,remote=false) {
    const type=getBlock(x,y,z),key=`${x},${y},${z}`;
    if(type===TNT_ID){if(!remote)igniteTNT(x,y,z);return true;}
    if(type===NUKE_ID){if(!remote)igniteNuke(x,y,z);return true;}
    if(type===CAMPFIRE_ID)return true;
    if(type!==FIRE_ID&&!FIRE_FUEL.has(type))return false;
    if(burningBlocks.has(key))return true;
    if(burningBlocks.size>=256)return false;
    if(HEAT_OFFSETS.some(([dx,dy,dz])=>getBlock(x+dx,y+dy,z+dz)===24))return false;
    burningBlocks.set(key,{fuel:type,life:type===5||type===42?1.5:3,spread:0});
    if(!remote)broadcastRoomThermal('ignite',[x,y,z],{fuel:type});
    return true;
}
function tickFire(delta) {
    if(!thermalAuthority()||commandJob||nukeJobs.length)return;
    fireElapsed+=delta;if(fireElapsed<0.25)return;const step=Math.min(fireElapsed,0.5);fireElapsed=0;
    const dirty=new Set(),editing=commandEditing;commandEditing=true;
    try {for(const [key,fire] of Array.from(burningBlocks)) {
        const [x,y,z]=key.split(',').map(Number);
        if(getBlock(x,y,z)!==fire.fuel){burningBlocks.delete(key);continue;}
        if(HEAT_OFFSETS.some(([dx,dy,dz])=>getBlock(x+dx,y+dy,z+dz)===24)) {
            extinguishBurning(x,y,z);continue;
        }
        fire.life-=step;fire.spread+=step;
        if(fire.spread>=0.5) {
            fire.spread=0;
            for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++) {
                if(!dx&&!dy&&!dz)continue;
                const type=getBlock(x+dx,y+dy,z+dz);
                if(FIRE_FUEL.has(type)||type===TNT_ID||type===NUKE_ID)startBurning(x+dx,y+dy,z+dz);
            }
        }
        if(fire.life<=0){setBlockNoRebuild(x,y,z,0,dirty);burningBlocks.delete(key);}
    }} finally {commandEditing=editing;addDirtyChunksToQueue(dirty);}
}

function createFlames() {
    const group=new THREE.Group();group.userData.flames=[];
    for(let i=0;i<7;i++) {
        const height=0.3+(i%3)*0.16,x=((i*3)%5-2)*0.14,z=((i*2)%5-2)*0.13;
        const mesh=addModelBox(group,0.14,height,0.14,i%2?0xffa42b:0xffe38a,x,-0.1+height/2,z);
        mesh.material.dispose();mesh.material=new THREE.MeshBasicMaterial({color:i%2?0xff8a22:0xffcd51});
        group.userData.flames.push({mesh,y:mesh.position.y,phase:i*1.7});
    }
    return group;
}
function animateFlames(group,time) {
    for(const f of group.userData.flames||[]) {f.mesh.scale.y=0.8+Math.sin(time*8+f.phase)*0.22;f.mesh.position.y=f.y+Math.sin(time*6+f.phase)*0.055;}
}
function buildThermalModel(id) {
    const group=new THREE.Group(),box=(w,h,d,c,x,y,z)=>addModelBox(group,w,h,d,c,x,y,z);
    if(id===LAVA_BUCKET_ID) {
        box(0.56,0.08,0.48,0x647782,0,-0.28,0);
        for(const x of [-0.3,0.3])box(0.07,0.52,0.55,0xc4d2d8,x,0,0);
        for(const z of [-0.26,0.26])box(0.6,0.52,0.07,0x91a6b2,0,0,z);
        const liquid=box(0.54,0.07,0.46,0xff6f16,0,0.19,0);liquid.material.emissive.setHex(0xc33200);
        for(const x of [-0.34,0.34])box(0.05,0.4,0.05,0xe0e8ea,x,0.39,0);
        box(0.73,0.05,0.05,0xe0e8ea,0,0.6,0);
        for(const x of [-0.17,0.08])box(0.09,0.02,0.11,0xffd267,x,0.235,x*0.4);
    } else if(id===LIGHTER_ID) {
        box(0.12,0.63,0.14,0xb5c2c8,0.2,0,0);
        box(0.43,0.12,0.14,0xe3e9e9,0.04,0.26,0);
        box(0.43,0.12,0.14,0x82959f,0.04,-0.26,0);
        box(0.13,0.2,0.14,0xc8d4d9,-0.14,0.2,0);
        const stone=box(0.25,0.3,0.22,0x39434e,-0.2,-0.05,0.05);stone.rotation.z=-0.3;
    } else {
        for(const z of [-0.23,0.23]) {box(0.86,0.21,0.22,0x6d4831,0,-0.35,z);box(0.02,0.15,0.16,0xbc945d,0.44,-0.35,z);}
        for(const x of [-0.22,0.22])box(0.2,0.18,0.75,0x85603b,x,-0.18,0);
        const flames=createFlames();group.add(flames);group.userData.fire=flames;
    }
    group.userData.modItem=true;return group;
}

function thermalRecipes() {
    return [{ing:{45:1,43:1},out:140,count:1},{ing:{36:1,3:2},out:141,count:1},{ing:{4:3,3:2,16:1},out:142,count:1}];
}
function igniteThermalTarget(x,y,z,air) {
    if(startBurning(x,y,z))return true;
    if(air&&getBlock(...air)===0){setBlock(...air,FIRE_ID);return startBurning(...air);}
    return false;
}
function initThermalWorld() {
    TOOL_ITEMS.push(LIGHTER_ID);
    materials[LAVA_BUCKET_ID]=matLava;materials[LIGHTER_ID]=matBucket;materials[FIRE_ID]=new THREE.MeshBasicMaterial({color:0xffba4a});
    matLava.map.wrapS=matLava.map.wrapT=THREE.RepeatWrapping;
    const r=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});r.setSize(96,96);
    const s=new THREE.Scene();s.add(new THREE.AmbientLight(0xffffff,1));const c=new THREE.PerspectiveCamera(35,1,0.01,10);c.position.set(1.5,1.2,2.9);c.lookAt(0,0.1,0);
    for(const id of [LAVA_BUCKET_ID,LIGHTER_ID]) {
        const model=buildThermalModel(id);s.add(model);r.render(s,c);
        const button=document.createElement('button');button.className='slot hidden-block-slot';button.id=`inv-${id-12}`;button.onclick=()=>selectSlot(id-12);
        const img=document.createElement('img');img.alt='';img.src=r.domElement.toDataURL();button.append(img,document.createTextNode(THERMAL_ITEMS[id]));
        document.getElementById('tab-weapon').appendChild(button);s.remove(model);disposeModModel(model);
    }
    r.dispose();updateInventoryCounts();
}

function pourLavaBucket(x,y,z) {
    const queue=[[x,z]],seen=new Set([`${x},${z}`]),cells=[];
    // Fill a connected horizontal area. Walls, plants and the player are never replaced.
    for(let i=0;i<queue.length&&cells.length<LAVA_BUCKET_VOLUME;i++) {
        const [bx,bz]=queue[i],type=getBlock(bx,y,bz);
        if(type!==0&&type!==24&&type!==LAVA_ID)continue;
        const player=Math.abs(bx-camera.position.x)<0.5+getPlayerRadius()&&Math.abs(bz-camera.position.z)<0.5+getPlayerRadius()&&
            y+0.5>camera.position.y-getPlayerHeight()&&y-0.5<camera.position.y+0.2*playerScale;
        if(player)continue;
        if(type!==LAVA_ID)cells.push([bx,y,bz,type]);
        for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx=bx+dx,nz=bz+dz,key=`${nx},${nz}`;
            if(Math.abs(nx-x)>9||Math.abs(nz-z)>9||seen.has(key))continue;
            seen.add(key);queue.push([nx,nz]);
        }
    }
    const dirty=new Set();
    for(const [bx,by,bz,type] of cells) {
        if(type===24)setBlockNoRebuild(bx,by,bz,OBSIDIAN_ID,dirty);
        else writeLava(bx,by,bz,8,dirty);
    }
    for(const [bx,by,bz] of cells)quenchLava(bx,by,bz,dirty);
    addDirtyChunksToQueue(dirty);
    return cells.length;
}

function handleThermalClick(e) {
    if(e.button!==2||![BUCKET_ID,LAVA_BUCKET_ID,LIGHTER_ID].includes(currentBlock))return false;
    const hit=expansionRay(true);if(!hit)return currentBlock!==BUCKET_ID;
    if(currentBlock===BUCKET_ID&&hit.type!==LAVA_ID)return false;
    if(!hasInventoryItem(currentBlock)){showToast('Not enough items.');return true;}
    if(currentBlock===LIGHTER_ID) {
        if(requestRoomThermal('ignite',[hit.x,hit.y,hit.z],hit.previous))return true;
        if(igniteThermalTarget(hit.x,hit.y,hit.z,hit.previous))playSound('crackle');
        return true;
    }
    if(currentBlock===BUCKET_ID) {
        setBlock(hit.x,hit.y,hit.z,0);consumeInventoryItem(BUCKET_ID);
        playerInventory[LAVA_BUCKET_ID]=(playerInventory[LAVA_BUCKET_ID]||0)+1;showToast('Lava bucket filled.');
    } else {
        const p=hit.type===24||hit.type===LAVA_ID?[hit.x,hit.y,hit.z]:hit.previous;
        if(!p)return true;
        const count=pourLavaBucket(...p);
        if(!count){showToast('No empty space for lava.');return true;}
        consumeInventoryItem(LAVA_BUCKET_ID);
        if(!isCreativeMode())playerInventory[BUCKET_ID]=(playerInventory[BUCKET_ID]||0)+1;
        showToast(`Lava poured: ${count} blocks.`);
    }
    updateInventoryCounts();updateHotbarUI();playSound('place');return true;
}

function isCraterVoid(x,y,z) {return craterColumns.get(`${x},${z}`)?.some(([low,high])=>y>=low&&y<=high)||false;}
function beginNuclearBlast(x,y,z,remote=false) {
    if(nukeJobs.some(j=>j.x===x&&j.y===y&&j.z===z)||nukeJobs.length>=4)return false;
    if(!remote&&requestRoomThermal('nuke',[x,y,z]))return true;
    setBlockNoRebuild(x,y,z,0,rebuildQueue);
    nukeJobs.push({x,y,z,column:0,radius:NUKE_BLAST_RADIUS});
    if(!remote)broadcastRoomThermal('nuke',[x,y,z]);
    const firstParticle=explosionParticles.length;
    spawnExplosionParticles(x,y,z,40);
    for(let i=0;i<8;i++) {const a=i*Math.PI/4;spawnExplosionParticles(x+Math.cos(a)*3,y+2,z+Math.sin(a)*3,4);}
    for(let i=firstParticle;i<explosionParticles.length;i++){const p=explosionParticles[i];p.mesh.scale.setScalar(1.5);p.velocity.multiplyScalar(1.5);p.life*=1.2;p.maxLife=p.life;}
    playSound('explosion');showToast('Nuclear blast: excavating crater...');
    for(const list of [zombies,creepers,villagers,animals,endermen])for(let i=list.length-1;i>=0;i--) {
        const p=list[i].mesh.position;
        if(Math.hypot(p.x-x,p.z-z)<NUKE_BLAST_RADIUS&&p.y>y-NUKE_BLAST_RADIUS&&p.y<y+Math.ceil(NUKE_BLAST_RADIUS*0.36)){disposeModModel(list[i].mesh);list.splice(i,1);}
    }
    return true;
}

function tickNuclearBlast() {
    const job=nukeJobs[0];if(!job)return;
    const radius=job.radius??NUKE_BLAST_RADIUS,diameter=radius*2,total=diameter*diameter;
    const dirty=new Set(),editing=commandEditing,started=performance.now();let columns=0;
    commandEditing=true;thermalBulkWrite=true;
    try {
        // Persist each job's radius so an older partially excavated crater resumes without changing shape.
        while(job.column<total&&columns++<160&&performance.now()-started<5) {
            const dx=job.column%diameter-radius,dz=Math.floor(job.column/diameter)-radius;job.column++;
            const radial=radius*radius-(dx+0.5)**2-(dz+0.5)**2;if(radial<=0)continue;
            const depth=Math.floor(Math.sqrt(radial)),x=job.x+dx,z=job.z+dz,low=job.y-depth,high=job.y-1+Math.ceil(depth*0.36);
            const key=`${x},${z}`,ranges=[...(craterColumns.get(key)||[]),[low,high]].sort((a,b)=>a[0]-b[0]),merged=[];
            for(const range of ranges) {const prev=merged[merged.length-1];if(prev&&range[0]<=prev[1]+1)prev[1]=Math.max(prev[1],range[1]);else merged.push([...range]);}
            craterColumns.set(key,merged);
            modifiedColumns.add(key);columnMinY.set(key,Math.min(columnMinY.get(key)??Infinity,low));
            for(let y=low;y<=high;y++)if(worldMap.has(`${x},${y},${z}`))setBlockNoRebuild(x,y,z,0,dirty);
            const cx=Math.floor(x/CHUNK_SIZE),cz=Math.floor(z/CHUNK_SIZE);
            for(const [a,b] of [[cx,cz],[cx-1,cz],[cx+1,cz],[cx,cz-1],[cx,cz+1]])dirty.add(`${a},${b}`);
        }
    } finally {thermalBulkWrite=false;commandEditing=editing;addDirtyChunksToQueue(dirty);}
    if(job.column>=total){nukeJobs.shift();showToast('Crater complete.');}
}

function saveThermalWorld() {return {machines:saveRedstoneMachines(),missiles:saveNuclearMissiles(),lava:Array.from(lavaAmounts),fires:Array.from(burningBlocks),craters:Array.from(craterColumns),jobs:nukeJobs.map(j=>({...j}))};}
function clearThermalWorld() {
    clearRedstoneMachines();
    clearNuclearMissiles();
    for(const m of fireVisuals.values())disposeModModel(m);fireVisuals.clear();
    for(const m of [lavaAmounts,lavaQueue,burningBlocks,craterColumns])m.clear();nukeJobs=[];
    lavaElapsed=fireElapsed=thermalScanElapsed=0;
}
function restoreThermalWorld(data={}) {
    clearThermalWorld();
    for(const [map,entries] of [[lavaAmounts,data.lava],[burningBlocks,data.fires],[craterColumns,data.craters]])for(const [key,value] of entries||[])map.set(key,value);
    nukeJobs=(data.jobs||[]).slice(0,4).map(j=>({...j,radius:j.radius===undefined?50:Number.isSafeInteger(j.radius)&&j.radius>=1&&j.radius<=50?j.radius:NUKE_BLAST_RADIUS}));
    restoreNuclearMissiles(data.missiles);
    restoreRedstoneMachines(data.machines);
    for(const [key,type] of worldMap)if(type===LAVA_ID)queueLavaCell(...key.split(',').map(Number));
}

function updateThermalWorld(delta) {
    updateNuclearMissiles(delta);
    tickNuclearBlast();tickLavaFlow(delta);tickFire(delta);
    const time=performance.now()/1000;
    matLava.map.offset.set((time*0.012)%1,(time*0.008)%1);
    thermalScanElapsed+=delta;
    if(thermalScanElapsed>=1&&thermalAuthority()) {
        thermalScanElapsed=0;const cx=Math.round(camera.position.x),cy=Math.round(camera.position.y),cz=Math.round(camera.position.z);
        for(let dx=-4;dx<=4;dx++)for(let dz=-4;dz<=4;dz++)for(let dy=-4;dy<=3;dy++)queueLavaCell(cx+dx,cy+dy,cz+dz);
    }
    const visible=new Set();
    for(const [key,fire] of burningBlocks) {
        const [x,y,z]=key.split(',').map(Number);if(getBlock(x,y,z)!==fire.fuel)continue;
        if(Math.hypot(x-camera.position.x,y-camera.position.y,z-camera.position.z)>48)continue;
        visible.add(key);
        if(!fireVisuals.has(key)){const model=createFlames();model.position.set(x,y+(fire.fuel===FIRE_ID?0:0.55),z);scene.add(model);fireVisuals.set(key,model);}
        animateFlames(fireVisuals.get(key),time);
    }
    for(const [key,m] of fireVisuals)if(!visible.has(key)){disposeModModel(m);fireVisuals.delete(key);}
    for(const m of furnitureMeshes.values())if(m.userData.fire)animateFlames(m.userData.fire,time);
}

function updateCraterVisibility() {
    if(!scene.fog||!craterColumns.size)return;
    const ranges=craterColumns.get(`${Math.round(camera.position.x)},${Math.round(camera.position.z)}`);
    if(!ranges)return;
    const depth=Math.max(0,camera.position.y-ranges[0][0]);
    scene.fog.near=Math.max(scene.fog.near,Math.min(240,depth+30));
    scene.fog.far=Math.max(scene.fog.far,Math.min(315,depth+100));
}
