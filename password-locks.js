const passwordLocks=new Map(),passwordLockSecrets=new Map(),lockedWireCells=new Map(),lockedPistonCells=new Map();
const lockAttempts=new Map(),pendingLockRequests=new Map();
let lockWriting=false,lockEditActor=null,lockRequestSequence=0,lockWorldRevision=0,localLockIdentity=null,lockPlacementPending=false;
const lockHex=bytes=>Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
const lockRandom=()=>lockHex(crypto.getRandomValues(new Uint8Array(32)));
const lockDigest=async text=>lockHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
const lockIdentityReady=(async()=>{
    try {
        let token;try{token=localStorage.getItem('daniel-mc-lock-owner-v1');}catch{}
        if(!/^[a-f0-9]{64}$/.test(token||''))token=lockRandom();
        let persistent=false;try{localStorage.setItem('daniel-mc-lock-owner-v1',token);persistent=true;}catch{}
        localLockIdentity={token,id:await lockDigest(token),persistent};return localLockIdentity;
    } catch {return null;}
})();

function withLockWrite(fn) {const previous=lockWriting;lockWriting=true;try{return fn();}finally{lockWriting=previous;}}
function publicPasswordLock(record) {
    return {owner:record.owner,id:record.id,configured:record.configured,remaining:record.remaining,face:{...record.face}};
}
function validPasswordLock(key,r) {
    return typeof key==='string'&&validMachineCell(key.split(',').map(Number))&&r&&/^[a-f0-9]{64}$/.test(r.owner)&&
        /^[a-f0-9]{64}$/.test(r.id)&&typeof r.configured==='boolean'&&Number.isFinite(r.remaining)&&r.remaining>=0&&r.remaining<=1&&validPistonDirection(r.face);
}
function savePasswordLocks() {return {locks:[...passwordLocks].map(([key,r])=>[key,publicPasswordLock(r)]),lockSecrets:[...passwordLockSecrets]};}
function clearPasswordLocks() {
    lockWorldRevision++;
    for(const map of [passwordLocks,passwordLockSecrets,lockedWireCells,lockedPistonCells,lockAttempts])map.clear();
}
function restorePasswordLocks(data={}) {
    for(const [key,r] of (data.locks||[]).slice(0,256))if(validPasswordLock(key,r)&&getBlock(...key.split(',').map(Number))===PASSWORD_LOCK_ID)passwordLocks.set(key,publicPasswordLock(r));
    for(const [key,s] of (data.lockSecrets||[]).slice(0,256))if(passwordLocks.has(key)&&s&&/^[a-f0-9]{64}$/.test(s.salt)&&/^[a-f0-9]{64}$/.test(s.hash))passwordLockSecrets.set(key,{salt:s.salt,hash:s.hash});
    circuitDirty=true;
}
function broadcastPasswordLocks() {
    circuitDirty=true;
    broadcastMachinePacket({type:'password-locks',locks:[...passwordLocks].map(([key,r])=>[key,publicPasswordLock(r)])});
}
function receivePasswordLocks(packet) {
    if(packet.dimension!==currentDimension||!Array.isArray(packet.locks)||packet.locks.length>256)return;
    passwordLocks.clear();passwordLockSecrets.clear();
    for(const [key,r] of packet.locks)if(validPasswordLock(key,r))passwordLocks.set(key,publicPasswordLock(r));
    circuitDirty=true;
}
function tickPasswordLocks(elapsed) {
    let changed=false;
    for(const r of passwordLocks.values())if(r.remaining>0){r.remaining=Math.max(0,r.remaining-elapsed);if(!r.remaining)changed=true;}
    if(changed)broadcastPasswordLocks();
}
function passwordCircuitOpen(keys) {
    const owners=new Set(),authorized=new Set();
    for(const key of keys) {const r=passwordLocks.get(key);if(!r)return false;owners.add(r.owner);if(r.remaining>0)authorized.add(r.owner);}
    return owners.size>0&&[...owners].every(owner=>authorized.has(owner));
}

