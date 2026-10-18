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
            window.buildingReset=()=>{
                closeCommandPanel(false);clearExpansionWorld();worldMap.clear();heightCache.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();chunkScanYRanges.clear();
                restoreMicroEdits([]);restoreFineVoxelEdits([]);resetPlayerFlight();clearMech();
                for(const meshes of chunkMeshes.values())for(const m of Object.values(meshes)){scene.remove(m);m.geometry?.dispose();}chunkMeshes.clear();rebuildQueue.clear();
                for(const list of [zombies,creepers,villagers,animals]){for(const m of list)disposeModModel(m.mesh);list.length=0;}
                selectedTerrain='moon';currentDimension='overworld';getSurfaceHeight=()=>0;camera.position.set(0,2.1,0);playerScale=1;gameMode='creative';isGameStarted=true;
                camera.rotation.set(0,0,0);scene.fog=null;scene.background.setHex(0xa6cedc);clouds.visible=false;heldItemGroup.visible=false;controls.isLocked=false;
                blocker.style.display='none';inventoryUI.style.display='none';
            };
            window.finishBuilding=()=>{let i=0;while(commandJob&&i++<2000)tickCommandJob();if(commandJob)throw Error('Construction did not finish');};
            window.renderBuilding=()=>{
                const r=constructionRegions.at(-1);
                for(let x=Math.floor(r.x/CHUNK_SIZE);x<=Math.floor((r.x+r.width-1)/CHUNK_SIZE);x++)for(let z=Math.floor(r.z/CHUNK_SIZE);z<=Math.floor((r.z+r.depth-1)/CHUNK_SIZE);z++)buildChunkMesh(x,z);
                camera.updateMatrixWorld(true);renderer.render(scene,camera);
                const gl=renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
                gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
                const colors=new Set();for(let i=0;i<pixels.length;i+=400)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
                if(colors.size<30||renderer.info.render.triangles<1000)throw Error('Blank building scene');
            };
            const check=(ok,name)=>{if(!ok)throw Error(name);};buildingReset();
            for(const text of ['房子20×21，一层为3格，10层','帮我设计一个20乘21的楼房，每层高三格，共十层','楼房长20宽21层数10层高3','房子20*21，10层，每层净高3','房子20×21 每层高3 10层','房子20×21 10层 每层高3格','房子20×21 每层高3格10层']){
                const p=parseWorldCommand(text);check(p.shape==='building'&&p.width===20&&p.depth===21&&p.floors===10&&p.floorHeight===3&&p.height===41,'House grammar: '+text);
            }
            check(parseWorldCommand('房子20×21').floors===1,'Single floor default');
            check(parseWorldCommand('房子20×21×8').kind==='room','Legacy three-dimensional room command');
            check(parseWorldCommand('房子长20宽21高8').kind==='room','Legacy named room dimensions');
            for(const text of ['城楼四角 楼和楼之间间隔20格 城楼高12格','四角城楼，相隔二十格，高十二格','城楼 高12 间隔20']){
                const p=parseWorldCommand(text);check(p.shape==='towers'&&p.towerSize===4&&p.gap===20&&p.width===28&&p.height===12,'Tower grammar: '+text);
            }
            check(parseWorldCommand('四角城楼 每座6×6 间隔10 高20').width===22,'Optional tower footprint');
            check(parseWorldCommand('城墙 厚5 长100 宽100').shape==='castle','Existing castle wall stays distinct');
            for(const s of ['房子20×21 0层','房子20×21 每层高2 10层','房子20×21 100层','房子6×6 10层','房子20×21 每层高3 10层 11层','房子20×21 长20 10层','房子20×21 每层高3 每层高4','房子20×21×8 10层','房子-20×21 10层','房子20.5×21 10层','房子20×21 高10','城楼 间隔0 高12','城楼 间隔193 高12','城楼4×5 间隔20 高12','城楼 高4','城楼 间隔20 间隔30','不要建房子20×21 10层']){
                let bad=false;try{parseWorldCommand(s);}catch{bad=true;}check(bad,'Reject invalid command: '+s);
            }
            executeWorldCommand(parseWorldCommand('房子20×21 每层高3 10层'));finishBuilding();
            const r=constructionRegions[0],at=(x,y,z)=>getBlock(r.x+x,r.y+y,r.z+z);
            check(worldMap.size<1000,'Sparse procedural building');
            for(let floor=0;floor<10;floor++){
                const base=floor*4;check(at(10,base,10)===63,'Floor slab '+floor);
                for(let h=1;h<=3;h++)check(at(10,base+h,10)===0,'Clear room height '+floor+':'+h);
                for(let step=1;step<=4;step++){
                    check(at(step+1,base+step,2)===63,'Stair step '+floor+':'+step);
                    check(at(step+1,base+step+1,2)===0&&at(step+1,base+step+2,2)===0,'Stair headroom');
                }
                check(at(0,base+2,5)===6,'Glass window per floor');
                check(at(17,base+3,2)===62,'Ceiling light per floor');
            }
            check(at(10,40,10)===63&&at(0,41,0)===6,'Roof and guardrail');
            check(at(10,1,0)===8&&at(10,2,0)===9,'Two-block entrance door');
            check(!checkScaledCollision(camera.position),'Safe player spawn');
            check(isTransparent(r.x,r.y+2,r.z+5),'Procedural glass does not hide adjacent faces');
            for(let y=1;y<=40;y++)check(at(18,y,19)===7,'Continuous ladder shaft through floors');
            controls.isLocked=true;camera.position.set(r.x+1,r.y+2.1,r.z+2);camera.rotation.set(0,-Math.PI/2,0);camera.updateMatrixWorld(true);
            for(let step=1;step<=4;step++){
                holdingSpace=true;moveForward=true;
                for(let i=0;i<45;i++){
                    if(camera.position.x>=r.x+step+0.95)moveForward=false;
                    updatePlayerMovement(1/60);
                }
                moveForward=false;for(let i=0;i<40;i++)updatePlayerMovement(1/60);
                check(camera.position.y>r.y+step+1.8,'Actual jump up stair '+step);
            }
            resetPlayerFlight();camera.rotation.set(0,0,0);camera.updateMatrixWorld(true);
            controls.isLocked=true;camera.position.set(r.x+18,r.y+2.1,r.z+19);holdingSpace=true;
            for(let i=0;i<660;i++)updatePlayerMovement(1/60);
            check(camera.position.y>r.y+40,'Actually climb through all ten floors');resetPlayerFlight();controls.isLocked=false;
            setBlock(r.x+10,r.y+1,r.z+10,4);check(at(10,1,10)===4,'Build furniture area manually');
            setBlock(r.x,r.y+1,r.z+10,0);check(at(0,1,10)===0,'Mine one generated wall block');
            setGenBlock(r.x,r.y+1,r.z+10,4);check(at(0,1,10)===0,'Terrain regeneration does not refill mined wall');
            const save=JSON.parse(JSON.stringify(saveWorldExpansion()));restoreConstruction();restoreWorldExpansion(save);
            check(at(10,36,10)===63&&at(10,1,10)===4&&constructionRegions[0].floors===10,'Persist floors and manual edits');
            camera.position.set(40,31,-45);camera.lookAt(0,18,0);renderBuilding();
            return 'PASS: House/tower grammar, validation, ten real floors with headroom, staircase, live ladder climbing, windows, roof, persistence and editable geometry.';
        }));
        await page.screenshot({path:'/private/tmp/mc-ten-storey-house.png'});
        await page.evaluate(()=>{camera.position.set(1,18.1,0);camera.lookAt(-6,18,-7);renderBuilding();});
        await page.screenshot({path:'/private/tmp/mc-house-interior.png'});
        console.log(await page.evaluate(()=>{
            const check=(ok,name)=>{if(!ok)throw Error(name);};buildingReset();
            executeWorldCommand(parseWorldCommand('城楼四角 间隔20 高12'));finishBuilding();const r=constructionRegions[0];
            check(r.width===28&&r.depth===28,'Square arrangement footprint');
            for(const dx of [0,24])for(const dz of [0,24]){
                const at=(x,y,z)=>getBlock(r.x+dx+x,r.y+y,r.z+dz+z);
                check(at(0,1,0)===3&&at(3,1,3)===3,'Four solid corners of each tower');
                check(at(2,1,1)===0,'Hollow tower interior');
                check(at(dx===0?3:0,1,1)===0&&at(dx===0?3:0,2,1)===0,'Inward-facing entrance');
                check(at(0,12,0)===3&&at(1,12,0)===0,'Roof battlements');
                controls.isLocked=true;camera.position.set(r.x+dx+1,r.y+2.1,r.z+dz+2);holdingSpace=true;
                for(let i=0;i<190;i++)updatePlayerMovement(1/60);
                check(camera.position.y>r.y+11,'Actually climb each tower');resetPlayerFlight();controls.isLocked=false;
            }
            for(let x=4;x<24;x++)check(getBlock(r.x+x,r.y+5,r.z+1)===0,'Exactly twenty empty cells between towers');
            check(getBlock(0,r.y,0)===63&&getBlock(0,r.y+12,0)===0,'Unroofed courtyard with solid floor');
            const save=JSON.parse(JSON.stringify(getWorldSaveData()));
            window.buildingSave=save;
            camera.position.set(34,30,-36);camera.lookAt(0,4,0);renderBuilding();
            return 'PASS: Exactly four 4x4 towers, twenty-cell edge-to-edge gaps, usable inward entrances, live roof climbing, battlements and open courtyard.';
        }));
        await page.screenshot({path:'/private/tmp/mc-four-corner-towers.png'});
        await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
        await page.evaluate(()=>{camera.position.set(44,38,-48);camera.lookAt(0,4,0);renderBuilding();});
        await page.screenshot({path:'/private/tmp/mc-four-corner-towers-mobile.png'});
        await page.evaluate(()=>openCommandPanel());
        await page.getByRole('textbox',{name:'输入中文命令'}).fill('房子20×21 每层高3 10层');
        await page.getByRole('button',{name:'检查命令',exact:true}).click();
        assert.match(await page.locator('#command-result').textContent(),/10层.*净高3格/);
        assert(await page.getByRole('button',{name:'执行',exact:true}).isEnabled());
        assert(await page.evaluate(()=>{const d=document.querySelector('#command-panel .world-dialog');return d.scrollWidth<=d.clientWidth+1;}));
        await page.screenshot({path:'/private/tmp/mc-building-command-mobile.png'});
        await page.getByRole('button',{name:'执行',exact:true}).click();
        assert(await page.evaluate(()=>{finishBuilding();return constructionRegions.at(-1).kind==='building'&&constructionRegions.at(-1).floors===10;}));
        await page.getByRole('textbox',{name:'输入中文命令'}).fill('房子20×21 每层高2 10层');
        await page.getByRole('button',{name:'检查命令',exact:true}).click();
        assert(await page.getByRole('button',{name:'执行',exact:true}).isDisabled());
        await page.evaluate(()=>{
            closeCommandPanel(false);buildingReset();
            window.loadSaveFile({target:{files:[new File([JSON.stringify(buildingSave)],'towers.json',{type:'application/json'})]}});
        });
        await page.waitForFunction(()=>constructionRegions[0]?.kind==='towers'&&getBlock(-14,12,-14)===3);
        await page.evaluate(()=>{
            buildingReset();setBlock(0,1,0,4);executeWorldCommand(parseWorldCommand('房子20×21 10层'));tickCommandJob();
            const data=JSON.parse(JSON.stringify(saveConstruction()));restoreConstruction();commandJob=null;restoreConstruction(data);finishBuilding();
            if(getBlock(0,36,0)!==63)throw Error('Interrupted build did not resume');
            buildingReset();setBlock(0,1,0,4);executeWorldCommand(parseWorldCommand('房子20×21 10层'));finishBuilding();executeWorldCommand({kind:'undo'});
        });
        await page.waitForFunction(()=>constructionRegions.length===0&&getBlock(0,1,0)===4);
        assert.deepEqual(errors,[]);
        console.log('PASS: Desktop/mobile canvas pixels and command controls, actual save-file reload, interrupted-job resume and undo.');
    } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
