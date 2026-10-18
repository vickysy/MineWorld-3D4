const nuclearMissiles=[];

function nuclearLaunchers() {
    const result=[];
    for(const [key,data] of furnitureData) {
        if(data.id!==NUCLEAR_LAUNCHER_ID||!key.startsWith(currentDimension+'|'))continue;
        const [x,y,z]=key.split('|')[1].split(',').map(Number);
        if(getBlock(x,y,z)===NUCLEAR_LAUNCHER_ID)result.push({key,data,id:NUCLEAR_LAUNCHER_ID,x,y,z});
    }
    return result;
}

function validLauncherTarget(record,target,port) {
    return record&&[0,1].includes(port)&&Array.isArray(target)&&target.length===3&&target.every(n=>Number.isSafeInteger(n)&&Math.abs(n)<=100000)&&
        Math.hypot(target[0]-record.x,target[1]-record.y,target[2]-record.z)<=512;
}

function createNuclearMissile(from,target,port,elapsed=0) {
    const mesh=new THREE.Group();
    addModelBox(mesh,0.2,0.65,0.2,0xe2e6e8,0,0,0);
    addModelBox(mesh,0.14,0.2,0.14,0xc66051,0,0.42,0);
    for(const x of [-0.15,0.15])addModelBox(mesh,0.12,0.18,0.28,0x5d727b,x,-0.24,0);
    const flame=addModelBox(mesh,0.12,0.3,0.12,0xffbd55,0,-0.48,0);flame.material.emissive.setHex(0xe86916);
    mesh.position.fromArray(from);scene.add(mesh);
    nuclearMissiles.push({from,target,port,elapsed,duration:Math.max(3,Math.min(8,new THREE.Vector3(...from).distanceTo(new THREE.Vector3(...target))/30)),mesh});
}

function launchNuclearMissile(record,target,port) {
    if(!validLauncherTarget(record,target,port)||nuclearMissiles.length>=8)return false;
    if(getBlock(record.x,record.y+1,record.z)!==0){showToast('The launch ports are blocked.');return false;}
    if((record.data.launchReady?.[port]||0)>Date.now()){showToast('This port is reloading.');return false;}
    if(multiplayerRoom?.role==='guest') {
        for(const e of multiplayerRoom.connections.values())sendRoomPacket(e.conn,{type:'launcher-request',at:[record.x,record.y,record.z],target,port,dimension:currentDimension});
        return true;
    }
    record.data.launchReady??=[0,0];record.data.launchReady[port]=Date.now()+10000;queueRoomBlockChange(record.x,record.y,record.z);
    const offset=new THREE.Vector3(port===0?-0.24:0.24,0.75,0).applyAxisAngle(new THREE.Vector3(0,1,0),record.data.yaw||0);
    const from=[record.x+offset.x,record.y+offset.y,record.z+offset.z];
    createNuclearMissile(from,target,port);
    broadcastLauncherPacket({type:'launcher-shot',from,target,port,dimension:currentDimension});
    showToast(`Port ${port+1} launched.`);return true;
}

function broadcastLauncherPacket(packet) {
    const r=multiplayerRoom;if(r?.role!=='host'||!r.worldReady)return;
    for(const e of r.connections.values()) {
        if(e.ready)sendRoomPacket(e.conn,packet);else if(e.sending)e.pending.push(packet);
    }
}

function updateNuclearMissiles(delta) {
    for(let i=nuclearMissiles.length-1;i>=0;i--) {
        const shot=nuclearMissiles[i];shot.elapsed+=delta;
        const t=Math.min(1,shot.elapsed/shot.duration),a=new THREE.Vector3(...shot.from),b=new THREE.Vector3(...shot.target),arc=Math.min(70,20+a.distanceTo(b)*0.2);
        const p=a.clone().lerp(b,t);p.y+=Math.sin(t*Math.PI)*arc;shot.mesh.position.copy(p);
        const direction=b.clone().sub(a);direction.y+=Math.cos(t*Math.PI)*Math.PI*arc;
        shot.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
        if(t===1){disposeModModel(shot.mesh);nuclearMissiles.splice(i,1);if(thermalAuthority())beginNuclearBlast(...shot.target);}
    }
    for(const button of document.querySelectorAll('[data-launch-port]')) {
        const data=furnitureData.get(button.dataset.launcher),port=Number(button.dataset.launchPort);
        button.disabled=!data||(data.launchReady?.[port]||0)>Date.now();
    }
}

function clearNuclearMissiles() {for(const shot of nuclearMissiles)disposeModModel(shot.mesh);nuclearMissiles.length=0;}
function saveNuclearMissiles() {return nuclearMissiles.map(({from,target,port,elapsed})=>({from,target,port,elapsed}));}
function restoreNuclearMissiles(list=[]) {clearNuclearMissiles();for(const s of list.slice(0,8))createNuclearMissile(s.from,s.target,s.port,s.elapsed);}

