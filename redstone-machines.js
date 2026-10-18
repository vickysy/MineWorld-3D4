// Door pistons invert power; cannons fire on a rising edge; cycle pistons reciprocate.
const PISTON_HEAD_ID=145;
const REDSTONE_DUST_ID=146,BUTTON_ID=147,PASSWORD_LOCK_ID=148;
const MACHINE_ITEMS={146:'Redstone Dust',147:'Button',148:'Password Lock'};
const DOOR_OPEN_HOLD=8,doorOpenTimers=new Map();
const pistonModes=new Map(),pistonPowerEdges=new Map(),buttonTimers=new Map(),buttonFaces=new Map(),circuitVisuals=new Map();
const PISTON_MODES=['auto','door','cannon','cycle'];
const machineCells=new Map(),hiddenRedstone=new Set(),pistonStates=new Map(),pistonVisuals=new Map(),movingTNT=new Map();
const poweredWireCells=new Set(),poweredPistonCells=new Set();
const LEVER_WIRE_RANGE=5,PISTON_WIRE_RANGE=5,PISTONS_PER_WIRE=8;
let circuitDirty=true,machineWriting=false,machineElapsed=0,machineNetworkElapsed=0,machineRevision=0,lastMachineRevision=-1,nextTNT=1;
const machineKey=(x,y,z)=>`${x},${y},${z}`;
const validMachinePoint=p=>Array.isArray(p)&&p.length===3&&p.every(n=>Number.isFinite(n)&&Math.abs(n)<=100000);
const validMachineCell=p=>validMachinePoint(p)&&p.every(Number.isSafeInteger);
const validPistonDirection=d=>d&&[d.x,d.y,d.z].every(Number.isSafeInteger)&&Math.abs(d.x)+Math.abs(d.y)+Math.abs(d.z)===1;

function machineBlockChanged(x,y,z,oldType,type) {
    const key=machineKey(x,y,z);
    if([21,28,30,31,52,53,145,146,147,148].includes(type))machineCells.set(key,type);else machineCells.delete(key);
    if(!circuitDirty)circuitDirty=[28,30,31,PISTON_ID,REDSTONE_DUST_ID,BUTTON_ID].includes(oldType)||
        [28,30,31,PISTON_ID,REDSTONE_DUST_ID,BUTTON_ID,PASSWORD_LOCK_ID].includes(type)||oldType===PASSWORD_LOCK_ID||hiddenRedstone.has(key)||
        redstoneNeighbors(x,y,z).some(n=>machineCells.get(machineKey(n.x,n.y,n.z))===REDSTONE_DUST_ID);
    if(oldType!==type){buttonTimers.delete(key);buttonFaces.delete(key);}
    if(oldType!==type)hiddenRedstone.delete(key);
    if(machineWriting||oldType===type)return;
    if(oldType===PISTON_ID) {
        const state=pistonStates.get(key);pistonStates.delete(key);pistonDirections.delete(key);pistonTimers.delete(key);pistonModes.delete(key);pistonPowerEdges.delete(key);doorOpenTimers.delete(key);
        if(state&&thermalAuthority()) {
            const d=state.dir,at=[x+d.x,y+d.y,z+d.z];
            if(getBlock(...at)===PISTON_HEAD_ID)machineWrite(()=>setBlockNoRebuild(...at,0,rebuildQueue));
        }
        machineRevision++;
    }
    if(oldType===PISTON_HEAD_ID&&thermalAuthority()) {
        const base=pistonBaseForHead(x,y,z);
        if(base) {pistonStates.delete(base.join(','));setBlockNoRebuild(...base,0,rebuildQueue);}
    }
}

