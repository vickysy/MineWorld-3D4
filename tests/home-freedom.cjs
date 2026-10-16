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
            window.homeFreedomReset=()=>{
                clearExpansionWorld();worldMap.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();heightCache.clear();
                restoreMicroEdits([]);restoreFineVoxelEdits([]);resetPlayerFlight();clearMech();
                for(const meshes of chunkMeshes.values())for(const m of Object.values(meshes))scene.remove(m);chunkMeshes.clear();
                for(const list of [villagers,zombies,creepers,animals]){for(const m of list)disposeModModel(m.mesh);list.length=0;}
                selectedTerrain='moon';currentDimension='overworld';getSurfaceHeight=()=>0;
                camera.position.set(0,2.1,4);camera.rotation.set(0,0,0);camera.updateMatrixWorld(true);
                playerScale=1;isGameStarted=true;gameMode='creative';controls.isLocked=false;isInventoryOpen=false;
                blocker.style.display='none';inventoryUI.style.display='none';heldItemGroup.visible=false;
            };
            homeFreedomReset();
            check(placeFurniture(SHOWER_DOOR_ID,0,1,0),'First door places');camera.position.set(5,2.1,0);
            check(placeFurniture(SHOWER_DOOR_ID,1,1,0)&&placeFurniture(112,2,1,0),'Second door and fixed glass place beside it');
            const a=furnitureRecord(0,1,0),b=furnitureRecord(1,1,0),glass=furnitureRecord(2,1,0);
            check(a.data.yaw===b.data.yaw&&b.data.yaw===glass.data.yaw,'Adjoining panes align despite different placement view');
            check(isSolid(0,1,0)&&isSolid(0,2,0),'Closed door blocks both lower and upper cells');
            check(toggleShowerDoors(a)&&a.data.open&&b.data.open,'Connected doors open together');
            check(!isSolid(0,1,0)&&!isSolid(0,2,0)&&!isSolid(1,1,0),'Opening clears actual collision for both doors');
            for(const scale of [1,0.05,0.005]){playerScale=scale;check(!checkScaledCollision(new THREE.Vector3(0,2.1,0)),`Open doorway passable at ${scale}`);}
            playerScale=1;camera.position.set(0,2.1,0);
            check(!toggleShowerDoors(a)&&a.data.open&&b.data.open,'Door cannot close on the player');
            camera.position.set(0,2.1,4);for(let i=0;i<5;i++)updateWorldExpansion(0.2);
            const left=furnitureMeshes.get(a.key),right=furnitureMeshes.get(b.key);
            check(Math.abs(left.userData.glassPanel.rotation.y)>1.4&&left.userData.glassPanel.rotation.y*right.userData.glassPanel.rotation.y<0,'Paired doors swing away from their common center');
            check(!left.userData.glassPosts[1].visible&&!right.userData.glassPosts[0].visible,'Connecting edges have no double posts');
            check(toggleShowerDoors(a)&&isSolid(1,2,0),'Closed doors regain collision');
            check(placeFurniture(SHOWER_ID,-2,1,0),'Shower places as a two-cell fixture');
            check(!isSolid(-2,1,0)&&!isSolid(-2,2,0),'Player can stand under the shower head');
            for(const id of [SHOWER_ID,SHOWER_DOOR_ID,BOOKSHELF_ID]) {
                const recipe=recipes.find(r=>r.out===id);craftingGrid=Object.entries(recipe.ing).flatMap(([t,n])=>Array(n).fill(Number(t)));checkRecipes();
                check(craftingGrid.length<=9&&craftingOutput.id===id,`${getBlockName(id)} has a working nine-slot recipe`);
                check(getInventorySlotMapping()[id-12]===id&&document.getElementById(`inv-${id-12}`),`${getBlockName(id)} is selectable`);
            }
            check(parseWorldCommand('帮我找到淋浴门').id===SHOWER_DOOR_ID&&parseWorldCommand('查找书本方块').id===BOOKSHELF_ID,'Chinese aliases find the new items');
            check(parseWorldCommand('查找太三').id===100,'Chinese numeral normalization preserves existing car aliases');
            const sentences=['帮我搭建一个20×20×20的正方形空间','请帮我建造一个二十乘二十乘二十的房间','做一个长20格、宽20格、高20格的空间','搭建２０＊２０＊２０的空间','建造边长二十的正方体空间','帮我搭建一个20格乘以20格乘以20格的空间'];
            for(const text of sentences){const p=parseWorldCommand(text);check(p.kind==='room'&&p.width===20&&p.depth===20&&p.height===20&&p.layers===20,`Understands: ${text}`);}
            const named=parseWorldCommand('搭建一个高8宽12长18的房间');check(named.width===18&&named.depth===12&&named.height===8,'Named dimensions work in any order');
            for(const text of ['不要搭建20×20×20空间','搭建20×20×0空间','搭建-20×20×20空间','搭建20.5×20×20空间','搭建20×20×20×20空间','搭建20×20×20空间然后用水淹没','搭建100×100×100空间','建一个长20高20的空间','做一个我想象中的东西']) {
                let rejected=false;try{parseWorldCommand(text);}catch{rejected=true;}check(rejected,`Rejects ambiguous/invalid command: ${text}`);
            }
            homeFreedomReset();camera.position.set(0,2.1,0);const plan=parseWorldCommand(sentences[0]);
            executeWorldCommand(plan);check(commandJob.changes.length===8000,'20 cubed edits exactly 8000 cells, not 8400');
            tickCommandJob();check(commandJob.index===256,'World changes remain batched');while(commandJob)tickCommandJob();
            check(getBlock(-10,0,-10)===51&&getBlock(9,19,9)===51&&getBlock(0,19,0)===51,'Exact outer bounds and roof are present');
            check(getBlock(0,0,0)===63&&getBlock(0,1,0)===0&&getBlock(0,18,0)===0,'Room interior is hollow with a solid floor');
            check(getBlock(0,1,-10)===8&&getBlock(0,2,-10)===9,'Room has a working two-cell door');
            check(getBlock(0,20,0)===0&&!checkScaledCollision(camera.position),'No unwanted twenty-first layer; player is not embedded');
            executeWorldCommand({kind:'undo'});while(commandJob)tickCommandJob();check(getBlock(0,19,0)===0&&getBlock(0,0,0)===3,'Undo restores terrain');
            return `${checks.length} home interaction and command checks passed.`;
        }));

        await page.evaluate(()=>{homeFreedomReset();placeFurniture(86,0,1,0);openFurniturePanel(furnitureRecord(0,1,0));});
        await page.getByRole('checkbox',{name:'Tap',exact:true}).check();
        await page.evaluate(()=>{updateWorldExpansion(0.2);window.dropBefore=furnitureMeshes.get('overworld|0,1,0').userData.waterDrops.children[0].position.clone();updateWorldExpansion(0.2);});
        assert(await page.evaluate(()=>{const m=furnitureMeshes.get('overworld|0,1,0');return m.userData.stream.visible&&m.userData.waterDrops.visible&&!dropBefore.equals(m.userData.waterDrops.children[0].position);}));
        await page.evaluate(()=>{gameMode='survival';playerInventory[45]=1;playerInventory[65]=0;});
        await page.getByRole('button',{name:'Fill Bucket',exact:true}).click();assert(await page.evaluate(()=>playerInventory[45]===0&&playerInventory[65]===1));
        await page.getByRole('checkbox',{name:'Tap',exact:true}).uncheck();await page.evaluate(()=>updateWorldExpansion(0.2));
        assert(await page.evaluate(()=>!furnitureMeshes.get('overworld|0,1,0').userData.waterDrops.visible));
        await page.evaluate(()=>{closeFurniturePanel(false);gameMode='creative';placeFurniture(SHOWER_ID,-2,1,0);openFurniturePanel(furnitureRecord(-2,1,0));});
        await page.getByRole('checkbox',{name:'Water',exact:true}).check();await page.evaluate(()=>updateWorldExpansion(0.2));
        assert(await page.evaluate(()=>furnitureMeshes.get('overworld|-2,1,0').userData.waterDrops.visible));
        await page.evaluate(()=>{closeFurniturePanel(false);placeFurniture(85,2,1,0);openFurniturePanel(furnitureRecord(2,1,0));});
        await page.getByRole('button',{name:'Use Toilet',exact:true}).click();
        assert(await page.evaluate(()=>seatedAt?.key==='overworld|2,1,0'&&furnitureRecord(2,1,0).data.using===3));
        await page.evaluate(()=>{for(let i=0;i<16;i++)updateWorldExpansion(0.2);});
        assert(await page.evaluate(()=>furnitureRecord(2,1,0).data.using===0&&furnitureRecord(2,1,0).data.flushing>0&&furnitureMeshes.get('overworld|2,1,0').userData.flushDrops.visible));
        await page.evaluate(()=>{standFromChair();controls.unlock();placeFurniture(BOOKSHELF_ID,4,1,0);openFurniturePanel(furnitureRecord(4,1,0));});
        await page.getByRole('textbox',{name:'Book text'}).fill('My secret room is behind the stone wall.');
        await page.getByRole('button',{name:'Save',exact:true}).click();
        assert.equal(await page.evaluate(()=>furnitureRecord(4,1,0).data.note),'My secret room is behind the stone wall.');
        for(const id of [120,121,122,123,124,125]) {
            await page.evaluate(()=>controls.unlock());await page.waitForFunction(()=>!document.pointerLockElement);
            await page.evaluate(id=>{closeFurniturePanel(false);controls.isLocked=false;gameMode='survival';playerInventory[id]=1;currentBlock=id;health=2;hunger=1;handleExpansionClick({button:0});},id);
            await page.getByRole('button',{name:'Eat',exact:true}).click();
            assert(await page.evaluate(id=>health===maxHealth&&hunger===maxHunger&&playerInventory[id]===0,id),`Food ${id} must restore health and consume exactly one`);
        }
        console.log('PASS: Real tap, shower, bucket, toilet, book and six food UI actions.');
        await page.evaluate(()=>{controls.unlock();gameMode='creative';placeFurniture(SHOWER_DOOR_ID,6,1,0);toggleShowerDoors(furnitureRecord(6,1,0));});
        const downloadEvent=page.waitForEvent('download');await page.evaluate(()=>downloadSave());const saved=JSON.parse(fs.readFileSync(await(await downloadEvent).path(),'utf8'));
        await page.locator('#load-file').setInputFiles({name:'home-freedom.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
        await page.waitForFunction(()=>furnitureRecord(4,1,0)?.data.note==='My secret room is behind the stone wall.');
        assert(await page.evaluate(()=>furnitureRecord(-2,1,0).data.on&&furnitureRecord(6,1,0).data.open&&!isSolid(6,2,0)));
        console.log('PASS: Book text, shower switch and open-door collision survive downloaded save/load.');

        await page.evaluate(()=>{
            homeFreedomReset();scene.fog=null;scene.background.setHex(0xb9d6e1);
            for(let x=-5;x<=5;x++)for(let z=-4;z<=4;z++)setBlockNoRebuild(x,0,z,63,rebuildQueue);
            for(const [id,x,y,z] of [[86,0,1,0],[87,0,2,0],[85,2,1,0],[SHOWER_ID,-3,1,0],[112,-4,1,1],[SHOWER_DOOR_ID,-3,1,1],[SHOWER_DOOR_ID,-2,1,1],[BOOKSHELF_ID,4,1,0]])placeFurniture(id,x,y,z);
            for(const [key,data] of furnitureData)if([86,SHOWER_ID].includes(data.id))data.on=true;
            for(let x=-1;x<=0;x++)for(let z=-1;z<=0;z++)buildChunkMesh(x,z);
            camera.position.set(0,2.1,2.4);camera.lookAt(0,2,-0.4);camera.updateMatrixWorld(true);updateWorldExpansion(0.2);renderer.render(scene,camera);
            window.testMirror=furnitureMeshes.get('overworld|0,2,0').userData.mirror;
        });
        assert(await page.evaluate(()=>{
            const rt=testMirror.getRenderTarget(),pixels=new Uint8Array(rt.width*rt.height*4);renderer.readRenderTargetPixels(rt,0,0,rt.width,rt.height,pixels);
            const colors=new Set();for(let i=0;i<pixels.length;i+=128)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
            return rt.width===1024&&colors.size>40&&reflectionAvatar.children[0].children.length>10&&!reflectionAvatar.visible&&!reflecting;
        }),'Mirror has a high-resolution real reflection and a detailed face');
        await page.screenshot({path:'/private/tmp/mc-smooth-mirror.png'});
        for(const [width,height,label] of [[1440,900,'desktop'],[390,844,'mobile']]) {
            await page.setViewportSize({width,height});
            await page.evaluate(()=>{camera.position.set(5,4.3,7);camera.lookAt(0,1.3,0);camera.updateMatrixWorld(true);renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.render(scene,camera);});
            await page.screenshot({path:`/private/tmp/mc-bathroom-${label}.png`});
            assert(await page.evaluate(()=>{renderer.render(scene,camera);const gl=renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels.some((v,i)=>i%4!==3&&v>30)&&renderer.info.render.triangles>500;}));
            await page.evaluate(()=>{openCommandPanel();});
            await page.getByRole('textbox',{name:'输入中文命令'}).fill('帮我搭建一个20×20×20的正方形空间');
            await page.getByRole('button',{name:'检查命令',exact:true}).click();
            assert((await page.locator('#command-result').textContent()).includes('20 × 20 × 20'));
            assert(await page.locator('#command-panel .world-dialog').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));
            await page.screenshot({path:`/private/tmp/mc-natural-command-${label}.png`});
            await page.getByRole('textbox',{name:'输入中文命令'}).fill('不要搭建20×20×20空间');await page.getByRole('button',{name:'检查命令',exact:true}).click();
            assert(await page.locator('#execute-command').isDisabled());await page.evaluate(()=>closeCommandPanel(false));
        }
        assert.deepEqual(errors,[]);console.log('PASS: Real mirror pixels, desktop/mobile 3D views and safe natural-language command UI.');
    } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
