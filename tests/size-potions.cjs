const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
    const browser=await chromium.launch({headless:true,
        ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
    try {
        const page=await browser.newPage({viewport:{width:1280,height:800}});
        const errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        page.on('console',message=>{if(message.type()==='error' && /shader|program/i.test(message.text())) errors.push(message.text());});
        await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
        await page.goto(pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await page.waitForFunction(()=>typeof drinkGrowPotion==='function');
        const result=await page.evaluate(()=>{
            const passed=[];
            const check=(value,name)=>{if(!value) throw new Error(name);passed.push(name);};
            const close=(a,b)=>Math.abs(a-b)<1e-8;
            selectedTerrain='moon'; currentDimension='overworld'; getSurfaceHeight=()=>0;
            worldMap.clear();heightCache.clear();restoreMicroEdits([]);
            for(let x=-3;x<=3;x++) for(let z=-3;z<=3;z++) for(let y=-3;y<=0;y++) worldMap.set(`${x},${y},${z}`,3);
            isGameStarted=true;gameMode='creative';controls.isLocked=true;playerScale=1;
            camera.position.set(0.0025,2.1,0.0025);
            buildChunkMesh(0,0);buildChunkMesh(-1,0);
            check(document.getElementById('inv-36').nextElementSibling.id==='inv-54','Grow potion is next to shrink potion');
            selectSlot(54);
            check(currentBlock===GROW_POTION_ID,'New inventory slot selects Grow Potion');
            check(recipes.some(r=>r.out===GROW_POTION_ID),'Grow Potion has a survival crafting recipe');
            gameMode='survival';
            for(const [ore,potion] of [[36,46],[37,66]]) {
                playerInventory[ore]=2;playerInventory[23]=3;playerInventory[potion]=0;
                currentBlock=ore;craftSlotClick(0);craftSlotClick(1);
                currentBlock=23;craftSlotClick(2);craftSlotClick(3);craftSlotClick(4);
                check(craftingOutput.id===potion,`Five ingredients fit and craft potion ${potion}`);
                craftOutputClick();
                check(playerInventory[potion]===1 && playerInventory[ore]===0 && playerInventory[23]===0 &&
                    craftingGrid.every(id=>id===0),`Potion ${potion} consumes exactly its recipe`);
            }
            gameMode='creative';
            check(drinkShrinkPotion() && close(playerScale,0.05),'First potion shrinks to 1/20');
            const feet=camera.position.y-getPlayerHeight();
            check(drinkShrinkPotion() && close(playerScale,0.005),'Second potion shrinks each dimension tenfold again');
            check(close(camera.position.y-getPlayerHeight(),feet),'Consecutive shrinking preserves foot position');
            check(close(microCellSize(),0.005) && close(getPlayerHeight(),0.008),'Camera height and digging cell share the second scale');
            check(close(camera.near,0.0001),'Second shrink also reduces near clipping');
            currentBlock=3;camera.lookAt(0.0025,0,0.0025);camera.updateMatrixWorld(true);
            document.dispatchEvent(new MouseEvent('mousedown',{button:0}));
            check(fineVoxelEdits.size===1 && microMinedBlocks.size===0,'One click removes only one second-level cell');
            const removed=microCellAt(0.0025,0.4975,0.0025);
            check(getMicroType(removed)===0 && getMicroType(microAncestor(removed,1))===3,'The enclosing first-level block remains intact');
            check(getMicroType(offsetMicroCell(removed,1,0,0))===3,'Adjacent second-level cell remains solid');
            moveTinyAxis('y',-0.2);
            check(close(camera.position.y,0.503) || Math.abs(camera.position.y-0.503)<0.000001,'Digging below drops precisely one second-level cell');
            scene.updateMatrixWorld(true);
            for(const dir of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,-1,0]]) {
                const ray=new THREE.Raycaster(new THREE.Vector3(0.0025,0.4975,0.0025),new THREE.Vector3(...dir),0,0.004);
                const hits=ray.intersectObjects(microVoxelGroup.children);
                check(hits.length && Math.abs(hits[0].distance-0.0025)<1e-6,`Second-level hole has a real wall ${dir}`);
            }
            gameMode='survival';playerInventory[GROW_POTION_ID]=5;
            const scaleBefore=playerScale,positionBefore=camera.position.clone();
            check(!drinkGrowPotion(),'Growth is rejected when the larger body would overlap the hole walls');
            check(playerInventory[GROW_POTION_ID]===5 && playerScale===scaleBefore && camera.position.equals(positionBefore),'Blocked growth consumes no potion and does not move the player');
            gameMode='creative';
            for(let i=1;i<14;i++) {
                camera.lookAt(camera.position.x,camera.position.y-1,camera.position.z);camera.updateMatrixWorld(true);
                document.dispatchEvent(new MouseEvent('mousedown',{button:0}));
                check(fineVoxelEdits.size===i+1,`Fine click ${i+1} changes exactly one cell`);
                moveTinyAxis('y',-0.02);
            }
            check(Math.abs(camera.position.y-(0.508-14*0.005))<1e-6,'Fine shaft crosses its first-level parent boundary without falling through');
            const savedFine=Array.from(fineVoxelEdits);
            restoreMicroEdits([]);restoreFineVoxelEdits(savedFine);updateMicroVoxelOverlay();
            check(!checkTinyCollision(camera.position),'Fine tunnel collision survives save/load');
            check(findMicroBlockHit(camera.position,new THREE.Vector3(0,-1,0)).level===2,'Targeting inside a saved fine tunnel retains its depth');

            camera.position.set(1.05,0.55,0.1);
            const fineFloor={x:1,y:0,z:0,mx:100,my:199,mz:100,level:2,type:3,norm:new THREE.Vector3(0,1,0)};
            check(placeMicroBlock(fineFloor,4),'Second-level miniature building works');
            const fineWood=offsetMicroCell(fineFloor,0,1,0);
            check(getMicroType(fineWood)===4 && getBlock(1,1,0)===0,'Fine placement does not create a full-sized block');
            const doorFloor={...fineFloor,mx:110};
            check(placeMicroBlock(doorFloor,8),'Second-level door places in two fine cells');
            const fineDoor=offsetMicroCell(doorFloor,0,1,0);
            check(getMicroType(offsetMicroCell(fineDoor,0,1,0))===9,'Fine door height is exactly two second-level cells');
            toggleMicroDoor(fineDoor);
            check(getMicroType(fineDoor)===10,'Fine door opens');
            camera.position.set(1.02,0.54,0.1);camera.lookAt(1.045,0.505,0.0025);
            heldItemGroup.visible=false;microTarget.visible=false;
            document.getElementById('blocker').style.display='none';scene.fog=null;renderer.render(scene,camera);

            camera.position.set(2.00025,0.508,0.00025);
            check(drinkShrinkPotion() && close(playerScale,0.0005),'A third drink continues shrinking tenfold');
            camera.position.y=0.5+getPlayerHeight();
            camera.lookAt(2.00025,0,0.00025);camera.updateMatrixWorld(true);
            const fineBefore=fineVoxelEdits.size;
            document.dispatchEvent(new MouseEvent('mousedown',{button:0}));
            check(fineVoxelEdits.size===fineBefore+1,'Third-level mining records a single nested cell');
            moveTinyAxis('y',-0.01);
            check(Math.abs(camera.position.y-(0.5008-0.0005))<1e-7,'Third-level physics stops on the next tiny floor');
            scene.updateMatrixWorld(true);
            const deepRay=new THREE.Raycaster(new THREE.Vector3(2.00025,0.49975,0.00025),new THREE.Vector3(0,-1,0),0,0.0004);
            check(deepRay.intersectObjects(microVoxelGroup.children).length>0,'Third-level hole also has a visible bottom');

            camera.position.set(-1.2,0.5+getPlayerHeight(),0.2);
            check(drinkGrowPotion() && close(playerScale,0.005),'Grow reverses the third shrink');
            check(drinkGrowPotion() && close(playerScale,0.05),'Grow reverses the second shrink');
            check(drinkGrowPotion() && close(playerScale,1),'Grow restores normal size');
            check(drinkGrowPotion() && close(playerScale,2),'Further Grow Potion makes the player larger');
            check(drinkGrowPotion() && close(1.8*playerScale,4),'Maximum body height is exactly four world blocks');
            check(!drinkGrowPotion() && close(1.8*playerScale,4),'More grow clicks cannot exceed the four-block cap');
            check(checkScaledCollision(camera.position.clone().add(new THREE.Vector3(0,-0.01,0))),'Giant collision reaches the ground');
            check(drinkShrinkPotion() && close(playerScale,2),'Shrink can step down from maximum size');
            check(drinkShrinkPotion() && close(playerScale,1),'Shrink can return a giant to normal');
            worldMap.set('-1,3,0',3);
            camera.position.set(-1,2.1,0);
            gameMode='survival';playerInventory[GROW_POTION_ID]=1;
            check(!drinkGrowPotion() && playerInventory[GROW_POTION_ID]===1,'Giant growth cannot push the head through a low ceiling');
            gameMode='creative';worldMap.delete('-1,3,0');

            camera.position.set(1.1,2.1,0.1);drinkShrinkPotion();drinkShrinkPotion();
            controls.isLocked=false;isGameStarted=false;
            const scale=playerScale;
            for(let i=0;i<10;i++) {prevTime=performance.now()-1000000;animate();}
            check(playerScale===scale,'Elapsed-time updates never restore the player automatically');
            check(typeof shrinkTimer==='undefined','There is no potion expiration timer');
            isGameStarted=true;
            camera.position.set(1.02,0.54,0.1);camera.lookAt(1.045,0.505,0.0025);
            updateMicroVoxelOverlay();
            renderer.render(scene,camera);
            return {passed,scale:playerScale,fineEdits:fineVoxelEdits.size};
        });
        console.log(JSON.stringify(result,null,2));
        await page.screenshot({path:'/private/tmp/size-potions-fine.png'});
        for(const viewport of [{width:1280,height:800},{width:390,height:844}]) {
            await page.setViewportSize(viewport);
            const colors=await page.evaluate(()=>{
                camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.render(scene,camera);
                const gl=renderer.getContext(),colors=new Set(),pixel=new Uint8Array(4);
                for(let x=0.2;x<0.85;x+=0.1) for(let y=0.2;y<0.85;y+=0.1) {
                    gl.readPixels(Math.floor(x*gl.drawingBufferWidth),Math.floor(y*gl.drawingBufferHeight),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
                    colors.add(Array.from(pixel).join(','));
                }
                return colors.size;
            });
            assert.ok(colors>4,'Deeply shrunken world is not a blank canvas');
        }
        await page.screenshot({path:'/private/tmp/size-potions-mobile.png'});

        const downloadEvent=page.waitForEvent('download');
        await page.evaluate(()=>downloadSave());
        const download=await downloadEvent;
        const save=JSON.parse(require('node:fs').readFileSync(await download.path(),'utf8'));
        assert.equal(save.playerScale,0.005);
        assert.ok(save.fineVoxelEdits.length>0);
        assert.equal(Object.hasOwn(save,'shrinkTimer'),false);
        await page.evaluate(()=>{playerScale=1;restoreMicroEdits([]);});
        await page.locator('#load-file').setInputFiles({name:'size-save.json',mimeType:'application/json',
            buffer:Buffer.from(JSON.stringify({...save,shrinkTimer:0.001}))});
        await page.waitForFunction(count=>playerScale===0.005 && fineVoxelEdits.size===count,save.fineVoxelEdits.length);
        assert.ok(await page.evaluate(()=>Math.abs(camera.near-0.0001)<1e-10));
        console.log('PASS: Actual save export/import restores size and fine cells, and ignores legacy expiration timers.');
        const smallest=await page.evaluate(()=>{
            gameMode='creative';currentBlock=3;controls.isLocked=true;
            for(let level=3;level<=6;level++) {
                camera.position.set(-2.9+level*0.3,0.5+getPlayerHeight(),0.2);
                if(!drinkShrinkPotion()) throw new Error(`Shrink level ${level} failed`);
                const n=microDivisions(level),size=1/n;
                camera.position.x=(Math.floor((camera.position.x+0.5)*n)+0.5)/n-0.5;
                camera.position.z=(Math.floor((camera.position.z+0.5)*n)+0.5)/n-0.5;
                camera.lookAt(camera.position.x,0,camera.position.z);camera.updateMatrixWorld(true);
                const count=fineVoxelEdits.size;
                document.dispatchEvent(new MouseEvent('mousedown',{button:0}));
                if(fineVoxelEdits.size!==count+1) throw new Error(`Mining level ${level} failed`);
                moveTinyAxis('y',-size*2);
                if(Math.abs(camera.position.y-(0.5-size+getPlayerHeight()))>size*0.001) throw new Error(`Collision level ${level} failed`);
                scene.updateMatrixWorld(true);
                const inside=new THREE.Vector3(camera.position.x,0.5-size*0.5,camera.position.z);
                const hits=new THREE.Raycaster(inside,new THREE.Vector3(0,-1,0),0,size*0.75).intersectObjects(microVoxelGroup.children);
                if(!hits.length || Math.abs(hits[0].distance-size*0.5)>size*0.005) throw new Error(`Floor rendering level ${level} failed`);
            }
            const previous=playerScale;
            if(drinkShrinkPotion() || playerScale!==previous) throw new Error('Minimum scale guard failed');
            return playerScale;
        });
        console.log('PASS: All six shrink levels have accurate mining, collision and rendered floors. Smallest scale:',smallest);
        assert.deepEqual(errors,[],'No runtime errors');
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
