const ROOM_PROTOCOL='daniel-mc-room-2', ROOM_PREFIX='daniel-mc-room2-';
const ROOM_TIMEOUT_MS=30000, ROOM_MAX_SAVE=16*1024*1024, ROOM_PACKET_CELLS=128;
let multiplayerRoom=null, multiplayerMode='host', currentRoomCode='', remotePlayers={};

function setMultiplayerStatus(message) {
    document.getElementById('multiplayer-status').textContent=message;
}

function setRoomCode(code) {
    currentRoomCode=code||'';
    document.getElementById('room-code-display').value=currentRoomCode;
    updateRoomCodeFloat();
}

function updateRoomCodeFloat() {
    const el=document.getElementById('room-code-float');
    el.style.display=multiplayerRoom?.entered&&currentRoomCode?'block':'none';
    el.textContent=`Room Code: ${currentRoomCode}`;
}

function updateRoomButtons() {
    const r=multiplayerRoom,busy=r&&!['ready','playing'].includes(r.phase);
    document.getElementById('create-room-btn').disabled=!!busy;
    document.getElementById('join-room-btn').disabled=!!busy;
    const enter=document.getElementById('enter-room-btn');
    enter.style.display=r&&['ready','playing'].includes(r.phase)?'block':'none';
    enter.disabled=!r||!['ready','playing'].includes(r.phase);
    document.getElementById('leave-room-btn').hidden=!r;
    document.getElementById('pause-room-btn').hidden=!r;
    document.getElementById('copy-room-btn').disabled=!currentRoomCode;
}

function setMultiplayerMode(mode) {
    multiplayerMode=mode==='guest'?'guest':'host';
    for(const name of ['host','guest']) {
        document.getElementById(name+'-panel').style.display=multiplayerMode===name?'block':'none';
        const button=document.getElementById(name+'-mode-btn');
        button.style.background=multiplayerMode===name?'#356b46':'#333';
        button.setAttribute('aria-pressed',String(multiplayerMode===name));
    }
    if(!multiplayerRoom)setMultiplayerStatus(mode==='guest'?'Enter a room code.':'No room created.');
    updateRoomButtons();
}

function showMultiplayerMenu() {
    clearTimeout(toastTimeout);document.getElementById('toast-msg').style.display='none';
    document.getElementById('multiplayer-menu').style.display='block';
    document.getElementById('start-menu').style.display='none';
    document.getElementById('pause-menu').style.display='none';
    blocker.style.display='flex';
    if(controls.isLocked)controls.unlock();
    setMultiplayerMode(multiplayerRoom?.role||multiplayerMode);
}

function hideMultiplayerMenu() {
    if(multiplayerRoom&&!['ready','playing'].includes(multiplayerRoom.phase))leaveMultiplayerRoom();
    document.getElementById('multiplayer-menu').style.display='none';
    document.getElementById(isGameStarted?'pause-menu':'start-menu').style.display=isGameStarted?'block':'flex';
}

async function copyRoomCode() {
    if(!currentRoomCode){setMultiplayerStatus('Create a room first.');return;}
    try {
        if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(currentRoomCode);setMultiplayerStatus('Room code copied.');
    } catch {
        const input=document.getElementById('room-code-display');input.focus();input.select();
        let copied=false;try{copied=document.execCommand('copy');}catch{}
        setMultiplayerStatus(copied?'Room code copied.':'Copy was blocked. Select the room code and copy it.');
    }
}

function leaveMultiplayerRoom(message='Left room.') {
    const r=multiplayerRoom;multiplayerRoom=null;
    if(r){for(const timer of r.timers)clearTimeout(timer);r.peer?.destroy();}
    for(const p of Object.values(remotePlayers))disposeModModel(p);remotePlayers={};
    setRoomCode('');setMultiplayerStatus(message);updateRoomButtons();
}

function roomTimer(r,fn,ms=ROOM_TIMEOUT_MS) {
    const timer=setTimeout(()=>{r.timers.delete(timer);if(multiplayerRoom===r)fn();},ms);
    r.timers.add(timer);return timer;
}

function roomFailure(r,message) {
    if(multiplayerRoom!==r)return;
    leaveMultiplayerRoom(message);showToast(message);
}