function machineWrite(fn) {
    const previous=machineWriting;machineWriting=true;
    try {return fn();} finally {machineWriting=previous;}
}
function isWireAt(x,y,z) {return [28,REDSTONE_DUST_ID].includes(getBlock(x,y,z))||hiddenRedstone.has(machineKey(x,y,z));}
function wireNeighbors(x,y,z) {
    const result=redstoneNeighbors(x,y,z).filter(n=>isWireAt(n.x,n.y,n.z));
    if(getBlock(x,y,z)===REDSTONE_DUST_ID)for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])for(const dy of [-1,1]) {
        const nx=x+dx,ny=y+dy,nz=z+dz;
        if(getBlock(nx,ny,nz)!==REDSTONE_DUST_ID)continue;
        if(dy===1&&!isSolid(x,y+1,z)||dy===-1&&!isSolid(nx,y,nz))result.push({x:nx,y:ny,z:nz});
    }
    return result;
}
function rebuildCircuitPower() {
    if(!circuitDirty)return;
    circuitDirty=false;poweredWireCells.clear();poweredPistonCells.clear();
    rebuildPasswordCircuits();
    const queue=[];
    for(const [key,type] of machineCells)if(type===31&&getBlock(...key.split(',').map(Number))===31) {
        const [x,y,z]=key.split(',').map(Number);
        for(let dx=-LEVER_WIRE_RANGE;dx<=LEVER_WIRE_RANGE;dx++)for(let dy=-LEVER_WIRE_RANGE;dy<=LEVER_WIRE_RANGE;dy++)
            for(let dz=-LEVER_WIRE_RANGE;dz<=LEVER_WIRE_RANGE;dz++) {
                if(dx*dx+dy*dy+dz*dz>LEVER_WIRE_RANGE*LEVER_WIRE_RANGE)continue;
                const p=[x+dx,y+dy,z+dz],wire=p.join(',');
                if(isWireAt(...p))queue.push(p);
            }
    }
    for(const [key,time] of buttonTimers)if(time>0) {
        const at=key.split(',').map(Number);
        for(const n of redstoneNeighbors(...at))if(isWireAt(n.x,n.y,n.z))queue.push([n.x,n.y,n.z]);
    }
    for(const [wire,locks] of lockedWireCells)if(passwordCircuitOpen(locks))queue.push(wire.split(',').map(Number));
    for(let i=0;i<queue.length&&poweredWireCells.size<8192;i++) {
        const [x,y,z]=queue[i],key=machineKey(x,y,z);
        if(poweredWireCells.has(key))continue;
        if(lockedWireCells.has(key)&&!passwordCircuitOpen(lockedWireCells.get(key)))continue;
        poweredWireCells.add(key);
        for(const n of wireNeighbors(x,y,z))if(!poweredWireCells.has(machineKey(n.x,n.y,n.z)))
            queue.push([n.x,n.y,n.z]);
    }
    // One powered wire serves eight nearby pistons. Distance/key order is stable across reloads.
    const candidates=[],loads=new Map();
    for(const [piston,type] of machineCells)if(type===PISTON_ID) {
        const [x,y,z]=piston.split(',').map(Number);
        for(let dx=-PISTON_WIRE_RANGE;dx<=PISTON_WIRE_RANGE;dx++)for(let dy=-PISTON_WIRE_RANGE;dy<=PISTON_WIRE_RANGE;dy++)
            for(let dz=-PISTON_WIRE_RANGE;dz<=PISTON_WIRE_RANGE;dz++) {
                const distance=dx*dx+dy*dy+dz*dz;
                if(distance>PISTON_WIRE_RANGE*PISTON_WIRE_RANGE)continue;
                const wire=machineKey(x+dx,y+dy,z+dz);
                if(poweredWireCells.has(wire)&&(getBlock(x+dx,y+dy,z+dz)!==REDSTONE_DUST_ID||distance<=1))candidates.push({piston,wire,distance});
            }
    }
    candidates.sort((a,b)=>a.distance-b.distance||a.piston.localeCompare(b.piston)||a.wire.localeCompare(b.wire));
    for(const {piston,wire} of candidates) {
        if(lockedPistonCells.has(piston)&&!passwordCircuitOpen(lockedPistonCells.get(piston)))continue;
        if(poweredPistonCells.has(piston)||(loads.get(wire)||0)>=PISTONS_PER_WIRE)continue;
        poweredPistonCells.add(piston);loads.set(wire,(loads.get(wire)||0)+1);
    }
}
function machinePowered(x,y,z) {
    rebuildCircuitPower();
    if(getBlock(x,y,z)===PISTON_ID)return poweredPistonCells.has(machineKey(x,y,z));
    return redstoneNeighbors(x,y,z).some(n=>getBlock(n.x,n.y,n.z)===31||(buttonTimers.get(machineKey(n.x,n.y,n.z))||0)>0||poweredWireCells.has(machineKey(n.x,n.y,n.z)));
}
function handleMachineClick(e) {
    if(![0,2].includes(e.button))return false;
    const hit=expansionRay();if(!hit)return false;
    if(e.button===0&&hit.type===PASSWORD_LOCK_ID){minePasswordLock(hit.x,hit.y,hit.z);return true;}
    if(e.button!==2||isTinyMode())return false;
    const key=machineKey(hit.x,hit.y,hit.z);
    if(hit.type===PASSWORD_LOCK_ID){openPasswordLockPanel(hit.x,hit.y,hit.z);return true;}
    if(hit.previous&&!canEditPasswordCircuit(...hit.previous,undefined,currentBlock)){showToast('Only the lock owner can change this circuit.');return true;}
    if(hit.type===BUTTON_ID){pressMachineButton(hit.x,hit.y,hit.z);return true;}
    if(currentBlock===34&&(hit.type===PISTON_ID||hit.type===PISTON_HEAD_ID)) {
        const at=hit.type===PISTON_ID?[hit.x,hit.y,hit.z]:pistonBaseForHead(hit.x,hit.y,hit.z);
        if(at)openPistonPanel(...at);return true;
    }
    if(MACHINE_ITEMS[currentBlock]) {
        const at=hit.previous;if(!at||!hasInventoryItem(currentBlock))return true;
        if(![0,42].includes(getBlock(...at)))return true;
        const face={x:at[0]-hit.x,y:at[1]-hit.y,z:at[2]-hit.z};
        if(currentBlock===PASSWORD_LOCK_ID) {
            if(lockPlacementPending)return true;
            if(validPistonDirection(face)&&(isSolid(hit.x,hit.y,hit.z)||isWireAt(hit.x,hit.y,hit.z))) {
                lockPlacementPending=true;
                performLockAction('place',at,{face}).then(result=>{
                    if(result.ok){consumeInventoryItem(PASSWORD_LOCK_ID);updateInventoryCounts();updateHotbarUI();openPasswordLockPanel(...at);}else showToast(result.message);
                }).catch(()=>showToast('Lock placement failed.')).finally(()=>lockPlacementPending=false);
            }
            return true;
        }
        if(currentBlock===REDSTONE_DUST_ID&&!isSolid(at[0],at[1]-1,at[2]))return true;
        if(currentBlock===BUTTON_ID&&(!validPistonDirection(face)||!isSolid(hit.x,hit.y,hit.z)))return true;
        setBlock(...at,currentBlock);
        if(currentBlock===BUTTON_ID)buttonFaces.set(at.join(','),face);
        queueRoomBlockChange(...at);consumeInventoryItem(currentBlock);updateInventoryCounts();updateHotbarUI();playSound('place');return true;
    }
    const embed=currentBlock===28&&HIDDEN_BLOCKS[hit.type];
    const cover=HIDDEN_BLOCKS[currentBlock]&&hit.type===28;
    if(!embed&&!cover)return false;
    if(hiddenRedstone.has(key)){showToast('Redstone is already hidden here.');return true;}
    if(!hasInventoryItem(currentBlock)){showToast('Not enough items.');return true;}
    if(cover)setBlock(hit.x,hit.y,hit.z,currentBlock);
    hiddenRedstone.add(key);circuitDirty=true;consumeInventoryItem(currentBlock);
    queueRoomBlockChange(hit.x,hit.y,hit.z);updateInventoryCounts();updateHotbarUI();playSound('place');
    showToast('Redstone concealed.');return true;
}

