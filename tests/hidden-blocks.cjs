const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

(async()=>{
    const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try {
        const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
        await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await page.waitForFunction(()=>expansionReady);
        console.log(await page.evaluate(()=>{
            const checks=[],check=(v,n)=>{if(!v)throw new Error(n);checks.push(n);};
            window.hiddenReset=()=>{
                clearExpansionWorld();worldMap.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();heightCache.clear();
                restoreMicroEdits([]);restoreFineVoxelEdits([]);resetPlayerFlight();clearMech();
                for(const meshes of chunkMeshes.values())for(const m of Object.values(meshes)){scene.remove(m);}
                chunkMeshes.clear();
                for(const list of [villagers,zombies,creepers,animals]){for(const m of list)disposeModModel(m.mesh);list.length=0;}
                selectedTerrain='moon';currentDimension='overworld';getSurfaceHeight=()=>-4;
                camera.position.set(0,2.1,3);camera.rotation.set(0,0,0);camera.updateMatrixWorld(true);
                playerScale=1;isGameStarted=true;gameMode='creative';controls.isLocked=false;
                isInventoryOpen=false;blocker.style.display='none';inventoryUI.style.display='none';heldItemGroup.visible=false;
            };
            hiddenReset();
            for(const [idText,block] of Object.entries(HIDDEN_BLOCKS)) {
                const id=Number(idText);check(materials[id]===materials[block.base],`${block.name} has exactly the original opaque texture`);
                check(!HOME_ITEMS[id]&&!isSolidType(id)&&isSolidType(block.base),`${block.name} is a passable voxel; original stays solid`);
                check(getDroppedItemForBlock(id)===id,`${block.name} retains its identity when dropped`);
                check(getBlockParticleColor(id)===getBlockParticleColor(block.base),`${block.name} fragments match its surface`);
                check(getMiningDuration(id,34)===getMiningDuration(block.base,34),`${block.name} mines like its base material`);
                document.getElementById(`inv-${id-12}`).click();check(currentBlock===id,`${block.name} can be selected`);
                const recipe=recipes.find(r=>r.out===id);
                craftingGrid=Object.entries(recipe.ing).flatMap(([t,n])=>Array(n).fill(Number(t)));
                while(craftingGrid.length<9)craftingGrid.push(0);checkRecipes();
                check(craftingOutput.id===id&&craftingOutput.count===4,`${block.name} has an unambiguous recipe`);
                for(let x=-2;x<=2;x++)for(let y=1;y<=3;y++)worldMap.set(`${x},${y},0`,id);
                for(let x=-3;x<=3;x++)for(let z=-5;z<=5;z++)worldMap.set(`${x},0,${z}`,3);
                resetPlayerFlight();playerScale=1;camera.position.set(0,2.1,2.5);controls.isLocked=true;moveForward=true;
                for(let i=0;i<60;i++)updatePlayerMovement(1/60);moveForward=false;
                check(camera.position.z<-0.6,`${block.name} wall can be walked through`);
                check(camera.position.y>=2,`Solid floor beneath ${block.name} still supports the player (${camera.position.toArray()})`);
                check(isTransparent(0,1,0),`${block.name} does not cull the adjacent room walls`);
                for(const scale of [1,0.05,0.005,0.0005,0.00005,0.000005,0.0000005]) {
                    playerScale=scale;
                    check(!checkCollision(new THREE.Vector3(0,2.1,0)),`${block.name} is passable at scale ${scale}`);
                    worldMap.set('0,2,0',block.base);
                    check(checkCollision(new THREE.Vector3(0,2.1,0)),`Base wall blocks scale ${scale}`);
                    worldMap.set('0,2,0',id);
                }
                hiddenReset();
                setBlock(0,1,0,id);buildChunkMesh(0,0);playerScale=0.05;
                const hit={...microCellAt(0.025,1.025,0.475),type:id};
                check(mineMicroBlock(hit)&&getMicroType(hit)===0,`${block.name} supports individual micro-cell mining`);
                check(getMicroType(offsetMicroCell(hit,0,0,-1))===id,`Mining ${block.name} removes only one cell`);
                const mesh=microMeshes.get(microParentKey(0,1,0));
                check(mesh?.geometry.attributes.position.count>0,`${block.name} remaining micro geometry is visible`);
                buildChunkMesh(0,0);check(!chunkMeshes.get('0,0')[id],`${block.name} edited cube is not drawn twice`);
                const edits=[...microMinedBlocks];restoreMicroEdits(edits);
                check(getMicroType(hit)===0&&getMicroType(offsetMicroCell(hit,0,0,-1))===id,`${block.name} micro edit survives restore`);
                const support={...microCellAt(2.025,1.025,0.025),norm:new THREE.Vector3(0,1,0)};
                setMicroPlacement(support,3);
                check(placeMicroBlock(support,id),`${block.name} can be placed as a small block`);
                const placed=offsetMicroCell(support,0,1,0);
                check(getMicroType(placed)===id&&!isSolidType(getMicroType(placed)),`Placed small ${block.name} remains passable`);
                hiddenReset();
            }
            check(parseWorldCommand('查找隐藏草块').id===132&&parseWorldCommand('查找隐藏土块').id===133&&parseWorldCommand('查找隐藏石头').id===134,'Chinese find commands select hidden blocks');
            return `${checks.length} hidden-block checks passed.`;
        }));

        // Use the actual right-click/mining handlers, including Survival inventory accounting.
        for(const id of [132,133,134]) {
            await page.evaluate(id=>{
                hiddenReset();gameMode='survival';playerInventory[id]=1;currentBlock=id;
                setBlock(0,1,0,3);camera.position.set(0,1,4);camera.lookAt(0,1,0);camera.updateMatrixWorld(true);controls.isLocked=true;
                document.dispatchEvent(new MouseEvent('mousedown',{button:2,bubbles:true}));
                document.dispatchEvent(new MouseEvent('mouseup',{button:2,bubbles:true}));
            },id);
            assert(await page.evaluate(id=>getBlock(0,1,1)===id&&playerInventory[id]===0,id),'Right click places one hidden block');
            assert(await page.evaluate(()=>{
                document.dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true}));
                return Boolean(miningState);
            }),'Hidden wall is still targetable for mining');
            await page.evaluate(()=>{updateMining(5);document.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true}));});
            assert(await page.evaluate(id=>getBlock(0,1,1)===0&&playerInventory[id]===0&&droppedItems.some(d=>d.itemType===id),id),'Mining removes the wall and drops its hidden item');
            assert(await page.evaluate(id=>{camera.position.set(0,2.1,1);updateDroppedItems(1/60);return playerInventory[id]===1;},id),'Approaching the dropped cube recovers the hidden item');
        }
        console.log('PASS: Survival right-click placement and left-click mining.');

        await page.evaluate(()=>{
            hiddenReset();for(const [i,id] of [132,133,134].entries()){setBlock(i*2,1,0,id);playerInventory[id]=i+2;}
            playerScale=0.05;mineMicroBlock({...microCellAt(0.025,1.025,0.475),type:132});
            setMicroPlacement(microCellAt(6.025,1.025,0.025),134);
        });
        const downloadPromise=page.waitForEvent('download');await page.evaluate(()=>downloadSave());
        const download=await downloadPromise,save=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
        assert.equal(new Map(save.worldMap).get('0,1,0'),132);
        await page.locator('#load-file').setInputFiles({name:'hidden-blocks.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(save))});
        await page.waitForFunction(()=>getBlock(0,1,0)===132&&getBlock(2,1,0)===133&&getBlock(4,1,0)===134&&playerInventory[134]===4);
        assert(await page.evaluate(()=>getMicroType(microCellAt(0.025,1.025,0.475))===0&&getMicroType(microCellAt(6.025,1.025,0.025))===134&&!isSolidType(getBlock(4,1,0))));
        console.log('PASS: Downloaded save reload preserves full/micro hidden blocks and inventory.');

        await page.evaluate(()=>{
            hiddenReset();scene.background.setHex(0xb9dae9);scene.fog=null;
            const dirty=new Set(),put=(x,y,z,t)=>setBlockNoRebuild(x,y,z,t,dirty);
            for(let x=-5;x<=5;x++)for(let z=-5;z<=3;z++)put(x,0,z,63);
            for(let x=-4;x<=4;x++)for(let y=1;y<=3;y++){
                put(x,y,-4,51);put(x,y,0,x===-2?132:x===0?133:x===2?134:x<-1?1:x<2?2:3);
            }
            for(const key of dirty){const [x,z]=key.split(',').map(Number);buildChunkMesh(x,z);}
            camera.position.set(6,5,9);camera.lookAt(0,1,0);camera.updateMatrixWorld(true);renderer.render(scene,camera);
        });
        for(const [width,height,label] of [[1280,800,'desktop'],[390,844,'mobile']]) {
            await page.setViewportSize({width,height});
            assert(await page.evaluate(()=>{
                renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.render(scene,camera);
                const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,pixels=new Uint8Array(w*h*4);
                gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const colors=new Set();
                for(let i=0;i<pixels.length;i+=64)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
                return colors.size>50&&renderer.info.render.triangles>100;
            }),'Actual voxel canvas is nonblank');
            await page.screenshot({path:`/private/tmp/mc-hidden-${label}.png`});
            await page.evaluate(()=>{isInventoryOpen=true;inventoryUI.style.display='block';switchTab('build');});
            await page.locator('#inv-122').scrollIntoViewIfNeeded();
            for(const id of [120,121,122]) {
                const slot=page.locator(`#inv-${id}`);
                assert(await slot.locator('img').evaluate(el=>el.complete&&el.naturalWidth>0));
                assert(await slot.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&el.scrollWidth<=el.clientWidth&&el.scrollHeight<=el.clientHeight;}));
            }
            await page.screenshot({path:`/private/tmp/mc-hidden-inventory-${label}.png`});
            await page.evaluate(()=>{isInventoryOpen=false;inventoryUI.style.display='none';});
        }
        assert.deepEqual(errors,[]);console.log('PASS: Desktop/mobile rendering, textured inventory icons and zero page errors.');
    } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