function roomErrorMessage(error) {
    if(error.type==='peer-unavailable')return 'Room not found. Check the code and keep the host page open.';
    if(error.type==='browser-incompatible')return 'This browser does not support WebRTC multiplayer.';
    if(error.type==='unavailable-id')return 'Room code is busy. Click Create Room again.';
    return 'Connection failed. Check your network, then try again.';
}

function newRoomSession(role,code) {
    leaveMultiplayerRoom('Connecting...');
    if(typeof Peer!=='function'||typeof RTCPeerConnection!=='function') {
        setMultiplayerStatus('Multiplayer is unavailable in this browser.');return null;
    }
    const r={role,code,phase:'connecting',entered:false,worldReady:false,peer:null,connections:new Map(),
        timers:new Set(),dirty:new Map(),positions:new Map(),applying:false,seq:0,nextTick:0,transfer:null};
    multiplayerRoom=r;updateRoomButtons();
    r.deadline=roomTimer(r,()=>roomFailure(r,'Connection timed out. Check your network and try again.'));
    return r;
}

function connectRoomPeer(r,id,onOpen) {
    try {
        // The signaling service registers room IDs; WebRTC carries game data, using the library's TURN fallback.
        r.peer=new Peer(id,{secure:true,debug:0});
        r.peer.on('open',()=>{if(multiplayerRoom===r)onOpen();});
        r.peer.on('error',error=>{
            if(r.role==='host'&&r.worldReady&&error.type==='peer-unavailable')return;
            roomFailure(r,roomErrorMessage(error));
        });
        r.peer.on('disconnected',()=>{
            if(multiplayerRoom!==r)return;
            if(r.worldReady&&Array.from(r.connections.values()).some(e=>e.conn.open)) {
                setMultiplayerStatus('Room directory disconnected. Current players are still connected.');
                roomTimer(r,()=>{if(!r.peer.destroyed&&r.peer.disconnected)r.peer.reconnect();},2000);
            } else roomFailure(r,'Room service disconnected. Please create or join again.');
        });
    } catch(error){roomFailure(r,roomErrorMessage(error));}
}

function createRoom() {
    if(multiplayerRoom?.role==='host'&&['ready','playing'].includes(multiplayerRoom.phase)) {
        setMultiplayerMode('host');setMultiplayerStatus('Room ready.');return;
    }
    if(multiplayerRoom&& !['ready','playing'].includes(multiplayerRoom.phase))return;
    setMultiplayerMode('host');
    const code=Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>String(n%1000).padStart(3,'0')).join('');
    const r=newRoomSession('host',code);if(!r)return;
    setMultiplayerStatus('Creating room...');
    connectRoomPeer(r,ROOM_PREFIX+code,()=>{
        clearTimeout(r.deadline);r.phase=r.entered?'playing':'ready';
        setRoomCode(code.match(/.{4}/g).join('-'));setMultiplayerStatus('Room ready.');updateRoomButtons();
    });
    r.peer?.on('connection',conn=>{
        if(multiplayerRoom!==r||conn.metadata?.protocol!==ROOM_PROTOCOL||r.connections.size>=7){conn.close();return;}
        const entry=attachRoomConnection(r,conn);
        conn.on('open',()=>{
            if(multiplayerRoom!==r)return;
            if(r.worldReady)sendRoomSnapshot(r,entry);
            else sendRoomPacket(conn,{type:'waiting'});
        });
    });
}

function joinRoom() {
    const raw=document.getElementById('room-code-input').value.trim(),code=raw.replace(/[\s.-]/g,'');
    if(!/^\d{12}$/.test(code)){setMultiplayerStatus('Enter the 12-digit room code from the host.');return;}
    if(multiplayerRoom?.role==='host'&&code===multiplayerRoom.code){setMultiplayerStatus('This is your room. Click Enter Room.');return;}
    if(multiplayerRoom&&!['ready','playing'].includes(multiplayerRoom.phase))return;
    setMultiplayerMode('guest');const r=newRoomSession('guest',code);if(!r)return;
    setMultiplayerStatus('Joining room...');
    connectRoomPeer(r,undefined,()=>{
        if(r.connections.size)return;
        const conn=r.peer.connect(ROOM_PREFIX+code,{serialization:'json',reliable:true,metadata:{protocol:ROOM_PROTOCOL}});
        attachRoomConnection(r,conn);
    });
}