function openLauncherTablet(content,button) {
    const launchers=nuclearLaunchers();
    if(!launchers.length){const p=document.createElement('p');p.textContent='No launchers in this dimension.';content.appendChild(p);return;}
    const select=document.createElement('select');select.setAttribute('aria-label','Launcher');select.style.width='100%';
    for(const r of launchers){const o=document.createElement('option');o.value=r.key;o.textContent=`Launcher (${r.x}, ${r.y}, ${r.z})`;select.appendChild(o);}
    const map=document.createElement('canvas');map.width=320;map.height=240;map.setAttribute('aria-label','Target Map');map.style.cssText='width:100%;aspect-ratio:4/3;display:block;cursor:crosshair';
    const row=document.createElement('div');row.style.cssText='display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px';const inputs=[];
    for(const axis of ['X','Y','Z']) {
        const label=document.createElement('label'),input=document.createElement('input');input.type='number';input.step=1;input.min=-100000;input.max=100000;label.style.cssText='display:grid;gap:5px';input.style.cssText='width:100%;min-width:0;box-sizing:border-box;padding:7px;background:#203438;color:white;border:1px solid #759398;border-radius:3px';input.setAttribute('aria-label',`Target ${axis}`);
        label.append(document.createTextNode(axis+' '),input);row.appendChild(label);inputs.push(input);
    }
    const warning=document.createElement('output');warning.textContent='Blast diameter: 100 blocks. Save your world before launching.';
    const actions=document.createElement('div');actions.className='home-row';content.append(select,map,row,warning,actions);
    const record=()=>launchers.find(r=>r.key===select.value),target=()=>inputs.map(i=>Number(i.value));
    const draw=()=>{
        const r=record(),ctx=map.getContext('2d'),[tx,,tz]=target(),scale=1.25;
        for(let x=0;x<320;x+=8)for(let z=0;z<240;z+=8) {
            const h=getSurfaceHeight(Math.round(r.x+(x-160)*scale),Math.round(r.z+(z-120)*scale));
            ctx.fillStyle=currentDimension==='nether'?'#815348':selectedTerrain==='moon'?'#91999d':h<12?'#538caa':h>28?'#8e9890':'#587d54';ctx.fillRect(x,z,8,8);
        }
        ctx.strokeStyle='#ffffff25';ctx.lineWidth=1;for(let x=0;x<=320;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,240);ctx.stroke();}for(let z=0;z<=240;z+=40){ctx.beginPath();ctx.moveTo(0,z);ctx.lineTo(320,z);ctx.stroke();}
        ctx.fillStyle='#e4e9df';for(const [key,type] of worldMap) {
            if(!type||[24,43].includes(type))continue;const [bx,by,bz]=key.split(',').map(Number);
            if(by<=getSurfaceHeight(bx,bz))continue;const x=160+(bx-r.x)/scale,z=120+(bz-r.z)/scale;if(x>=0&&x<320&&z>=0&&z<240)ctx.fillRect(x,z,2,2);
        }
        ctx.fillStyle='#f5f3e9';ctx.fillRect(156,116,8,8);
        const x=160+(tx-r.x)/scale,z=120+(tz-r.z)/scale;
        ctx.strokeStyle='#ff785e';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,z,50/scale,0,Math.PI*2);ctx.moveTo(x-8,z);ctx.lineTo(x+8,z);ctx.moveTo(x,z-8);ctx.lineTo(x,z+8);ctx.stroke();
    };
    for(const input of inputs)input.oninput=draw;
    const launchButtons=[0,1].map(port=>{
        const b=button(`Launch ${port+1}`,()=>{
            if(inputs.some(i=>i.value==='')||!validLauncherTarget(record(),target(),port)){warning.textContent='Choose integer coordinates within 512 blocks of the launcher.';return;}
            if(launchNuclearMissile(record(),target(),port))warning.textContent=`Port ${port+1}: target ${target().join(', ')}`;
        },actions);b.dataset.launchPort=port;return b;
    });
    select.onchange=()=>{const r=record();inputs[0].value=r.x;inputs[2].value=r.z+110;inputs[1].value=getSurfaceHeight(r.x,r.z+110)+1;for(const b of launchButtons)b.dataset.launcher=r.key;draw();};
    map.onclick=e=>{const r=record(),rect=map.getBoundingClientRect();inputs[0].value=Math.round(r.x+((e.clientX-rect.left)/rect.width*320-160)*1.25);inputs[2].value=Math.round(r.z+((e.clientY-rect.top)/rect.height*240-120)*1.25);inputs[1].value=getSurfaceHeight(Number(inputs[0].value),Number(inputs[2].value))+1;draw();};
    select.onchange();
}
