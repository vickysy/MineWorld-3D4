const assert=require('node:assert/strict');
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
        await page.waitForFunction(()=>typeof openCannonPanel==='function'&&expansionReady);
        console.log(await page.evaluate(()=>{
            const checks=[],check=(value,name)=>{if(!value)throw Error(name);checks.push(name);};
            window.testReset=()=>{
                clearExpansionWorld();clearMech();resetPlayerFlight();worldMap.clear();modifiedColumns.clear();heightCache.clear();
                restoreMicroEdits([]);rebuildQueue.clear();chunkQueue.length=0;cancelMining();
                for(const meshes of chunkMeshes.values())for(const mesh of Object.values(meshes))scene.remove(mesh);chunkMeshes.clear();
                for(const list of [villagers,zombies,creepers,animals,endermen]){for(const m of list)disposeModModel(m.mesh);list.length=0;}
                for(const p of explosionParticles)disposeModModel(p.mesh);explosionParticles.length=0;
                selectedTerrain='moon';currentDimension='overworld';getSurfaceHeight=()=>-10;
                for(let x=-15;x<=110;x++)for(let z=-15;z<=15;z++)worldMap.set(`${x},0,${z}`,3);
                gameMode='creative';isGameStarted=true;controls.isLocked=true;playerScale=1;
                camera.position.set(0,2.1,0);camera.lookAt(10,2.1,0);camera.updateMatrixWorld(true);
                currentBlock=2;blocker.style.display='none';inventoryUI.style.display='none';heldItemGroup.visible=false;
                document.getElementById('home-panel').hidden=true;document.getElementById('command-panel').hidden=true;
                scene.background.setHex(0xb9dae9);scene.fog=null;
            };
            window.testPut=(x,y,z,t)=>setBlockNoRebuild(x,y,z,t,rebuildQueue);
            window.testTicks=seconds=>{for(let i=0;i<Math.ceil(seconds*60);i++)tickRedstoneMachines(1/60);};
            testReset();playerScale=0.05;testPut(0,1,0,2);camera.position.set(0,1,0);
            check(getMicroType(microCellAt(0,1,0))===0,'Dirt interior is hollow');
            check(getMicroType(microCellAt(0,1.475,0))===2,'Dirt retains its outer micro layer');
            check(!checkTinyCollision(camera.position),'Tiny player can stand in the cavity');
            check(checkTinyCollision(new THREE.Vector3(0,0.6,0)),'Dirt cavity has a collidable floor');
            const geometry=createMicroBlockGeometry(0,1,0),mesh=new THREE.Mesh(geometry,geometry.userData.materials);mesh.position.set(0,1,0);mesh.updateMatrixWorld(true);
            for(const dir of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
                const ray=new THREE.Raycaster(new THREE.Vector3(0.025,1.025,0.025),new THREE.Vector3(...dir),0,1),hits=ray.intersectObject(mesh);
                check(hits.length&&Math.abs(hits[0].distance-(0.45-dir.reduce((a,b)=>a+b,0)*0.025))<1e-5,`Cavity has real inward surface ${dir}`);
            }
            geometry.dispose();
            const hole={x:0,y:1,z:0,mx:19,my:10,mz:10,level:1,type:2};
            mineMicroBlock(hole);check(getMicroType(hole)===0&&getBlock(0,1,0)===2,'Mining shell removes exactly one voxel, not parent');
            check(getMicroType({...hole,my:11})===2,'Adjacent shell voxel survives');
            setMicroPlacement(microCellAt(0,1,0),3);check(getMicroType(microCellAt(0,1,0))===3,'Can build a micro block in cavity');
            const save={mined:[...microMinedBlocks],placed:[...microPlacedBlocks]};restoreMicroEdits(save.mined,save.placed);
            check(getMicroType(hole)===0&&getMicroType(microCellAt(0,1,0))===3,'Hollow shell edits survive save/restore');
            playerScale=1;check(isSolid(0,1,0),'Dirt remains a solid macro obstacle at normal size');
            testPut(2,1,0,3);check(getMicroType(microCellAt(2,1,0))===3,'Stone interior remains solid');

            testReset();playerScale=0.05;testPut(3,1,0,82);syncFurnitureMeshes();
            check(!checkTinyCollision(new THREE.Vector3(3,0.8,0)),'Can walk underneath table');
            check(checkTinyCollision(new THREE.Vector3(3.38,0.8,0.36)),'Table leg stops tiny player');
            check(checkTinyCollision(new THREE.Vector3(3,1.44,0)),'Table top stops tiny player');
            camera.position.set(3,0.8,1);check(!moveTinyAxis('z',-1),'Tiny player actually walks into table space');
            testPut(6,1,0,FRIDGE_ID);testPut(6,2,0,FRIDGE_TOP_ID);syncFurnitureMeshes();
            check(!checkTinyCollision(new THREE.Vector3(6,1.5,0)),'Fridge has an actual empty interior');
            check(checkTinyCollision(new THREE.Vector3(6,1.5,0.45)),'Closed fridge door blocks entry');
            const fridge=furnitureRecord(6,1,0);fridge.data.open=true;updateWorldExpansion(0.16);
            check(!checkTinyCollision(new THREE.Vector3(6,1.5,0.45)),'Open fridge door allows entry');
            check(checkTinyCollision(new THREE.Vector3(6,1.25,0)),'Fridge shelves are solid');
            testPut(9,1,0,88);testPut(9,2,0,FRIDGE_TOP_ID);syncFurnitureMeshes();
            check(!checkTinyCollision(new THREE.Vector3(9,2,0)),'Storage cabinet has a hollow compartment');
            check(checkTinyCollision(new THREE.Vector3(9,2,0.44)),'Cabinet doors block entry when closed');
            furnitureRecord(9,1,0).data.open=true;updateWorldExpansion(0.16);
            check(!checkTinyCollision(new THREE.Vector3(9,2,0.44)),'Cabinet doors open physically');
            playerScale=1;check(isSolid(3,1,0),'Normal-size furniture collision is unchanged');

            testReset();const plan=parseWorldCommand('帮我建造一个双重炮');
            check(plan.kind==='machine'&&plan.rounds===2,'Chinese double cannon command parses');
            check(parseWorldCommand('建造门').machine==='door','Door command parses');
            let rejected=false;try{parseWorldCommand('不要建造炮');}catch{rejected=true;}check(rejected,'Negative command does not build');
            check(executeWorldCommand(plan),'Cannon command builds on clear ground');
            const key=[...pistonModes].find(([,mode])=>mode==='cannon')[0],at=key.split(',').map(Number);window.testCannon=at;
            check(getBlock(at[0]+1,at[1],at[2])===TNT_ID&&getBlock(at[0]+1,at[1]+1,at[2])===TNT_ID,'Double cannon has exactly two vertically stacked TNT');
            check(undoMachineCommand()&&getBlock(...at)===0,'Unused cannon command can be undone');
            check(executeWorldCommand(plan),'Cannon can be rebuilt');
            check(fireCannon(at,[36,0,0],true),'Aimed single shot begins');
            check(movingTNT.size===1&&[...movingTNT.values()][0].mesh.position.y===at[1]+1,'Single shot takes upper TNT only');
            check(getBlock(at[0]+1,at[1],at[2])===TNT_ID,'Lower TNT remains loaded');
            check(!fireCannon(at,[36,0,0],true),'Repeated click during stroke cannot duplicate ammunition');
            testTicks(4);
            check(!movingTNT.size&&getBlock(at[0]+1,at[1],at[2])===TNT_ID,'Single shot never secretly fires the remaining round');
            check([...worldMap].some(([key,type])=>{const [x,y,z]=key.split(',').map(Number);return !type&&Math.abs(x-36)<=2&&y===0&&Math.abs(z)<=2;}),'Aimed TNT hits chosen ground');
            check(getBlock(...at)===PISTON_ID,'Aimed launcher survives its shot');
            check(fireCannon(at,[45,0,0],true),'Can fire remaining lower round later');testTicks(4);
            check(!movingTNT.size&&getBlock(at[0]+1,at[1],at[2])===0,'Second shot consumes the last round');
            check(!fireCannon(at,[45,0,0],true)&&!pistonStates.size,'Empty cannon does not fake a successful shot');
            check(!validCannonTarget(at,at)&&!validCannonTarget(at,[999,0,0]),'Unsafe near or unreachable far targets rejected');

            testReset();executeWorldCommand(plan);const a=[...pistonModes.keys()][0].split(',').map(Number);
            check(fireCannon(a,[38,0,0],false),'Double sequence begins');
            const rounds=[...movingTNT.values()];
            check(rounds.length===2&&rounds[0].mesh.position.y>rounds[1].mesh.position.y&&rounds[0].launchDelay<rounds[1].launchDelay,'Magazine ordering is upper to lower with separate delays');
            testTicks(0.7);check([...movingTNT.values()].filter(t=>t.impact).length===1,'Only first round flies initially');
            const machines=saveRedstoneMachines();restoreRedstoneMachines(JSON.parse(JSON.stringify(machines)));
            check(movingTNT.size===2&&[...movingTNT.values()].some(t=>t.target?.[0]===38&&t.launchDelay>0),'Target and pending sequence survive save/restore');
            testTicks(0.8);check([...movingTNT.values()].filter(t=>t.impact).length===2,'Second round follows later');testTicks(5);
            check(!movingTNT.size&&getBlock(...a)===PISTON_ID,'Sequence finishes without duplicate explosions at launcher');

            testReset();const door=parseWorldCommand('建造活塞门');check(executeWorldCommand(door),'Door template builds');
            check(pistonStates.size===4&&[...pistonStates.values()].every(s=>s.pushed.length===1),'Four door pistons start extended and shut');
            const lever=[...machineCells].find(([,t])=>t===30)[0].split(',').map(Number);testPut(...lever,31);testTicks(0.3);
            check(pistonStates.size===0,'One lever retracts the entire gate');
            testTicks(10);check(pistonStates.size===0,'Gate remains open while lever is on');
            testPut(...lever,30);testTicks(2);check(pistonStates.size===0,'Switching off preserves passage delay');
            testTicks(8);check(pistonStates.size===4,'Gate shuts after passage delay');
            return `${checks.length} tiny furniture, cavity, cannon and command checks passed.`;
        }));

        // Real mouse events, responsive target panel, and a nonblank 3D furniture view.
        await page.evaluate(()=>{testReset();executeWorldCommand(parseWorldCommand('建造双重炮'));const at=[...pistonModes.keys()][0].split(',').map(Number);window.testCannon=at;camera.position.set(at[0]-3,at[1]+0.1,at[2]);camera.lookAt(...at);camera.updateMatrixWorld(true);currentBlock=2;});
        await page.mouse.click(640,400,{button:'right'});await page.mouse.click(640,400,{button:'right'});
        await page.getByRole('heading',{name:'TNT Cannon',exact:true}).waitFor();
        await page.getByLabel('Cannon target map').click({position:{x:350,y:200}});
        assert.notEqual(await page.getByLabel('Cannon target X').inputValue(),'31');
        await page.getByLabel('Cannon target X').fill('40');await page.getByLabel('Cannon target Y').fill('0');await page.getByLabel('Cannon target Z').fill('0');
        assert(await page.getByRole('button',{name:'Fire One',exact:true}).isEnabled());
        await page.screenshot({path:'/private/tmp/mc-cannon-aim-desktop.png'});
        await page.setViewportSize({width:390,height:844});
        await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth,null,{polling:100,timeout:5000});
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.screenshot({path:'/private/tmp/mc-cannon-aim-mobile.png'});
        await page.getByRole('button',{name:'Fire One',exact:true}).click();
        assert.equal(await page.evaluate(()=>movingTNT.size),1);
        assert(await page.evaluate(()=>document.getElementById('home-panel').hidden));
        await page.evaluate(()=>{testReset();playerScale=0.05;testPut(0,1,0,82);syncFurnitureMeshes();camera.position.set(0,0.8,0.9);camera.near=0.001;camera.updateProjectionMatrix();camera.lookAt(0,1,-0.4);camera.updateMatrixWorld(true);buildChunkMesh(0,0);buildChunkMesh(-1,0);renderer.render(scene,camera);});
        for(const [width,height,label] of [[1280,800,'desktop'],[390,844,'mobile']]) {
            await page.setViewportSize({width,height});
            const colors=await page.evaluate(()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.render(scene,camera);const gl=renderer.getContext(),p=new Uint8Array(4),colors=new Set();for(let x=10;x<gl.drawingBufferWidth;x+=30)for(let y=10;y<gl.drawingBufferHeight;y+=30){gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);colors.add(p.slice(0,3).join(','));}return colors.size;});
            assert(colors>10,`Nonblank tiny furniture ${label}`);await page.screenshot({path:`/private/tmp/mc-tiny-table-${label}.png`});
        }
        assert.deepEqual(errors,[]);console.log('PASS: Actual double-right-click aiming, fire button, desktop/mobile layouts and 3D pixels.');
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