function enterCreatedRoom() {
    const r=multiplayerRoom;
    if(!r||!['ready','playing'].includes(r.phase)){setMultiplayerStatus('Wait for the room connection to finish.');return;}
    window.startNewGame(false);r.entered=r.worldReady=true;r.phase='playing';
    document.getElementById('multiplayer-menu').style.display='none';
    updateRoomCodeFloat();updateRoomButtons();
    if(r.role==='host')for(const entry of r.connections.values())if(entry.conn.open&&!entry.sending&&!entry.ready)sendRoomSnapshot(r,entry);
}

function sendRoomPacket(conn,packet) {
    if(!conn.open)return false;
    try{conn.send(packet);return true;}catch{return false;}
}

function attachRoomConnection(r,conn) {
    const entry={conn,ready:false,sending:false,pending:[],rateStart:0,rate:0};r.connections.set(conn.peer,entry);
    conn.on('data',packet=>{
        if(multiplayerRoom!==r||!packet||typeof packet!=='object')return;
        try {
            if(r.role==='host')receiveRoomGuest(r,entry,packet);
            else receiveRoomHost(r,entry,packet);
        } catch {if(r.role==='guest')roomFailure(r,'World sync failed. Please rejoin the room.');else conn.close();}
    });
    conn.on('error',()=>{if(r.role==='guest')roomFailure(r,'Could not connect to the host. Check the code and your network.');else conn.close();});
    conn.on('close',()=>{
        if(multiplayerRoom!==r)return;
        r.connections.delete(conn.peer);r.positions.delete(conn.peer);
        disposeModModel(remotePlayers[conn.peer]);delete remotePlayers[conn.peer];
        if(r.role==='guest')roomFailure(r,'Host disconnected. Your current world is still available in single player.');
        else {for(const e of r.connections.values())if(e.ready)sendRoomPacket(e.conn,{type:'leave',id:conn.peer});showToast('A player left.');}
    });
    return entry;
}

function sendRoomSnapshot(r,entry) {
    if(entry.sending||!entry.conn.open)return;
    const text=JSON.stringify(getWorldSaveData());
    if(text.length>ROOM_MAX_SAVE){sendRoomPacket(entry.conn,{type:'error',message:'This world is too large to transfer. Try a smaller world.'});return;}
    entry.sending=true;entry.pending=[];const size=8000,parts=Math.ceil(text.length/size);
    sendRoomPacket(entry.conn,{type:'world-begin',version:ROOM_PROTOCOL,parts,length:text.length,seq:r.seq});
    let index=0;
    const pump=()=>{
        if(multiplayerRoom!==r||!entry.conn.open)return;
        if(entry.conn.bufferSize>4||entry.conn.dataChannel?.bufferedAmount>256000){roomTimer(r,pump,30);return;}
        for(let count=0;count<4&&index<parts;count++,index++)sendRoomPacket(entry.conn,{type:'world-chunk',index,text:text.slice(index*size,(index+1)*size)});
        if(index<parts)roomTimer(r,pump,16);
        else sendRoomPacket(entry.conn,{type:'world-end'});
    };pump();
}

function validateRoomPosition(p) {
    return ['x','y','z','ry'].every(k=>Number.isFinite(p[k])&&Math.abs(p[k])<=1000000)&&
        Number.isFinite(p.scale)&&p.scale>=MIN_PLAYER_SCALE&&p.scale<=MAX_PLAYER_SCALE&&['overworld','nether'].includes(p.dimension);
}

function displayRoomPlayer(id,p) {
    if(id===multiplayerRoom?.peer.id||!validateRoomPosition(p))return;
    const model=remotePlayers[id]||(remotePlayers[id]=createRemotePlayer());
    model.visible=p.dimension===currentDimension;model.position.set(p.x,p.y-0.75*p.scale,p.z);model.rotation.y=p.ry;model.scale.setScalar(p.scale);
}