function pressMachineButton(x,y,z) {
    if(getBlock(x,y,z)!==BUTTON_ID)return false;
    if(!thermalAuthority())return requestRoomThermal('button',[x,y,z]);
    buttonTimers.set(machineKey(x,y,z),1);circuitDirty=true;queueRoomBlockChange(x,y,z);playSound('place');return true;
}
function openPistonPanel(x,y,z) {
    if(!canEditPasswordCircuit(x,y,z)){showToast('Only the lock owner can change this circuit.');return;}
    closeFurniturePanel(false);furnitureFocus=machineKey(x,y,z);
    const key=furnitureFocus,content=document.getElementById('home-content');content.replaceChildren();
    document.getElementById('home-title').textContent='Piston';document.getElementById('home-panel').hidden=false;
    if(controls.isLocked)controls.unlock();blocker.style.display='none';
    const row=document.createElement('div');row.className='home-row';row.setAttribute('role','group');row.setAttribute('aria-label','Piston mode');content.appendChild(row);
    for(const [mode,label] of [['auto','Auto'],['door','Door'],['cannon','TNT Cannon'],['cycle','Cycle']]) {
        const b=document.createElement('button');b.textContent=label;b.setAttribute('aria-pressed',String((pistonModes.get(key)||'auto')===mode));
        b.onclick=()=>{if(getBlock(x,y,z)!==PISTON_ID||!canEditPasswordCircuit(x,y,z))return;pistonModes.set(key,mode);pistonPowerEdges.delete(key);queueRoomBlockChange(x,y,z);openPistonPanel(x,y,z);};row.appendChild(b);
    }
    const rotate=document.createElement('button');rotate.innerHTML='&#x21bb;';rotate.title='Rotate';rotate.setAttribute('aria-label','Rotate');
    rotate.style.cssText='width:44px;height:44px;padding:0;font-size:26px';rotate.disabled=pistonStates.has(key);
    rotate.onclick=()=>{
        if(getBlock(x,y,z)!==PISTON_ID||pistonStates.has(key)||!canEditPasswordCircuit(x,y,z))return;
        const directions=[{x:1,y:0,z:0},{x:0,y:0,z:1},{x:-1,y:0,z:0},{x:0,y:0,z:-1},{x:0,y:1,z:0},{x:0,y:-1,z:0}];
        const old=getStoredPistonDirection(x,y,z),i=directions.findIndex(d=>d.x===old.x&&d.y===old.y&&d.z===old.z);
        pistonDirections.set(key,directions[(i+1)%6]);queueRoomBlockChange(x,y,z);machineRevision++;playSound('stone');
    };content.appendChild(rotate);
}

function resolvedPistonMode(key,at) {
    const mode=pistonModes.get(key)||'auto';if(mode!=='auto')return mode;
    const d=getStoredPistonDirection(...at),front=[at[0]+d.x,at[1]+d.y,at[2]+d.z],type=getBlock(...front);
    const next=type===TNT_ID?'cannon':type&&type!==42&&movablePistonCell(...front,type)?'door':null;
    if(next){pistonModes.set(key,next);queueRoomBlockChange(...at);return next;}
    return 'cycle';
}

