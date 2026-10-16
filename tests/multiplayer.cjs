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
            page.on('pageerror',e=>errors.push(e.message));
            await page.goto(url);await page.waitForFunction(()=>expansionReady);
        }
        await host.getByRole('button',{name:'Creative',exact:true}).click();
        await host.getByRole('button',{name:'Moon',exact:true}).click();
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

        const cell=await host.evaluate(()=>{
            const p=[Math.round(camera.position.x)+4,Math.round(camera.position.y)+2,Math.round(camera.position.z)];
            setBlock(...p,59);return p;
        });
        await guest.waitForFunction(p=>getBlock(...p)===59,cell);
        const guestCell=[cell[0]+1,cell[1],cell[2]];
        await guest.evaluate(p=>setBlock(...p,60),guestCell);await host.waitForFunction(p=>getBlock(...p)===60,guestCell);
        await guest.evaluate(p=>mineBlock(new THREE.Vector3(...p),false),cell);await host.waitForFunction(p=>getBlock(...p)===0,cell);
        const furniture=[cell[0]+3,cell[1],cell[2]];
        assert(await host.evaluate(p=>placeFurniture(SHOWER_DOOR_ID,...p),furniture));
        await guest.waitForFunction(p=>getBlock(...p)===SHOWER_DOOR_ID&&getBlock(p[0],p[1]+1,p[2])===FRIDGE_TOP_ID&&!!furnitureRecord(...p),furniture);
        assert.equal(await host.evaluate(p=>furnitureRecord(...p).data.yaw,furniture),await guest.evaluate(p=>furnitureRecord(...p).data.yaw,furniture));
        console.log('PASS: Bidirectional placement/mining and complete two-block furniture synchronization.');

        await host.evaluate(()=>{controls.unlock();});await host.waitForFunction(()=>!controls.isLocked);
        await host.getByRole('button',{name:'Resume Game',exact:true}).click();
        const start=await host.evaluate(()=>camera.position.toArray());
        await host.keyboard.down('KeyW');await host.waitForTimeout(600);await host.keyboard.up('KeyW');
        const end=await host.evaluate(()=>camera.position.toArray());assert(Math.hypot(start[0]-end[0],start[2]-end[2])>0.1);
        await guest.waitForFunction(p=>Object.values(remotePlayers).some(m=>Math.hypot(m.position.x-p[0],m.position.z-p[2])<0.3),end);
        await guest.evaluate(()=>{const p=Object.values(remotePlayers)[0];camera.lookAt(p.position.clone().add(new THREE.Vector3(0,0.4,0)));});
        await assertScenePixels(guest);
        await guest.screenshot({path:'/private/tmp/mc-room-two-players.png'});
        console.log('PASS: Actual W movement arrives on the other player screen.');

        await guest.evaluate(()=>{controls.unlock();});await guest.waitForFunction(()=>!controls.isLocked);
        await guest.locator('#pause-room-btn').click();await guest.locator('#leave-room-btn').click();
        await host.waitForFunction(()=>Object.keys(remotePlayers).length===0);
        assert(await guest.evaluate(()=>isGameStarted&&!multiplayerRoom));
        await guest.locator('#guest-mode-btn').click();await guest.locator('#room-code-input').fill(code);await guest.locator('#join-room-btn').click();
        await guest.waitForFunction(()=>multiplayerRoom?.worldReady,{},{timeout:60000});
        assert.equal(await guest.evaluate(p=>getBlock(...p),guestCell),60);
        await guest.setViewportSize({width:390,height:844});
        await assertScenePixels(guest);
        assert(await guest.evaluate(()=>{const p=document.getElementById('multiplayer-menu'),r=p.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&p.scrollWidth<=p.clientWidth+1;}));
        await guest.screenshot({path:'/private/tmp/mc-room-mobile.png'});
        await host.evaluate(()=>leaveMultiplayerRoom());await guest.waitForFunction(()=>!multiplayerRoom);
        assert.match(await guest.locator('#multiplayer-status').textContent(),/Host disconnected/);
        assert(await guest.evaluate(()=>isGameStarted&&!document.getElementById('join-room-btn').disabled));
        assert.deepEqual(errors,[]);
        console.log('PASS: Leave/rejoin preserves world edits; host closing gives a clear message; responsive room UI and no page exceptions.');

        const failure=await browser.newPage();await failure.addInitScript(()=>window.requestAnimationFrame=()=>0);await failure.goto(url);
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