function roomCellValid(cell) {
    return Array.isArray(cell)&&cell.length===4&&cell.every(Number.isSafeInteger)&&cell.slice(0,3).every(n=>Math.abs(n)<=100000)&&cell[3]>=0&&cell[3]<=144;
}

function applyRoomCells(r,cells) {
    if(!Array.isArray(cells)||cells.length>ROOM_PACKET_CELLS)throw new Error('Invalid edit batch');
    const dirty=new Set(),editing=commandEditing;r.applying=true;commandEditing=true;
    try {
        for(const change of cells) {
            if(!roomCellValid(change.cell))throw new Error('Invalid cell');
            const [x,y,z,id]=change.cell,key=`${currentDimension}|${x},${y},${z}`;
            setBlockNoRebuild(x,y,z,id,dirty);
            if(id===LAVA_ID&&Number.isInteger(change.lava)&&change.lava>0&&change.lava<=8)lavaAmounts.set(`${x},${y},${z}`,change.lava);
            if(id===24&&Number.isInteger(change.water)&&change.water>0&&change.water<=8)waterAmounts.set(`${x},${y},${z}`,change.water);
            if(HOME_ITEMS[id]&&change.furniture&&typeof change.furniture==='object') {
                const data=JSON.parse(JSON.stringify(change.furniture),(key,value)=>['__proto__','constructor','prototype'].includes(key)?undefined:value);
                data.id=id;furnitureData.set(key,data);
                const model=furnitureMeshes.get(key);if(model){disposeModModel(model);furnitureMeshes.delete(key);}
            }
        }
    } finally {r.applying=false;commandEditing=editing;addDirtyChunksToQueue(dirty);furnitureTick=1;}
}

function receiveRoomGuest(r,entry,p) {
    if(p.type==='ready'&&entry.sending) {
        entry.ready=true;entry.sending=false;
        for(const patch of entry.pending)sendRoomPacket(entry.conn,patch);entry.pending=[];
        for(const [id,pos] of r.positions)sendRoomPacket(entry.conn,{type:'pos',id,...pos});
        showToast('A player joined.');return;
    }
    if(!entry.ready||!r.worldReady)return;
    if(p.type==='launcher-request') {
        if(p.dimension!==currentDimension||!Array.isArray(p.at)||p.at.length!==3||!p.at.every(Number.isSafeInteger))return;
        const launcher=furnitureRecord(...p.at);
        if(launcher?.id===NUCLEAR_LAUNCHER_ID&&validLauncherTarget(launcher,p.target,p.port))launchNuclearMissile(launcher,p.target,p.port);
        return;
    }
    if(p.type==='thermal-request') {
        if(!validRoomThermal(p))return;
        if(p.action==='nuke'&&getBlock(...p.at)===NUKE_ID)beginNuclearBlast(...p.at);
        else if(p.action==='ignite')igniteThermalTarget(...p.at,p.air);
        return;
    }
    if(p.type==='pos'&&validateRoomPosition(p)) {
        const pos={type:'pos',id:entry.conn.peer,x:p.x,y:p.y,z:p.z,ry:p.ry,scale:p.scale,dimension:p.dimension};
        r.positions.set(entry.conn.peer,pos);displayRoomPlayer(entry.conn.peer,pos);
        for(const e of r.connections.values())if(e.ready&&e!==entry)sendRoomPacket(e.conn,pos);
    } else if(p.type==='edit'&&p.dimension===currentDimension) {
        const now=performance.now();if(now-entry.rateStart>1000){entry.rate=0;entry.rateStart=now;}
        entry.rate+=(p.cells?.length||0);if(entry.rate>4096){entry.conn.close();return;}
        if(JSON.stringify(p).length>60000)throw new Error('Edit too large');
        applyRoomCells(r,p.cells);
        for(const change of p.cells)r.dirty.set(change.cell.slice(0,3).join(','),change.cell.slice(0,3));
    }
}