function pistonBaseForHead(x,y,z) {
    for(const n of redstoneNeighbors(x,y,z)) {
        const key=machineKey(n.x,n.y,n.z),state=pistonStates.get(key);
        if(state&&n.x+state.dir.x===x&&n.y+state.dir.y===y&&n.z+state.dir.z===z)return [n.x,n.y,n.z];
    }
    return null;
}
function machineCellOccupied(x,y,z,padding=0) {
    const overlaps=(p,r,bottom,top)=>Math.abs(p.x-x)<r+0.499+padding&&Math.abs(p.z-z)<r+0.499+padding&&top>y-0.499-padding&&bottom<y+0.499+padding;
    if(isGameStarted&&overlaps(camera.position,getPlayerRadius(),camera.position.y-getPlayerHeight(),camera.position.y+0.2*playerScale))return true;
    if(multiplayerRoom?.role==='host')for(const p of multiplayerRoom.positions.values()) {
        if(p.dimension===currentDimension&&overlaps(p,0.2*p.scale,p.y-1.6*p.scale,p.y+0.2*p.scale))return true;
    }
    return [...villagers,...zombies,...creepers,...animals,...endermen].some(m=>!m.dying&&overlaps(m.mesh.position,0.35,m.mesh.position.y-0.5,m.mesh.position.y+1.3));
}
function doorPassageOccupied(at) {
    const d=getStoredPistonDirection(...at);
    for(let i=1;i<=13;i++) {
        const cell=[at[0]+d.x*i,at[1]+d.y*i,at[2]+d.z*i];
        if(machineCellOccupied(...cell,0.65))return true;
        if(i>=2&&!getBlock(...cell))break;
    }
    return false;
}
function movablePistonCell(x,y,z,type) {
    if(!isMovableByPiston(type)||hiddenRedstone.has(machineKey(x,y,z)))return false;
    return !microEdits.has(microParentKey(x,y,z))&&!microPlacements.has(microParentKey(x,y,z))&&!fineRoots.has(microParentKey(x,y,z));
}
function extendPiston(x,y,z) {
    if(!thermalAuthority())return false;
    const key=machineKey(x,y,z);if(pistonStates.has(key)||pistonStates.size>=512||getBlock(x,y,z)!==PISTON_ID)return false;
    const dir=getStoredPistonDirection(x,y,z),front=[x+dir.x,y+dir.y,z+dir.z];
    const pushed=[];
    let cannon=false;
    const primed=[...movingTNT.values()].filter(t=>!t.impact&&!t.launchDelay&&Math.abs(t.mesh.position.x-front[0])<0.6&&
        Math.abs(t.mesh.position.z-front[2])<0.6&&t.mesh.position.y>=front[1]-0.1&&t.mesh.position.y<front[1]+16);
    if(getBlock(...front)===TNT_ID||(primed.length&&[0,42].includes(getBlock(...front)))) {
        if(pistonModes.get(key)==='door')return false;
        const ammo=[];
        for(let i=0;i<16;i++) {
            const at=[front[0],front[1]+i,front[2]];
            if(getBlock(...at)!==TNT_ID)break;ammo.push(at);
        }
        if(movingTNT.size+ammo.length>128||machineCellOccupied(...front))return false;
        for(const at of ammo)primeTNT(...at,{launch:dir});
        for(const t of primed.slice(0,16)) {t.launch={...dir};t.launchDelay=0.45;t.fuse=4;t.velocity.set(0,0,0);}
        cannon=true;
    } else {
        let empty=false;
        for(let i=1;i<=13;i++) {
            const at=[x+dir.x*i,y+dir.y*i,z+dir.z*i],type=getBlock(...at);
            if(!type||type===42) {empty=true;break;}
            if(i>12||!movablePistonCell(...at,type))return false;
            pushed.push({from:at,to:[at[0]+dir.x,at[1]+dir.y,at[2]+dir.z],type});
        }
        if(!empty||[front,...pushed.map(p=>p.to)].some(p=>machineCellOccupied(...p)))return false;
    }
    const state={dir:{...dir},pushed,cannon,time:0};pistonStates.set(key,state);
    machineWrite(()=>{
        for(let i=pushed.length-1;i>=0;i--) {
            const p=pushed[i];setBlockNoRebuild(...p.to,p.type,rebuildQueue);setBlockNoRebuild(...p.from,0,rebuildQueue);
        }
        setBlockNoRebuild(...front,PISTON_HEAD_ID,rebuildQueue);
    });
    machineRevision++;playSound('stone');return true;
}
function retractPiston(x,y,z) {
    const key=machineKey(x,y,z),state=pistonStates.get(key);if(!state)return true;
    const d=state.dir,front=[x+d.x,y+d.y,z+d.z],sources=new Set(state.pushed.map(p=>p.to.join(',')));
    const intact=state.pushed.every(p=>getBlock(...p.to)===p.type&&
        (p.from.join(',')===front.join(',')||sources.has(p.from.join(','))||getBlock(...p.from)===0));
    if(intact&&state.pushed.some(p=>machineCellOccupied(...p.from)))return false;
    machineWrite(()=>{
        if(getBlock(...front)===PISTON_HEAD_ID)setBlockNoRebuild(...front,0,rebuildQueue);
        if(intact)for(const p of state.pushed) {setBlockNoRebuild(...p.from,p.type,rebuildQueue);setBlockNoRebuild(...p.to,0,rebuildQueue);}
    });
    pistonStates.delete(key);machineRevision++;playSound('stone');return true;
}

