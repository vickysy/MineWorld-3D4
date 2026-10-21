const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

async function assertScenePixels(page) {
    assert(await page.evaluate(()=>{
        renderer.render(scene,camera);
        const gl=renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4),colors=new Set();
        gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        for(let i=0;i<pixels.length;i+=256)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
        return colors.size>8&&renderer.info.render.triangles>100;
    }),'Multiplayer scene must contain rendered world pixels');
}

(async()=>{
    const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    const url=process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href,errors=[];
    try {
        const host=await browser.newPage({viewport:{width:1360,height:900}}),guest=await browser.newPage({viewport:{width:1280,height:900}});
        for(const page of [host,guest]) {
            page.setDefaultNavigationTimeout(120000);
            page.on('pageerror',e=>errors.push(e.message));
            await page.goto(url);await page.waitForFunction(()=>expansionReady);
        }
        await host.getByRole('button',{name:'Creative',exact:true}).click();
        await host.getByRole('button',{name:'Moon',exact:true}).click();
        await host.locator('#difficulty-select').selectOption('peaceful');
        await host.getByRole('button',{name:'Play with Others',exact:true}).click();
        await host.locator('#create-room-btn').click();
        await host.waitForFunction(()=>multiplayerRoom?.phase==='ready',{},{timeout:40000});
        const code=await host.locator('#room-code-display').inputValue();assert.match(code,/^\d{4}-\d{4}-\d{4}$/);
        await host.locator('#create-room-btn').click();assert.equal(await host.locator('#room-code-display').inputValue(),code);
        await host.locator('#copy-room-btn').click();
        await host.waitForFunction(()=>/copied|Copy was blocked/.test(document.getElementById('multiplayer-status').textContent));
        await host.screenshot({path:'/private/tmp/mc-room-created.png'});
        await guest.getByRole('button',{name:'Play with Others',exact:true}).click();
        await guest.locator('#guest-mode-btn').click();
        await guest.locator('#room-code-input').fill('not a room');await guest.locator('#join-room-btn').click();
        assert.match(await guest.locator('#multiplayer-status').textContent(),/12-digit/);
        await guest.locator('#room-code-input').fill(code);await guest.locator('#join-room-btn').click();
        await guest.waitForFunction(()=>document.getElementById('multiplayer-status').textContent.includes('Waiting for the host'),{},{timeout:40000});
        assert(await guest.evaluate(()=>!isGameStarted&&!multiplayerRoom.worldReady));
        await host.locator('#enter-room-btn').click();
        await host.waitForFunction(()=>isGameStarted&&multiplayerRoom?.entered);
        await guest.waitForFunction(()=>multiplayerRoom?.worldReady,{},{timeout:60000});
        const world=await host.evaluate(()=>({seed,terrain:selectedTerrain,mode:gameMode,spawn:worldSpawnPoint,position:camera.position.toArray()}));
        const joined=await guest.evaluate(()=>({seed,terrain:selectedTerrain,mode:gameMode,spawn:worldSpawnPoint,position:camera.position.toArray()}));
        assert.equal(joined.seed,world.seed);assert.equal(joined.terrain,'moon');assert.equal(joined.mode,'creative');assert.deepEqual(joined.spawn,world.spawn);
        assert(Math.hypot(joined.position[0]-world.position[0],joined.position[2]-world.position[2])<=3);
        await guest.locator('#enter-room-btn').click();await guest.waitForFunction(()=>multiplayerRoom?.entered&&controls.isLocked);
        await host.waitForFunction(()=>Object.keys(remotePlayers).length===1);
        await guest.waitForFunction(()=>Object.keys(remotePlayers).length===1);
        console.log('PASS: Actual public signaling + WebRTC; Create Room, waiting guest, Enter Room, shared seed/terrain/mode/spawn and two visible players.');

        assert.equal(await guest.evaluate(()=>gameDifficulty),'peaceful');
        const avatarPosition=await host.evaluate(()=>{const p=camera.position.toArray();camera.position.y+=12;creativeFlying=true;selectSlot(3);return p;});
        await guest.waitForFunction(()=>Object.values(remotePlayers).some(m=>m.userData.heldId===4));
        assert(await host.evaluate(()=>enterMech(71)));
        await guest.waitForFunction(()=>Object.values(remotePlayers).some(m=>m.userData.mechId===71&&m.userData.form==='robot'&&!m.children[0].visible));
        await guest.evaluate(()=>{const p=Object.values(remotePlayers)[0].position;camera.position.copy(p).add(new THREE.Vector3(5,3,7));camera.lookAt(p);creativeFlying=true;});
        await guest.screenshot({path:'/private/tmp/mc-remote-bee.png'});
        assert(await host.evaluate(()=>transformMech()));
        await guest.waitForFunction(()=>Object.values(remotePlayers).some(m=>m.userData.form==='vehicle'&&!m.userData.mech.userData.cannon.visible));
        assert(await host.evaluate(()=>exitMech()));
        await host.evaluate(p=>{camera.position.fromArray(p);creativeFlying=false;selectSlot(174-12);},avatarPosition);
        await guest.waitForFunction(()=>Object.values(remotePlayers).some(m=>m.userData.heldId===174&&m.userData.form==='human'&&m.children[0].visible));
        assert(await guest.evaluate(()=>{const m=Object.values(remotePlayers)[0];return m.userData.held.material.map===materials[174].map;}));
        await guest.evaluate(()=>{selectSlot(3);});
        await host.waitForFunction(()=>Object.values(remotePlayers).some(m=>m.userData.heldId===4));
        console.log('PASS: Real two-peer robot/vehicle/human transformations and actual held wood/red brick are visible, with shared Peaceful difficulty.');

        const cell=await host.evaluate(()=>{
            const p=[Math.round(camera.position.x)+4,Math.round(camera.position.y)+2,Math.round(camera.position.z)];
            setBlock(...p,59);return p;
        });
        await guest.waitForFunction(p=>getBlock(...p)===59,cell);
        const guestCell=[cell[0]+1,cell[1],cell[2]];
        await guest.evaluate(p=>setBlock(...p,60),guestCell);await host.waitForFunction(p=>getBlock(...p)===60,guestCell);
        await guest.evaluate(p=>setBlock(p[0]+1,p[1],p[2],430),guestCell);
        await host.waitForFunction(p=>getBlock(p[0]+1,p[1],p[2])===430&&!isSolid(p[0]+1,p[1],p[2]),guestCell);
        await guest.evaluate(p=>mineBlock(new THREE.Vector3(...p),false),cell);await host.waitForFunction(p=>getBlock(...p)===0,cell);
        const furniture=[cell[0]+3,cell[1],cell[2]];
        assert(await host.evaluate(p=>placeFurniture(SHOWER_DOOR_ID,...p),furniture));
        await guest.waitForFunction(p=>getBlock(...p)===SHOWER_DOOR_ID&&getBlock(p[0],p[1]+1,p[2])===FRIDGE_TOP_ID&&!!furnitureRecord(...p),furniture);
        assert.equal(await host.evaluate(p=>furnitureRecord(...p).data.yaw,furniture),await guest.evaluate(p=>furnitureRecord(...p).data.yaw,furniture));
        console.log('PASS: Bidirectional placement/mining and complete two-block furniture synchronization.');

        const home=await host.evaluate(cell=>{
            const p=[cell[0]-12,cell[1]+8,cell[2]+8],tv=[p[0]+6,p[1],p[2]],lamp=[p[0]+6,p[1],p[2]+3];
            for(let x=-1;x<=8;x++)for(let z=-1;z<=5;z++)setBlockNoRebuild(p[0]+x,p[1]-1,p[2]+z,3,rebuildQueue);
            const saved=camera.position.clone();
            for(const [id,at] of [[XL_SOFA_ID,p],[93,tv],[89,lamp]]){camera.position.set(at[0],at[1]+10,at[2]+10);if(!placeFurniture(id,...at))throw Error('Connected home fixture did not place');}
            camera.position.copy(saved);
            for(let z=0;z<=3;z++)setBlockNoRebuild(p[0]+5,p[1],p[2]+z,REDSTONE_DUST_ID,rebuildQueue);
            const lever=[p[0]+4,p[1],p[2]+3];setBlockNoRebuild(...lever,31,rebuildQueue);
            for(const at of [tv,lamp]){furnitureRecord(...at).data.redstone=true;queueRoomBlockChange(...at);}
            return {p,tv,lamp,lever};
        },cell);
        await guest.waitForFunction(({p,tv,lamp})=>furnitureRecord(...p)?.data.parts.length===3&&furnitureRecord(...tv)?.data.on&&furnitureRecord(...lamp)?.data.on,home);
        const guestHomePosition=await guest.evaluate(()=>({pos:camera.position.toArray(),flying:creativeFlying}));
        await guest.evaluate(({tv})=>{creativeFlying=true;camera.position.set(tv[0],tv[1]+1.1,tv[2]+4);currentBlock=TV_REMOTE_ID;openRemotePanel();},home);
        await guest.getByRole('button',{name:'Power',exact:true}).click();
        await host.waitForFunction(tv=>furnitureRecord(...tv)?.data.on===false&&furnitureRecord(...tv)?.data.redstone===false,home.tv);
        await guest.getByRole('button',{name:'Next Channel',exact:true}).click();
        await host.waitForFunction(tv=>furnitureRecord(...tv)?.data.channel===1&&furnitureRecord(...tv)?.data.on,home.tv);
        await guest.locator('#close-home').click();
        await guest.evaluate(saved=>{camera.position.set(...saved.pos);creativeFlying=saved.flying;currentBlock=2;},guestHomePosition);
        await host.evaluate(lever=>setBlockNoRebuild(...lever,30,rebuildQueue),home.lever);
        await guest.waitForFunction(lamp=>furnitureRecord(...lamp)?.data.on===false,home.lamp);
        console.log('PASS: Four-cell sofa synchronizes; one redstone circuit powers lamp/TV; guest remote switches the host TV and channel.');

        await host.evaluate(()=>{controls.unlock();});await host.waitForFunction(()=>!controls.isLocked);
        await host.getByRole('button',{name:'Resume Game',exact:true}).click();
        await host.waitForFunction(()=>controls.isLocked);
        await host.evaluate(()=>{creativeFlying=true;camera.position.y+=12;camera.lookAt(camera.position.x,camera.position.y,camera.position.z-10);velocity.set(0,0,0);});
        const start=await host.evaluate(()=>camera.position.toArray());
        await host.keyboard.down('KeyW');
        try {await host.waitForFunction(p=>Math.hypot(camera.position.x-p[0],camera.position.z-p[2])>0.1,start);}finally{await host.keyboard.up('KeyW');}
        const end=await host.evaluate(()=>camera.position.toArray());assert(Math.hypot(start[0]-end[0],start[2]-end[2])>0.1);
        await guest.waitForFunction(p=>Object.values(remotePlayers).some(m=>Math.hypot(m.position.x-p[0],m.position.z-p[2])<0.3),end);
        await guest.evaluate(()=>{const p=Object.values(remotePlayers)[0];camera.lookAt(p.position.clone().add(new THREE.Vector3(0,0.4,0)));});
        await assertScenePixels(guest);
        await guest.screenshot({path:'/private/tmp/mc-room-two-players.png'});
        console.log('PASS: Actual W movement arrives on the other player screen.');

        const fireCell=[cell[0]+10,cell[1]+2,cell[2]];
        await host.evaluate(p=>setBlock(...p,4),fireCell);await guest.waitForFunction(p=>getBlock(...p)===4,fireCell);
        await guest.evaluate(p=>requestRoomThermal('ignite',p),fireCell);
        await host.waitForFunction(p=>burningBlocks.has(p.join(',')),fireCell);
        await guest.waitForFunction(p=>burningBlocks.has(p.join(',')),fireCell);
        await host.evaluate(()=>{for(let i=0;i<16;i++)tickFire(0.25);});
        await guest.waitForFunction(p=>getBlock(...p)===0,fireCell);
        const stoneCell=[fireCell[0],fireCell[1]-1,fireCell[2]];
        await host.evaluate(p=>setBlock(...p,3),stoneCell);await guest.waitForFunction(p=>getBlock(...p)===3,stoneCell);
        await guest.evaluate(({p,air})=>requestRoomThermal('ignite',p,air),{p:stoneCell,air:fireCell});
        await guest.waitForFunction(p=>getBlock(...p)===FIRE_ID&&burningBlocks.has(p.join(',')),fireCell);
        await host.evaluate(p=>setBlock(p[0]+1,p[1],p[2],24),fireCell);
        await guest.waitForFunction(p=>!burningBlocks.has(p.join(',')),fireCell);
        await host.evaluate(p=>setBlock(...p,4),fireCell);await guest.waitForFunction(p=>getBlock(...p)===4,fireCell);
        await host.evaluate(p=>{setBlock(p[0]+1,p[1],p[2],0);startBurning(...p);setBlock(p[0]+1,p[1],p[2],24);},fireCell);
        await guest.waitForFunction(p=>getBlock(...p)===4&&!burningBlocks.has(p.join(',')),fireCell);
        const lavaCell=[cell[0]+14,cell[1]+2,cell[2]];
        await host.evaluate(p=>{for(const [dx,dy,dz] of HEAT_OFFSETS)setBlockNoRebuild(p[0]+dx,p[1]+dy,p[2]+dz,3,new Set());setBlockNoRebuild(...p,43,new Set());lavaAmounts.set(p.join(','),3);},lavaCell);
        await guest.waitForFunction(p=>lavaAmount(...p)===3,lavaCell);
        const pool=[cell[0]+24,cell[1]+3,cell[2]];
        assert.equal(await guest.evaluate(p=>pourLavaBucket(...p),pool),128);
        await host.waitForFunction(p=>[...worldMap].some(([key,type])=>{
            if(type!==LAVA_ID)return false;const [x,y,z]=key.split(',').map(Number);
            return Math.abs(x-p[0])<9&&Math.abs(z-p[2])<9&&y<p[1];
        }),pool);
        const nuke=[cell[0]+120,cell[1],cell[2]+120];
        await host.evaluate(p=>setBlockNoRebuild(...p,22,new Set()),nuke);await guest.waitForFunction(p=>getBlock(...p)===22,nuke);
        await guest.evaluate(p=>igniteNuke(...p),nuke);
        await host.waitForFunction(()=>craterColumns.size>300&&craterColumns.size<400&&!nukeJobs.length,{},{timeout:60000});
        await guest.waitForFunction(()=>craterColumns.size>300&&craterColumns.size<400&&!nukeJobs.length,{},{timeout:60000});
        assert.deepEqual(await host.evaluate(()=>Array.from(craterColumns)),await guest.evaluate(()=>Array.from(craterColumns)));
        console.log('PASS: Guest ignition, fire on stone, water extinguishing, shallow lava levels and nuclear crater geometry synchronize.');
        const launcher=[cell[0]+24,cell[1]+6,cell[2]+8],cctv=[cell[0]+22,cell[1]+6,cell[2]+8];
        assert(await host.evaluate(p=>placeFurniture(144,...p),launcher));assert(await host.evaluate(p=>placeFurniture(138,...p),cctv));
        await guest.waitForFunction(p=>furnitureRecord(...p)?.id===144,launcher);
        await guest.waitForFunction(p=>furnitureRecord(...p)?.id===138,cctv);
        await guest.evaluate(p=>{furnitureRecord(...p).data.pan=-90;queueRoomBlockChange(...p);},cctv);
        await host.waitForFunction(p=>furnitureRecord(...p)?.data.pan===-90,cctv);
        assert(await guest.evaluate(({p,target})=>launchNuclearMissile(furnitureRecord(...p),target,0),{p:launcher,target:nuke}));
        await host.waitForFunction(()=>nuclearMissiles.length===1);await guest.waitForFunction(()=>nuclearMissiles.length===1);
        await host.evaluate(()=>updateNuclearMissiles(9));await guest.evaluate(()=>updateNuclearMissiles(9));
        await host.waitForFunction(()=>!nukeJobs.length,{},{timeout:60000});await guest.waitForFunction(()=>!nukeJobs.length,{},{timeout:60000});
        assert.deepEqual(await host.evaluate(()=>Array.from(craterColumns)),await guest.evaluate(()=>Array.from(craterColumns)));
        console.log('PASS: Guest camera pan and tablet launch reach the host; both players receive the missile and the same crater.');

        const machine=[cell[0]+5,cell[1]+10,cell[2]-10];
        await host.evaluate(p=>{
            const [x,y,z]=p;
            for(let dx=-3;dx<=35;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=-1;dy<=5;dy++)setBlockNoRebuild(x+dx,y+dy,z+dz,dy===-1?3:0,rebuildQueue);
            setBlockNoRebuild(x,y,z,PISTON_ID,rebuildQueue);pistonDirections.set(p.join(','),{x:1,y:0,z:0});pistonModes.set(p.join(','),'cycle');
            setBlockNoRebuild(x,y-1,z,134,rebuildQueue);hiddenRedstone.add(`${x},${y-1},${z}`);circuitDirty=true;
            setBlockNoRebuild(x-1,y-1,z,30,rebuildQueue);setBlockNoRebuild(x+1,y,z,3,rebuildQueue);
        },machine);
        await guest.waitForFunction(p=>getBlock(...p)===PISTON_ID&&pistonDirections.get(p.join(','))?.x===1&&hiddenRedstone.has(`${p[0]},${p[1]-1},${p[2]}`),machine);
        await guest.evaluate(p=>setBlockNoRebuild(p[0]-1,p[1]-1,p[2],31,rebuildQueue),machine);
        await host.waitForFunction(p=>pistonStates.has(p.join(',')),machine);
        await guest.waitForFunction(p=>pistonStates.has(p.join(','))&&getBlock(p[0]+2,p[1],p[2])===3,machine);
        await guest.evaluate(p=>setBlockNoRebuild(p[0]-1,p[1]-1,p[2],30,rebuildQueue),machine);
        await host.waitForFunction(p=>!pistonStates.has(p.join(','))&&getBlock(p[0]+1,p[1],p[2])===3,machine);
        await guest.waitForFunction(p=>!pistonStates.has(p.join(','))&&getBlock(p[0]+1,p[1],p[2])===3,machine);
        await host.evaluate(p=>{setBlockNoRebuild(p[0]+1,p[1],p[2],TNT_ID,rebuildQueue);setBlockNoRebuild(p[0]+1,p[1]+1,p[2],TNT_ID,rebuildQueue);},machine);
        await guest.waitForFunction(p=>getBlock(p[0]+1,p[1],p[2])===TNT_ID,machine);
        await guest.evaluate(p=>setBlockNoRebuild(p[0]-1,p[1]-1,p[2],31,rebuildQueue),machine);
        await host.waitForFunction(()=>movingTNT.size===2);
        await guest.waitForFunction(()=>movingTNT.size===2);
        await host.waitForFunction(()=>!movingTNT.size,{},{timeout:20000});
        await guest.waitForFunction(()=>!movingTNT.size,{},{timeout:20000});
        const impact=await host.evaluate(p=>[...worldMap].filter(([key,type])=>{
            const [x,y,z]=key.split(',').map(Number);return type===0&&x>p[0]+15&&x<p[0]+35&&y===p[1]-1&&Math.abs(z-p[2])<3;
        }).map(([key])=>key.split(',').map(Number)),machine);
        assert(impact.length>0);await guest.waitForFunction(cells=>cells.every(p=>getBlock(...p)===0),impact);
        assert.equal(await guest.evaluate(p=>getBlock(...p),machine),53);
        console.log('PASS: Guest lever drives host piston, hidden wire/direction and gate synchronize, both players see two TNT projectiles and the same distant impact.');

        await host.evaluate(p=>{
            setBlockNoRebuild(p[0]-1,p[1]-1,p[2],30,rebuildQueue);
            pistonModes.set(p.join(','),'cannon');pistonPowerEdges.delete(p.join(','));queueRoomBlockChange(...p);
        },machine);
        await host.waitForFunction(p=>!pistonStates.has(p.join(',')),machine);
        await host.evaluate(p=>{
            setBlockNoRebuild(p[0]+1,p[1],p[2],TNT_ID,rebuildQueue);setBlockNoRebuild(p[0]+1,p[1]+1,p[2],TNT_ID,rebuildQueue);
            for(let dx=26;dx<=34;dx++)for(let dz=-2;dz<=2;dz++)setBlockNoRebuild(p[0]+dx,p[1]-1,p[2]+dz,3,rebuildQueue);
        },machine);
        await guest.waitForFunction(p=>pistonModes.get(p.join(','))==='cannon'&&getBlock(p[0]+1,p[1]+1,p[2])===TNT_ID,machine);
        await guest.evaluate(p=>{camera.position.set(p[0]-2,p[1]+1.1,p[2]);controls.isLocked=true;},machine);
        await host.waitForFunction(p=>[...multiplayerRoom.positions.values()].some(pos=>Math.hypot(pos.x-p[0],pos.y-p[1],pos.z-p[2])<4),machine);
        assert(await guest.evaluate(p=>fireCannon(p,[p[0]+30,p[1]-1,p[2]],true),machine));
        await host.waitForFunction(()=>movingTNT.size===1);await guest.waitForFunction(()=>movingTNT.size===1);
        assert(await host.evaluate(p=>getBlock(p[0]+1,p[1],p[2])===TNT_ID,machine));
        await host.waitForFunction(()=>!movingTNT.size,{},{timeout:15000});await guest.waitForFunction(()=>!movingTNT.size,{},{timeout:15000});
        await guest.waitForFunction(p=>getBlock(p[0]+30,p[1]-1,p[2])===0,machine);
        assert(await guest.evaluate(p=>getBlock(p[0]+1,p[1],p[2])===TNT_ID,machine));
        console.log('PASS: Guest aimed single-shot request reaches the host; both players see the chosen impact and lower TNT stays loaded.');

        const door=[machine[0],machine[1],machine[2]+8];
        await host.evaluate(p=>{
            const [x,y,z]=p;
            for(let dx=-12;dx<=4;dx++)for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=3;dy++)setBlockNoRebuild(x+dx,y+dy,z+dz,dy===-1?3:0,rebuildQueue);
            setBlockNoRebuild(x,y,z,PISTON_ID,rebuildQueue);pistonDirections.set(p.join(','),{x:1,y:0,z:0});pistonModes.set(p.join(','),'door');
            setBlockNoRebuild(x+1,y,z,6,rebuildQueue);
            for(let dx=-10;dx<0;dx++)setBlockNoRebuild(x+dx,y,z,REDSTONE_DUST_ID,rebuildQueue);
            setBlockNoRebuild(x-11,y,z,BUTTON_ID,rebuildQueue);buttonFaces.set(`${x-11},${y},${z}`,{x:0,y:1,z:0});
        },door);
        await guest.waitForFunction(p=>pistonModes.get(p.join(','))==='door'&&pistonStates.has(p.join(','))&&getBlock(p[0]-11,p[1],p[2])===BUTTON_ID,door);
        await guest.evaluate(p=>pressMachineButton(p[0]-11,p[1],p[2]),door);
        await guest.waitForFunction(p=>!pistonStates.has(p.join(','))&&getBlock(p[0]+2,p[1],p[2])===0,door);
        await guest.waitForFunction(p=>pistonStates.has(p.join(','))&&getBlock(p[0]+2,p[1],p[2])===6&&!(buttonTimers.get(`${p[0]-11},${p[1]},${p[2]}`)||0),door);
        assert(await host.evaluate(p=>pistonStates.has(p.join(','))&&!buttonTimers.size,door));
        console.log('PASS: Guest button opens a normally-closed door through a long dust wire; the host releases the pulse and both players see it close.');

        const keypad=[door[0]-5,door[1],door[2]+1];
        await guest.waitForFunction(()=>multiplayerRoom.lockAuthenticated&&localLockIdentity);
        await guest.evaluate(p=>{creativeFlying=true;camera.position.set(p[0],p[1]+1.6,p[2]+3);},keypad);
        await host.waitForFunction(p=>[...multiplayerRoom.positions.values()].some(v=>Math.abs(v.x-p[0])<0.1&&Math.abs(v.z-p[2]-3)<0.1),keypad);
        assert((await guest.evaluate(at=>performLockAction('place',at,{face:{x:0,y:1,z:0}}),keypad)).ok);
        await guest.waitForFunction(p=>getBlock(...p)===PASSWORD_LOCK_ID&&passwordLocks.has(p.join(',')),keypad);
        const guestOwner=await guest.evaluate(()=>localLockIdentity.id);
        assert.equal(await host.evaluate(p=>passwordLocks.get(p.join(',')).owner,keypad),guestOwner);
        assert((await guest.evaluate(at=>performLockAction('set-code',at,{code:'friend door 42'}),keypad)).ok);
        assert.equal(await guest.evaluate(()=>passwordLockSecrets.size),0,'Host never broadcasts the password verifier');
        assert(!(await host.evaluate(at=>performLockAction('unlock',at,{code:'wrong'}),keypad)).ok);
        assert(!(await host.evaluate(at=>performLockAction('remove',at),keypad)).ok,'A host is not automatically the owner of a guest lock');
        await host.evaluate(p=>{setBlockNoRebuild(...p,0,rebuildQueue);},keypad);
        assert.equal(await host.evaluate(p=>getBlock(...p),keypad),148);
        const revision=await guest.evaluate(p=>{
            const r=multiplayerRoom,seq=r.seq;
            for(const e of r.connections.values())sendRoomPacket(e.conn,{type:'edit',dimension:currentDimension,cells:[{cell:[...p,0]}]});
            return seq;
        },keypad);
        await guest.waitForFunction(seq=>multiplayerRoom.seq>seq,revision);
        assert.equal(await host.evaluate(p=>getBlock(...p),keypad),148,'Even an owner cannot bypass the authenticated remove action using a raw edit');
        await host.evaluate(p=>pressMachineButton(p[0]-11,p[1],p[2]),door);
        assert.equal(await host.evaluate(p=>machinePowered(...p),door),false,'An ordinary switch cannot bypass the password');
        assert((await host.evaluate(at=>performLockAction('unlock',at,{code:'friend door 42'}),keypad)).ok);
        await guest.waitForFunction(p=>!pistonStates.has(p.join(',')),door);
        await guest.evaluate(p=>camera.position.set(p[0]+2,p[1]+1.6,p[2]),door);
        await host.waitForFunction(p=>[...multiplayerRoom.positions.values()].some(v=>Math.abs(v.x-p[0]-2)<0.1&&Math.abs(v.z-p[2])<0.1),door);
        assert(await host.evaluate(p=>{for(let i=0;i<13*60;i++)tickRedstoneMachines(1/60);return !pistonStates.has(p.join(','));},door),'Remote player keeps the passage open after password expiry');
        await guest.evaluate(p=>camera.position.set(p[0],p[1]+1.6,p[2]+3),keypad);
        await host.waitForFunction(p=>[...multiplayerRoom.positions.values()].some(v=>Math.abs(v.x-p[0])<0.1&&Math.abs(v.z-p[2]-3)<0.1),keypad);
        await host.evaluate(()=>{for(let i=0;i<10*60;i++)tickRedstoneMachines(1/60);});
        await guest.waitForFunction(p=>pistonStates.has(p.join(',')),door);
        console.log('PASS: Guest-owned password lock, host/visitor restrictions, masked verifier, rejected raw deletion, correct-code entry and remote-player anti-crush safety.');

        await guest.evaluate(()=>{controls.unlock();});await guest.waitForFunction(()=>!controls.isLocked);
        await guest.locator('#pause-room-btn').click();await guest.locator('#leave-room-btn').click();
        await host.waitForFunction(()=>Object.keys(remotePlayers).length===0);
        assert(await guest.evaluate(()=>isGameStarted&&!multiplayerRoom));
        await guest.locator('#guest-mode-btn').click();await guest.locator('#room-code-input').fill(code);await guest.locator('#join-room-btn').click();
        await guest.waitForFunction(()=>multiplayerRoom?.worldReady,{},{timeout:60000});
        assert.equal(await guest.evaluate(p=>getBlock(...p),guestCell),60);
        assert.equal(await guest.evaluate(p=>passwordLocks.get(p.join(','))?.owner,keypad),guestOwner);
        assert.equal(await guest.evaluate(()=>passwordLockSecrets.size),0,'Rejoin snapshot also excludes private verifiers');
        await guest.setViewportSize({width:390,height:844});
        await assertScenePixels(guest);
        assert(await guest.evaluate(()=>{const p=document.getElementById('multiplayer-menu'),r=p.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&p.scrollWidth<=p.clientWidth+1;}));
        await guest.screenshot({path:'/private/tmp/mc-room-mobile.png'});
        await host.evaluate(()=>leaveMultiplayerRoom());await guest.waitForFunction(()=>!multiplayerRoom);
        assert.match(await guest.locator('#multiplayer-status').textContent(),/Host disconnected/);
        assert(await guest.evaluate(()=>isGameStarted&&!document.getElementById('join-room-btn').disabled));
        assert.deepEqual(errors,[]);
        console.log('PASS: Leave/rejoin preserves world edits; host closing gives a clear message; responsive room UI and no page exceptions.');

        await host.close();await guest.close();
        const failure=await browser.newPage();failure.setDefaultNavigationTimeout(120000);await failure.addInitScript(()=>window.requestAnimationFrame=()=>0);await failure.goto(url);
        await failure.waitForFunction(()=>expansionReady);
        await failure.clock.install();
        await failure.evaluate(()=>{
            window.Peer=class {constructor(){this.callbacks={};}on(name,cb){this.callbacks[name]=cb;return this;}destroy(){this.destroyed=true;}};
            showMultiplayerMenu();createRoom();window.latePeer=multiplayerRoom.peer;
        });
        await failure.clock.fastForward(31000);
        assert(await failure.evaluate(()=>!multiplayerRoom&&!document.getElementById('create-room-btn').disabled&&document.getElementById('multiplayer-status').textContent.includes('timed out')));
        await failure.evaluate(()=>{latePeer.callbacks.open();});assert(await failure.evaluate(()=>!multiplayerRoom&&!currentRoomCode));
        await failure.evaluate(()=>{createRoom();multiplayerRoom.peer.callbacks.error({type:'network'});});
        assert.match(await failure.locator('#multiplayer-status').textContent(),/Connection failed/);
        await failure.evaluate(()=>{createRoom();hideMultiplayerMenu();});assert(await failure.evaluate(()=>!multiplayerRoom));
        assert(await failure.evaluate(()=>{
            const NativeReader=FileReader;
            window.FileReader=class {readAsText(){window.cancelledReader=this;}};
            const before=seed;
            loadSaveFile({target:{files:[new File(['{}'],'cancelled.json')]}},()=>{throw new Error('Cancelled load must not finish');},()=>false);
            cancelledReader.onload({target:{result:JSON.stringify({seed:-123})}});
            window.FileReader=NativeReader;
            return seed===before;
        }));
        await failure.evaluate(()=>{createRoom();multiplayerRoom.worldReady=true;window.resetWorld=()=>{};controls.lock=()=>{};startNewGame(true);});
        assert(await failure.evaluate(()=>!multiplayerRoom));
        console.log('PASS: Connection timeout, signaling failure, cancellation and stale callbacks all recover with clickable buttons.');
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
