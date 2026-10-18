const SECURITY_CAMERA_ID=138, SURVEILLANCE_TABLET_ID=139, NUCLEAR_LAUNCHER_ID=144;
const SURVEILLANCE_ITEMS={138:'Security Camera',139:'Surveillance Tablet',144:'Twin Nuclear Launcher'};
Object.assign(HOME_ITEMS,SURVEILLANCE_ITEMS);
Object.assign(EXTRA_HOME_ITEMS,SURVEILLANCE_ITEMS);
Object.assign(COMMAND_ITEMS,{'监控':138,'监控摄像头':138,'摄像头':138,'监控平板':139,'平板':139,'核武器':144,'核弹发射器':144,'双管发射器':144});
let nextSecurityCameraNumber=1, surveillanceWatch=null, surveillanceRendering=false;

function surveillanceRecipes() {
    return [{ing:{36:2,6:1,28:3},out:138,count:1},{ing:{36:1,6:2,28:3},out:139,count:1},{ing:{36:3,3:2,28:1,22:1},out:144,count:1}];
}

function buildSurveillanceModel(group,id,data) {
    const box=(w,h,d,c,x,y,z)=>addModelBox(group,w,h,d,c,x,y,z);
    if(id===NUCLEAR_LAUNCHER_ID) {
        box(0.96,0.2,0.88,0x48545b,0,-0.39,0);
        group.userData.launchPorts=[];
        for(const x of [-0.24,0.24]) {
            box(0.37,0.03,0.45,0x11191d,x,-0.25,0);
            for(const dx of [-0.18,0.18])box(0.045,0.65,0.48,0xc4ced1,x+dx,0.06,0);
            for(const z of [-0.22,0.22])box(0.36,0.65,0.045,0x82949d,x,0.06,z);
            const light=box(0.08,0.06,0.025,0x6de0a3,x,-0.35,0.46);group.userData.launchPorts.push(light);
        }
        box(0.14,0.05,0.025,0xe7be4c,0,-0.35,0.46);
    } else if(id===SECURITY_CAMERA_ID) {
        box(0.35,0.08,0.35,0x616e73,0,-0.46,-0.16);
        box(0.09,0.42,0.09,0xaab7bb,0,-0.22,-0.16);
        const head=new THREE.Group();head.position.y=0.1;head.rotation.x=-(data.pitch??-12)*Math.PI/180;group.add(head);
        addModelBox(head,0.56,0.33,0.62,0xe9edeb,0,0,0);
        addModelBox(head,0.6,0.055,0.7,0xf7f8f5,0,0.18,0.03);
        addModelBox(head,0.46,0.25,0.035,0x29393d,0,0,0.325);
        addModelBox(head,0.22,0.19,0.035,0x16252b,0,0,0.35);
        const lens=addModelBox(head,0.12,0.11,0.04,0x589fba,0,0,0.37);lens.material.emissive.setHex(0x173a48);
        const light=addModelBox(head,0.035,0.035,0.025,0x59d780,0.17,-0.07,0.35);
        light.material.emissive.setHex(0x226a35);group.userData.securityHead=head;group.userData.securityLight=light;
    } else {
        box(0.78,0.52,0.065,0x3d494e,0,0,0);
        box(0.69,0.42,0.008,0x20333c,0,0,0.038);
        box(0.025,0.025,0.012,0x82949c,0,0.235,0.038);
        for(const x of [-0.17,0.17])for(const y of [-0.1,0.1]) {
            box(0.3,0.17,0.012,0x70a3a0,x,y,0.046);
            box(0.25,0.045,0.016,0x52795e,x,y-0.05,0.05);
        }
    }
}

function ensureSecurityCameraNumber(data) {
    if(!Number.isSafeInteger(data.cameraNumber)||data.cameraNumber<1) data.cameraNumber=nextSecurityCameraNumber++;
    nextSecurityCameraNumber=Math.max(nextSecurityCameraNumber,data.cameraNumber+1);
    return data.cameraNumber;
}

function restoreSurveillanceNumber(value) {
    nextSecurityCameraNumber=Number.isSafeInteger(value)&&value>0?value:1;
    for(const data of furnitureData.values())if(data.id===SECURITY_CAMERA_ID&&Number.isSafeInteger(data.cameraNumber))
        nextSecurityCameraNumber=Math.max(nextSecurityCameraNumber,data.cameraNumber+1);
    for(const data of furnitureData.values())if(data.id===SECURITY_CAMERA_ID)ensureSecurityCameraNumber(data);
}

