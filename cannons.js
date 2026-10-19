// Small, reversible machine templates and aimed, top-first TNT magazines.
const CANNON_SHOT_INTERVAL=0.9;
let lastCannonClick=null;

function cannonAtHit(hit) {
    if(hit.type===PISTON_ID)return [hit.x,hit.y,hit.z];
    if(hit.type===PISTON_HEAD_ID)return pistonBaseForHead(hit.x,hit.y,hit.z);
    if(hit.type!==TNT_ID)return null;
    for(const [key,type] of machineCells)if(type===PISTON_ID) {
        const at=key.split(',').map(Number),d=getStoredPistonDirection(...at);
        if(hit.x===at[0]+d.x&&hit.z===at[2]+d.z&&hit.y>=at[1]+d.y&&hit.y<at[1]+d.y+16)return at;
    }
    return null;
}

function handleCannonClick(hit) {
    const at=cannonAtHit(hit);if(!at)return false;
    const key=at.join(','),mode=resolvedPistonMode(key,at);
    if(mode!=='cannon'||currentBlock===34)return false;
    const now=performance.now(),double=lastCannonClick?.key===key&&now-lastCannonClick.time<=1000;
    lastCannonClick={key,time:now};
    if(double){lastCannonClick=null;openCannonPanel(at);}
    return true;
}

function validCannonTarget(at,target) {
    if(!validMachineCell(at)||!validMachineCell(target))return false;
    const distance=Math.hypot(target[0]-at[0],target[2]-at[2]);
    return distance>=6&&distance<=96&&Math.abs(target[1]-at[1])<=32;
}

function cannonVelocity(from,target) {
    const dx=target[0]-from.x,dz=target[2]-from.z,dy=target[1]+0.95-from.y;
    const time=Math.max(1.2,Math.hypot(dx,dz)/18,Math.sqrt(Math.max(0,dy)/9)+0.5);
    return new THREE.Vector3(dx/time,dy/time+9*time,dz/time);
}

function fireCannon(at,target,single=true,actor=localLockIdentity?.id) {
    if(!validCannonTarget(at,target)||getBlock(...at)!==PISTON_ID||!canEditPasswordCircuit(...at,actor))return false;
    if(pistonModes.get(at.join(','))!=='cannon')return false;
    const d=getStoredPistonDirection(...at),front=[at[0]+d.x,at[1]+d.y,at[2]+d.z];
    if(getBlock(...front)!==TNT_ID&&![...movingTNT.values()].some(t=>!t.impact&&!t.launchDelay&&
        Math.abs(t.mesh.position.x-front[0])<0.6&&Math.abs(t.mesh.position.z-front[2])<0.6&&t.mesh.position.y>=front[1]-0.1&&t.mesh.position.y<front[1]+16))return false;
    if(!thermalAuthority()) {
        for(const e of multiplayerRoom.connections.values())sendRoomPacket(e.conn,{type:'cannon-request',at,target,single:!!single,dimension:currentDimension});
        return true;
    }
    return extendPiston(...at,{target,single:!!single});
}

function cannonTargetHeight(x,z,originY) {
    let top=getSurfaceHeight(x,z);
    for(let y=Math.floor(originY)+32;y>=Math.floor(originY)-32;y--)if(isSolid(x,y,z)){top=y;break;}
    return Math.round(top);
}