function rebuildPasswordCircuits() {
    lockedWireCells.clear();lockedPistonCells.clear();if(!passwordLocks.size)return;
    // A keypad gates its entire connected wire network, including concealed wiring.
    for(const [key] of passwordLocks) {
        const queue=redstoneNeighbors(...key.split(',').map(Number)).filter(n=>isWireAt(n.x,n.y,n.z)),seen=new Set();
        for(let i=0;i<queue.length&&seen.size<8192;i++) {
            const n=queue[i],wire=machineKey(n.x,n.y,n.z);if(seen.has(wire))continue;seen.add(wire);
            if(!lockedWireCells.has(wire))lockedWireCells.set(wire,new Set());lockedWireCells.get(wire).add(key);
            queue.push(...wireNeighbors(n.x,n.y,n.z).filter(p=>!seen.has(machineKey(p.x,p.y,p.z))));
        }
    }
    for(const [key,type] of machineCells)if(type===PISTON_ID) {
        const [x,y,z]=key.split(',').map(Number),locks=new Set();
        for(let dx=-5;dx<=5;dx++)for(let dy=-5;dy<=5;dy++)for(let dz=-5;dz<=5;dz++) {
            const distance=dx*dx+dy*dy+dz*dz;if(distance>25)continue;
            const wire=machineKey(x+dx,y+dy,z+dz),bound=lockedWireCells.get(wire);
            if(bound&&(getBlock(x+dx,y+dy,z+dz)!==REDSTONE_DUST_ID||distance<=1))for(const lock of bound)locks.add(lock);
        }
        if(locks.size)lockedPistonCells.set(key,locks);
    }
}
function ownsPasswordBindings(bindings,actor) {return !bindings||[...bindings].every(key=>passwordLocks.get(key)?.owner===actor);}
function canEditPasswordCircuit(x,y,z,actor=lockEditActor||localLockIdentity?.id,type=null) {
    if(!passwordLocks.size)return true;
    rebuildCircuitPower();const key=machineKey(x,y,z);
    if(!ownsPasswordBindings(lockedWireCells.get(key),actor)||!ownsPasswordBindings(lockedPistonCells.get(key),actor))return false;
    for(const [base,bindings] of lockedPistonCells)if(!ownsPasswordBindings(bindings,actor)) {
        const at=base.split(',').map(Number),d=getStoredPistonDirection(...at);
        const offset=(x-at[0])*d.x+(y-at[1])*d.y+(z-at[2])*d.z;
        if(offset<1||offset>13||x!==at[0]+d.x*offset||y!==at[1]+d.y*offset||z!==at[2]+d.z*offset)continue;
        for(let i=1;i<=13;i++) {
            const cell=[at[0]+d.x*i,at[1]+d.y*i,at[2]+d.z*i];
            if(cell[0]===x&&cell[1]===y&&cell[2]===z)return false;
            if(i>=2&&!getBlock(...cell))break;
        }
    }
    if([28,30,31,REDSTONE_DUST_ID,PASSWORD_LOCK_ID,PISTON_ID].includes(type)) {
        for(const n of redstoneNeighbors(x,y,z))if(!ownsPasswordBindings(lockedWireCells.get(machineKey(n.x,n.y,n.z)),actor))return false;
    }
    return true;
}
function lockedBlockWriteAllowed(x,y,z,type) {
    if(lockWriting||machineWriting||multiplayerRoom?.role==='guest'&&multiplayerRoom.applying)return true;
    if(type===PASSWORD_LOCK_ID||getBlock(x,y,z)===PASSWORD_LOCK_ID)return false;
    return canEditPasswordCircuit(x,y,z,undefined,type);
}
function minePasswordLock(x,y,z) {
    const record=passwordLocks.get(machineKey(x,y,z));
    if(!record||record.owner!==localLockIdentity?.id){showToast('Only the player who placed this lock can remove it.');return;}
    performLockAction('remove',[x,y,z]).then(result=>{
        if(result.ok){playerInventory[PASSWORD_LOCK_ID]=(playerInventory[PASSWORD_LOCK_ID]||0)+1;updateInventoryCounts();updateHotbarUI();}else showToast(result.message);
    });
}
async function passwordVerifier(code,salt) {
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(code),'PBKDF2',false,['deriveBits']);
    return lockHex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(salt),iterations:100000,hash:'SHA-256'},key,256));
}
async function executeLockAction(actor,action,at,extra={}) {
    const fail=message=>({ok:false,message});
    if(!thermalAuthority()||!actor||!validMachineCell(at))return fail('Lock access unavailable.');
    const key=at.join(','),r=passwordLocks.get(key),revision=lockWorldRevision,room=multiplayerRoom,dimension=currentDimension;
    if(action==='place') {
        if(passwordLocks.size>=256||![0,42].includes(getBlock(...at))||!validPistonDirection(extra.face))return fail('This position is unavailable.');
        const f=extra.face,support=[at[0]-f.x,at[1]-f.y,at[2]-f.z];
        if(!isSolid(...support)&&!isWireAt(...support))return fail('Attach the lock to a block.');
        if(!canEditPasswordCircuit(...at,actor,PASSWORD_LOCK_ID))return fail('This circuit belongs to another lock owner.');
        passwordLocks.set(key,{owner:actor,id:lockRandom(),configured:false,remaining:0,face:{...f}});
        withLockWrite(()=>setBlockNoRebuild(...at,PASSWORD_LOCK_ID,rebuildQueue));broadcastPasswordLocks();return {ok:true,message:'Set a code for this lock.'};
    }
    if(!r||getBlock(...at)!==PASSWORD_LOCK_ID)return fail('This lock no longer exists.');
    if(action==='remove') {
        if(r.owner!==actor)return fail('Only the player who placed this lock can remove it.');
        withLockWrite(()=>setBlockNoRebuild(...at,0,rebuildQueue));passwordLocks.delete(key);passwordLockSecrets.delete(key);broadcastPasswordLocks();return {ok:true,message:'Lock removed.'};
    }
    if(!['set-code','unlock'].includes(action))return fail('Unknown lock action.');
    if(typeof extra.code!=='string'||extra.code.length<1||extra.code.length>64)return fail('Enter a code of 1 to 64 characters.');
    if(action==='set-code'&&r.owner!==actor)return fail('Only the lock owner can change the code.');
    const attemptKey=`${r.id}|${actor}`,attempt=lockAttempts.get(attemptKey)||{failures:0,until:0};
    if(action==='unlock'&&attempt.until>Date.now())return fail('Too many attempts. Try again in 30 seconds.');
    const secret=action==='set-code'?{salt:lockRandom()}:passwordLockSecrets.get(key);
    if(!secret)return fail(r.configured?'This save has no lock key. Ask the owner to set a new code.':'The owner has not set a code yet.');
    const hash=await passwordVerifier(extra.code,secret.salt);
    if(revision!==lockWorldRevision||multiplayerRoom!==room||currentDimension!==dimension||passwordLocks.get(key)!==r)return fail('The world changed. Try again.');
    if(action==='set-code') {passwordLockSecrets.set(key,{salt:secret.salt,hash});r.configured=true;r.remaining=0;broadcastPasswordLocks();return {ok:true,message:'Code saved.'};}
    if(hash!==secret.hash) {
        attempt.failures++;if(attempt.failures>=5){attempt.until=Date.now()+30000;attempt.failures=0;}lockAttempts.set(attemptKey,attempt);
        return fail('Incorrect code.');
    }
    lockAttempts.delete(attemptKey);r.remaining=1;broadcastPasswordLocks();return {ok:true,message:'Unlocked.'};
}
async function performLockAction(action,at,extra={}) {
    const identity=await lockIdentityReady;
    if(!identity)return {ok:false,message:'This browser cannot initialize lock ownership.'};
    if(thermalAuthority())return executeLockAction(identity.id,action,at,extra);
    const r=multiplayerRoom;
    if(!r?.lockAuthenticated)return {ok:false,message:'Wait for the room to verify your lock identity.'};
    const request=++lockRequestSequence;
    return new Promise(resolve=>{
        const timer=setTimeout(()=>{pendingLockRequests.delete(request);resolve({ok:false,message:'Host did not respond. Please try again.'});},10000);
        pendingLockRequests.set(request,{resolve,timer});
        for(const e of r.connections.values())sendRoomPacket(e.conn,{type:'lock-request',request,action,at,extra,dimension:currentDimension});
    });
}
function receiveLockReply(p) {
    const pending=pendingLockRequests.get(p.request);if(!pending)return;
    clearTimeout(pending.timer);pendingLockRequests.delete(p.request);pending.resolve({ok:p.ok===true,message:String(p.message||'').slice(0,180)});
}
async function authenticateLockGuest(r,entry,p) {
    if(entry.owner||entry.authenticating||typeof p.token!=='string'||!/^[a-f0-9]{64}$/.test(p.token))return;
    entry.authenticating=true;const owner=await lockDigest(p.token);
    if(multiplayerRoom!==r||r.connections.get(entry.conn.peer)!==entry)return;
    entry.owner=owner;sendRoomPacket(entry.conn,{type:'lock-auth-ok'});
}
async function receiveGuestLockAction(r,entry,p) {
    if(!entry.owner||entry.lockBusy||p.dimension!==currentDimension||!Number.isSafeInteger(p.request)||!validMachineCell(p.at))return;
    const position=r.positions.get(entry.conn.peer);
    if(!position||position.dimension!==currentDimension||Math.hypot(position.x-p.at[0],position.y-p.at[1],position.z-p.at[2])>9) {
        sendRoomPacket(entry.conn,{type:'lock-reply',request:p.request,ok:false,message:'Move closer to the lock.'});return;
    }
    if(!p.extra||typeof p.extra!=='object'||JSON.stringify(p.extra).length>600)return;
    entry.lockBusy=true;
    try {
        const result=await executeLockAction(entry.owner,p.action,p.at,p.extra);
        if(multiplayerRoom===r)sendRoomPacket(entry.conn,{type:'lock-reply',request:p.request,...result});
    } finally {entry.lockBusy=false;}
}