function securityCameras() {
    const result=[];
    for(const [key,data] of furnitureData) {
        if(data.id!==SECURITY_CAMERA_ID||!key.startsWith(currentDimension+'|'))continue;
        const [x,y,z]=key.split('|')[1].split(',').map(Number);
        if(getBlock(x,y,z)!==SECURITY_CAMERA_ID)continue;
        ensureSecurityCameraNumber(data);result.push({key,id:SECURITY_CAMERA_ID,x,y,z,data});
    }
    return result.sort((a,b)=>a.data.cameraNumber-b.data.cameraNumber);
}

function isSurveillanceChunk(cx,cz) {return surveillanceWatch?.chunks.has(`${cx},${cz}`)||false;}

function nearSurveillanceCamera(x,z) {
    const r=surveillanceWatch?.record;
    return !!r&&Math.abs(x-r.x)<=40&&Math.abs(z-r.z)<=40;
}

function stopSurveillance() {
    const watch=surveillanceWatch;if(!watch)return;
    surveillanceWatch=null;watch.target.dispose();disposeModModel(watch.avatar);
    const cx=Math.floor(camera.position.x/CHUNK_SIZE),cz=Math.floor(camera.position.z/CHUNK_SIZE);
    for(const key of watch.chunks) {
        const [x,z]=key.split(',').map(Number);
        if(Math.abs(x-cx)<=RENDER_DISTANCE+1&&Math.abs(z-cz)<=RENDER_DISTANCE+1)continue;
        for(const mesh of Object.values(chunkMeshes.get(key)||{})){scene.remove(mesh);mesh.geometry?.dispose();}
        chunkMeshes.delete(key);
    }
    furnitureTick=1;
}

function startSurveillance(record,canvas,status) {
    stopSurveillance();
    const width=512,height=288,cx=Math.floor(record.x/CHUNK_SIZE),cz=Math.floor(record.z/CHUNK_SIZE),chunks=[];
    // Only the selected camera pins a bounded 5x5 window; the player's chunk center never moves.
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)chunks.push([cx+dx,cz+dz]);
    chunks.sort((a,b)=>(Math.abs(a[0]-cx)+Math.abs(a[1]-cz))-(Math.abs(b[0]-cx)+Math.abs(b[1]-cz)));
    canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d'),avatar=createRemotePlayer();avatar.visible=false;scene.add(avatar);
    surveillanceWatch={record,canvas,status,ctx,chunks:new Set(chunks.map(p=>p.join(','))),
        target:new THREE.WebGLRenderTarget(width,height),view:new THREE.PerspectiveCamera(75,width/height,0.03,30),
        pixels:new Uint8Array(width*height*4),frame:ctx.createImageData(width,height),avatar,frames:0,nextFrame:0,nextBuild:0};
    furnitureTick=1;
}