function openCannonPanel(at) {
    if(!canEditPasswordCircuit(...at)){showToast('Only the lock owner can operate this cannon.');return;}
    closeFurniturePanel(false);furnitureFocus=at.join(',');
    const content=document.getElementById('home-content');content.replaceChildren();
    document.getElementById('home-title').textContent='TNT Cannon';document.getElementById('home-panel').hidden=false;
    if(controls.isLocked)controls.unlock();blocker.style.display='none';
    const map=document.createElement('canvas');map.width=360;map.height=280;map.setAttribute('aria-label','Cannon target map');
    map.style.cssText='width:100%;aspect-ratio:9/7;display:block;cursor:crosshair;touch-action:none';
    const row=document.createElement('div');row.style.cssText='display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px';
    const inputs=['X','Y','Z'].map(axis=>{
        const label=document.createElement('label'),input=document.createElement('input');label.textContent=axis;
        input.type='number';input.step=1;input.setAttribute('aria-label',`Cannon target ${axis}`);
        input.style.cssText='display:block;box-sizing:border-box;width:100%;min-width:0;padding:8px';label.append(input);row.append(label);return input;
    });
    const status=document.createElement('output');status.setAttribute('aria-live','polite');status.style.cssText='display:block;margin:12px 0;overflow-wrap:anywhere';
    const actions=document.createElement('div');actions.className='home-row';content.append(map,row,status,actions);
    const d=getStoredPistonDirection(...at),initial=[at[0]+(d.x||(!d.z?1:0))*24,at[1]-1,at[2]+d.z*24];
    initial[1]=cannonTargetHeight(initial[0],initial[2],at[1]);inputs.forEach((input,i)=>input.value=initial[i]);
    const target=()=>inputs.map(input=>input.value.trim()===''?NaN:Number(input.value));
    const buttons=[];
    const draw=()=>{
        const ctx=map.getContext('2d'),t=target(),scale=0.75;
        for(let x=0;x<360;x+=12)for(let z=0;z<280;z+=12) {
            const h=getSurfaceHeight(Math.round(at[0]+(x-180)*scale),Math.round(at[2]+(z-140)*scale));
            ctx.fillStyle=currentDimension==='nether'?'#815348':selectedTerrain==='moon'?'#91999d':h<12?'#538caa':h>28?'#8e9890':'#587d54';ctx.fillRect(x,z,12,12);
        }
        ctx.strokeStyle='#ffffff22';for(let x=0;x<=360;x+=30){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,280);ctx.stroke();}
        for(let y=0;y<=280;y+=30){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(360,y);ctx.stroke();}
        ctx.fillStyle='#d5dcd7';for(const m of launcherMapStructures())ctx.fillRect(180+(m.x-at[0])/scale,140+(m.z-at[2])/scale,m.width/scale,m.depth/scale);
        ctx.strokeStyle='#79d6ed';ctx.beginPath();ctx.arc(180,140,96/scale,0,Math.PI*2);ctx.stroke();
        ctx.fillStyle='#f5d76c';ctx.fillRect(176,136,8,8);
        ctx.fillStyle='#7cddeb';ctx.beginPath();ctx.arc(180+(camera.position.x-at[0])/scale,140+(camera.position.z-at[2])/scale,3,0,Math.PI*2);ctx.fill();
        if(t.every(Number.isFinite)) {
            const x=180+(t[0]-at[0])/scale,y=140+(t[2]-at[2])/scale;
            ctx.strokeStyle='#ff9c86';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.moveTo(x-12,y);ctx.lineTo(x+12,y);ctx.moveTo(x,y-12);ctx.lineTo(x,y+12);ctx.stroke();ctx.lineWidth=1;
        }
        const valid=validCannonTarget(at,t);buttons.forEach(b=>b.disabled=!valid);
        status.textContent=valid?`Target: ${t.join(', ')}`:'Target range: 6-96 blocks; height difference: up to 32.';
    };
    for(const [label,single] of [['Fire One',true],['Fire Sequence',false]]) {
        const button=document.createElement('button');button.textContent=label;actions.append(button);buttons.push(button);
        button.onclick=()=>{
            if(fireCannon(at,target(),single)){status.textContent='Firing';closeFurniturePanel();}
            else status.textContent='Not fired. Check ammunition, piston position and circuit permissions.';
        };
    }
    map.onclick=e=>{
        const rect=map.getBoundingClientRect(),x=Math.round(at[0]+((e.clientX-rect.left)/rect.width*360-180)*0.75),z=Math.round(at[2]+((e.clientY-rect.top)/rect.height*280-140)*0.75);
        inputs[0].value=x;inputs[2].value=z;inputs[1].value=cannonTargetHeight(x,z,at[1]);draw();
    };
    inputs.forEach(input=>input.oninput=draw);draw();
}

function parseMachineCommand(text) {
    const prefix='(?:请|帮我|请帮我|我想)?(?:建造|搭建|生成|创建|做)?(?:1个|个)?';
    const cannon=new RegExp('^'+prefix+'(双重炮|双发炮|双炮|双重TNT炮|tnt炮|炮台|大炮|炮|cannon)(?:吧|1下)?$','i').exec(text);
    const door=new RegExp('^'+prefix+'(活塞门|红石门|闸门|门)(?:吧|1下)?$').exec(text);
    if(!cannon&&!door)return null;
    const double=!!cannon&&/双/.test(cannon[1]),machine=cannon?'cannon':'door';
    return {kind:'machine',machine,rounds:double?2:1,label:machine==='cannon'?`在前方建造${double?'双重':'单发'}TNT炮，装入${double?2:1}枚TNT，从上往下依次发射。双击右键瞄准，可单发。只在空地建造，不覆盖房屋，可撤销。`:'在前方建造两格高的活塞门，带红石和拉杆。开启保持通行，关闭有延时和防夹检查。只在空地建造，可撤销。'};
}

