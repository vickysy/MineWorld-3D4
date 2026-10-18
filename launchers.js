const nuclearMissiles=[];
let launcherMapRefresh=null;

function launcherMapStructures() {
    const marks=[];
    for(const [i,r] of constructionRegions.entries()){
        if(!['building','towers','fortress','castle'].includes(r.kind))continue;
        marks.push({name:`${r.kind==='building'?'House':'Castle'} ${i+1}`,x:r.x-0.5,z:r.z-0.5,width:r.width,depth:r.depth});
    }
    // Command buildings are implicit voxels; ordinary walls and furniture live in worldMap.
    const columns=new Map(),materials=new Set([6,8,9,10,11,12,13,14,15,17,18,19,20,48,49,50,51,59,60,62,63]);
    for(const [key,type] of worldMap){
        if(!materials.has(type)&&!(HOME_ITEMS[type]&&type<100))continue;
        const [x,y,z]=key.split(',').map(Number);if(![x,y,z].every(Number.isFinite))continue;
        if(type===63&&y<=getSurfaceHeight(x,z)+1)continue;
        if(marks.some(m=>x>m.x&&x<m.x+m.width&&z>m.z&&z<m.z+m.depth))continue;
        const k=`${x},${z}`,c=columns.get(k)||{x,z,count:0};c.count++;columns.set(k,c);
    }
    let number=0;
    while(columns.size){
        const first=columns.values().next().value,queue=[first];columns.delete(`${first.x},${first.z}`);
        let x0=first.x,x1=x0,z0=first.z,z1=z0,count=0;
        for(let i=0;i<queue.length;i++){
            const c=queue[i];count+=c.count;x0=Math.min(x0,c.x);x1=Math.max(x1,c.x);z0=Math.min(z0,c.z);z1=Math.max(z1,c.z);
            for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const key=`${c.x+dx},${c.z+dz}`,next=columns.get(key);if(next){columns.delete(key);queue.push(next);}}
        }
        if(count>=4)marks.push({name:`Building ${++number}`,x:x0-0.5,z:z0-0.5,width:x1-x0+1,depth:z1-z0+1});
    }
    if(homeSpawnPoint&&currentDimension==='overworld')marks.push({name:'Home',x:homeSpawnPoint.x-1,z:homeSpawnPoint.z-1,width:2,depth:2});
    return marks;
}

function launcherTargetRisks(target,marks=launcherMapStructures()) {
    const [x,,z]=target,cx=x-0.5,cz=z-0.5;
    const hits=marks.filter(m=>Math.hypot(cx-Math.max(m.x,Math.min(cx,m.x+m.width)),cz-Math.max(m.z,Math.min(cz,m.z+m.depth)))<=NUKE_BLAST_RADIUS).map(m=>m.name);
    if(Math.hypot(camera.position.x-cx,camera.position.z-cz)<=NUKE_BLAST_RADIUS+getPlayerRadius())hits.push('You');
    if(Object.values(remotePlayers).some(p=>p.visible&&Math.hypot(p.position.x-cx,p.position.z-cz)<=NUKE_BLAST_RADIUS+0.3))hits.push('Other players');
    return hits;
}

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