function receiveRoomHost(r,entry,p) {
    if(p.type==='error'){roomFailure(r,String(p.message).slice(0,200));return;}
    if(p.type==='waiting') {
        clearTimeout(r.deadline);r.deadline=roomTimer(r,()=>roomFailure(r,'The host has not entered the room. Please try again.'),60000);
        setMultiplayerStatus('Connected. Waiting for the host to enter the room.');return;
    }
    if(p.type==='world-begin') {
        if(r.worldReady||r.transfer||p.version!==ROOM_PROTOCOL||!Number.isSafeInteger(p.parts)||p.parts<1||p.parts>Math.ceil(ROOM_MAX_SAVE/8000)||!Number.isSafeInteger(p.length)||p.length<1||p.length>ROOM_MAX_SAVE||!Number.isSafeInteger(p.seq))throw new Error('Invalid snapshot');
        r.transfer={...p,chunks:[],received:0};r.phase='syncing';setMultiplayerStatus('Loading host world...');
    } else if(p.type==='world-chunk'&&r.transfer) {
        const t=r.transfer;
        if(typeof p.text!=='string'||p.text.length>8000||p.index!==t.chunks.length||t.chunks.length>=t.parts)throw new Error('Invalid world chunk');
        t.chunks.push(p.text);t.received+=p.text.length;if(t.received>t.length)throw new Error('World too large');
        clearTimeout(r.deadline);r.deadline=roomTimer(r,()=>roomFailure(r,'World transfer timed out. Please rejoin.'));
        setMultiplayerStatus(`Loading host world: ${Math.round(t.received/t.length*100)}%`);
    } else if(p.type==='world-end'&&r.transfer) {
        const t=r.transfer;if(t.chunks.length!==t.parts||t.received!==t.length)throw new Error('Incomplete world');
        const save=JSON.parse(t.chunks.join(''),(key,value)=>['__proto__','constructor','prototype'].includes(key)?undefined:value);
        if(!Number.isFinite(save.seed)||!Array.isArray(save.worldMap)||!save.camera||!['x','y','z'].every(k=>Number.isFinite(save.camera[k])))throw new Error('Invalid world');
        r.applying=true;r.seq=t.seq;r.transfer=null;
        const inventory=playerInventory,hostScale=Math.max(MIN_PLAYER_SCALE,Math.min(MAX_PLAYER_SCALE,Number(save.playerScale)||1));
        save.camera.y+=PLAYER_HEIGHT*(1-hostScale);
        save.playerInventory=inventory;save.playerScale=1;save.activeMech=null;save.creativeFlying=false;
        const file=new File([JSON.stringify(save)],'room.json',{type:'application/json'});
        window.loadSaveFile({target:{files:[file]}},error=>{
            if(multiplayerRoom!==r)return;
            r.applying=false;if(error){roomFailure(r,'Could not load this room.');return;}
            const origin=camera.position.clone();
            for(const [dx,dz] of [[2,0],[-2,0],[0,2],[0,-2]]){const p=origin.clone().add(new THREE.Vector3(dx,0,dz));if(!checkScaledCollision(p)){camera.position.copy(p);break;}}
            if(checkScaledCollision(camera.position)) {
                camera.position.y=getSurfaceHeight(Math.round(origin.x),Math.round(origin.z))+0.5+getPlayerHeight();
                for(let i=0;i<256&&checkScaledCollision(camera.position);i++)camera.position.y++;
            }
            clearTimeout(r.deadline);r.worldReady=true;r.phase='ready';
            setRoomCode(r.code.match(/.{4}/g).join('-'));sendRoomPacket(entry.conn,{type:'ready'});
            document.getElementById('pause-menu').style.display='none';document.getElementById('multiplayer-menu').style.display='block';
            setMultiplayerStatus('World ready.');updateRoomButtons();
        },()=>multiplayerRoom===r);
    } else if(p.type==='patch'&&r.worldReady) {
        if(p.seq<=r.seq)return;if(p.seq!==r.seq+1||p.dimension!==currentDimension)throw new Error('World revision mismatch');
        applyRoomCells(r,p.cells);r.seq=p.seq;
    } else if(p.type==='launcher-shot'&&r.worldReady&&p.dimension===currentDimension) {
        if(nuclearMissiles.length<8&&Array.isArray(p.from)&&p.from.length===3&&p.from.every(n=>Number.isFinite(n)&&Math.abs(n)<=100001)&&validLauncherTarget({x:p.from[0],y:p.from[1],z:p.from[2]},p.target,p.port))createNuclearMissile(p.from,p.target,p.port);
    } else if(p.type==='thermal'&&r.worldReady&&validRoomThermal(p)) {
        if(p.action==='nuke')beginNuclearBlast(...p.at,true);
        else if(p.action==='extinguish')burningBlocks.delete(p.at.join(','));
        else {
            if(p.fuel===FIRE_ID&&getBlock(...p.at)===0) {
                r.applying=true;try {setBlock(...p.at,FIRE_ID);} finally {r.applying=false;}
            }
            startBurning(...p.at,true);
        }
    } else if(p.type==='pos'&&typeof p.id==='string')displayRoomPlayer(p.id,p);
    else if(p.type==='leave'&&typeof p.id==='string'){disposeModModel(remotePlayers[p.id]);delete remotePlayers[p.id];}
}

