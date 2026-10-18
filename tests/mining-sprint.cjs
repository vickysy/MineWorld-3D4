const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
    const browser = await chromium.launch({headless:true,
        ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
    try {
        const errors = [];
        const page = await browser.newPage({viewport:{width:1280,height:800}});
        page.on('pageerror', e => errors.push(e.message));
        await page.addInitScript(() => {window.requestAnimationFrame = () => 0;});
        await page.goto(process.env.GAME_URL || pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await page.waitForFunction(() => typeof startMiningBlock === 'function' && expansionReady);
        await page.evaluate(() => {
            window.testKey = (code, type='keydown', target=document, repeat=false) =>
                target.dispatchEvent(new KeyboardEvent(type,{code,repeat,bubbles:true,cancelable:true}));
            window.testTick = (count=60) => {for(let i=0;i<count;i++) updatePlayerMovement(1/60);};
            window.prepareMiningSprint = () => {
                cancelMining();clearExpansionWorld();clearMech();resetPlayerFlight();
                worldMap.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();heightCache.clear();
                restoreMicroEdits([]);restoreFineVoxelEdits([]);rebuildQueue.clear();chunkQueue.length=0;
                for(const meshes of chunkMeshes.values()) for(const mesh of Object.values(meshes)) {
                    scene.remove(mesh);if(mesh.geometry!==boxGeo) mesh.geometry.dispose();
                }
                chunkMeshes.clear();
                for(const list of [villagers,zombies,creepers,animals,endermen]) {
                    for(const mob of list) disposeModModel(mob.mesh);list.length=0;
                }
                for(const p of explosionParticles) {scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();}
                explosionParticles.length=0;
                for(const d of droppedItems) {scene.remove(d.mesh);d.mesh.geometry.dispose();disposeBlockMaterial(d.material);}
                droppedItems.length=0;
                selectedTerrain='moon';currentDimension='overworld';getSurfaceHeight=()=>-4;
                for(let x=-10;x<=10;x++) for(let z=-25;z<=10;z++) worldMap.set(`${x},0,${z}`,3);
                isGameStarted=true;gameMode='creative';controls.isLocked=true;playerScale=1;playerTired=false;
                camera.position.set(0,1,4);camera.rotation.set(0,0,0);camera.updateMatrixWorld(true);
                currentBlock=2;isInventoryOpen=false;blocker.style.display='none';inventoryUI.style.display='none';
                document.getElementById('home-panel').hidden=true;
                document.getElementById('command-panel').hidden=true;
                heldItemGroup.visible=false;scene.background.setHex(0xb9dae9);scene.fog=null;
            };
            prepareMiningSprint();setBlock(0,1,0,3);setBlock(0,1,-1,4);
            buildChunkMesh(0,0);buildChunkMesh(0,-1);
            rebuildQueue.clear();rebuildQueue.add('20,20');
        });
        await page.mouse.click(640,400);
        assert(await page.evaluate(() => getBlock(0,1,0)===0 && getBlock(0,1,-1)===4 && miningState===null),
            'A short Creative click immediately removes exactly the aimed block');
        assert(await page.evaluate(()=>rebuildQueue.values().next().value==='0,0'),
            'Mined geometry rebuilds before an unrelated terrain backlog');
        assert(await page.evaluate(() => explosionParticles.length===7 && explosionParticles.every(p =>
            p.debrisRadius>0 && p.mesh.material.color.getHex()===getBlockParticleColor(3)) && droppedItems.length===1),
            'Fast mining retains seven same-color chips and one collectible cube');
        const airborne = await page.evaluate(() => explosionParticles.map(p=>p.mesh.position.toArray()));
        await page.evaluate(() => {for(let i=0;i<45;i++) updateExplosionParticles(1/60);});
        const settled = await page.evaluate(() => explosionParticles.map(p=>({position:p.mesh.position.toArray(),r:p.debrisRadius,vy:p.velocity.y})));
        assert.equal(settled.length,7);
        assert(settled.every(p=>Math.abs(p.position[1]-0.5-p.r)<1e-6 && p.vy===0),'Chips settle on top of the floor');
        assert(settled.some((p,i)=>Math.hypot(p.position[0]-airborne[i][0],p.position[2]-airborne[i][2])>0.1),
            'Chips scatter outward before settling');
        await page.evaluate(() => {for(let i=0;i<80;i++) updateExplosionParticles(1/60);});
        assert(await page.evaluate(() => explosionParticles.length===0 && droppedItems.length===1),
            'Decorative chips expire, while the collectible remains');
        await page.evaluate(() => {camera.position.set(0,2.1,0);window.beforePickup=playerInventory[3]||0;updateDroppedItems(1/60);});
        assert(await page.evaluate(() => droppedItems.length===0 && playerInventory[3]===window.beforePickup+1),
            'Walking near the small dropped cube still collects it');
        console.log('PASS: Actual short click, instant Creative removal, seven matching chips, ground collision, cleanup and pickup.');

        console.log(await page.evaluate(() => {
            const checks=[],check=(v,n)=>{if(!v)throw new Error(n);checks.push(n);};
            prepareMiningSprint();
            for(const type of [1,2,3,4,5,6,8,23,36,37,38,44,132,133,134]) {
                check(getMiningDuration(type,2)===0,`Creative ignores hardness for ${type}`);
                setBlock(0,1,0,type);startMiningBlock(new THREE.Vector3(0,1,0),false,new THREE.Vector3(0,0,1));
                check(getBlock(0,1,0)===0 && miningState===null,`Creative immediately mines ${type}`);
            }
            gameMode='survival';
            for(const [type,tool,time] of [[1,2,0.75],[2,2,0.55],[3,2,1.35],[3,34,0.65],[4,2,0.9],[6,2,0.35],[5,2,0.05]])
                check(getMiningDuration(type,tool)===time,`Survival duration preserved for ${type}/${tool}`);
            setBlock(0,1,0,3);startMiningBlock(new THREE.Vector3(0,1,0),false,new THREE.Vector3(0,0,1));
            updateMining(0.2);
            check(getBlock(0,1,0)===3 && miningState.progress>0 && miningState.crackMesh,'Survival still develops cracks');
            document.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));updateMining(2);
            check(getBlock(0,1,0)===3 && miningState===null,'Releasing Survival click cancels mining');
            startMiningBlock(new THREE.Vector3(0,1,0),false);updateMining(1.4);
            check(getBlock(0,1,0)===0 && miningState===null,'Completed Survival mining still works');
            setBlock(0,1,0,3);startMiningBlock(new THREE.Vector3(0,1,0),false);
            gameMode='creative';setBlock(1,1,0,4);startMiningBlock(new THREE.Vector3(1,1,0),false);updateMining(2);
            check(getBlock(0,1,0)===3 && getBlock(1,1,0)===0 && miningState===null,'Instant mining cancels an older timer');
            for(const scale of [0.05,0.005,0.0005,0.00005,0.000005,0.0000005]) {
                prepareMiningSprint();playerScale=scale;setBlock(0,1,0,3);
                const hit={...microCellAt(0,1,0),type:3};
                check(mineMicroBlock(hit) && getMicroType(hit)===0 && getMicroType(offsetMicroCell(hit,1,0,0))===3 && getBlock(0,1,0)===3,
                    `Only one micro-cell is mined at scale ${scale}`);
            }
            prepareMiningSprint();
            spawnExplosionParticles(0,2,0,1);const smoke=explosionParticles[0],v=smoke.velocity.y;
            updateExplosionParticles(0.1);
            check(!smoke.debrisRadius && Math.abs(smoke.velocity.y-(v-0.22))<1e-9,'TNT smoke retains its separate light-gravity animation');
            return `${checks.length} mining checks passed.`;
        }));

        console.log(await page.evaluate(() => {
            const checks=[],check=(v,n)=>{if(!v)throw new Error(n);checks.push(n);};
            prepareMiningSprint();
            const walk=(scale,shift,diagonal=false,tired=false,mode='creative')=>{
                resetPlayerFlight();playerScale=scale;playerTired=tired;gameMode=mode;controls.isLocked=true;
                camera.position.set(0,0.5+getPlayerHeight()+scale*0.00002,4);camera.rotation.set(0,0,0);camera.updateMatrixWorld(true);
                if(shift)testKey(shift);testKey('KeyW');if(diagonal)testKey('KeyD');
                const start=camera.position.clone();testTick(90);
                return Math.hypot(camera.position.x-start.x,camera.position.z-start.z);
            };
            for(const scale of [1,0.05,0.005,0.0005,0.00005,0.000005,0.0000005]) {
                for(const mode of ['creative','survival']) {
                    const normal=walk(scale,null,false,false,mode),fast=walk(scale,'ShiftLeft',false,false,mode);
                    check(normal>scale*5 && Math.abs(fast/normal-1.6)<0.001,`Shift is 1.6x walking at ${scale} in ${mode}`);
                    testKey('ShiftLeft','keyup');testTick(1);
                    check(Math.hypot(velocity.x,velocity.z)<=MAX_WALK_SPEED*scale+1e-10,`Release restores normal speed at ${scale} in ${mode}`);
                }
            }
            const fast=walk(1,'ShiftLeft'),right=walk(1,'ShiftRight'),diagonal=walk(1,'ShiftLeft',true);
            check(Math.abs(fast-right)<1e-8,'Both Shift keys work');
            check(Math.abs(diagonal-fast)<1e-8,'Diagonal sprint is not faster than straight sprint');
            check(Math.abs(walk(1,'ShiftLeft',false,true)/fast-TIRED_WALK_MULTIPLIER)<1e-8,'Tiredness still applies');
            resetPlayerFlight();testKey('KeyX');check(sprintKeys.size===0,'X does not enable sprint');
            testKey('ShiftLeft');testKey('ShiftRight');testKey('ShiftLeft','keyup');
            check(sprintKeys.size===1 && sprintKeys.has('ShiftRight'),'Releasing one Shift keeps the other held');
            testKey('ShiftRight','keydown',document,true);testKey('ShiftRight','keyup');
            check(sprintKeys.size===0,'Keyboard repeat cannot leave sprint stuck');
            testKey('ShiftLeft');window.dispatchEvent(new Event('blur'));
            check(sprintKeys.size===0 && velocity.length()===0,'Window blur clears sprint');
            testKey('ShiftLeft');controls.dispatchEvent({type:'unlock'});
            check(sprintKeys.size===0,'Opening the pause menu clears sprint');
            controls.isLocked=false;testKey('ShiftLeft');check(sprintKeys.size===0,'Menus cannot start sprint');
            controls.isLocked=true;
            const input=document.createElement('input');document.body.appendChild(input);
            testKey('ShiftLeft','keydown',input);check(sprintKeys.size===0,'Typing Shift in a field does not sprint');
            testKey('ShiftLeft');testKey('ShiftLeft','keyup',input);input.remove();
            check(sprintKeys.size===0,'Key release still clears sprint after focus changes');

            for(const scale of [1,0.05,0.005]) {
                prepareMiningSprint();playerScale=scale;
                for(let x=-2;x<=2;x++)for(let y=1;y<=4;y++)worldMap.set(`${x},${y},0`,3);
                camera.position.set(0,0.5+getPlayerHeight()+scale*0.00002,0.5+2*scale);
                testKey('ShiftLeft');testKey('KeyW');testTick(90);
                check(camera.position.z>=0.5+getPlayerRadius()-0.001*scale,`Sprinting cannot cross a wall at ${scale}`);
            }
            for(const environment of ['flight','water','lava','ladder']) {
                const run=shift=>{
                    prepareMiningSprint();camera.position.set(0,2.1,3);creativeFlying=environment==='flight';
                    const type={water:24,lava:LAVA_ID,ladder:7}[environment];
                    if(type)for(let x=-2;x<=2;x++)for(let y=1;y<=6;y++)for(let z=-10;z<=5;z++)worldMap.set(`${x},${y},${z}`,type);
                    if(shift)testKey('ShiftLeft');testKey('KeyW');testTick(20);
                    return camera.position.toArray();
                };
                const normal=run(false),shift=run(true);
                check(normal.every((v,i)=>Math.abs(v-shift[i])<1e-10),`Shift does not alter ${environment} movement`);
            }
            return `${checks.length} sprint checks passed.`;
        }));

        await page.evaluate(() => {
            prepareMiningSprint();camera.position.set(0,2.1,4);camera.updateMatrixWorld(true);
        });
        await page.keyboard.down('ShiftLeft');await page.keyboard.down('w');
        await page.evaluate(() => testTick(90));
        assert(await page.evaluate(() => sprintKeys.has('ShiftLeft') && camera.position.z < -6 && Math.abs(velocity.z)>7.5));
        await page.keyboard.up('ShiftLeft');await page.evaluate(() => testTick(1));
        assert(await page.evaluate(() => sprintKeys.size===0 && Math.abs(velocity.z)<=MAX_WALK_SPEED));
        await page.keyboard.up('w');
        console.log('PASS: Actual Shift+W keyboard input speeds up and releasing Shift restores walking.');

        await page.evaluate(() => {
            prepareMiningSprint();setBlock(0,1,0,3);setBlock(1,1,0,4);setBlock(-1,1,0,2);
            startMiningBlock(new THREE.Vector3(0,1,0),false);updateExplosionParticles(0.08);
            for(let x=-1;x<=0;x++)for(let z=-1;z<=0;z++)buildChunkMesh(x,z);
            camera.position.set(2.8,2.4,4.5);camera.lookAt(0,0.8,0);camera.updateMatrixWorld(true);
        });
        for(const [width,height,label] of [[1280,800,'desktop'],[390,844,'mobile']]) {
            await page.setViewportSize({width,height});
            assert(await page.evaluate(() => {
                renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
                renderer.render(scene,camera);
                const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,pixels=new Uint8Array(w*h*4),colors=new Set();
                gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
                for(let i=0;i<pixels.length;i+=64)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
                return colors.size>30 && renderer.info.render.triangles>100 && explosionParticles.every(p=>p.mesh.parent===scene);
            }),'Actual terrain, fragment and drop scene renders rather than a blank canvas');
            await page.screenshot({path:`/private/tmp/mc-fast-mining-${label}.png`});
        }
        assert.deepEqual(errors,[]);
        console.log('PASS: Desktop/mobile canvas pixels, debris screenshots, no browser errors.');
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
