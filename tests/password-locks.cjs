const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

(async()=>{
    const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try {
        const context=await browser.newContext(),page=await context.newPage(),errors=[];
        await page.setViewportSize({width:1280,height:800});page.on('pageerror',e=>errors.push(e.message));
        await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
        const url=process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href;
        await page.goto(url);await page.waitForFunction(()=>expansionReady&&localLockIdentity);
        console.log(await page.evaluate(async()=>{
            window.lockReset=()=>{
                clearExpansionWorld();clearMech();resetPlayerFlight();worldMap.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();heightCache.clear();
                for(const meshes of chunkMeshes.values())for(const mesh of Object.values(meshes))scene.remove(mesh);chunkMeshes.clear();rebuildQueue.clear();chunkQueue.length=0;
                for(const list of [villagers,zombies,creepers,animals,endermen]){for(const m of list)disposeModModel(m.mesh);list.length=0;}
                selectedTerrain='moon';currentDimension='overworld';getSurfaceHeight=()=>-10;gameMode='creative';isGameStarted=true;playerScale=1;
                camera.position.set(0,2.1,6);camera.lookAt(0,1,0);camera.updateMatrixWorld(true);controls.isLocked=true;
                blocker.style.display='none';inventoryUI.style.display='none';document.getElementById('home-panel').hidden=true;
                for(let x=-15;x<=15;x++)for(let z=-8;z<=8;z++)worldMap.set(`${x},0,${z}`,3);
                scene.background.setHex(0xb9dae9);scene.fog=null;
            };
            window.lockPut=(...p)=>setBlockNoRebuild(...p,rebuildQueue);
            window.lockTicks=seconds=>{for(let i=0;i<Math.ceil(seconds*60);i++)tickRedstoneMachines(1/60);};
            window.lockGate=()=>{
                lockPut(0,1,0,PISTON_ID);pistonDirections.set('0,1,0',{x:1,y:0,z:0});pistonModes.set('0,1,0','door');
                lockPut(1,1,0,6);for(let x=-1;x>=-5;x--)lockPut(x,1,0,REDSTONE_DUST_ID);
                lockPut(-6,1,0,BUTTON_ID);lockPut(-7,1,0,30);
            };
            const checks=[],check=(v,n)=>{if(!v)throw Error(n);checks.push(n);};
            lockReset();lockGate();lockTicks(0.3);check(pistonStates.has('0,1,0'),'Door starts closed');
            pressMachineButton(-6,1,0);lockTicks(1.5);check(!pistonStates.size,'Door stays open after the one-second button pulse');
            lockTicks(5);check(!pistonStates.size,'Door is still open six seconds after opening');
            camera.position.set(2,2.1,0);lockTicks(15);check(!pistonStates.size&&getBlock(2,1,0)===0,'Standing in the passage cannot be crushed or trapped by closure');
            camera.position.set(2,2.1,1);lockTicks(10);check(!pistonStates.size,'Standing just outside the door plane is inside its safety margin');
            camera.position.set(0,2.1,6);lockTicks(9);check(pistonStates.has('0,1,0'),'Door closes after the player clears the passage');
            lockPut(-7,1,0,31);lockTicks(20);check(!pistonStates.size,'An enabled lever holds the door open indefinitely');
            lockPut(-7,1,0,30);lockTicks(2);const safety=saveRedstoneMachines();restoreRedstoneMachines(safety);lockTicks(3);
            check(!pistonStates.size,'Save/load preserves the remaining door delay');lockTicks(5);
            check(pistonStates.size===1,'Restored safe door closes normally');

            lockReset();lockGate();const owner=localLockIdentity.id,other='a'.repeat(64),at=[-5,1,1];
            check((await performLockAction('place',at,{face:{x:0,y:1,z:0}})).ok,'A lock can be placed on a surface next to dust');
            const record=passwordLocks.get(at.join(','));check(record.owner===owner&&!record.configured,'The placer owns the unconfigured lock');
            lockPut(-7,1,0,31);lockTicks(0.4);check(!machinePowered(0,1,0)&&pistonStates.has('0,1,0'),'A new lock fails closed and blocks lever bypass');
            pressMachineButton(-6,1,0);lockTicks(0.3);check(!machinePowered(0,1,0),'A nearby button cannot bypass a locked circuit');
            check(!(await executeLockAction(other,'set-code',at,{code:'stolen'})).ok,'Another player cannot configure or change the code');
            check((await performLockAction('set-code',at,{code:'my secret 123'})).ok,'The owner can set a custom code');
            const saved=saveRedstoneMachines();check(!JSON.stringify(saved).includes('my secret 123'),'No plaintext password in saved data');
            const publicSave=JSON.stringify(getWorldSaveData(),(key,value)=>key==='lockSecrets'?undefined:value);
            check(!publicSave.includes(passwordLockSecrets.get(at.join(',')).hash)&&!publicSave.includes(localLockIdentity.token),'Room snapshots exclude password verifiers and ownership tokens');
            check(!(await executeLockAction(other,'unlock',at,{code:'wrong'})).ok&&!machinePowered(0,1,0),'Wrong code does not open the circuit');
            check((await executeLockAction(other,'unlock',at,{code:'my secret 123'})).ok,'A visitor with the correct code can unlock');
            lockTicks(0.3);check(machinePowered(0,1,0)&&!pistonStates.size,'Correct password retracts the connected door');
            camera.position.set(2,2.1,0);lockTicks(12);check(!pistonStates.size,'Password expiry cannot close a door on its user');
            camera.position.set(0,2.1,6);lockTicks(10);check(pistonStates.size===1,'Password door relocks after safe passage');
            check(!(await executeLockAction(other,'remove',at)).ok,'A visitor cannot remove the lock');
            setBlockNoRebuild(...at,0,rebuildQueue);check(getBlock(...at)===PASSWORD_LOCK_ID,'Generic edits, explosions and commands cannot delete a lock');
            setGenBlock(...at,3);check(getBlock(...at)===PASSWORD_LOCK_ID,'Procedural building generation cannot overwrite a lock');
            setFineVoxel({x:at[0],y:at[1],z:at[2],mx:0,my:0,mz:0,level:2},0);
            check(!fineVoxelEdits.size,'Tiny mining cannot dismantle a protected keypad');
            lockPut(-5,0,1,0);lockTicks(0.3);check(getBlock(...at)===PASSWORD_LOCK_ID,'Removing support does not drop a protected lock');
            check(!canEditPasswordCircuit(-2,1,0,other,0)&&!canEditPasswordCircuit(0,1,0,other,PISTON_ID),'Guests cannot cut the secured wire or change piston mode');
            check(canEditPasswordCircuit(-2,1,0,owner,0),'The owner can edit their circuit');
            lockEditActor=other;lockPut(-2,0,0,0);const drops=droppedItems.length;lockTicks(0.5);
            check(droppedItems.length===drops,'Rejected removal of a protected unsupported wire cannot duplicate drops');lockEditActor=null;lockPut(-2,0,0,3);
            restoreRedstoneMachines(saved);check(passwordLocks.get(at.join(',')).owner===owner&&(await executeLockAction(other,'unlock',at,{code:'my secret 123'})).ok,'Lock owner and hashed password survive save/load');
            for(let i=0;i<5;i++)await executeLockAction(other,'unlock',at,{code:'bad'});
            check(!(await executeLockAction(other,'unlock',at,{code:'my secret 123'})).ok,'Repeated wrong guesses temporarily block further attempts');
            check((await performLockAction('set-code',at,{code:'new code'})).ok,'The owner can reset a forgotten code');
            check((await performLockAction('unlock',at,{code:'new code'})).ok,'The changed code works');
            const secondKey='-4,1,1';passwordLocks.set(secondKey,{owner:other,id:lockRandom(),configured:true,remaining:1,face:{x:0,y:1,z:0}});
            record.remaining=0;passwordLocks.get(at.join(',')).remaining=0;
            check(!passwordCircuitOpen(new Set([at.join(','),secondKey])),'Adding another owner keypad cannot bypass the original locked owner');passwordLocks.delete(secondKey);
            check((await performLockAction('remove',at)).ok&&getBlock(...at)===0&&!passwordLocks.size,'Only the authenticated owner removal deletes the lock');
            check(getInventorySlotMapping()[136]===PASSWORD_LOCK_ID&&recipes.some(r=>r.out===PASSWORD_LOCK_ID),'Lock is in the inventory and has a Survival recipe');
            return `${checks.length} door safety, password, ownership and persistence checks passed.`;
        }));
        const identity=await page.evaluate(()=>localLockIdentity.id);
        await page.reload();await page.waitForFunction(()=>expansionReady&&localLockIdentity);
        assert.equal(await page.evaluate(()=>localLockIdentity.id),identity,'Ownership persists across reloads');
        await page.evaluate(()=>{
            gameMode='creative';isGameStarted=true;selectedTerrain='moon';getSurfaceHeight=()=>-10;controls.isLocked=true;
            camera.position.set(0,2,4);camera.lookAt(0,1,0);camera.updateMatrixWorld(true);blocker.style.display='none';
            setBlockNoRebuild(0,1,0,3,rebuildQueue);currentBlock=PASSWORD_LOCK_ID;
        });
        await page.mouse.click(640,400,{button:'right'});
        await page.getByLabel('New code',{exact:true}).fill('ui secret');await page.getByRole('button',{name:'Set Code',exact:true}).click();
        await page.getByRole('status').filter({hasText:'Code saved.'}).waitFor();
        await page.getByLabel('Code',{exact:true}).fill('wrong');await page.getByRole('button',{name:'Unlock',exact:true}).click();
        await page.getByRole('status').filter({hasText:'Incorrect code.'}).waitFor();
        await page.getByLabel('Code',{exact:true}).fill('ui secret');await page.getByRole('button',{name:'Unlock',exact:true}).click();
        await page.waitForFunction(()=>document.getElementById('home-panel').hidden&&[...passwordLocks.values()].some(r=>r.remaining>0),null,{polling:100});
        await page.evaluate(()=>openPasswordLockPanel(...[...passwordLocks.keys()][0].split(',').map(Number)));
        await page.evaluate(()=>{
            tickRedstoneMachines(0.1);
            for(const key of rebuildQueue){const [x,z]=key.split(',').map(Number);buildChunkMesh(x,z);}rebuildQueue.clear();
            camera.position.set(2,3,5);camera.lookAt(0,1,1);camera.updateMatrixWorld(true);
        });
        for(const [width,height,label] of [[1280,800,'desktop'],[390,844,'mobile']]) {
            await page.setViewportSize({width,height});
            assert(await page.evaluate(()=>{
                renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.render(scene,camera);
                const gl=renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4),colors=new Set();
                gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
                for(let i=0;i<pixels.length;i+=64)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
                return colors.size>8&&[...circuitVisuals.keys()].some(key=>passwordLocks.has(key));
            }),'The placed keypad has a visible 3D model');
            assert(await page.locator('#home-panel .world-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.getBoundingClientRect().width<=innerWidth));
            await page.screenshot({path:`/private/tmp/mc-password-lock-${label}.png`});
            await page.evaluate(()=>document.getElementById('home-panel').hidden=true);
            await page.screenshot({path:`/private/tmp/mc-password-keypad-${label}.png`});
            await page.evaluate(()=>document.getElementById('home-panel').hidden=false);
        }
        await page.getByRole('button',{name:'Remove Lock',exact:true}).click();await page.waitForFunction(()=>passwordLocks.size===0,null,{polling:100});
        assert.deepEqual(errors,[]);
        console.log('PASS: Persistent browser owner, actual right-click lock placement, masked code input, set/unlock/error/remove controls, desktop/mobile panel screenshots.');
    } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
