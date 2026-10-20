const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
    const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try{
        const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
        page.setDefaultNavigationTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
        await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
        await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await page.waitForFunction(()=>expansionReady&&typeof XL_SOFA_ID!=='undefined');
        console.log(await page.evaluate(()=>{
            const checks=[],check=(v,s)=>{if(!v)throw Error(s);checks.push(s);};
            window.playReset=()=>{
                clearExpansionWorld();clearMech();resetPlayerFlight();worldMap.clear();heightCache.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();
                restoreMicroEdits([]);restoreFineVoxelEdits([]);rebuildQueue.clear();chunkQueue.length=0;cancelMining();
                for(const ms of chunkMeshes.values())for(const m of Object.values(ms))scene.remove(m);chunkMeshes.clear();
                for(const list of [villagers,zombies,creepers,animals,endermen,minecarts]){for(const m of list)disposeModModel(m.mesh);list.length=0;}ridingMinecart=null;
                currentDimension='overworld';selectedTerrain='moon';getSurfaceHeight=()=>0;
                for(let x=-32;x<=32;x++)for(let z=-32;z<=32;z++)worldMap.set(`${x},0,${z}`,3);
                camera.position.set(20,2.1,20);camera.rotation.set(0,0,0);camera.updateMatrixWorld(true);playerScale=1;gameMode='creative';isGameStarted=true;controls.isLocked=true;isSleeping=false;playerTired=false;
                blocker.style.display='none';inventoryUI.style.display='none';document.getElementById('home-panel').hidden=true;heldItemGroup.visible=false;clouds.visible=false;scene.background.setHex(0xb9dbe7);scene.fog=null;
            };
            window.playPut=(x,y,z,id)=>setBlockNoRebuild(x,y,z,id,rebuildQueue);
            const water=()=>[...worldMap].filter(([,id])=>id===24);
            playReset();
            for(let i=0;i<2000;i++)queueFluidCell(0,20+i,0);
            check(!waterFlowQueue.length,'Air does not consume the water update budget');
            for(let x=0;x<8;x++)for(let z=0;z<8;z++)playPut(x,16,z,24);
            for(let i=0;i<30;i++)tickWaterFlow(1/60);
            check(water().every(([k])=>Number(k.split(',')[1])===1),'Whole water sheet falls promptly');
            check(water().reduce((s,[k])=>s+waterAmount(...k.split(',').map(Number)),0)===512,'Flow conserves water');
            for(let i=0;i<600;i++)tickWaterFlow(1/60);
            check(waterFlowQueue.length===0,'Settled water sleeps');
            const drain=water()[0][0].split(',').map(Number);playPut(drain[0],0,drain[2],0);tickWaterFlow(.1);
            check(getBlock(drain[0],0,drain[2])===24,'Digging pool floor immediately wakes the water');
            playReset();playPut(0,4,0,43);playPut(0,8,0,24);
            for(let i=0;i<12;i++)tickWaterFlow(1/60);
            check(getBlock(0,4,0)===44,'Falling water still quenches lava');
            for(const depth of [0,1,8]){
                playReset();gameMode='survival';camera.position.set(0,2.1,0);
                if(depth){for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++){playPut(x,1,z,24);waterAmounts.set(`${x},1,${z}`,depth);}}
                holdingSpace=true;updatePlayerMovement(1/60);
                if(depth<8)check(velocity.y===8,`Dry/shallow water jump remains a land jump ${depth}`);
                else check(velocity.y===3.2,'Deep water uses swimming, not a land launch');
            }
            playReset();gameMode='survival';
            for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)for(let y=1;y<=5;y++)playPut(x,y,z,24);
            camera.position.set(0,3,0);velocity.y=-100;holdingSpace=true;swimInputHeld=true;
            for(let i=0;i<180;i++)updatePlayerMovement(1/60);
            check(camera.position.y>5&&!getPlayerEnvironment().headInWater,'Holding Space keeps swimming at the surface after entering water');
            holdingSpace=false;swimInputHeld=false;holdingDescend=true;const top=camera.position.y;
            for(let i=0;i<60;i++)updatePlayerMovement(1/60);
            check(camera.position.y<top-.5,'B deliberately dives');

            playReset();
            for(let x=-1;x<=1;x++)for(let y=1;y<=3;y++)for(let z=-1;z<=1;z++)playPut(x,y,z,3);
            playPut(0,2,0,REDSTONE_DUST_ID);buildChunkMesh(0,0);
            check(isTransparent(0,2,0)&&!isSolid(0,2,0),'Dust never hides adjacent block faces or blocks walking');
            check(chunkMeshes.get('0,0')[3]?.userData.blockIndices.has('0,1,0'),'Actual floor geometry under dust is rendered inside a solid enclosure');

            for(const [sx,sz] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
                playReset();
                for(let i=0;i<=5;i++){playPut(-sx*i,1,0,26);playPut(0,1,sz*i,26);}
                const shape=computeRailShape(0,1,0);check(shape.curved,'L shaped rails have a real curve');
                const model=createMinecartModel();model.position.set(-sx*4,1.25,0);scene.add(model);
                const cart={mesh:model,vx:sx*4,vz:0,isRiding:false};minecarts.push(cart);let diagonal=false;
                for(let i=0;i<100;i++){updateMinecarts(1/60);if(Math.abs(cart.vx)>.5&&Math.abs(cart.vz)>.5)diagonal=true;}
                check(diagonal&&Math.abs(model.position.x)<.01&&model.position.z*sz>1,`Cart follows and faces curve ${sx},${sz}`);
                check(!cart.derailed,'Curve keeps the cart on track');
            }
            playReset();for(let x=-3;x<=1;x++)playPut(x,1,0,26);for(let x=2;x<=5;x++)playPut(x,2,0,26);
            const ramp=createMinecartModel();ramp.position.set(-2,1.25,0);scene.add(ramp);
            const cart={mesh:ramp,vx:4,vz:0,isRiding:false};minecarts.push(cart);let previous=ramp.position.clone(),maxJump=0;
            for(let i=0;i<100;i++){updateMinecarts(1/60);maxJump=Math.max(maxJump,Math.abs(ramp.position.y-previous.y));previous.copy(ramp.position);}
            check(ramp.position.x>3&&ramp.position.y>2&&maxJump<.12,'Rail slopes are continuous, without jumping or derailing');
            cart.track=null;cart.vx=-4;cart.vz=0;ramp.position.set(4,2.25,0);previous=ramp.position.clone();maxJump=0;
            for(let i=0;i<100;i++){updateMinecarts(1/60);maxJump=Math.max(maxJump,Math.abs(ramp.position.y-previous.y));previous.copy(ramp.position);}
            check(ramp.position.x<0&&Math.abs(ramp.position.y-1.25)<.01&&maxJump<.12,'Cart can descend the same ramp without snapping');
            playReset();for(let x=0;x<=20;x++){playPut(x,1,0,27);playPut(x,1,1,REDSTONE_DUST_ID);}playPut(-1,1,1,30);
            const poweredCart={mesh:createMinecartModel(),vx:4,vz:0,isRiding:false};poweredCart.mesh.position.set(2,1.25,0);scene.add(poweredCart.mesh);minecarts.push(poweredCart);
            for(let i=0;i<30;i++)updateMinecarts(1/60);check(poweredCart.railSpeed===4,'Disconnected powered rail does not supply free acceleration');
            playPut(-1,1,1,31);for(let i=0;i<30;i++)updateMinecarts(1/60);
            check(poweredCart.railSpeed>5.8,'Lever and dust supply powered rail acceleration');
            playPut(-1,1,1,30);poweredCart.isRiding=true;moveBackward=true;
            for(let i=0;i<120;i++)updateMinecarts(1/60);moveBackward=false;
            check(poweredCart.vx< -1,'Holding reverse brakes and then reverses without direction oscillation');

            for(const wallHeight of [1,2]){
                playReset();for(let x=-12;x<=12;x++)for(let z=-32;z<=-5;z++)for(let y=1;y<=wallHeight;y++)playPut(x,y,z,3);
                camera.position.set(0,2.1,0);check(enterMech(70)&&transformMech(),'Prime can transform into the vehicle');
                moveForward=true;for(let i=0;i<180;i++)updatePlayerMovement(1/60);moveForward=false;
                if(wallHeight===1)check(camera.position.z< -7&&camera.position.y-getPlayerHeight()>1.45,`Prime vehicle climbs a one-block slope: ${camera.position.toArray()}, feet ${camera.position.y-getPlayerHeight()}`);
                else check(camera.position.z> -4,'Prime cannot climb a two-block wall');
            }
            playReset();
            for(const id of [149,150,151,152,153]) {
                check(getInventorySlotMapping()[id-12]===id&&!!document.getElementById(`inv-${id-12}`),`Home item ${id} is selectable`);
                const recipe=recipes.find(r=>r.out===id);check(!!recipe,`Home item ${id} has a recipe`);
                craftingGrid=Object.entries(recipe.ing).flatMap(([k,n])=>Array(n).fill(Number(k)));checkRecipes();check(craftingOutput.id===id,`Recipe ${id} does not collide`);
            }
            check(placeFurniture(XL_SOFA_ID,0,1,0),'Four-seat sofa places');
            check(furnitureRecord(0,1,0).data.parts.length===3,'Whole sofa footprint is reserved and saved');
            check(!placeFurniture(82,...furnitureRecord(0,1,0).data.parts[0]),'Cannot place another item inside the sofa');
            check(furnitureMeshes.get('overworld|0,1,0').userData.sofaSections.length===4,'Four actual sofa seats');
            check(placeFurniture(89,10,1,0)&&placeFurniture(93,10,1,3),'Lamp and television place');
            for(const pos of [[9,1,0],[9,1,1],[9,1,2],[9,1,3]])playPut(...pos,REDSTONE_DUST_ID);
            playPut(8,1,0,31);furnitureRecord(10,1,0).data.redstone=true;furnitureRecord(10,1,3).data.redstone=true;updateConnectedPower();
            check(furnitureRecord(10,1,0).data.on&&furnitureRecord(10,1,3).data.on,'One connected wire switches both light and TV on');
            playPut(8,1,0,30);updateConnectedPower();check(!furnitureRecord(10,1,0).data.on&&!furnitureRecord(10,1,3).data.on,'Same lever switches both off');
            check(placeFurniture(95,-8,1,0)&&placeFurniture(94,-6,1,0),'Gaming PC and monitor place');
            const tower=furnitureRecord(-8,1,0),monitor=furnitureRecord(-6,1,0);monitor.data.tower=tower.key;tower.data.on=true;updateConnectedPower();
            check(monitor.data.on,'Connected monitor follows the computer tower');
            const pc=furnitureMeshes.get(tower.key);check(pc.userData.pcFans.length===3&&pc.children.length>15,'Gaming tower has three fans, transparent side and internal parts');
            check(placeFurniture(74,10,1,5),'Console places');connectConsoleScreen(furnitureRecord(10,1,5),12);
            check(furnitureRecord(10,1,3).data.consoleScore===12,'Game console sends its score to the nearby TV');
            const saved=saveWorldExpansion();clearExpansionWorld();restoreWorldExpansion(saved);
            check(furnitureRecord(-6,1,0).data.tower===tower.key&&furnitureRecord(0,1,0).data.parts.length===3,'Connected furniture survives save/load');
            return `PASS: ${checks.length} water, swimming, dust rendering, rail, slope and connected furniture checks.`;
        }));
        await page.evaluate(()=>{camera.position.set(10,2.1,7);currentBlock=TV_REMOTE_ID;controls.isLocked=true;});
        await page.mouse.click(640,400,{button:'right'});
        await page.getByRole('button',{name:'Power',exact:true}).click();
        assert(await page.evaluate(()=>document.getElementById('home-title').textContent==='TV Remote'));
        await page.getByRole('button',{name:'Next Channel',exact:true}).click();
        assert(await page.evaluate(()=>furnitureRecord(10,1,3).data.channel===1));
        await page.evaluate(()=>{closeFurniturePanel(false);camera.position.set(20,2.1,20);placeFurniture(NIGHTSTAND_ID,4,1,4);openFurniturePanel(furnitureRecord(4,1,4));});
        await page.getByLabel('Stored item').selectOption('3');
        await page.getByRole('button',{name:'Store',exact:true}).click();
        assert.equal(await page.evaluate(()=>furnitureRecord(4,1,4).data.storage[3]),1);
        await page.getByRole('button',{name:'Take',exact:true}).click();
        assert.equal(await page.evaluate(()=>furnitureRecord(4,1,4).data.storage[3]),0);
        await page.mouse.move(640,400);
        await page.evaluate(()=>{
            closeFurniturePanel(false);camera.position.set(20,2.1,20);if(!placeFurniture(MOUSE_ID,-6,2,1))throw Error('Mouse did not place');
            camera.position.set(-6,2.5,4);camera.lookAt(-6,2,1);camera.updateMatrixWorld(true);controls.isLocked=true;currentBlock=2;
            if(expansionRay()?.type!==MOUSE_ID)throw Error('Mouse is not in the crosshair');
        });
        await page.mouse.click(640,400,{button:'right'});
        assert.equal(await page.locator('#home-title').textContent(),'Monitor');
        await page.evaluate(()=>{
            playReset();camera.position.set(20,3,20);
            for(const [id,x,y,z] of [[149,-2,1,3],[93,-1,1,-3],[151,4,1,3],[89,4,2,3],[90,-4,1,-3],[152,3,1,-3],[94,3,2,-3],[95,5,1,-3],[78,3,2,-2],[153,4,2,-2],[79,3,1,0],[150,0,1,1]]){camera.position.set(x,10,z+10);if(!placeFurniture(id,x,y,z))throw Error(`Showroom item ${id} did not place`);}
            for(const data of furnitureData.values())data.on=true;
            for(let x=-5;x<=7;x++)playPut(x,1,-7,26);for(let z=-6;z<=-3;z++)playPut(7,1,z,26);
            syncFurnitureMeshes();for(const [key,model] of furnitureMeshes){paintDeviceScreen(model,furnitureData.get(key),1);updateExtraFurniture(model,furnitureData.get(key),.1);}
            for(let x=-1;x<=0;x++)for(let z=-1;z<=0;z++)buildChunkMesh(x,z);
            camera.position.set(11,10,14);camera.lookAt(0,1,-1);camera.updateMatrixWorld(true);blocker.style.display='none';
            clearTimeout(toastTimeout);document.getElementById('toast-msg').style.display='none';
        });
        for(const [width,height,label] of [[1280,800,'desktop'],[390,844,'mobile']]){
            await page.setViewportSize({width,height});
            assert(await page.evaluate(({width,height})=>{
                camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height);renderer.render(scene,camera);
                const gl=renderer.getContext(),p=new Uint8Array(4),colors=new Set();
                for(let x=20;x<gl.drawingBufferWidth;x+=20)for(let y=20;y<gl.drawingBufferHeight;y+=20){gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);colors.add(p.slice(0,3).join(','));}
                return colors.size>30;
            },{width,height}));
            await page.screenshot({path:`/private/tmp/mc-connected-${label}.png`});
        }
        await page.setViewportSize({width:1280,height:800});
        await page.evaluate(()=>{
            camera.aspect=1280/800;camera.updateProjectionMatrix();renderer.setSize(1280,800);camera.position.set(6.7,3,-0.4);camera.lookAt(4,1.7,-2.8);camera.updateMatrixWorld(true);renderer.render(scene,camera);
            if(!furnitureMeshes.has('overworld|5,1,-3'))throw Error('Gaming tower is missing from the scene');
        });
        await page.screenshot({path:'/private/tmp/mc-gaming-desk.png'});
        await page.evaluate(()=>{
            playReset();for(let i=0;i<=5;i++){playPut(-i,1,0,26);playPut(0,1,i,26);}
            const mesh=createMinecartModel();mesh.position.set(-0.5,1.25,0);scene.add(mesh);minecarts.push({mesh,vx:3,vz:0,isRiding:false});
            updateMinecarts(.001);for(let x=-1;x<=0;x++)for(let z=-1;z<=0;z++)buildChunkMesh(x,z);
            camera.position.set(-2.2,3,3.5);camera.lookAt(0,1,0);camera.updateMatrixWorld(true);renderer.render(scene,camera);
            window.cartBefore={position:mesh.position.toArray(),yaw:mesh.rotation.y};
        });
        await page.screenshot({path:'/private/tmp/mc-cart-before.png'});
        assert(await page.evaluate(()=>{
            for(let i=0;i<8;i++)updateMinecarts(1/60);
            const mesh=minecarts[0].mesh;renderer.render(scene,camera);
            return mesh.position.distanceTo(new THREE.Vector3(...cartBefore.position))>.2&&Math.abs(mesh.rotation.y-cartBefore.yaw)>.4;
        }));
        await page.screenshot({path:'/private/tmp/mc-cart-turn.png'});
        assert.deepEqual(errors,[]);console.log('PASS: Real remote and storage buttons, desktop/mobile connected-home and curved-track rendering.');
    }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