function launchNuclearMissile(record,target,port,confirmed=false) {
    if(!validLauncherTarget(record,target,port)||nuclearMissiles.length>=8)return false;
    if(!confirmed&&launcherTargetRisks(target).length){showToast('Buildings or players are in the blast area. Confirm the warning on the tablet.');return false;}
    if(getBlock(record.x,record.y+1,record.z)!==0){showToast('The launch ports are blocked.');return false;}
    if((record.data.launchReady?.[port]||0)>Date.now()){showToast('This port is reloading.');return false;}
    if(multiplayerRoom?.role==='guest') {
        for(const e of multiplayerRoom.connections.values())sendRoomPacket(e.conn,{type:'launcher-request',at:[record.x,record.y,record.z],target,port,confirmed,dimension:currentDimension});
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
    if(launcherMapRefresh){if(!launcherMapRefresh.map.isConnected)launcherMapRefresh=null;else if(Date.now()-launcherMapRefresh.time>1000){launcherMapRefresh.time=Date.now();launcherMapRefresh.draw();}}
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
    const zoom=document.createElement('select');zoom.setAttribute('aria-label','Map range');
    for(const [value,name] of [[1.25,'Nearby'],[4.5,'Full range']]){const o=document.createElement('option');o.value=value;o.textContent=name;zoom.append(o);}
    const buildings=document.createElement('div');buildings.setAttribute('aria-label','Mapped Buildings');buildings.style.cssText='max-height:90px;overflow:auto;overflow-wrap:anywhere;font-size:13px';
    const warning=document.createElement('output');warning.setAttribute('aria-live','polite');warning.style.cssText='display:block;overflow-wrap:anywhere';
    const actions=document.createElement('div');actions.className='home-row';content.append(select,zoom,map,buildings,row,warning,actions);
    const record=()=>launchers.find(r=>r.key===select.value),target=()=>inputs.map(i=>Number(i.value));
    let pending=null,marks=[];
    const confirmation=document.createElement('div');confirmation.className='home-row';confirmation.hidden=true;content.insertBefore(confirmation,actions);
    const cancel=()=>{pending=null;confirmation.hidden=true;};
    const send=(port,confirmed)=>{
        if(launchNuclearMissile(record(),target(),port,confirmed)){cancel();draw();showToast(`Port ${port+1}: target ${target().join(', ')}`);}
        else warning.textContent='Launch not sent. Check the port, reload time and target.';
    };
    const confirm=button('Confirm Launch',()=>{
        if(!pending||pending.key!==record().key||pending.target!==target().join(','))return cancel();
        send(pending.port,true);
    },confirmation);confirm.style.background='#943c31';button('Cancel',()=>{cancel();draw();},confirmation);
    const draw=()=>{
        const r=record(),ctx=map.getContext('2d'),[tx,,tz]=target(),scale=Number(zoom.value);
        marks=launcherMapStructures();const risks=launcherTargetRisks(target(),marks),riskKey=risks.join('|');
        if(pending&&pending.risks!==riskKey)cancel();
        warning.textContent=`Blast diameter: ${NUKE_BLAST_RADIUS*2} blocks. `+(risks.length?`DANGER: ${risks.join(', ')} in blast area. ${pending?'Confirm Launch to fire anyway.':'Confirmation required.'}`:'No mapped buildings in blast area.');
        warning.style.color=risks.length?'#ffab91':'#b7dfc2';
        for(let x=0;x<320;x+=8)for(let z=0;z<240;z+=8) {
            const h=getSurfaceHeight(Math.round(r.x+(x-160)*scale),Math.round(r.z+(z-120)*scale));
            ctx.fillStyle=currentDimension==='nether'?'#815348':selectedTerrain==='moon'?'#91999d':h<12?'#538caa':h>28?'#8e9890':'#587d54';ctx.fillRect(x,z,8,8);
        }
        ctx.strokeStyle='#ffffff25';ctx.lineWidth=1;for(let x=0;x<=320;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,240);ctx.stroke();}for(let z=0;z<=240;z+=40){ctx.beginPath();ctx.moveTo(0,z);ctx.lineTo(320,z);ctx.stroke();}
        ctx.fillStyle='#e4e9df';for(const [key,type] of worldMap) {
            if(!type||[24,43].includes(type))continue;const [bx,by,bz]=key.split(',').map(Number);
            if(![bx,by,bz].every(Number.isFinite))continue;
            if(by<=getSurfaceHeight(bx,bz))continue;const x=160+(bx-r.x)/scale,z=120+(bz-r.z)/scale;if(x>=0&&x<320&&z>=0&&z<240)ctx.fillRect(x,z,2,2);
        }
        buildings.replaceChildren();
        marks.forEach((m,i)=>{
            const x=160+(m.x-r.x)/scale,z=120+(m.z-r.z)/scale,w=m.width/scale,h=m.depth/scale;
            ctx.fillStyle='#f5bb4f55';ctx.strokeStyle='#ffd577';ctx.lineWidth=1.5;ctx.fillRect(x,z,w,h);ctx.strokeRect(x,z,w,h);
            if(x+w>=0&&x<320&&z+h>=0&&z<240){
                const lx=Math.max(0,Math.min(306,x)),lz=Math.max(0,Math.min(226,z-14));ctx.fillStyle='#142529';ctx.fillRect(lx,lz,14,14);
                ctx.fillStyle='#ffffff';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText(String(i+1),lx+7,lz+11);
            }
            const line=document.createElement('div');line.textContent=`${i+1}. ${m.name} (${Math.round(m.x+m.width/2)}, ${Math.round(m.z+m.depth/2)})`;buildings.append(line);
        });
        if(!marks.length)buildings.textContent='No mapped buildings.';
        ctx.fillStyle='#f5f3e9';ctx.fillRect(156,116,8,8);
        ctx.fillStyle='#73e3ff';ctx.beginPath();ctx.arc(160+(camera.position.x-r.x)/scale,120+(camera.position.z-r.z)/scale,3,0,Math.PI*2);ctx.fill();
        const x=160+(tx-0.5-r.x)/scale,z=120+(tz-0.5-r.z)/scale;
        if(Number.isFinite(x)&&Number.isFinite(z)){ctx.strokeStyle='#ff785e';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,z,NUKE_BLAST_RADIUS/scale,0,Math.PI*2);ctx.moveTo(x-5,z);ctx.lineTo(x+5,z);ctx.moveTo(x,z-5);ctx.lineTo(x,z+5);ctx.stroke();}
    };
    for(const input of inputs)input.oninput=()=>{cancel();draw();};zoom.onchange=()=>{cancel();draw();};
    const launchButtons=[0,1].map(port=>{
        const b=button(`Launch ${port+1}`,()=>{
            if(inputs.some(i=>i.value==='')||!validLauncherTarget(record(),target(),port)){warning.textContent='Choose integer coordinates within 512 blocks of the launcher.';return;}
            draw();const risks=launcherTargetRisks(target(),marks);
            if(risks.length){pending={key:record().key,target:target().join(','),port,risks:risks.join('|')};confirm.textContent=`Confirm Launch ${port+1}`;confirmation.hidden=false;draw();confirm.scrollIntoView({block:'nearest'});return;}
            send(port,false);
        },actions);b.dataset.launchPort=port;return b;
    });
    select.onchange=()=>{cancel();const r=record();inputs[0].value=r.x;inputs[2].value=r.z+110;inputs[1].value=getSurfaceHeight(r.x,r.z+110)+1;for(const b of launchButtons)b.dataset.launcher=r.key;draw();};
    map.onclick=e=>{cancel();const r=record(),rect=map.getBoundingClientRect(),scale=Number(zoom.value);inputs[0].value=Math.round(r.x+((e.clientX-rect.left)/rect.width*320-160)*scale);inputs[2].value=Math.round(r.z+((e.clientY-rect.top)/rect.height*240-120)*scale);inputs[1].value=getSurfaceHeight(Number(inputs[0].value),Number(inputs[2].value))+1;draw();};
    launcherMapRefresh={map,draw,time:Date.now()};
    select.onchange();
}
