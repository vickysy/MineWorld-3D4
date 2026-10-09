const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
    const browser = await chromium.launch({headless: true,
        ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {})});
    try {
        const errors=[];
        if (!process.env.LIVE_ONLY) {
        const page = await browser.newPage({viewport: {width:1280,height:800}});
        page.on('pageerror',e=>errors.push(e.message));
        page.on('console',m=>{if(m.type()==='error' && /shader|program/i.test(m.text())) errors.push(m.text());});
        await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
        await page.goto(pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await page.waitForFunction(()=>typeof useSpawnEgg==='function');
        const result=await page.evaluate(()=>{
            const passed=[];
            const check=(value,name)=>{if(!value) throw new Error(name);passed.push(name);};
            const close=(a,b)=>Math.abs(a-b)<0.0001;
            selectedTerrain='moon';getSurfaceHeight=()=>0;currentDimension='overworld';
            worldMap.clear();heightCache.clear();restoreMicroEdits([]);
            for(let x=-18;x<=18;x++) for(let z=-18;z<=18;z++) worldMap.set(`${x},0,${z}`,3);
            for(const meshes of chunkMeshes.values()) for(const mesh of Object.values(meshes)) scene.remove(mesh);
            chunkMeshes.clear();
            for(let x=-1;x<=0;x++) for(let z=-1;z<=0;z++) buildChunkMesh(x,z);
            isGameStarted=true;gameMode='survival';playerScale=1;camera.position.set(0,2.1,5);
            controls.isLocked=false;
            summonModPack('mobs');summonModPack('mechs');
            check(playerInventory[67]===8 && playerInventory[70]===1 && playerInventory[71]===1,'Both mod packs grant their inventory items');
            check(document.getElementById('tab-mods').style.display==='flex','Summoning opens the Mods inventory');
            check([...document.querySelectorAll('[data-mod-icon]')].every(i=>i.src.startsWith('data:image/png')),'All five mod items have visual icons');
            controls.isLocked=true;
            for(const [id,x] of [[67,-3],[68,0],[69,3]]) {
                camera.lookAt(x,0.5,0);camera.updateMatrixWorld(true);
                selectSlot(id-12);
                document.dispatchEvent(new MouseEvent('mousedown',{button:2}));
                check(playerInventory[id]===7,`Right-click consumes one egg ${id}`);
            }
            check(villagers.length===1 && creepers.length===1 && zombies.length===1,'All three egg types spawn the correct mob');
            check(creepers[0].mesh.children.length>=10,'Creeper has a face, body and four feet');
            const before=playerInventory[67];
            camera.lookAt(0,9,0);camera.updateMatrixWorld(true);
            check(!useSpawnEgg(67) && playerInventory[67]===before,'Aiming at sky does not consume an egg');
            worldMap.set('7,1,0',24);camera.position.set(7,2.1,4);camera.lookAt(7,0.5,0);camera.updateMatrixWorld(true);
            check(!useSpawnEgg(67) && playerInventory[67]===before,'Cannot spawn inside water');worldMap.delete('7,1,0');
            worldMap.set('7,2,0',3);
            check(!useSpawnEgg(67),'Cannot spawn under a low ceiling');worldMap.delete('7,2,0');
            camera.position.set(7,2.1,0);camera.lookAt(7,0,0);camera.updateMatrixWorld(true);
            check(!useSpawnEgg(67),'Cannot spawn a mob overlapping the player');

            camera.position.set(8,2.03,8);camera.lookAt(8,2.03,0);camera.updateMatrixWorld(true);
            selectSlot(58);document.dispatchEvent(new MouseEvent('mousedown',{button:2}));
            check(activeMech && activeMech.id===70 && playerScale===2,'Core right-click transforms the player into Prime');
            check(close(camera.position.y-getPlayerHeight(),0.5),'Transformation corrects the old normal-player floor tolerance');
            check(playerInventory[70]===1,'Mech cores are reusable');
            const combatTarget=spawnMobFromEgg(69,8,1,4);
            delete combatTarget.eggId;combatTarget.friendly=false;combatTarget.hp=6;
            camera.lookAt(8,1,4);camera.updateMatrixWorld(true);
            check(mechAttack() && combatTarget.hp===6,'Robot fires a projectile instead of instant damage');
            check(!mechAttack(),'Robot attack cooldown prevents instant repeated hits');
            for(let i=0;i<10;i++) updateCombatEffects(0.03);
            check(combatTarget.hp===3,'Hand cannon damages the targeted mob on impact');
            mechAttackTime=-Infinity;worldMap.set('8,2,6',3);
            mechAttack();for(let i=0;i<10;i++) updateCombatEffects(0.03);
            check(combatTarget.hp===3,'Robot attack cannot pass through a wall');worldMap.delete('8,2,6');
            scene.remove(combatTarget.mesh);zombies.splice(zombies.indexOf(combatTarget),1);
            camera.lookAt(8,camera.position.y,0);camera.updateMatrixWorld(true);
            const physicsPosition=camera.position.clone();
            for(let i=0;i<20;i++) updateMechView(1/60);
            check(camera.position.equals(physicsPosition),'Third-person rendering never moves the physics camera');
            check(mechCamera.position.distanceTo(camera.position)>3 && !heldItemGroup.visible,'Chase camera is separate and held item is hidden');
            worldMap.set('8,4,10',3);updateMechView(0);
            check(mechCamera.position.distanceTo(camera.position)<2,'Chase camera pulls forward when a wall is behind the player');
            worldMap.delete('8,4,10');updateMechView(0);
            check(mechVisual.children.length>30,'Robot has detailed articulated panels and wheels');
            check(!drinkShrinkPotion() && playerScale===2,'Potions cannot corrupt an active mech collider');
            moveTinyAxis('y',-0.01);
            document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyR'}));
            check(activeMech.form==='vehicle' && close(playerScale,0.9),'R changes the robot into its truck form');
            check(!checkScaledCollision(camera.position),'Shrinking the mech preserves a valid resting floor contact');
            for(let i=0;i<60;i++) updateMechView(1/60);
            check(mechBlend===1,'Transformation completes with folded panel geometry');
            check(close(camera.position.y-getPlayerHeight(),0.5),'Vehicle transformation preserves feet');
            const vehiclePos=camera.position.clone();
            worldMap.set('8,3,8',3);
            check(!transformMech() && activeMech.form==='vehicle' && camera.position.equals(vehiclePos),'Cannot unfold a robot through a low ceiling');
            worldMap.delete('8,3,8');
            for(let y=1;y<=5;y++) for(let z=5;z<=11;z++) worldMap.set(`11,${y},${z}`,3);
            moveTinyAxis('x',5);
            check(camera.position.x<=8.951 && !checkScaledCollision(camera.position),'Wide vehicle cannot pass through walls at speed');
            camera.position.copy(vehiclePos);
            document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyX'}));
            check(!activeMech && !mechVisual && playerScale===1 && heldItemGroup.visible,'X exits the mech and restores player size');

            camera.position.set(-8,2.1,8);drinkShrinkPotion();drinkShrinkPotion();
            const tinyScale=playerScale;
            check(enterMech(71),'A tiny player can become the scout in open space');
            check(transformMech() && close(playerScale,0.65),'Scout has its own compact car collider');
            check(exitMech() && close(playerScale,tinyScale),'Exiting restores the exact previous potion size');
            drinkGrowPotion();drinkGrowPotion();
            worldMap.set('-8,3,8',3);
            check(!enterMech(70) && !activeMech && playerScale===1,'Entering a robot under a low ceiling fails safely');
            worldMap.delete('-8,3,8');

            gameMode='creative';camera.position.set(-8,2.1,8);enterMech(71);transformMech();
            camera.lookAt(-8,camera.position.y,0);camera.updateMatrixWorld(true);
            const start=camera.position.clone();
            moveForward=true;moveBackward=moveLeft=moveRight=false;
            // Isolate physics from terrain scheduling; use the real main-loop controls and collisions.
            const originalUpdateChunks=updateChunks;updateChunks=()=>{};
            for(let i=0;i<60;i++) {prevTime=performance.now()-20;animate();}
            moveForward=false;updateChunks=originalUpdateChunks;
            check(camera.position.z<start.z-5,'W drives the vehicle through the real frame loop');
            check(Math.abs(camera.position.y-getPlayerHeight()-0.5)<0.002,'Driving stays on solid ground instead of flying');
            check(zombies.some(m=>m.eggId===69) && creepers.some(m=>m.eggId===68),'Egg mobs remain in the running world');
            selectedTerrain='plains';dayTime=Math.PI/2;isGameStarted=false;controls.isLocked=false;animate();
            check(zombies.some(m=>m.eggId===69) && creepers.some(m=>m.eggId===68),'Daylight does not delete manually spawned mobs');
            selectedTerrain='moon';isGameStarted=true;
            const actor=camera.position.clone();
            for(let i=0;i<20;i++) updateMechView(0.05);
            check(camera.position.equals(actor),'Repeated camera updates have no position drift');
            camera.position.set(-8,0.5+getPlayerHeight(),8);velocity.set(0,0,0);
            scene.background.setHex(0x91c8e3);scene.fog=null;clouds.visible=false;ambientLight.intensity=0.55;dirLight.intensity=0.7;
            document.getElementById('blocker').style.display='none';inventoryUI.style.display='none';
            renderer.render(scene,updateMechView(0.1));
            return passed;
        });
        console.log(JSON.stringify(result,null,2));
        await page.screenshot({path:'/private/tmp/mods-car-desktop.png'});

        const downloadEvent=page.waitForEvent('download');
        await page.evaluate(()=>downloadSave());
        const download=await downloadEvent;
        const save=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
        assert.equal(save.activeMech.id,71);assert.equal(save.activeMech.form,'vehicle');
        assert.ok(save.spawnedMobs.some(m=>m.id===69));
        await page.evaluate(()=>{clearMech();playerScale=1;});
        await page.locator('#load-file').setInputFiles({name:'mods-save.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(save))});
        await page.waitForFunction(()=>activeMech && activeMech.id===71 && activeMech.form==='vehicle');
        assert.equal(await page.evaluate(()=>villagers.filter(m=>m.eggId).length+zombies.filter(m=>m.eggId).length+creepers.filter(m=>m.eggId).length),save.spawnedMobs.length);
        console.log('PASS: Real save export/import restores active mech, its form and spawned mobs.');

        await page.evaluate(()=>{
            exitMech();gameMode='creative';camera.position.set(0,2.1,9);camera.lookAt(0,2.1,0);enterMech(70);
            for(let x=-1;x<=0;x++) for(let z=-1;z<=0;z++) buildChunkMesh(x,z);
            updateMechView(1);scene.fog=null;scene.background.setHex(0x91c8e3);
            document.getElementById('blocker').style.display='none';
            document.getElementById('pause-menu').style.display='none';
            document.getElementById('start-menu').style.display='none';
            const scout=createMechModel(71);scout.position.set(3,0.5,9);scout.rotation.y=Math.PI;scene.add(scout);
            window.testScout=scout;
            // A front view additionally verifies the eyes and chest details, not only the chase-view back.
            mechCamera.position.set(4.5,3.6,2.3);mechCamera.lookAt(1.3,2,9);
            renderer.render(scene,mechCamera);
        });
        await page.screenshot({path:'/private/tmp/mods-robots-desktop.png'});
        for(const viewport of [{width:1280,height:800},{width:390,height:844}]) {
            await page.setViewportSize(viewport);
            const colors=await page.evaluate(()=>{
                renderer.setSize(innerWidth,innerHeight);mechCamera.aspect=innerWidth/innerHeight;mechCamera.updateProjectionMatrix();
                renderer.render(scene,updateMechView(0.1));
                const gl=renderer.getContext(),pixel=new Uint8Array(4),colors=new Set();
                for(let x=.25;x<.8;x+=.05) for(let y=.2;y<.8;y+=.05) {
                    gl.readPixels(Math.floor(x*gl.drawingBufferWidth),Math.floor(y*gl.drawingBufferHeight),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
                    colors.add(Array.from(pixel).join(','));
                }
                return colors.size;
            });
            assert.ok(colors>8,`Rendered game has nonblank colorful pixels at ${viewport.width}px`);
        }
        await page.screenshot({path:'/private/tmp/mods-robot-mobile.png'});
        await page.evaluate(()=>{
            controls.isLocked=false;isInventoryOpen=true;
            document.getElementById('blocker').style.display='flex';
            document.getElementById('start-menu').style.display='none';document.getElementById('pause-menu').style.display='none';
            inventoryUI.style.display='block';switchTab('mods',document.querySelector("[onclick=\"switchTab('mods', this)\"]"));
        });
        await page.getByRole('button',{name:'Get Spawn Eggs',exact:true}).click();
        await page.locator('#inv-59').click();
        assert.equal(await page.evaluate(()=>currentBlock),71);
        await page.getByRole('button',{name:'Transform',exact:true}).click();
        assert.equal(await page.evaluate(()=>activeMech.form),'vehicle');
        await page.screenshot({path:'/private/tmp/mods-inventory-mobile.png'});
        assert.ok(await page.evaluate(()=>{
            const panel=inventoryUI.getBoundingClientRect();
            return panel.left>=0 && panel.right<=innerWidth && panel.top>=0 && panel.bottom<=innerHeight && inventoryUI.scrollWidth<=inventoryUI.clientWidth;
        }),'Mods inventory fits mobile without horizontal overflow');
        await page.getByRole('button',{name:'Return to Player',exact:true}).click();
        assert.equal(await page.evaluate(()=>activeMech),null);
        await page.evaluate(()=>{
            camera.position.set(0,2.1,9);enterMech(71);resetWorld();
            if(activeMech || mechVisual || playerScale!==1 || creepers.length || zombies.length) throw new Error('Reset left stale mod state');
        });
        assert.deepEqual(errors,[]);
        console.log('PASS: Desktop/mobile rendering, real inventory clicks, transform controls and no browser errors.');
        }

        const live=await browser.newPage({viewport:{width:1280,height:800}});
        live.on('pageerror',e=>errors.push(e.message));
        await live.goto(pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await live.getByRole('button',{name:'Creative',exact:true}).click();
        await live.evaluate(()=>{window.originalTestRandom=Math.random;Math.random=()=>0.5;});
        await live.getByRole('button',{name:'Start Game',exact:true}).click();
        await live.evaluate(()=>{Math.random=window.originalTestRandom;});
        await live.waitForFunction(()=>isGameStarted && chunkMeshes.size>=9);
        await live.evaluate(()=>{
            const origin=camera.position.clone();
            for(let dx=0;dx<120;dx+=2) for(let dz=0;dz<120;dz+=2) {
                const x=Math.round(origin.x)+dx,z=Math.round(origin.z)+dz,h=getSurfaceHeight(x,z);
                if(h<=8) continue;
                let flat=true;
                for(let xx=x-2;xx<=x+2;xx++) for(let zz=z-7;zz<=z+2;zz++) {
                    if(getSurfaceHeight(xx,zz)!==h) flat=false;
                    for(let yy=h+1;yy<=h+4;yy++) if(isSolid(xx,yy,zz)) flat=false;
                }
                if(!flat) continue;
                camera.position.set(x,h+2.1,z);camera.lookAt(x,h+2.1,z-10);camera.updateMatrixWorld(true);
                controls.isLocked=true;
                if(enterMech(71)) {selectSlot(59);return;}
            }
            throw new Error('Could not find an open flat spawn for the live mech test');
        });
        await live.waitForFunction(()=>mechVisual && chunkMeshes.size>=12);
        await live.keyboard.press('r');
        await live.waitForFunction(()=>activeMech.form==='vehicle' && mechBlend===1 && Math.abs(velocity.y)<0.001,{},{timeout:10000}).catch(async e=>{
            console.log(await live.evaluate(()=>({activeMech,mechBlend,velocity:velocity.toArray(),position:camera.position.toArray(),
                locked:controls.isLocked,feet:camera.position.y-getPlayerHeight(),toast:document.getElementById('toast-msg').textContent})));
            await live.screenshot({path:'/private/tmp/mods-live-error.png'});throw e;
        });
        const liveStart=await live.evaluate(()=>({x:camera.position.x,y:camera.position.y,z:camera.position.z}));
        await live.keyboard.down('w');
        await live.waitForFunction(z=>camera.position.z<z-1.5,liveStart.z,{timeout:15000});
        await live.keyboard.up('w');
        await live.waitForFunction(()=>Math.abs(velocity.z)<0.05);
        const liveEnd=await live.evaluate(()=>({x:camera.position.x,y:camera.position.y,z:camera.position.z,collision:checkScaledCollision(camera.position)}));
        assert.ok(Math.abs(liveEnd.y-liveStart.y)<0.02 && !liveEnd.collision,'Live car drives across natural terrain without sinking or flying');
        await live.screenshot({path:'/private/tmp/mods-live-car.png'});
        await live.keyboard.press('r');
        await live.waitForFunction(()=>activeMech.form==='robot' && mechBlend===0);
        await live.keyboard.press('f');
        await live.waitForFunction(()=>cannonProjectiles.length>0);
        await live.screenshot({path:'/private/tmp/mods-live-robot.png'});
        await live.waitForFunction(()=>cannonProjectiles.length===0);
        await live.keyboard.press('x');
        assert.equal(await live.evaluate(()=>activeMech),null);
        assert.deepEqual(errors,[]);
        console.log('PASS: Real generated world, real W/R/X keys, live transformation animation and stable grounded driving.');
    } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