function updateSurveillance(now=performance.now()) {
    updateSecurityCameraMovement();
    const w=surveillanceWatch;if(!w)return;
    const r=w.record;
    if(!w.canvas.isConnected||document.getElementById('home-panel').hidden||!r.key.startsWith(currentDimension+'|')){stopSurveillance();return;}
    if(getBlock(r.x,r.y,r.z)!==SECURITY_CAMERA_ID||r.data.on===false) {
        w.ctx.fillStyle='#11191d';w.ctx.fillRect(0,0,w.canvas.width,w.canvas.height);
        w.status.textContent='OFFLINE';stopSurveillance();return;
    }
    let missing=Array.from(w.chunks).filter(key=>!chunkMeshes.has(key));
    if(missing.length&&now>=w.nextBuild){buildChunkIfMissing(...missing[0].split(',').map(Number));w.nextBuild=now+60;missing.shift();}
    if(now<w.nextFrame)return;w.nextFrame=now+125;
    w.status.textContent=missing.length?`Loading ${25-missing.length} / 25`:'LIVE';
    const yaw=(r.data.yaw||0)+cameraPanDegrees(r.data)*Math.PI/180,pitch=(r.data.pitch??-12)*Math.PI/180;
    const forward=new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
    w.view.position.set(r.x,r.y+0.1,r.z);w.view.position.addScaledVector(forward,0.44);w.view.lookAt(w.view.position.clone().add(forward));
    w.view.updateMatrixWorld(true);
    const hidden=[heldItemGroup,localPlayerModel,microTarget,furnitureMeshes.get(r.key)].filter(Boolean).map(m=>[m,m.visible]);
    const target=renderer.getRenderTarget(),fog=scene.fog,shadow=renderer.shadowMap.autoUpdate;
    try {
        surveillanceRendering=true;
        for(const [m] of hidden)m.visible=false;
        w.avatar.position.copy(camera.position);w.avatar.position.y-=0.75*playerScale;w.avatar.scale.setScalar(playerScale);
        w.avatar.rotation.y=camera.rotation.y;w.avatar.children[0].rotation.x=camera.rotation.x;w.avatar.visible=!activeMech;
        scene.fog=new THREE.Fog(scene.background?.isColor?scene.background:0x879ba1,18,28);
        renderer.shadowMap.autoUpdate=false;renderer.setRenderTarget(w.target);renderer.render(scene,w.view);
        renderer.readRenderTargetPixels(w.target,0,0,w.canvas.width,w.canvas.height,w.pixels);
        const row=w.canvas.width*4;
        for(let y=0;y<w.canvas.height;y++)w.frame.data.set(w.pixels.subarray((w.canvas.height-1-y)*row,(w.canvas.height-y)*row),y*row);
        w.ctx.putImageData(w.frame,0,0);w.frames++;
    } finally {
        renderer.setRenderTarget(target);renderer.shadowMap.autoUpdate=shadow;scene.fog=fog;
        for(const [m,visible] of hidden)m.visible=visible;w.avatar.visible=false;surveillanceRendering=false;
    }
}

function openSecurityCameraPanel(record,content,button) {
    const data=record.data;
    const title=document.createElement('strong');title.textContent=`Camera ${ensureSecurityCameraNumber(data)}`;content.appendChild(title);
    const label=document.createElement('label'),power=document.createElement('input');power.type='checkbox';power.checked=data.on!==false;
    power.onchange=()=>{data.on=power.checked;queueRoomBlockChange(record.x,record.y,record.z);};label.append(power,document.createTextNode(' Power'));content.appendChild(label);
    const direction=document.createElement('select');direction.setAttribute('aria-label','Direction');
    for(const [name,value] of [['South',0],['East',90],['North',180],['West',270]]){const o=document.createElement('option');o.textContent=name;o.value=value;direction.appendChild(o);}
    direction.value=((Math.round((data.yaw||0)*180/Math.PI)%360)+360)%360;
    direction.onchange=()=>{data.yaw=Number(direction.value)*Math.PI/180;syncFurnitureMeshes();queueRoomBlockChange(record.x,record.y,record.z);};
    const directionLabel=document.createElement('label');directionLabel.textContent='Direction';directionLabel.appendChild(direction);content.appendChild(directionLabel);
    const tiltLabel=document.createElement('label'),tilt=document.createElement('input'),value=document.createElement('output');
    tilt.type='range';tilt.min=-80;tilt.max=60;tilt.step=1;tilt.value=data.pitch??-12;tilt.setAttribute('aria-label','Tilt');
    tilt.oninput=()=>{data.pitch=Number(tilt.value);value.textContent=`${data.pitch} degrees`;syncFurnitureMeshes();queueRoomBlockChange(record.x,record.y,record.z);};value.textContent=`${tilt.value} degrees`;
    tiltLabel.append(document.createTextNode('Tilt '),tilt,value);content.appendChild(tiltLabel);
    appendCameraPanControls(record,content);
}