function serializeTNT(t) {
    return {id:t.id,at:t.mesh.position.toArray(),velocity:t.velocity.toArray(),fuse:t.fuse,age:t.age,
        launchDelay:t.launchDelay,launch:t.launch,impact:t.impact};
}
function validTNT(t) {
    return t&&typeof t.id==='string'&&t.id.length<80&&validMachinePoint(t.at)&&validMachinePoint(t.velocity)&&
        t.velocity.every(v=>Math.abs(v)<=80)&&(t.fuse===null||Number.isFinite(t.fuse)&&t.fuse>=0&&t.fuse<=10)&&
        Number.isFinite(t.age)&&t.age>=0&&t.age<=600&&Number.isFinite(t.launchDelay)&&t.launchDelay>=0&&t.launchDelay<=1&&
        (!t.launch||validPistonDirection(t.launch));
}
function makeMovingTNT(data) {
    if(!validTNT(data)||movingTNT.size>=128)return null;
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.9,0.9),matTNT.clone());mesh.position.fromArray(data.at);scene.add(mesh);
    const t={...data,mesh,velocity:new THREE.Vector3().fromArray(data.velocity),remoteTarget:new THREE.Vector3().fromArray(data.at)};
    movingTNT.set(t.id,t);return t;
}
function removeMovingTNT(t) {scene.remove(t.mesh);t.mesh.geometry.dispose();t.mesh.material.dispose();movingTNT.delete(t.id);}
function primeTNT(x,y,z,options={}) {
    if(!thermalAuthority())return requestRoomThermal('ignite',[x,y,z]);
    if(getBlock(x,y,z)!==TNT_ID||movingTNT.size>=128)return false;
    const launch=options.launch||null;
    while(movingTNT.has(`tnt-${nextTNT}`))nextTNT++;
    const t=makeMovingTNT({id:`tnt-${nextTNT++}`,at:[x,y,z],velocity:[0,0,0],fuse:options.falling?null:4,age:0,
        launchDelay:launch?0.45:0,launch,impact:false});
    if(!t)return false;
    setBlockNoRebuild(x,y,z,0,rebuildQueue);return true;
}
function tntHitsBlock(pos) {
    for(let x=Math.floor(pos.x+0.05);x<=Math.floor(pos.x+0.95-1e-7);x++)
        for(let y=Math.floor(pos.y+0.05);y<=Math.floor(pos.y+0.95-1e-7);y++)
            for(let z=Math.floor(pos.z+0.05);z<=Math.floor(pos.z+0.95-1e-7);z++)if(isSolid(x,y,z))return true;
    return false;
}
function showTNTBlast(at) {
    spawnExplosionParticles(...at,Math.min(40,Math.max(0,160-explosionParticles.length)));
}
function explodeMovingTNT(t) {
    const at=t.mesh.position.toArray().map(Math.round);removeMovingTNT(t);
    const [x,y,z]=at;showTNTBlast(at);playSound('stone');
    for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++)for(let dz=-2;dz<=2;dz++) {
        if(dx*dx+dy*dy+dz*dz>6.25)continue;
        const p=[x+dx,y+dy,z+dz],type=getBlock(...p);
        if(type===TNT_ID)primeTNT(...p);
        else if(type&&type!==OBSIDIAN_ID&&type!==BARRIER_ID)setBlockNoRebuild(...p,0,rebuildQueue);
    }
    for(const m of [...villagers,...animals,...zombies,...creepers,...endermen])if(m.mesh.position.distanceTo(new THREE.Vector3(x,y,z))<3)
        damageMob(m,4,'explosion');
    if(camera.position.distanceTo(new THREE.Vector3(x,y,z))<3)takeDamage(4);
    broadcastMachinePacket({type:'machine-blast',at});
}
function tickMovingTNT(delta) {
    const dt=Math.min(delta,0.1);
    for(const t of [...movingTNT.values()]) {
        if(!thermalAuthority()) {
            t.mesh.position.lerp(t.remoteTarget,1-Math.exp(-20*dt));
        } else {
            t.age+=dt;
            if(t.launchDelay>0) {
                t.launchDelay=Math.max(0,t.launchDelay-dt);
                if(t.launchDelay===0) {
                    const d=t.launch;
                    t.mesh.position.add(new THREE.Vector3(d.x,d.y,d.z));
                    t.velocity.set(d.x*22,d.y*22+(d.y===0?9:0),d.z*22);t.impact=true;t.fuse=8;
                }
            } else {
                t.velocity.y=Math.max(-40,t.velocity.y-18*dt);
                const steps=Math.max(1,Math.ceil(t.velocity.length()*dt/0.15)),step=dt/steps;
                let landed=false,hit=false;
                for(let i=0;i<steps&&!hit;i++)for(const axis of ['x','z','y']) {
                    const motion=t.velocity[axis]*step;if(!motion)continue;
                    const before=t.mesh.position[axis];t.mesh.position[axis]+=motion;
                    if(tntHitsBlock(t.mesh.position)) {
                        let low=0,high=1;
                        for(let n=0;n<10;n++) {const mid=(low+high)/2;t.mesh.position[axis]=before+motion*mid;
                            if(tntHitsBlock(t.mesh.position))high=mid;else low=mid;}
                        t.mesh.position[axis]=before+motion*low;
                        landed=landed||(axis==='y'&&motion<0);t.velocity[axis]=0;
                        if(t.impact){hit=true;break;}
                    }
                }
                if(hit){explodeMovingTNT(t);continue;}
                if(landed&&t.fuse===null) {
                    const at=t.mesh.position.toArray().map(Math.round);
                    if([0,24,LAVA_ID,42].includes(getBlock(...at)))setBlockNoRebuild(...at,TNT_ID,rebuildQueue);
                    else spawnDroppedItem(...at,TNT_ID);
                    removeMovingTNT(t);continue;
                }
            }
            if(t.fuse!==null&&!t.launchDelay) {
                t.fuse=Math.max(0,t.fuse-dt);
                if(t.fuse===0){explodeMovingTNT(t);continue;}
            }
            if(t.age>120||t.mesh.position.y<-9999){spawnDroppedItem(...t.mesh.position.toArray(),TNT_ID);removeMovingTNT(t);continue;}
        }
        t.mesh.material.emissive.setHex(t.fuse!==null&&Math.floor(t.age*8)%2===0?0x999999:0x000000);
    }
}

function updatePistonVisuals(delta) {
    for(const [key,type] of machineCells) {
        if(type!==PISTON_ID)continue;
        const at=key.split(',').map(Number);
        if(!nearThermalPlayer(...at))continue;
        let m=pistonVisuals.get(key);
        if(!m) {
            m=new THREE.Group();m.position.set(...at);m.userData.extension=0;
            m.userData.rod=addModelBox(m,0.22,0.22,1,0xaab4bc,0,0,0.5);
            m.userData.plate=addModelBox(m,0.92,0.92,0.16,0xbe995f,0,0,0.5);
            for(const x of [-0.32,0.32])for(const y of [-0.32,0.32])addModelBox(m.userData.plate,0.09,0.09,0.03,0xd8dfe3,x,y,0.095);
            scene.add(m);pistonVisuals.set(key,m);
        }
        const dir=getStoredPistonDirection(...at),state=pistonStates.get(key);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(dir.x,dir.y,dir.z));
        const target=state?1:0;
        m.userData.extension+=Math.max(-delta*6,Math.min(delta*6,target-m.userData.extension));
        const extension=m.userData.extension;
        m.userData.plate.position.z=0.42+extension*0.5;
        m.userData.rod.scale.z=Math.max(0.01,extension*0.5);m.userData.rod.position.z=0.42+extension*0.25;
    }
    for(const [key,m] of pistonVisuals)if(getBlock(...key.split(',').map(Number))!==PISTON_ID||!nearThermalPlayer(...key.split(',').map(Number))) {
        disposeModModel(m);pistonVisuals.delete(key);
    }
}

