const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

(async()=>{
    const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try {
        const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
        await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await page.waitForFunction(()=>expansionReady);
        console.log(await page.evaluate(()=>{
            const checks=[],check=(v,n)=>{if(!v)throw new Error(n);checks.push(n);};
            clearExpansionWorld();worldMap.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();heightCache.clear();
            restoreMicroEdits([]);restoreFineVoxelEdits([]);resetPlayerFlight();clearMech();
            for(const meshes of chunkMeshes.values())for(const m of Object.values(meshes)){scene.remove(m);m.geometry?.dispose();}chunkMeshes.clear();
            for(const list of [villagers,zombies,creepers,animals]){for(const m of list)disposeModModel(m.mesh);list.length=0;}
            selectedTerrain='moon';currentDimension='overworld';getSurfaceHeight=()=>0;
            camera.position.set(0,2.1,6);camera.rotation.set(0,0,0);camera.updateMatrixWorld(true);
            playerScale=1;isGameStarted=true;gameMode='creative';controls.isLocked=false;isInventoryOpen=false;
            blocker.style.display='none';inventoryUI.style.display='none';heldItemGroup.visible=false;
            scene.background.setHex(0x9fc9df);scene.fog=null;dirLight.intensity=0.8;
            for(const id of [138,139]) {
                check(getInventorySlotMapping()[id-12]===id&&document.getElementById(`inv-${id-12}`),`${id} inventory slot`);
                const recipe=recipes.find(r=>r.out===id);craftingGrid=Object.entries(recipe.ing).flatMap(([t,n])=>Array(n).fill(Number(t)));checkRecipes();
                check(craftingOutput.id===id,`${id} craftable without recipe conflicts`);
                const model=createFurnitureModel(id,{});let meshes=0;model.traverse(m=>{if(m.isMesh)meshes++;});check(meshes>6,`${id} has a detailed voxel model`);disposeModModel(model);
            }
            check(parseWorldCommand('帮我找到监控摄像头').id===138&&parseWorldCommand('查找监控平板').id===139,'Chinese item lookup');
            check(placeFurniture(138,0,3,0),'Place Camera 1');
            check(placeFurniture(138,160,3,160),'Place distant Camera 2');
            check(placeFurniture(77,0,1,2)&&placeFurniture(96,2,1,2)&&placeFurniture(76,-2,1,2),'Computers and TV place');
            const cameras=securityCameras();check(cameras.length===2&&cameras[0].data.cameraNumber===1&&cameras[1].data.cameraNumber===2,'Stable camera numbering');
            for(const r of cameras){r.data.yaw=0;r.data.pitch=-12;}
            for(let x=155;x<=165;x++)for(let z=155;z<=169;z++)setBlockNoRebuild(x,0,z,51,new Set());
            for(let x=157;x<=163;x++)for(let y=1;y<=4;y++)setBlockNoRebuild(x,y,168,59,new Set());
            setBlockNoRebuild(160,1,164,89,new Set());furnitureData.set('overworld|160,1,164',{id:89,on:true});
            window.cctvMarker=addModelBox(scene,1.5,1.5,0.5,0xe84844,160,2,166);cctvMarker.material.emissive.setHex(0x701010);
            check(!furnitureMeshes.has('overworld|160,3,160'),'Remote model is initially unloaded');
            openFurniturePanel(furnitureRecord(0,3,0));
            return `${checks.length} surveillance registration and placement checks passed.`;
        }));
        assert.equal(await page.locator('#home-content strong').textContent(),'Camera 1');
        await page.getByRole('combobox',{name:'Direction'}).selectOption('90');
        await page.getByRole('slider',{name:'Tilt'}).fill('-20');
        assert(await page.evaluate(()=>furnitureRecord(0,3,0).data.yaw===Math.PI/2&&furnitureRecord(0,3,0).data.pitch===-20));
        await page.getByRole('checkbox',{name:'Power',exact:true}).uncheck();
        assert(await page.evaluate(()=>!furnitureRecord(0,3,0).data.on));
        await page.getByRole('checkbox',{name:'Power',exact:true}).check();
        await page.evaluate(()=>openFurniturePanel(furnitureRecord(0,1,2)));
        assert.equal(await page.getByRole('combobox',{name:'Camera',exact:true}).inputValue(),'overworld|0,3,0');
        await page.getByRole('combobox',{name:'Camera',exact:true}).selectOption('overworld|160,3,160');
        console.log(await page.evaluate(()=>{
            const before=camera.position.clone(),center=[lastChunkX,lastChunkZ];
            for(let i=0;i<30;i++){updateSurveillance(performance.now()+i*130);updateWorldExpansion(0.2);}
            if(!camera.position.equals(before)||lastChunkX!==center[0]||lastChunkZ!==center[1])throw new Error('Surveillance moved the player or player chunk center');
            const w=surveillanceWatch;
            if(w.chunks.size!==25||Array.from(w.chunks).some(key=>!chunkMeshes.has(key)))throw new Error('Remote window is incomplete');
            if(!furnitureMeshes.has('overworld|160,1,164'))throw new Error('Distant furniture missing from feed');
            if(w.frames<2||w.status.textContent!=='LIVE')throw new Error('Not a live stream');
            const pixels=w.ctx.getImageData(0,0,512,288).data,colors=new Set();let red=0;
            for(let i=0;i<pixels.length;i+=4){colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);if(pixels[i]>pixels[i+1]*1.5&&pixels[i]>pixels[i+2]*1.5)red++;}
            if(colors.size<30||red<50)throw new Error(`Blank or wrong camera: ${colors.size} colors, ${red} red pixels`);
            window.cctvFirstFrame=Array.from(pixels);
            cctvMarker.position.x+=2;updateSurveillance(performance.now()+5000);
            const next=w.ctx.getImageData(0,0,512,288).data;let changed=0;
            for(let i=0;i<next.length;i+=4)if(next[i]!==cctvFirstFrame[i])changed++;
            if(changed<50)throw new Error('Feed is a static image');
            if(renderer.getRenderTarget()!==null||surveillanceRendering||w.avatar.visible)throw new Error('Secondary renderer state leaked');
            renderer.render(scene,camera);
            return `PASS: Remote 25-chunk view, furniture, ${colors.size} colors and ${changed} moving pixels; player stays in place.`;
        }));
        await page.screenshot({path:'/private/tmp/mc-surveillance-desktop.png'});
        await page.getByRole('button',{name:'Notes',exact:true}).click();
        assert(await page.evaluate(()=>!surveillanceWatch&&!chunkMeshes.has('10,10')));
        await page.getByRole('textbox',{name:'Notes'}).fill('Camera 2 watches the workshop.');
        await page.getByRole('button',{name:'Save',exact:true}).click();
        await page.getByRole('button',{name:'Cameras',exact:true}).click();
        assert.equal(await page.getByRole('combobox',{name:'Camera',exact:true}).inputValue(),'overworld|160,3,160');
        await page.evaluate(()=>{furnitureRecord(160,3,160).data.on=false;updateSurveillance(performance.now()+6000);});
        assert.equal(await page.locator('.surveillance-body output[aria-live]').textContent(),'OFFLINE');
        assert(await page.evaluate(()=>!surveillanceWatch));
        await page.evaluate(()=>{furnitureRecord(160,3,160).data.on=true;openFurniturePanel(furnitureRecord(-2,1,2));});
        assert.equal(await page.getByRole('combobox',{name:'Camera',exact:true}).count(),0);
        assert.equal(await page.getByRole('combobox',{name:'Channel',exact:true}).count(),1);
        await page.evaluate(()=>{openFurniturePanel(furnitureRecord(2,1,2));});
        assert.equal(await page.getByRole('combobox',{name:'Camera',exact:true}).count(),1);
        await page.evaluate(()=>{closeFurniturePanel(false);currentBlock=139;camera.lookAt(0,100,6);camera.updateMatrixWorld(true);handleExpansionClick({button:2});});
        assert.equal(await page.locator('#home-title').textContent(),'Surveillance Tablet');
        assert.equal(await page.getByRole('combobox',{name:'Camera',exact:true}).count(),1);
        await page.getByRole('combobox',{name:'Camera',exact:true}).selectOption('overworld|160,3,160');
        await page.setViewportSize({width:390,height:844});
        await page.evaluate(()=>{for(let i=0;i<30;i++){updateSurveillance(performance.now()+i*130);updateWorldExpansion(0.2);}});
        assert(await page.evaluate(()=>{const c=document.getElementById('surveillance-feed').getBoundingClientRect(),dialog=document.querySelector('#home-panel .world-dialog');return c.width>200&&c.right<=innerWidth&&c.left>=0&&dialog.scrollWidth<=dialog.clientWidth+1;}));
        await page.screenshot({path:'/private/tmp/mc-surveillance-mobile.png'});
        await page.evaluate(()=>{closeFurniturePanel(false);setBlock(0,3,0,0);placeFurniture(138,4,3,0);});
        assert(await page.evaluate(()=>securityCameras().map(r=>r.data.cameraNumber).join(',')==='2,3'));
        const downloadEvent=page.waitForEvent('download');await page.evaluate(()=>downloadSave());
        const saved=JSON.parse(fs.readFileSync(await(await downloadEvent).path(),'utf8'));
        await page.locator('#load-file').setInputFiles({name:'surveillance.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
        await page.waitForFunction(()=>securityCameras().map(r=>r.data.cameraNumber).join(',')==='2,3');
        assert(await page.evaluate(()=>nextSecurityCameraNumber===4&&furnitureRecord(0,1,2).data.cameraKey==='overworld|160,3,160'&&furnitureRecord(0,1,2).data.note.includes('workshop')));
        await page.evaluate(()=>{closeFurniturePanel(false);openFurniturePanel(furnitureRecord(0,1,2));setBlock(160,3,160,0);updateSurveillance(performance.now()+8000);});
        assert.equal(await page.locator('.surveillance-body output[aria-live]').textContent(),'OFFLINE');
        assert(await page.evaluate(()=>!surveillanceWatch));
        assert.deepEqual(errors,[]);
        console.log('PASS: Real camera settings, computer channel switching, notes, tablet, TV exclusion, offline/deletion, save/load and mobile layout.');

        const live=await browser.newPage({viewport:{width:1280,height:800}}),liveErrors=[];live.on('pageerror',e=>liveErrors.push(e.message));
        await live.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await live.waitForFunction(()=>expansionReady);
        await live.evaluate(()=>{
            selectedTerrain='moon';getSurfaceHeight=()=>0;isGameStarted=true;gameMode='creative';
            blocker.style.display='none';camera.position.set(0,2.1,5);placeFurniture(138,0,3,0);placeFurniture(77,0,1,2);
            selectSlot(1);camera.lookAt(0,1.1,2);camera.updateMatrixWorld(true);controls.isLocked=true;
        });
        await live.mouse.click(640,400,{button:'right'});
        await live.waitForFunction(()=>surveillanceWatch?.frames>3);
        const frameCount=await live.evaluate(()=>surveillanceWatch.frames);
        await live.waitForFunction(n=>surveillanceWatch?.frames>n+2,frameCount);
        assert.equal(await live.locator('#home-title').textContent(),'Desktop Computer');
        await live.getByRole('button',{name:'Close',exact:true}).click();
        assert(await live.evaluate(()=>!surveillanceWatch));
        await live.evaluate(()=>controls.unlock());
        assert.deepEqual(liveErrors,[]);
        console.log('PASS: Actual in-game right-click opens the computer; animation-loop camera feed keeps refreshing and closes cleanly.');
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
