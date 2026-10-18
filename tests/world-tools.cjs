const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

(async()=>{
    const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try {
        const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
        page.setDefaultNavigationTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
        await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
        await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await page.waitForFunction(()=>expansionReady);
        console.log(await page.evaluate(()=>{
            window.toolsReset=()=>{
                clearExpansionWorld();worldMap.clear();heightCache.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();chunkScanYRanges.clear();
                restoreMicroEdits([]);restoreFineVoxelEdits([]);resetPlayerFlight();clearMech();
                for(const meshes of chunkMeshes.values())for(const m of Object.values(meshes)){scene.remove(m);m.geometry?.dispose();}chunkMeshes.clear();rebuildQueue.clear();
                for(const list of [zombies,creepers,villagers,animals]){for(const m of list)disposeModModel(m.mesh);list.length=0;}
                for(const p of explosionParticles)disposeModModel(p.mesh);explosionParticles.length=0;
                selectedTerrain='moon';currentDimension='overworld';getSurfaceHeight=()=>0;camera.position.set(0,2.1,5);playerScale=1;gameMode='creative';isGameStarted=true;
                camera.rotation.set(0,0,0);scene.fog=null;scene.background.setHex(0xa6cedc);clouds.visible=false;heldItemGroup.visible=false;controls.isLocked=false;
                blocker.style.display='none';inventoryUI.style.display='none';
            };
            window.finishToolsJob=()=>{let i=0;while(commandJob&&i++<2000)tickCommandJob();if(commandJob)throw Error('Construction never finishes');};
            toolsReset();const check=(x,n)=>{if(!x)throw Error(n);};
            for(const text of ['field.100×100×100','场地一百乘一百乘一百','帮我造一个长100宽100高100的场地','帮我搭建一个100×100×100的空间']) {
                const p=parseWorldCommand(text);check(p.kind==='construction'&&p.shape==='field'&&p.width===100&&p.depth===100&&p.height===100,'Parse large open field: '+text);
            }
            const wide=parseWorldCommand('field 200×200×10');check(wide.width===200&&wide.depth===200&&wide.height===10,'200 square field');
            const wall=parseWorldCommand('100×100');check(wall.shape==='wall'&&wall.width===100&&wall.height===100&&wall.thickness===1,'Two numbers are a wall');
            const castle=parseWorldCommand('城墙 厚5 长100 宽100');check(castle.shape==='castle'&&castle.thickness===5&&castle.height===10,'Castle named sizes and default height');
            for(const s of ['场地201×100×10','场地-10×10×10','场地20.5×20×20','城墙厚5长10宽10','不要生成场地100×100×100']){let bad=false;try{parseWorldCommand(s);}catch{bad=true;}check(bad,'Reject ambiguous or invalid size: '+s);}
            camera.position.set(0,2.1,0);setBlock(1,2,1,4);
            check(executeWorldCommand(parseWorldCommand('场地100×100×100')),'Start construction');tickCommandJob();check(!!commandJob,'Construction is batched');finishToolsJob();
            check(getBlock(-50,50,0)===51&&getBlock(49,99,0)===51,'Both 100-wide walls exist');
            check(getBlock(0,0,0)===63&&getBlock(1,2,1)===0&&getBlock(0,100,0)===0,'Solid floor, clear interior and no roof');
            check(worldMap.size<1000,'Large empty volume is not millions of stored cells');
            setGenBlock(1,2,1,4);check(getBlock(1,2,1)===0,'World regeneration cannot fill the field');
            setBlock(1,2,1,59);check(getBlock(1,2,1)===59,'Build inside the field');setBlock(1,2,1,0);check(getBlock(1,2,1)===0,'Mine inside the field');
            const saved=JSON.parse(JSON.stringify(saveWorldExpansion()));restoreConstruction();restoreWorldExpansion(saved);
            check(getBlock(-50,99,0)===51&&getBlock(0,100,0)===0,'Saved field restores with no roof');
            toolsReset();camera.position.set(0,2.1,0);executeWorldCommand(castle);finishToolsJob();
            for(let x=-50;x<-45;x++)check(getBlock(x,5,0)===59,'Five solid wall layers');
            check(getBlock(-45,5,0)===0&&getBlock(0,10,0)===0,'Open castle interior');
            toolsReset();camera.position.set(0,2.1,0);executeWorldCommand(wide);finishToolsJob();
            check(getBlock(-100,5,0)===51&&getBlock(99,5,0)===51&&getBlock(0,10,0)===0,'200-by-200-by-10 geometry');
            check(worldMap.size<1000,'Wide field remains sparse');
            toolsReset();check(placeFurniture(138,0,3,0),'Place camera');check(placeFurniture(139,2,1,2),'Place tablet');
            const r=furnitureRecord(0,3,0);r.data.yaw=0;r.data.pitch=-12;r.data.pan=0;
            for(let x=-6;x<=6;x++)for(let y=1;y<4;y++)setBlockNoRebuild(x,y,7,x<0?59:60,new Set());
            openFurniturePanel(furnitureRecord(2,1,2));
            for(let i=0;i<30;i++){updateSurveillance(performance.now()+i*130);updateWorldExpansion(0.01);}
            return 'PASS: Large open fields, 200x200x10 dimensions, 5-thick castle walls, sparse storage, persistence and terrain regeneration.';
        }));
        const before=await page.evaluate(()=>Array.from(surveillanceWatch.ctx.getImageData(0,0,512,288).data));
        await page.getByRole('slider',{name:'Camera Pan',exact:true}).fill('90');
        assert(await page.evaluate(()=>{updateSurveillance(performance.now()+6000);return furnitureMeshes.get('overworld|0,3,0').userData.securityHead.rotation.y===Math.PI/2;}));
        assert(await page.evaluate(first=>{const p=surveillanceWatch.ctx.getImageData(0,0,512,288).data;let n=0;for(let i=0;i<p.length;i+=4)if(p[i]!==first[i])n++;return n>500;},before));
        await page.getByRole('checkbox',{name:'Auto Scan',exact:true}).check();
        assert(await page.evaluate(()=>{const d=furnitureRecord(0,3,0).data,t=d.scanStarted;return cameraPanDegrees(d,t)===90&&cameraPanDegrees(d,t+6000)===-90&&cameraPanDegrees(d,t+12000)===90;}));
        await page.screenshot({path:'/private/tmp/mc-camera-pan.png'});
        await page.evaluate(()=>{
            closeFurniturePanel(false);placeFurniture(144,5,1,0);openFurniturePanel({id:139,key:'tablet',data:{}});
        });
        await page.getByRole('button',{name:'Launchers',exact:true}).click();
        await page.getByRole('spinbutton',{name:'Target X',exact:true}).fill('100');
        await page.getByRole('spinbutton',{name:'Target Y',exact:true}).fill('1');
        await page.getByRole('spinbutton',{name:'Target Z',exact:true}).fill('100');
        await page.getByRole('button',{name:'Launch 1',exact:true}).click();
        await page.getByRole('button',{name:'Launch 2',exact:true}).click();
        assert(await page.evaluate(()=>nuclearMissiles.length===2&&nuclearMissiles[0].from[0]!==nuclearMissiles[1].from[0]));
        console.log(await page.evaluate(()=>{
            const r=furnitureRecord(5,1,0);if(launchNuclearMissile(r,[100,1,100],0))throw Error('Cooldown ignored');
            if(validLauncherTarget(r,[1.5,1,2],0)||validLauncherTarget(r,[10000,1,1],0))throw Error('Invalid targeting accepted');
            const first=nuclearMissiles[0].mesh.position.clone();updateNuclearMissiles(1);if(nuclearMissiles[0].mesh.position.equals(first))throw Error('Static missile');
            const save=saveThermalWorld();clearThermalWorld();restoreThermalWorld(save);if(nuclearMissiles.length!==2)throw Error('Flight lost in save');
            for(let i=0;i<20;i++)updateNuclearMissiles(0.5);
            if(nuclearMissiles.length||nukeJobs.length!==1||nukeJobs[0].x!==100||nukeJobs[0].z!==100)throw Error('Wrong impact or duplicate crater');
            return 'PASS: Actual tablet targeting and two independent launch ports, moving missiles, reload cooldown, save/resume and crater at the selected target.';
        }));
        await page.screenshot({path:'/private/tmp/mc-launcher-desktop.png'});
        await page.setViewportSize({width:390,height:844});
        assert(await page.evaluate(()=>{const d=document.querySelector('#home-panel .world-dialog');return d.scrollWidth<=d.clientWidth+1;}));
        await page.screenshot({path:'/private/tmp/mc-launcher-mobile.png'});
        await page.setViewportSize({width:1440,height:900});
        await page.waitForTimeout(100);
        await page.evaluate(()=>{
            toolsReset();placeFurniture(144,0,1,0);placeFurniture(138,2,2,0);furnitureRecord(2,2,0).data.pan=45;updateSecurityCameraMovement();
            for(let x=-1;x<=0;x++)for(let z=-1;z<=0;z++)buildChunkMesh(x,z);
            camera.position.set(3,3.8,4);camera.lookAt(0.6,1,0);camera.updateMatrixWorld(true);renderer.render(scene,camera);
            if(furnitureMeshes.get('overworld|0,1,0').userData.launchPorts.length!==2)throw Error('Two ports must be visible');
            const gl=renderer.getContext(),pixels=new Uint8Array(4);gl.readPixels(Math.floor(gl.drawingBufferWidth/2),Math.floor(gl.drawingBufferHeight/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixels);if(pixels[0]+pixels[1]+pixels[2]<30)throw Error('Launcher frame is blank');
        });
        await page.screenshot({path:'/private/tmp/mc-launcher-model.png'});
        await page.evaluate(()=>{
            toolsReset();camera.position.set(0,2.1,0);setBlock(1,1,1,4);executeWorldCommand(parseWorldCommand('场地20×20×10'));finishToolsJob();
            for(let x=-1;x<=0;x++)for(let z=-1;z<=0;z++)buildChunkMesh(x,z);
            camera.position.set(23,25,24);camera.lookAt(0,4,0);camera.updateMatrixWorld(true);renderer.render(scene,camera);
            if(renderer.info.render.triangles<1000)throw Error('Construction is blank');
        });
        await page.screenshot({path:'/private/tmp/mc-open-field.png'});
        await page.evaluate(()=>executeWorldCommand({kind:'undo'}));
        await page.waitForFunction(()=>constructionRegions.length===0&&getBlock(1,1,1)===4);
        assert.deepEqual(errors,[]);
        console.log('PASS: Pan changes both physical camera and live pixels; auto scan stays within 180 degrees; desktop/mobile controls fit.');
    } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