function buildCircuitModel(type,links=[],powered=false,face={x:0,y:1,z:0}) {
    const group=new THREE.Group();
    if(type===REDSTONE_DUST_ID) {
        const color=powered?0xff3c27:0x811c18;
        addModelBox(group,0.26,0.025,0.26,color,0,-0.48,0);
        for(const [dx,dy,dz] of links) {
            if(dx)addModelBox(group,0.5,0.025,0.16,color,dx*0.25,-0.48,0);
            if(dz)addModelBox(group,0.16,0.025,0.5,color,0,-0.48,dz*0.25);
            if(dy===1)addModelBox(group,dx?0.025:0.16,1,dz?0.025:0.16,color,dx*0.48,0,dz*0.48);
        }
    } else {
        if(type===PASSWORD_LOCK_ID) {
            addModelBox(group,0.58,0.09,0.76,0x3d484b,0,-0.43,0);
            addModelBox(group,0.4,0.02,0.15,powered?0x49d593:0xd55748,0,-0.375,-0.2);
            for(let x=-1;x<=1;x++)for(let z=0;z<3;z++)addModelBox(group,0.09,0.035,0.09,0xe2e4e0,x*0.14,-0.365,z*0.13-0.02);
            group.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(face.x,face.y,face.z));
            return group;
        }
        addModelBox(group,0.42,0.06,0.3,0x48545b,0,-0.46,0);
        addModelBox(group,0.3,powered?0.04:0.12,0.2,powered?0xe45938:0xaab5bd,0,powered?-0.41:-0.37,0);
        group.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(face.x,face.y,face.z));
    }
    return group;
}
function updateCircuitVisuals() {
    rebuildCircuitPower();
    for(const [key,type] of machineCells)if(MACHINE_ITEMS[type]) {
        const at=key.split(',').map(Number);if(!nearThermalPlayer(...at))continue;
        const links=type===REDSTONE_DUST_ID?wireNeighbors(...at).concat(redstoneNeighbors(...at).filter(n=>[30,31,53,52,BUTTON_ID].includes(getBlock(n.x,n.y,n.z))))
            .map(n=>[n.x-at[0],n.y-at[1],n.z-at[2]]):[];
        const powered=type===REDSTONE_DUST_ID?poweredWireCells.has(key):type===PASSWORD_LOCK_ID?(passwordLocks.get(key)?.remaining||0)>0:(buttonTimers.get(key)||0)>0;
        const face=passwordLocks.get(key)?.face||buttonFaces.get(key)||{x:0,y:1,z:0};
        const signature=JSON.stringify([type,links,powered,face]);let model=circuitVisuals.get(key);
        if(model?.userData.signature===signature)continue;
        if(model)disposeModModel(model);
        model=buildCircuitModel(type,links,powered,face);model.position.set(...at);model.userData.signature=signature;scene.add(model);circuitVisuals.set(key,model);
    }
    for(const [key,model] of circuitVisuals)if(!MACHINE_ITEMS[getBlock(...key.split(',').map(Number))]||!nearThermalPlayer(...key.split(',').map(Number))) {
        disposeModModel(model);circuitVisuals.delete(key);
    }
}
function initRedstoneMachines() {
    materials[REDSTONE_DUST_ID]=matRedstone;materials[BUTTON_ID]=matStone;
    materials[PASSWORD_LOCK_ID]=matStone;
    recipes.push({ing:{28:1},out:REDSTONE_DUST_ID,count:8},{ing:{3:1},out:BUTTON_ID,count:1},{ing:{36:2,28:1},out:PASSWORD_LOCK_ID,count:1});
    const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(96,96);
    const preview=new THREE.Scene();preview.add(new THREE.AmbientLight(0xffffff,1));
    const view=new THREE.PerspectiveCamera(35,1,0.01,10);view.position.set(1.3,1.3,1.8);view.lookAt(0,-0.35,0);
    for(const [id,name] of Object.entries(MACHINE_ITEMS)) {
        const model=buildCircuitModel(Number(id),[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]);preview.add(model);renderer.render(preview,view);
        const b=document.createElement('button');b.className='slot hidden-block-slot';b.id=`inv-${id-12}`;b.onclick=()=>selectSlot(id-12);
        const img=document.createElement('img');img.alt='';img.src=renderer.domElement.toDataURL();b.append(img,document.createTextNode(name));document.getElementById('tab-redstone').appendChild(b);
        preview.remove(model);disposeModModel(model);
    }
    renderer.dispose();updateInventoryCounts();
}