function queueRoomBlockChange(x,y,z) {
    const r=multiplayerRoom;
    if(r?.worldReady&&!r.applying&&!thermalBulkWrite)r.dirty.set(`${x},${y},${z}`,[x,y,z]);
}

function updateMultiplayer(now=performance.now()) {
    const r=multiplayerRoom;if(!r?.worldReady||r.applying||now<r.nextTick)return;r.nextTick=now+100;
    if(r.entered) {
        const pos={type:'pos',id:r.peer.id,x:camera.position.x,y:camera.position.y,z:camera.position.z,ry:camera.rotation.y,scale:playerScale,dimension:currentDimension};
        if(r.role==='host')r.positions.set(r.peer.id,pos);
        for(const entry of r.connections.values())if(entry.ready||r.role==='guest')sendRoomPacket(entry.conn,pos);
    }
    const cells=[];
    for(const [key,coords] of r.dirty) {
        const id=getBlock(...coords),furniture=furnitureData.get(`${currentDimension}|${key}`);
        cells.push({cell:[...coords,id],...(id===LAVA_ID?{lava:lavaAmount(...coords)}:{}),...(id===24?{water:waterAmount(...coords)}:{}),...(furniture?{furniture}: {})});r.dirty.delete(key);
        if(cells.length>=ROOM_PACKET_CELLS)break;
    }
    if(!cells.length)return;
    if(r.role==='guest') {for(const entry of r.connections.values())sendRoomPacket(entry.conn,{type:'edit',dimension:currentDimension,cells});}
    else {
        const patch={type:'patch',seq:++r.seq,dimension:currentDimension,cells};
        for(const entry of r.connections.values()) {
            if(entry.ready)sendRoomPacket(entry.conn,patch);
            else if(entry.sending){entry.pending.push(patch);if(entry.pending.length>512)entry.conn.close();}
        }
    }
}

function initMultiplayer() {
    setMultiplayerMode('host');setRoomCode('');
    window.addEventListener('beforeunload',()=>multiplayerRoom?.peer?.destroy());
}

function validRoomThermal(p) {
    const coords=a=>Array.isArray(a)&&a.length===3&&a.every(n=>Number.isSafeInteger(n)&&Math.abs(n)<=100000);
    return p.dimension===currentDimension&&['ignite','nuke','extinguish'].includes(p.action)&&coords(p.at)&&
        (!p.air||(coords(p.air)&&p.air.reduce((n,v,i)=>n+Math.abs(v-p.at[i]),0)===1));
}
function requestRoomThermal(action,at,air) {
    const r=multiplayerRoom;if(!r?.worldReady||r.role!=='guest')return false;
    for(const e of r.connections.values())sendRoomPacket(e.conn,{type:'thermal-request',action,at,air,dimension:currentDimension});return true;
}
function broadcastRoomThermal(action,at,extra={}) {
    const r=multiplayerRoom;if(!r?.worldReady||r.role!=='host')return;
    const packet={type:'thermal',action,at,dimension:currentDimension,...extra};
    for(const e of r.connections.values()) {
        if(e.ready)sendRoomPacket(e.conn,packet);
        else if(e.sending){e.pending.push(packet);if(e.pending.length>512)e.conn.close();}
    }
}