async function openPasswordLockPanel(x,y,z) {
    await lockIdentityReady;
    const key=machineKey(x,y,z),r=passwordLocks.get(key);if(!r){showToast('Waiting for the lock to synchronize.');return;}
    closeFurniturePanel(false);furnitureFocus=key;cancelMining();
    document.getElementById('home-title').textContent='Password Lock';document.getElementById('home-panel').hidden=false;
    if(controls.isLocked)controls.unlock();blocker.style.display='none';
    const content=document.getElementById('home-content');content.replaceChildren();
    const status=document.createElement('div');status.setAttribute('role','status');status.textContent=r.remaining>0?'Unlocked.':r.configured?'Locked':'Not configured';content.appendChild(status);
    const owner=r.owner===localLockIdentity?.id;
    const form=document.createElement('form');form.style.cssText='display:grid;gap:12px';content.appendChild(form);
    const label=document.createElement('label');label.textContent=owner&&!r.configured?'New code':'Code';form.appendChild(label);
    const input=document.createElement('input');input.type='password';input.maxLength=64;input.autocomplete='off';input.id='lock-code';label.htmlFor=input.id;
    input.style.cssText='box-sizing:border-box;width:100%;min-width:0;font-size:18px;padding:10px';form.appendChild(input);
    const actions=document.createElement('div');actions.className='home-row';form.appendChild(actions);
    const submit=document.createElement('button');submit.type='submit';submit.textContent=owner&&!r.configured?'Set Code':'Unlock';actions.appendChild(submit);
    let busy=false;
    const run=async action=>{
        if(busy)return;busy=true;for(const b of form.querySelectorAll('button'))b.disabled=true;
        try {
            const result=await performLockAction(action,[x,y,z],{code:input.value});
            if(furnitureFocus!==key||document.getElementById('home-panel').hidden)return;
            status.textContent=result.message;
            if(result.ok&&action==='unlock'){input.value='';closeFurniturePanel();showToast('Unlocked.');return;}
            if(result.ok){input.value='';if(action==='remove'){closeFurniturePanel();playerInventory[PASSWORD_LOCK_ID]=(playerInventory[PASSWORD_LOCK_ID]||0)+1;updateInventoryCounts();updateHotbarUI();}else if(action==='set-code'){submit.textContent='Unlock';label.textContent='Code';}}
        } catch {status.textContent='Could not contact the lock. Try again.';}
        finally {busy=false;for(const b of form.querySelectorAll('button'))b.disabled=false;}
    };
    form.onsubmit=e=>{e.preventDefault();run(owner&&!passwordLocks.get(key)?.configured?'set-code':'unlock');};
    if(owner)for(const [action,labelText] of [['set-code','Change Code'],['remove','Remove Lock']]) {
        const b=document.createElement('button');b.type='button';b.textContent=labelText;b.onclick=()=>run(action);actions.appendChild(b);
    }
    if(!localLockIdentity?.persistent)status.textContent='Ownership cannot be saved in this browser.';
    input.focus();
}
