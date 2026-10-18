const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

(async()=>{
    const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try {
        const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
        page.setDefaultNavigationTimeout(120000);
        page.on('pageerror',e=>errors.push(e.message));
        await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
        await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await page.waitForFunction(()=>expansionReady&&document.getElementById('inv-129'));
        console.log(await page.evaluate(()=>{
            const checks=[],check=(v,n)=>{if(!v)throw Error(n);checks.push(n);};
            window.thermalReset=()=>{
                clearExpansionWorld();worldMap.clear();heightCache.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();chunkScanYRanges.clear();
                restoreMicroEdits([]);restoreFineVoxelEdits([]);resetPlayerFlight();clearMech();
                for(const meshes of chunkMeshes.values())for(const m of Object.values(meshes)){scene.remove(m);m.geometry?.dispose();}chunkMeshes.clear();rebuildQueue.clear();
                for(const list of [zombies,creepers,villagers,animals]){for(const m of list)disposeModModel(m.mesh);list.length=0;}
                for(const p of explosionParticles)disposeModModel(p.mesh);explosionParticles.length=0;
                clouds.visible=false;
                clearTimeout(toastTimeout);document.getElementById('toast-msg').style.display='none';
                selectedTerrain='moon';currentDimension='overworld';getSurfaceHeight=()=>0;seed=17;
                camera.position.set(0,2.1,5);camera.rotation.set(0,0,0);playerScale=1;gameMode='creative';isGameStarted=true;controls.isLocked=false;
                scene.fog=null;scene.background.setHex(0xa6cedc);heldItemGroup.visible=false;
            };
            window.thermalPut=(x,y,z,id)=>setBlockNoRebuild(x,y,z,id,new Set());
            const ticks=n=>{for(let i=0;i<n;i++){tickLavaFlow(0.35);tickFire(0.35);}};
            thermalReset();
            for(const id of [140,141,142]) {
                check(document.getElementById(`inv-${id-12}`)&&getInventorySlotMapping()[id-12]===id,`${id} inventory slot`);
                const recipe=recipes.find(r=>r.out===id);craftingGrid=Object.entries(recipe.ing).flatMap(([k,v])=>Array(v).fill(Number(k)));checkRecipes();
                check(craftingOutput.id===id,`${id} recipe`);
                const model=buildThermalModel(id);check(model.children.length>=4,`${id} voxel model`);disposeModModel(model);
            }
            check(parseWorldCommand('帮我找到打火器').id===141&&parseWorldCommand('查找岩浆桶').id===140,'Chinese lookup');
            gameMode='survival';playerInventory[141]=0;updateInventoryCounts();
            check(!hasInventoryItem(141)&&document.querySelector('#inv-129 .inv-qty').textContent==='0','Lighter must be acquired in survival');
            gameMode='creative';
            thermalPut(0,8,0,LAVA_ID);ticks(70);
            check(getBlock(0,8,0)===0,'Lava falls');
            const lava=[...worldMap].filter(([,id])=>id===LAVA_ID);
            check(lava.length>1&&lava.reduce((n,[k])=>n+lavaAmount(...k.split(',').map(Number)),0)===8,'Finite lava spreads without multiplying');
            check(getBlock(0,0,0)===3,'Stone floor survives');
            for(const type of [2,3,4,5,6,21,22,25,42,44,47,48,59,142]) {
                thermalReset();thermalPut(0,2,0,LAVA_ID);thermalPut(0,1,0,type);thermalPut(1,2,0,type);ticks(30);
                check(getBlock(0,1,0)===type&&getBlock(1,2,0)===type&&!burningBlocks.size&&!nukeJobs.length,`Lava never destroys or ignites block ${type}`);
            }
            thermalReset();camera.position.set(0,2.1,25);
            check(pourLavaBucket(0,1,0)===128,'One bucket pours 128 connected cells');
            check([...worldMap].filter(([,id])=>id===43).length===128,'Exactly 128 full lava cells initially');
            ticks(100);
            check([...worldMap].filter(([,id])=>id===43).reduce((n,[k])=>n+lavaAmount(...k.split(',').map(Number)),0)===1024,'Large bucket volume remains finite while flowing');
            thermalReset();camera.position.set(0,2.1,25);
            for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++)if(Math.abs(x)===3||Math.abs(z)===3)thermalPut(x,1,z,4);
            thermalPut(1,1,1,42);
            check(pourLavaBucket(0,1,0)===24&&pourLavaBucket(0,1,0)===0,'Walls contain the bucket and a full enclosure cannot consume another bucket');
            ticks(50);
            check(getBlock(1,1,1)===42&&getBlock(3,1,0)===4&&getBlock(4,1,0)===0,'Bucket and flowing lava preserve plants and do not cross walls');
            for(const first of [24,LAVA_ID]) {
                thermalReset();thermalPut(0,1,0,first);thermalPut(1,1,0,first===24?LAVA_ID:24);
                solidifyFluidContact(1,1,0);
                check(getBlock(first===LAVA_ID?0:1,1,0)===44,'Both placement orders produce obsidian');
            }
            thermalReset();thermalPut(0,1,0,24);thermalPut(0,5,0,LAVA_ID);ticks(20);
            check([...worldMap].some(([,id])=>id===44),'Falling lava reacts to water');
            thermalReset();currentDimension='nether';
            for(let x=-5;x<=5;x++)for(let z=-5;z<=5;z++)for(let y=0;y<=8;y++)thermalPut(x,y,z,y===0?3:0);
            thermalPut(0,6,0,LAVA_ID);ticks(30);check(getBlock(0,6,0)===0&&[...worldMap].some(([k,id])=>id===LAVA_ID&&Number(k.split(',')[1])===1),'Lava also flows in the Nether');
            thermalReset();
            for(let y=1;y<=4;y++)thermalPut(0,y,0,4);
            for(let x=-1;x<=1;x++)for(let y=4;y<=5;y++)for(let z=-1;z<=1;z++)if(x||z||y===5)thermalPut(x,y,z,5);
            check(startBurning(0,1,0),'Lighter ignites trunk');
            for(let i=0;i<60;i++)tickFire(0.25);
            check(![...worldMap].some(([,id])=>id===4||id===5),'Connected trunk and canopy burn completely');
            check(!burningBlocks.size,'Ordinary fire runs out of fuel');
            thermalPut(8,1,0,4);thermalPut(9,1,0,24);check(!startBurning(8,1,0),'Water protects wet wood');
            thermalPut(20,1,0,43);lavaAmounts.set('20,1,0',3);thermalPut(24,1,0,4);startBurning(24,1,0);
            const heatSave=saveThermalWorld();clearThermalWorld();restoreThermalWorld(heatSave);
            check(lavaAmount(20,1,0)===3&&burningBlocks.has('24,1,0'),'Save preserves partial lava and burning fuel');
            check(placeFurniture(CAMPFIRE_ID,3,1,0),'Campfire can be placed');
            for(let i=0;i<3000;i++)tickFire(0.5);
            check(getBlock(3,1,0)===CAMPFIRE_ID,'Campfire does not expire');
            thermalPut(12,1,0,TNT_ID);thermalPut(13,1,0,TNT_ID);startBurning(12,1,0);
            check(getBlock(12,1,0)===0&&getBlock(13,1,0)===TNT_ID&&movingTNT.size===1,'Lighter starts a visible TNT fuse without an instant blast');
            for(let i=0;i<500;i++)tickMovingTNT(1/60);
            check(getBlock(13,1,0)===0&&!movingTNT.size,'TNT detonates after its fuse and chains to its neighbor');
            return `PASS: ${checks.length} lava, water reaction, Nether, complete tree burning, perpetual campfire, TNT, recipe and inventory checks.`;
        }));

        await page.evaluate(()=>{
            thermalReset();gameMode='survival';playerInventory={[BUCKET_ID]:1,[LIGHTER_ID]:1};
            thermalPut(0,1,0,LAVA_ID);camera.position.set(0,2.1,3);camera.lookAt(0,1,0);camera.updateMatrixWorld(true);
            controls.isLocked=true;currentBlock=BUCKET_ID;
        });
        await page.mouse.click(720,450,{button:'right'});
        assert(await page.evaluate(()=>playerInventory[140]===1&&playerInventory[45]===0&&getBlock(0,1,0)===0));
        await page.evaluate(()=>{currentBlock=140;camera.lookAt(0,0,0);camera.updateMatrixWorld(true);});
        await page.mouse.click(720,450,{button:'right'});
        assert(await page.evaluate(()=>playerInventory[140]===0&&playerInventory[45]===1&&[...worldMap].filter(([,id])=>id===43).length===128));
        await page.evaluate(()=>{thermalPut(3,2,0,4);camera.lookAt(3,2,0);camera.updateMatrixWorld(true);currentBlock=141;});
        await page.mouse.click(720,450,{button:'right'});
        assert(await page.evaluate(()=>burningBlocks.has('3,2,0')&&playerInventory[141]===1));
        console.log('PASS: Actual right-click pours 128 lava blocks, returns one empty bucket and ignites wood only when the lighter is used.');

        console.log(await page.evaluate(()=>{
            thermalReset();restoreThermalWorld({jobs:[{x:0,y:1,z:0,column:160}]});
            if(nukeJobs[0].radius!==50)throw Error('Legacy unfinished crater lost its original radius');
            clearThermalWorld();thermalPut(0,1,0,22);igniteNuke(0,1,0);
            if(nukeJobs[0].radius!==10)throw Error('New crater was not reduced');
            if(nukeJobs.length!==1)throw Error('Blast was not queued');
            tickNuclearBlast();if(!nukeJobs.length||nukeJobs[0].column>160)throw Error('Blast is not batched');
            const saved=saveThermalWorld();clearThermalWorld();restoreThermalWorld(saved);
            let steps=0;while(nukeJobs.length&&steps++<2000)tickNuclearBlast();
            if(nukeJobs.length)throw Error('Blast did not finish');
            for(let x=-10;x<10;x++)if(getBlock(x,0,0)!==0)throw Error('Crater is not 20 blocks wide');
            if(getBlock(-11,0,0)!==3||getBlock(10,0,0)!==3||getBlock(9,0,9)!==3)throw Error('Crater extends beyond circle');
            if(getBlock(0,-8,0)!==0||!isSolid(0,-9,0))throw Error('Crater has no solid bottom');
            if(!isTransparent(0,-8,0))throw Error('Crater hides the floor');
            const edge=craterColumns.get('8,0')[0][0];if(edge<=-8||edge>=0)throw Error('Crater floor is not curved');
            setGenBlock(0,-5,0,4);if(getBlock(0,-5,0)!==0)throw Error('Terrain generation fills the crater back in');
            thermalPut(0,-8,0,59);if(getBlock(0,-8,0)!==59)throw Error('Cannot build inside crater');
            thermalPut(0,-8,0,0);
            const s=saveWorldExpansion();clearExpansionWorld();restoreWorldExpansion(s);
            if(getBlock(0,-7,0)!==0||!isSolid(0,-9,0))throw Error('Save loses crater');
            for(let cx=-1;cx<=0;cx++)for(let cz=-1;cz<=0;cz++)buildChunkMesh(cx,cz);
            if(!chunkMeshes.get('0,0')[getBlock(0,-9,0)]?.userData.blockIndices.has('0,-9,0'))throw Error('Bottom was not rendered');
            camera.position.set(16,16,20);camera.lookAt(-0.5,-3,-0.5);camera.updateMatrixWorld(true);blocker.style.display='none';inventoryUI.style.display='none';
            renderer.render(scene,camera);
            for(const p of explosionParticles)disposeModModel(p.mesh);explosionParticles.length=0;
            clearTimeout(toastTimeout);document.getElementById('toast-msg').style.display='none';
            return `PASS: Reduced 20-block circular crater, curved 9-block-deep solid floor, ${steps} bounded batches, save/resume, no regeneration and visible floor geometry.`;
        }));
        for(const [w,h,name] of [[1440,900,'desktop'],[390,844,'mobile']]) {
            await page.setViewportSize({width:w,height:h});
            if(name==='mobile')await page.evaluate(()=>{camera.position.set(26,30,30);camera.lookAt(-0.5,-3,-0.5);camera.updateMatrixWorld(true);});
            assert(await page.evaluate(()=>{
                renderer.render(scene,camera);const gl=renderer.getContext(),p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4),colors=new Set();
                gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);
                for(let i=0;i<p.length;i+=64)colors.add(`${p[i]},${p[i+1]},${p[i+2]}`);
                return colors.size>40&&renderer.info.render.triangles>1000;
            }));
            assert(await page.evaluate(()=>{
                const gl=renderer.getContext(),p=new Uint8Array(4);gl.readPixels(Math.floor(gl.drawingBufferWidth/2),Math.floor(gl.drawingBufferHeight/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);
                return Math.abs(p[0]-p[2])<45;
            }),'Center of the crater must render the floor, not blue sky');
            await page.screenshot({path:`/private/tmp/mc-nuke-${name}.png`});
        }
        await page.setViewportSize({width:1440,height:900});
        await page.evaluate(()=>{
            thermalReset();placeFurniture(CAMPFIRE_ID,-2,1,0);thermalPut(2,1,0,43);thermalPut(3,1,0,43);lavaAmounts.set('3,1,0',3);
            thermalPut(0,1,-2,4);startBurning(0,1,-2);camera.position.set(4,4.2,7);camera.lookAt(0,0.6,0);camera.updateMatrixWorld(true);
            syncFurnitureMeshes();updateThermalWorld(0.01);for(let x=-1;x<=0;x++)for(let z=-1;z<=0;z++)buildChunkMesh(x,z);
            blocker.style.display='none';renderer.render(scene,camera);
            window.firstFlame=fireVisuals.get('0,1,-2').userData.flames[0].mesh.scale.y;
            if(fireVisuals.get('0,1,-2').position.y<1.5)throw Error('Fire is hidden inside the wood');
        });
        await page.waitForTimeout(100);
        assert(await page.evaluate(()=>{updateThermalWorld(0.01);renderer.render(scene,camera);return firstFlame!==fireVisuals.get('0,1,-2').userData.flames[0].mesh.scale.y;}));
        await page.screenshot({path:'/private/tmp/mc-fire-lava.png'});
        assert.deepEqual(errors,[]);console.log('PASS: Desktop/mobile crater canvas pixels and animated voxel flames, with no browser exceptions.');
        await page.close();

        const live=await browser.newPage({viewport:{width:1280,height:800}});
        live.setDefaultNavigationTimeout(120000);
        live.on('pageerror',e=>errors.push(e.message));
        await live.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await live.waitForFunction(()=>expansionReady);
        await live.getByRole('button',{name:'Creative',exact:true}).click();
        await live.getByRole('button',{name:'Moon',exact:true}).click();
        await live.getByRole('button',{name:'Start Game',exact:true}).click({timeout:60000});
        await live.waitForFunction(()=>controls.isLocked&&isGameStarted);
        await live.mouse.move(640,400);
        await live.evaluate(()=>{
            const x=Math.round(camera.position.x),z=Math.round(camera.position.z)-3,y=Math.max(getSurfaceHeight(x,z),getSurfaceHeight(x,z+3))+5;
            creativeFlying=true;camera.position.set(x,y+1,z+3);velocity.set(0,0,0);
            window.liveNuke=[x,y,z];setBlock(x,y,z,22);currentBlock=141;
            camera.lookAt(x,y,z);camera.updateMatrixWorld(true);
        });
        await live.mouse.click(640,400,{button:'right'});
        await live.waitForFunction(()=>nukeJobs.length>0||craterColumns.size>0);
        await live.evaluate(()=>{const [x,y,z]=liveNuke;creativeFlying=true;camera.position.set(x,y+20,z+5);camera.lookAt(x,y-4,z);camera.updateMatrixWorld(true);});
        const before=await live.evaluate(()=>camera.position.toArray());
        await live.keyboard.down('KeyW');await live.waitForTimeout(500);await live.keyboard.up('KeyW');
        assert(await live.evaluate(p=>Math.hypot(camera.position.x-p[0],camera.position.z-p[2])>0.05,before));
        await live.waitForFunction(()=>!nukeJobs.length,{},{timeout:60000});
        assert(await live.evaluate(()=>{const [x,y,z]=liveNuke;return isSolid(x,y-10,z)&&!isSolid(x,y-8,z);}));
        await live.waitForFunction(()=>rebuildQueue.size===0,{},{timeout:60000});
        await live.screenshot({path:'/private/tmp/mc-nuke-live.png'});
        assert(await live.evaluate(()=>{
            renderer.render(scene,camera);
            const gl=renderer.getContext(),p=new Uint8Array(100*100*4);
            gl.readPixels(Math.floor(gl.drawingBufferWidth/2)-50,Math.floor(gl.drawingBufferHeight/2)-50,100,100,gl.RGBA,gl.UNSIGNED_BYTE,p);
            let visible=0;for(let i=0;i<p.length;i+=4)if(p[i]>20&&p[i+1]>20&&p[i+2]>20)visible++;
            return visible>3000&&scene.fog.near>NUKE_BLAST_RADIUS*3;
        }),'Live crater floor must remain visible through the environment fog');
        await live.screenshot({path:'/private/tmp/mc-nuke-live.png'});
        assert.deepEqual(errors,[]);console.log('PASS: Live right-click ignites the nuke, the player can still move during excavation, and the real animation loop completes the crater.');
    } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