function buildMachineCommand(plan) {
    if(multiplayerRoom){showCommandStatus('请先在单人世界建造，再创建房间分享；联机中可以使用已经建好的炮和门。');return false;}
    if(!['door','cannon'].includes(plan.machine)||![1,2].includes(plan.rounds))return false;
    const look=camera.getWorldDirection(new THREE.Vector3()),d=Math.abs(look.x)>Math.abs(look.z)?{x:Math.sign(look.x),y:0,z:0}:{x:0,y:0,z:Math.sign(look.z)||-1};
    const base=[Math.round(camera.position.x)+d.x*7,Math.round(camera.position.y-getPlayerHeight()-0.5),Math.round(camera.position.z)+d.z*7];
    const point=(u,y,v)=>[base[0]+d.z*u+d.x*v,base[1]+y,base[2]-d.x*u+d.z*v];
    const cells=new Map(),pistons=[],put=(u,y,v,type)=>cells.set(point(u,y,v).join(','),[...point(u,y,v),type]);
    for(let u=-4;u<=4;u++)for(let v=-2;v<=2;v++)put(u,0,v,3);
    if(plan.machine==='cannon') {
        put(0,1,0,PISTON_ID);pistons.push({at:point(0,1,0),dir:d,mode:'cannon'});
        for(let y=1;y<=plan.rounds;y++)put(0,y,1,TNT_ID);
        put(-1,1,0,28);put(-2,1,0,30);
    } else {
        for(const side of [-1,1])for(let y=1;y<=2;y++) {
            put(side*3,y,0,PISTON_ID);put(side*2,y,0,6);
            pistons.push({at:point(side*3,y,0),dir:{x:-side*d.z,y:0,z:side*d.x},mode:'door'});
        }
        for(let u=-3;u<=3;u++){put(u,1,1,28);put(u,3,0,3);}
        put(-4,1,1,30);
    }
    for(let u=-4;u<=4;u++)for(let v=-2;v<=2;v++)for(let y=0;y<=4;y++) {
        const at=point(u,y,v),type=getBlock(...at);
        if((y===0?![0,1,2,3,23,42].includes(type):![0,42].includes(type))||!canEditPasswordCircuit(...at)||machineCellOccupied(...at)) {
            showCommandStatus('前方空间不足或有受保护装置。请找一块平坦空地再建造。');return false;
        }
    }
    const before=[...cells.values()].map(([x,y,z])=>[x,y,z,getBlock(x,y,z)]),dirty=new Set();
    for(const cell of cells.values())setBlockNoRebuild(...cell,dirty);
    for(const p of pistons){pistonDirections.set(p.at.join(','),p.dir);pistonModes.set(p.at.join(','),p.mode);}
    circuitDirty=true;
    if(plan.machine==='door')for(const p of pistons)extendPiston(...p.at);
    const after=new Map(cells);
    for(const p of pistons)for(const moved of pistonStates.get(p.at.join(','))?.pushed||[]) {
        if(!before.some(c=>c.slice(0,3).join(',')===moved.to.join(',')))before.push([...moved.to,0]);
        after.set(moved.to.join(','),[...moved.to,getBlock(...moved.to)]);
    }
    for(const [key,cell] of after)after.set(key,[...cell.slice(0,3),getBlock(...cell.slice(0,3))]);
    commandUndo={kind:'machine',before,after:[...after.values()],pistons,dimension:currentDimension};
    addDirtyChunksToQueue(dirty);showCommandStatus(plan.machine==='cannon'?'炮台已建好。双击右键炮台或TNT打开瞄准，也可使用旁边的拉杆。':'活塞门已建好，右键拉杆开门。');return true;
}

function undoMachineCommand() {
    const undo=commandUndo;
    if(multiplayerRoom||undo.dimension!==currentDimension){showCommandStatus('请在原来的单人世界撤销。');return false;}
    if(undo.after.some(([x,y,z,type])=>getBlock(x,y,z)!==type)||undo.pistons.some(p=>[...movingTNT.values()].some(t=>t.cannon===p.at.join(',')))) {
        showCommandStatus('装置已使用或修改，不能安全撤销；请手动拆除或加载此前存档。');return false;
    }
    for(const p of undo.pistons)pistonStates.delete(p.at.join(','));
    const dirty=new Set();for(const [x,y,z,type] of undo.before)setBlockNoRebuild(x,y,z,type,dirty);
    addDirtyChunksToQueue(dirty);commandUndo=null;showCommandStatus('已撤销装置。');return true;
}