function openSurveillanceComputer(record,content,button) {
    const tablet=record.id===SURVEILLANCE_TABLET_ID,data=record.data;
    const tabs=document.createElement('div');tabs.className='home-row';content.appendChild(tabs);
    const body=document.createElement('div');body.className='surveillance-body';content.appendChild(body);
    let cameraTab,notesTab,launcherTab;
    const render=mode=>{
        stopSurveillance();body.replaceChildren();cameraTab.setAttribute('aria-pressed',mode==='cameras');notesTab?.setAttribute('aria-pressed',mode==='notes');launcherTab?.setAttribute('aria-pressed',mode==='launchers');
        if(mode==='launchers'){openLauncherTablet(body,button);return;}
        if(mode==='notes') {
            const input=document.createElement('textarea');input.rows=6;input.maxLength=2000;input.value=data.note||'';input.setAttribute('aria-label','Notes');
            input.oninput=()=>{data.note=input.value;data.on=true;};body.appendChild(input);
            button('Save',()=>{data.note=input.value;data.on=true;showToast('Notes saved.');},body);return;
        }
        const cameras=securityCameras();
        if(!cameras.length){const empty=document.createElement('p');empty.textContent='No cameras in this dimension.';body.appendChild(empty);return;}
        const select=document.createElement('select');select.setAttribute('aria-label','Camera');select.style.width='100%';
        for(const r of cameras){const o=document.createElement('option');o.value=r.key;o.textContent=`Camera ${r.data.cameraNumber} (${r.x}, ${r.y}, ${r.z})`;select.appendChild(o);}
        if(cameras.some(r=>r.key===data.cameraKey))select.value=data.cameraKey;
        const canvas=document.createElement('canvas');canvas.id='surveillance-feed';canvas.setAttribute('aria-label','Live camera view');
        canvas.style.cssText='display:block;width:100%;aspect-ratio:16/9;background:#11191d;border-radius:4px';
        const status=document.createElement('output');status.setAttribute('aria-live','polite');
        const label=document.createElement('label');label.textContent='Camera';label.appendChild(select);body.append(label,canvas,status);
        const panControls=document.createElement('div');body.appendChild(panControls);
        select.onchange=()=>{data.cameraKey=select.value;data.on=true;status.textContent='Connecting';const r=cameras.find(r=>r.key===select.value);startSurveillance(r,canvas,status);panControls.replaceChildren();appendCameraPanControls(r,panControls);};
        select.onchange();
    };
    cameraTab=button('Cameras',()=>render('cameras'),tabs);
    if(!tablet)notesTab=button('Notes',()=>render('notes'),tabs);
    launcherTab=button('Launchers',()=>render('launchers'),tabs);
    render(tablet||securityCameras().length?'cameras':'notes');
}

function cameraPanDegrees(data,now=Date.now()) {
    const pan=Math.max(-90,Math.min(90,Number(data.pan)||0));
    if(!data.scan||data.on===false)return pan;
    const t=((now-(data.scanStarted||now))/6000+(data.scanPhase||0))%2;
    return -90+180*(1-Math.abs(t-1));
}

function appendCameraPanControls(record,parent) {
    const row=document.createElement('label'),slider=document.createElement('input'),value=document.createElement('output');
    row.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap';
    slider.type='range';slider.min=-90;slider.max=90;slider.step=1;slider.value=cameraPanDegrees(record.data);slider.setAttribute('aria-label','Camera Pan');slider.style.maxWidth='100%';
    value.dataset.cameraPan=record.key;value.textContent=`${Math.round(Number(slider.value))} degrees`;
    const scanLabel=document.createElement('label'),scan=document.createElement('input');scan.type='checkbox';scan.checked=!!record.data.scan;scan.setAttribute('aria-label','Auto Scan');
    const changed=()=>{queueRoomBlockChange(record.x,record.y,record.z);updateSecurityCameraMovement();if(surveillanceWatch)surveillanceWatch.nextFrame=0;};
    slider.oninput=()=>{record.data.pan=Number(slider.value);record.data.scan=false;scan.checked=false;changed();};
    scan.onchange=()=>{record.data.pan=cameraPanDegrees(record.data);record.data.scan=scan.checked;record.data.scanStarted=Date.now();record.data.scanPhase=(record.data.pan+90)/180;changed();};
    row.append(document.createTextNode('Pan '),slider,value);scanLabel.append(scan,document.createTextNode(' Auto Scan'));parent.append(row,scanLabel);
}

function updateSecurityCameraMovement() {
    for(const [key,model] of furnitureMeshes)if(model.userData.securityHead) {
        const data=furnitureData.get(key);if(data)model.userData.securityHead.rotation.y=cameraPanDegrees(data)*Math.PI/180;
    }
    for(const output of document.querySelectorAll('[data-camera-pan]')) {
        const data=furnitureData.get(output.dataset.cameraPan);if(data){const pan=Math.round(cameraPanDegrees(data));output.textContent=`${pan} degrees`;if(data.scan)output.parentElement.querySelector('input[type=range]').value=pan;}
    }
}