function tickRedstoneMachines(delta) {
    tickMovingTNT(delta);
    machineElapsed+=delta;
    if(machineElapsed>=0.1&&thermalAuthority()&&!commandJob&&!nukeJobs.length) {
        const elapsed=Math.min(machineElapsed,0.2);machineElapsed=0;
        tickPasswordLocks(elapsed);
        for(const [key,time] of buttonTimers) {
            const left=Math.max(0,time-elapsed);
            if(left)buttonTimers.set(key,left);else {buttonTimers.delete(key);circuitDirty=true;queueRoomBlockChange(...key.split(',').map(Number));}
        }
        for(const [key,type] of [...machineCells])if(MACHINE_ITEMS[type]) {
            if(type===PASSWORD_LOCK_ID)continue;
            const at=key.split(',').map(Number),f=type===BUTTON_ID?(buttonFaces.get(key)||{x:0,y:1,z:0}):{x:0,y:1,z:0};
            if(!isSolid(at[0]-f.x,at[1]-f.y,at[2]-f.z)) {
                if(setBlockNoRebuild(...at,0,rebuildQueue)!==false)spawnDroppedItem(...at,type);
            }
        }
        // Run pistons before unsupported TNT, so stacked ammunition can be armed as a group.
        for(const [key,type] of [...machineCells])if(type===PISTON_ID) {
            const at=key.split(',').map(Number);if(!nearThermalPlayer(...at))continue;
            const power=machinePowered(...at),state=pistonStates.get(key),mode=resolvedPistonMode(key,at);
            const wasPowered=pistonPowerEdges.get(key)||false;pistonPowerEdges.set(key,power);
            if(mode==='door') {
                if(power) {
                    doorOpenTimers.set(key,DOOR_OPEN_HOLD);
                    if(state)retractPiston(...at);
                } else if(!state) {
                    const remaining=doorPassageOccupied(at)?Math.max(2,doorOpenTimers.get(key)||0):Math.max(0,(doorOpenTimers.get(key)||0)-elapsed);
                    doorOpenTimers.set(key,remaining);
                    if(remaining===0)extendPiston(...at);
                }
                continue;
            }
            if(mode==='cannon') {
                if(state) {state.time+=elapsed;if(state.time>=0.65)retractPiston(...at);}
                else if(power&&!wasPowered)extendPiston(...at);
                continue;
            }
            if(state) {
                state.time+=elapsed;
                // A powered piston keeps reciprocating; its stored row returns on each backstroke.
                if((!power||state.time>=0.65)&&retractPiston(...at))pistonTimers.set(key,0.45);
            } else {
                const cooldown=Math.max(0,(pistonTimers.get(key)||0)-elapsed);pistonTimers.set(key,cooldown);
                if(power&&cooldown===0)extendPiston(...at);
            }
        }
        for(const [key,type] of [...machineCells])if(type===TNT_ID) {
            const [x,y,z]=key.split(',').map(Number);if(!nearThermalPlayer(x,y,z))continue;
            if(machinePowered(x,y,z))primeTNT(x,y,z);
            else if(!isSolid(x,y-1,z))primeTNT(x,y,z,{falling:true});
        }
    }
    updatePistonVisuals(delta);
    updateCircuitVisuals();
    machineNetworkElapsed+=delta;
    if(machineNetworkElapsed>=0.15&&thermalAuthority()) {
        machineNetworkElapsed=0;
        const changed=machineRevision!==lastMachineRevision;lastMachineRevision=machineRevision;
        broadcastMachinePacket({type:'machines',tnt:[...movingTNT.values()].map(serializeTNT),
            ...(changed?{pistons:[...pistonStates]}:{})});
    }
}

function saveRedstoneMachines() {
    return {...savePasswordLocks(),doorTimers:[...doorOpenTimers],tnt:[...movingTNT.values()].map(serializeTNT),pistons:[...pistonStates],directions:[...pistonDirections],modes:[...pistonModes],edges:[...pistonPowerEdges],buttons:[...buttonTimers],faces:[...buttonFaces],hidden:[...hiddenRedstone],nextTNT};
}
function clearRedstoneMachines() {
    clearPasswordLocks();doorOpenTimers.clear();
    for(const t of [...movingTNT.values()])removeMovingTNT(t);
    for(const m of pistonVisuals.values())disposeModModel(m);
    for(const m of circuitVisuals.values())disposeModModel(m);
    for(const map of [machineCells,hiddenRedstone,pistonStates,pistonVisuals,poweredWireCells,poweredPistonCells,pistonDirections,pistonTimers,pistonModes,pistonPowerEdges,buttonTimers,buttonFaces,circuitVisuals])map.clear();
    circuitDirty=true;machineElapsed=machineNetworkElapsed=0;machineRevision++;lastMachineRevision=-1;
}
function validPistonState(key,state) {
    return typeof key==='string'&&validMachineCell(key.split(',').map(Number))&&state&&validPistonDirection(state.dir)&&
        Number.isFinite(state.time)&&state.time>=0&&Array.isArray(state.pushed)&&state.pushed.length<=12&&
        state.pushed.every(p=>validMachineCell(p.from)&&validMachineCell(p.to)&&Number.isSafeInteger(p.type)&&p.type>0&&p.type<=145&&
            p.to.every((v,i)=>v-p.from[i]===state.dir[['x','y','z'][i]]));
}
function restoreRedstoneMachines(data={}) {
    clearRedstoneMachines();
    for(const [key,type] of worldMap)if([21,28,30,31,52,53,145,146,147,148].includes(type)&&validMachineCell(key.split(',').map(Number)))machineCells.set(key,type);
    for(const key of (data.hidden||[]).slice(0,8192))if(typeof key==='string'&&validMachineCell(key.split(',').map(Number))&&HIDDEN_BLOCKS[getBlock(...key.split(',').map(Number))])hiddenRedstone.add(key);
    for(const [key,d] of (data.directions||[]).slice(0,4096))if(machineCells.get(key)===PISTON_ID&&validPistonDirection(d))pistonDirections.set(key,d);
    for(const [key,s] of (data.pistons||[]).slice(0,512))if(machineCells.get(key)===PISTON_ID&&validPistonState(key,s))pistonStates.set(key,s);
    for(const [key,mode] of (data.modes||[]).slice(0,4096))if(machineCells.get(key)===PISTON_ID&&PISTON_MODES.includes(mode))pistonModes.set(key,mode);
    for(const [key,time] of (data.doorTimers||[]).slice(0,4096))if(machineCells.get(key)===PISTON_ID&&Number.isFinite(time)&&time>=0&&time<=DOOR_OPEN_HOLD)doorOpenTimers.set(key,time);
    restorePasswordLocks(data);
    // Older saves used reciprocating pistons only; keep their existing mechanism unchanged.
    if(!data.modes)for(const [key,type] of machineCells)if(type===PISTON_ID)pistonModes.set(key,'cycle');
    for(const [key,value] of (data.edges||[]).slice(0,4096))if(machineCells.get(key)===PISTON_ID&&typeof value==='boolean')pistonPowerEdges.set(key,value);
    for(const [key,time] of (data.buttons||[]).slice(0,4096))if(machineCells.get(key)===BUTTON_ID&&Number.isFinite(time)&&time>0&&time<=1)buttonTimers.set(key,time);
    for(const [key,face] of (data.faces||[]).slice(0,4096))if(machineCells.get(key)===BUTTON_ID&&validPistonDirection(face))buttonFaces.set(key,face);
    for(const t of (data.tnt||[]).slice(0,128))if(validTNT(t)&&!movingTNT.has(t.id))makeMovingTNT(t);
    nextTNT=Math.max(Number.isSafeInteger(data.nextTNT)?data.nextTNT:1,nextTNT);
    while(movingTNT.has(`tnt-${nextTNT}`))nextTNT++;
}
function machineCellData(x,y,z) {
    const key=machineKey(x,y,z);
    return {hidden:hiddenRedstone.has(key),direction:pistonDirections.get(key),mode:pistonModes.get(key)||'auto',button:buttonTimers.get(key)||0,face:buttonFaces.get(key)};
}
function applyMachineCellData(x,y,z,data={}) {
    const key=machineKey(x,y,z);
    if(data.hidden===true&&HIDDEN_BLOCKS[getBlock(x,y,z)])hiddenRedstone.add(key);else hiddenRedstone.delete(key);
    if(getBlock(x,y,z)===PISTON_ID&&validPistonDirection(data.direction))pistonDirections.set(key,data.direction);
    if(getBlock(x,y,z)===PISTON_ID&&PISTON_MODES.includes(data.mode)) {
        if(pistonModes.get(key)!==data.mode)pistonPowerEdges.delete(key);
        pistonModes.set(key,data.mode);
    }
    if(getBlock(x,y,z)===BUTTON_ID) {
        if(validPistonDirection(data.face))buttonFaces.set(key,data.face);
        if(Number.isFinite(data.button)&&data.button>=0&&data.button<=1)buttonTimers.set(key,data.button);
    }
    circuitDirty=true;
}
function broadcastMachinePacket(packet) {
    const r=multiplayerRoom;if(!r?.worldReady||r.role!=='host')return;
    packet.dimension=currentDimension;
    for(const e of r.connections.values()) {
        if(e.ready)sendRoomPacket(e.conn,packet);
        else if(e.sending){e.pending.push(packet);if(e.pending.length>512)e.conn.close();}
    }
}
function receiveMachinePacket(p) {
    if(p.dimension!==currentDimension)return;
    if(p.type==='password-locks'){receivePasswordLocks(p);return;}
    if(p.type==='machine-blast') {
        if(validMachineCell(p.at))showTNTBlast(p.at);return;
    }
    if(!Array.isArray(p.tnt)||p.tnt.length>128)return;
    const ids=new Set();
    for(const data of p.tnt)if(validTNT(data)) {
        ids.add(data.id);let t=movingTNT.get(data.id);
        if(!t)t=makeMovingTNT(data);
        else {t.remoteTarget.fromArray(data.at);t.velocity.fromArray(data.velocity);t.fuse=data.fuse;t.age=data.age;t.launchDelay=data.launchDelay;t.launch=data.launch;t.impact=!!data.impact;}
    }
    for(const t of [...movingTNT.values()])if(!ids.has(t.id))removeMovingTNT(t);
    if(Array.isArray(p.pistons)&&p.pistons.length<=512) {
        pistonStates.clear();for(const [key,state] of p.pistons)if(validPistonState(key,state))pistonStates.set(key,state);
    }
}

function updateVillagerLavaDamage(entity,delta) {
    if(entity.dying)return;
    const p=entity.mesh.position,bottom=p.y-0.5,top=p.y+1.3;
    let inLava=false;
    for(let x=Math.floor(p.x+0.2);x<=Math.floor(p.x+0.8);x++)
        for(let z=Math.floor(p.z+0.2);z<=Math.floor(p.z+0.8);z++)
            for(let y=Math.floor(bottom+0.5);y<=Math.floor(top+0.5);y++)if(getBlock(x,y,z)===LAVA_ID&&
                bottom<y-0.5+lavaAmount(x,y,z)/8&&top>y-0.5)inLava=true;
    if(!inLava){entity.lavaDamageTimer=0;return;}
    entity.lavaDamageTimer=(entity.lavaDamageTimer||0)-delta;
    if(entity.lavaDamageTimer<=0){damageMob(entity,1,'lava');entity.lavaDamageTimer=0.4;}
}
