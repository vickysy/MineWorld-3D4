const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

(async()=>{
    const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try {
        const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
        await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await page.waitForFunction(()=>typeof tickRedstoneMachines==='function'&&expansionReady);
        console.log(await page.evaluate(()=>{
            window.machineReset=()=>{
                clearExpansionWorld();clearMech();resetPlayerFlight();worldMap.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();heightCache.clear();
                restoreMicroEdits([]);restoreFineVoxelEdits([]);rebuildQueue.clear();chunkQueue.length=0;cancelMining();
                for(const meshes of chunkMeshes.values())for(const mesh of Object.values(meshes))scene.remove(mesh);chunkMeshes.clear();
                for(const list of [villagers,zombies,creepers,animals,endermen]){for(const m of list)disposeModModel(m.mesh);list.length=0;}
                for(const p of explosionParticles)disposeModModel(p.mesh);explosionParticles.length=0;
                selectedTerrain='moon';currentDimension='overworld';getSurfaceHeight=()=>-10;
                for(let x=-10;x<=60;x++)for(let z=-10;z<=10;z++)worldMap.set(`${x},0,${z}`,3);
                gameMode='creative';isGameStarted=true;controls.isLocked=true;playerScale=1;
                camera.position.set(0,3,8);camera.rotation.set(0,0,0);camera.updateMatrixWorld(true);
                currentBlock=2;blocker.style.display='none';inventoryUI.style.display='none';heldItemGroup.visible=false;
                jumpPadCooldown=0;
                document.getElementById('home-panel').hidden=true;document.getElementById('command-panel').hidden=true;
                scene.background.setHex(0xb9dae9);scene.fog=null;
            };
            window.machinePut=(x,y,z,t)=>setBlockNoRebuild(x,y,z,t,rebuildQueue);
            window.machineTicks=(seconds)=>{for(let i=0;i<Math.ceil(seconds*60);i++)tickRedstoneMachines(1/60);};
            window.setupPiston=(x=0,y=1,z=0)=>{
                machinePut(x,y,z,PISTON_ID);pistonDirections.set(`${x},${y},${z}`,{x:1,y:0,z:0});pistonModes.set(`${x},${y},${z}`,'cycle');
            };
            const checks=[],check=(v,n)=>{if(!v)throw Error(n);checks.push(n);};
            machineReset();machinePut(5,6,0,TNT_ID);machineTicks(0.2);
            check(getBlock(5,6,0)===0&&movingTNT.size===1,'Unsupported TNT becomes a falling cube');
            check([...movingTNT.values()][0].mesh.position.y<6,'The TNT actually moves downward');
            machineTicks(2);
            check(getBlock(5,1,0)===TNT_ID&&!movingTNT.size&&!explosionParticles.length,'Unlit TNT lands intact without exploding');
            machinePut(5,0,0,0);machineTicks(0.2);check(movingTNT.size===1,'Removing support makes already placed TNT fall');

            machineReset();machinePut(5,1,0,TNT_ID);machinePut(6,1,0,TNT_ID);igniteTNT(5,1,0);
            check(movingTNT.size===1&&getBlock(6,1,0)===TNT_ID&&!explosionParticles.length,'Ignition starts a fuse instead of instantly destroying neighbors');
            machineTicks(3.8);check(movingTNT.size===1&&!explosionParticles.length,'Four-second fuse remains visible');
            machineTicks(0.4);check(explosionParticles.length>0&&getBlock(6,1,0)===0&&movingTNT.size===1,'Explosion primes the adjacent TNT');
            machineTicks(4.2);check(!movingTNT.size,'Chain reaction finishes without duplicate projectiles');

            machineReset();setupPiston();machinePut(0,0,0,28);machinePut(-1,0,0,31);
            for(let y=1;y<=3;y++)machinePut(1,y,0,TNT_ID);
            machineTicks(0.15);
            check(movingTNT.size===3&&[...movingTNT.values()].every(t=>t.launchDelay>0&&!t.impact),'Piston arms the full vertical stack before pushing');
            check(!explosionParticles.length&&getBlock(0,1,0)===PISTON_ID,'No early explosion destroys the launcher');
            machineTicks(0.7);
            check([...movingTNT.values()].filter(t=>t.impact).length===1&&[...movingTNT.values()].filter(t=>!t.impact).length===2,'Only the upper TNT launches first; lower rounds wait');
            let furthest=0;for(let i=0;i<300;i++){tickRedstoneMachines(1/60);for(const t of movingTNT.values())furthest=Math.max(furthest,t.mesh.position.x);}
            check(furthest>18&&!movingTNT.size&&explosionParticles.length>0,'Projectiles travel away and explode on landing');
            check(getBlock(0,1,0)===PISTON_ID&&getBlock(0,0,0)===28,'The launcher survives its distant blast');
            check([...worldMap].some(([k,t])=>t===0&&Number(k.split(',')[0])>18&&Number(k.split(',')[1])===0),'Landing blast changes actual distant ground');
            machineReset();setupPiston();machinePut(1,1,0,TNT_ID);igniteTNT(1,1,0);tickMovingTNT(0.1);
            check(extendPiston(0,1,0)&&[...movingTNT.values()][0].launchDelay>0,'Piston can also launch TNT that was already lit');

            machineReset();setupPiston();machinePut(1,1,0,3);machinePut(2,1,0,4);machinePut(3,1,0,6);
            machinePut(0,0,0,28);machinePut(-1,0,0,31);machineTicks(0.2);
            check(getBlock(1,1,0)===PISTON_HEAD_ID&&getBlock(2,1,0)===3&&getBlock(3,1,0)===4&&getBlock(4,1,0)===6,'Piston pushes a row without losing or duplicating blocks');
            machineTicks(0.7);
            check(!pistonStates.size&&getBlock(1,1,0)===3&&getBlock(2,1,0)===4&&getBlock(3,1,0)===6&&getBlock(4,1,0)===0,'Powered piston retracts and brings its row back');
            machineTicks(0.5);check(pistonStates.size===1&&getBlock(4,1,0)===6,'Still-powered piston starts another stroke');
            machinePut(-1,0,0,30);machineTicks(1.5);
            check(!pistonStates.size&&getBlock(1,1,0)===3,'Turning off the lever leaves the gate retracted');
            check(pistonVisuals.get('0,1,0').userData.extension===0,'Rod visually returns to the base');
            machinePut(-1,0,0,31);machineTicks(0.3);const model=pistonVisuals.get('0,1,0');model.updateMatrixWorld(true);
            const bounds=new THREE.Box3().setFromObject(model);
            check(model.userData.extension===1&&bounds.max.x<=1.05&&bounds.max.x>=0.99,'Extended front plus base measures about 1.5 blocks');

            machineReset();setupPiston();setupPiston(0,2,0);machinePut(1,1,0,3);machinePut(1,2,0,3);
            machinePut(-1,1,0,134);hiddenRedstone.add('-1,1,0');machinePut(-1,2,0,134);hiddenRedstone.add('-1,2,0');
            machinePut(-2,1,0,28);machinePut(-3,1,0,28);machinePut(-4,1,0,31);circuitDirty=true;
            machineTicks(0.2);
            check(pistonStates.size===2&&getBlock(2,1,0)===3&&getBlock(2,2,0)===3,'Concealed connected wire drives both stacked gate pistons');
            machinePut(-3,1,0,0);machineTicks(0.3);
            check(machinePowered(0,1,0)&&machinePowered(0,2,0),'A lever within five blocks still powers concealed wire across a gap');
            machinePut(-4,1,0,30);machineTicks(0.2);
            check(!pistonStates.size&&getBlock(1,1,0)===3&&getBlock(1,2,0)===3,'Switching off the distant lever resets both gate pistons');
            machinePut(-1,1,0,0);check(!hiddenRedstone.has('-1,1,0'),'Removing a cover removes its concealed wire state');

            for(const obstacle of [OBSIDIAN_ID,BARRIER_ID,PISTON_ID,14,73]) {
                machineReset();setupPiston();machinePut(1,1,0,3);machinePut(2,1,0,obstacle);
                check(!extendPiston(0,1,0)&&getBlock(1,1,0)===3&&getBlock(2,1,0)===obstacle,`Piston cannot erase protected block ${obstacle}`);
            }
            machineReset();setupPiston();for(let x=1;x<=13;x++)machinePut(x,1,0,3);
            check(!extendPiston(0,1,0)&&getBlock(13,1,0)===3,'More than twelve blocks stop the piston');
            machinePut(13,1,0,0);check(extendPiston(0,1,0)&&getBlock(13,1,0)===3,'Twelve blocks can move as one row');
            machineReset();setupPiston();machinePut(1,1,0,3);camera.position.set(2,2.1,0);
            check(!extendPiston(0,1,0)&&getBlock(1,1,0)===3,'Piston cannot place a block inside the player');
            camera.position.set(0,3,8);check(extendPiston(0,1,0),'Piston resumes after the player moves away');
            machinePut(2,1,0,6);retractPiston(0,1,0);
            check(getBlock(2,1,0)===6&&getBlock(1,1,0)===0,'A manually replaced block is not overwritten on the backstroke');

            machineReset();setupPiston();machinePut(1,1,0,3);extendPiston(0,1,0);
            mineBlock(new THREE.Vector3(1,1,0),false);
            check(getBlock(0,1,0)===0&&getBlock(1,1,0)===0&&!pistonStates.size,'Mining the piston head removes the base and cannot leave an invisible obstacle');

            for(const scale of [1,0.05]) {
                machineReset();playerScale=scale;camera.position.set(0,0.5+getPlayerHeight()-(scale===1?0.09:0),0);
                machinePut(0,1,0,PRESSURE_PLATE_ID);machinePut(1,1,0,28);machinePut(2,1,0,30);
                updatePressurePlatesAndPistons(1/60);check(velocity.y===0,`Unpowered plate does not launch scale ${scale}`);
                machinePut(2,1,0,31);updatePressurePlatesAndPistons(1/60);
                check(velocity.y===14*scale&&velocity.z===-18*scale,`Powered jump pad detects feet and scales launch at ${scale}`);
                const start=camera.position.clone();updatePlayerMovement(1/60);
                check(camera.position.y>start.y+0.1*scale&&camera.position.z<start.z-0.2*scale,`Actual physics keeps jump pad impulse at ${scale}`);
            }

            machineReset();spawnVillagerAt(5,1,0);spawnVillagerAt(8,1,0);
            const wet=villagers[0],dry=villagers[1];wet.timer=dry.timer=100;machinePut(5,1,0,LAVA_ID);
            updateEntities(1/60);check(wet.hp===3&&wet.hurtTimer>0&&dry.hp===4,'Lava causes a red hit reaction only on contact');
            for(let i=0;i<220;i++)updateEntities(1/60);
            check(!villagers.includes(wet)&&villagers.includes(dry)&&dry.hp===4,'Sustained lava contact kills the villager and finishes its ash animation');
            machineReset();spawnVillagerAt(5,2,0);machinePut(5,1,0,LAVA_ID);lavaAmounts.set('5,1,0',1);
            updateVillagerLavaDamage(villagers[0],1);check(villagers[0].hp===4,'Standing above a shallow lava surface is not contact');

            for(const [position,expected] of [[[4,2,0],{x:1,y:0,z:0}],[[-4,2,0],{x:-1,y:0,z:0}],
                [[0,2,4],{x:0,y:0,z:1}],[[0,2,-4],{x:0,y:0,z:-1}],[[0,5,0],{x:0,y:1,z:0}],[[0,-3,0],{x:0,y:-1,z:0}]]) {
                machineReset();camera.position.set(...position);camera.lookAt(0,1,0);camera.updateMatrixWorld(true);
                rememberPistonDirectionFromHit(0,1,0,new THREE.Vector3(0,1,0));
                check(Object.keys(expected).every(k=>pistonDirections.get('0,1,0')[k]===expected[k]),`Placed piston faces its player at ${position}`);
            }
            for(const [lever,powered] of [[[5,1,0],true],[[6,1,0],false],[[3,5,0],true],[[4,5,0],false],[[0,6,0],true],[[0,7,0],false]]) {
                machineReset();setupPiston(0,2,0);machinePut(0,1,0,28);machinePut(...lever,31);
                check(machinePowered(0,2,0)===powered,`Three-dimensional five-block lever boundary at ${lever}`);
            }
            machineReset();machinePut(0,1,0,28);machinePut(5,1,0,31);
            for(const x of [-3,0,3])for(const z of [-3,0,3])if(x||z) {
                setupPiston(x,1,z);pistonDirections.set(`${x},1,${z}`,{x:0,y:1,z:0});
            }
            setupPiston(0,3,0);pistonDirections.set('0,3,0',{x:0,y:1,z:0});machineTicks(0.2);
            check(poweredPistonCells.size===8&&pistonStates.size===8,'One redstone powers and moves exactly eight of nine nearby pistons');
            check(poweredPistonCells.has('0,3,0'),'Nearest pistons have priority');
            const poweredBefore=[...poweredPistonCells].sort();const state=saveRedstoneMachines();restoreRedstoneMachines(state);rebuildCircuitPower();
            check(JSON.stringify([...poweredPistonCells].sort())===JSON.stringify(poweredBefore),'Eight-piston selection remains stable after a save restore');
            machinePut(0,2,0,28);machineTicks(0.2);
            check(poweredPistonCells.size===9&&pistonStates.size===9,'Adding one powered wire supplies the ninth piston');
            machinePut(5,1,0,30);machineTicks(0.3);check(!poweredPistonCells.size&&!pistonStates.size,'The distant lever can stop all connected pistons');
            machineReset();for(let x=0;x<=40;x++)machinePut(x,1,0,28);machinePut(-5,1,0,31);setupPiston(41,1,0);
            check(machinePowered(41,1,0),'Connected redstone can carry a distant lever beyond the old 32-block limit');
            machineReset();setupPiston();pistonModes.delete('0,1,0');machinePut(1,1,0,3);machinePut(-1,1,0,28);machinePut(-2,1,0,30);
            machineTicks(2);
            check(pistonModes.get('0,1,0')==='door'&&pistonStates.has('0,1,0')&&getBlock(2,1,0)===3,'An automatically detected door starts extended and stays closed');
            machinePut(-2,1,0,31);machineTicks(2);
            check(!pistonStates.size&&getBlock(1,1,0)===3&&getBlock(2,1,0)===0,'First lever activation retracts the door and keeps it open');
            machinePut(-2,1,0,30);machineTicks(1);
            check(!pistonStates.size,'Switching the door off keeps the passage open during the safety delay');
            machineTicks(8);
            check(pistonStates.size===1&&getBlock(2,1,0)===3,'The door closes after the safety delay');
            const doorSave=saveRedstoneMachines();restoreRedstoneMachines(doorSave);machineTicks(1);
            check(pistonModes.get('0,1,0')==='door'&&pistonStates.size===1,'Closed-door mode and pushed row survive save/load');

            machineReset();setupPiston();pistonModes.delete('0,1,0');machinePut(1,1,0,TNT_ID);machinePut(-1,1,0,28);machinePut(-2,1,0,30);machineTicks(0.3);
            check(pistonModes.get('0,1,0')==='cannon'&&!pistonStates.size&&!movingTNT.size,'A TNT cannon starts retracted and unlit');
            machinePut(-2,1,0,31);machineTicks(0.2);
            check(movingTNT.size===1&&pistonStates.size===1,'First power edge arms and launches cannon ammunition');
            machineTicks(1.5);check(!pistonStates.size,'A powered cannon does not repeatedly stroke');

            machineReset();
            for(let x=0;x<=24;x++)machinePut(x,1,0,REDSTONE_DUST_ID);
            for(let x=10;x<=24;x+=2){setupPiston(x,1,1);pistonDirections.set(`${x},1,1`,{x:0,y:1,z:0});}
            machinePut(-5,1,0,31);machineTicks(0.2);
            check(poweredWireCells.size===25&&pistonStates.size===8,'A long dust line branches to all eight adjacent pistons');
            check(!isSolid(4,1,0)&&circuitVisuals.size===25,'Dust is passable and renders as surface tracks, not cubes');
            machinePut(-5,1,0,30);machinePut(7,1,0,0);machinePut(-5,1,0,31);machineTicks(0.8);
            check(!pistonStates.size&&!poweredWireCells.has('24,1,0'),'A cut outside the five-block source range breaks the dust circuit');
            machinePut(7,1,0,REDSTONE_DUST_ID);machineTicks(0.5);check(pistonStates.size===8,'Repairing the dust line restores all branches');
            machinePut(-5,1,0,30);machinePut(-1,1,0,BUTTON_ID);buttonFaces.set('-1,1,0',{x:0,y:1,z:0});machineTicks(1);
            pressMachineButton(-1,1,0);machineTicks(0.2);check(poweredPistonCells.size===8&&buttonTimers.get('-1,1,0')>0,'A button sends a pulse through the dust network');
            const buttonSave=saveRedstoneMachines();restoreRedstoneMachines(buttonSave);machineTicks(1.2);
            check(!buttonTimers.size&&!poweredPistonCells.size,'A saved pressed button releases after its remaining pulse');
            machinePut(2,0,0,0);machineTicks(0.2);check(getBlock(2,1,0)===0,'Unsupported dust drops instead of floating');

            machineReset();machinePut(0,1,0,REDSTONE_DUST_ID);machinePut(1,1,0,3);machinePut(1,2,0,REDSTONE_DUST_ID);machinePut(-1,1,0,31);
            check(machinePowered(2,2,0),'Dust travels up one stair');
            machinePut(-1,1,0,30);machinePut(2,2,0,BUTTON_ID);machinePut(2,1,0,3);pressMachineButton(2,2,0);
            rebuildCircuitPower();check(poweredWireCells.has('0,1,0'),'Dust travels down the same stair');
            machinePut(0,2,0,3);rebuildCircuitPower();check(!poweredWireCells.has('0,1,0'),'A solid ceiling blocks the diagonal dust connection');
            check(getInventorySlotMapping()[134]===REDSTONE_DUST_ID&&getInventorySlotMapping()[135]===BUTTON_ID,'Both circuit items have inventory slots');
            check(recipes.some(r=>r.out===REDSTONE_DUST_ID&&r.ing[28]===1&&r.count===8)&&recipes.some(r=>r.out===BUTTON_ID&&r.ing[3]===1),'Dust and buttons are craftable in Survival');
            return `${checks.length} redstone, TNT and lava checks passed.`;
        }));

        await page.evaluate(()=>{
            machineReset();currentBlock=53;camera.position.set(0,2.1,3);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
        });
        await page.mouse.click(640,400,{button:'right'});
        assert(await page.evaluate(()=>{
            const entries=[...machineCells].filter(([,id])=>id===PISTON_ID);
            if(entries.length!==1)return false;
            const [key]=entries[0],[x,y,z]=key.split(',').map(Number),d=pistonDirections.get(key);
            return d&&d.x*(camera.position.x-x)+d.y*(camera.position.y-y)+d.z*(camera.position.z-z)>0;
        }),'Actual placed piston faces the player, not away');
        await page.evaluate(()=>{
            machineReset();machinePut(0,1,0,134);currentBlock=28;gameMode='survival';playerInventory[28]=2;
            camera.position.set(0,1,4);camera.lookAt(0,1,0);camera.updateMatrixWorld(true);
        });
        await page.mouse.click(640,400,{button:'right'});
        assert(await page.evaluate(()=>hiddenRedstone.has('0,1,0')&&getBlock(0,1,0)===134&&playerInventory[28]===1));
        await page.mouse.click(640,400,{button:'right'});
        assert.equal(await page.evaluate(()=>playerInventory[28]),1);
        await page.evaluate(()=>{machinePut(0,1,0,28);currentBlock=134;playerInventory[134]=1;});
        await page.mouse.click(640,400,{button:'right'});
        assert(await page.evaluate(()=>hiddenRedstone.has('0,1,0')&&getBlock(0,1,0)===134&&playerInventory[134]===0));
        await page.evaluate(()=>{machineReset();setupPiston();currentBlock=34;camera.position.set(0,1,4);camera.lookAt(0,1,0);camera.updateMatrixWorld(true);});
        await page.mouse.click(640,400,{button:'right'});
        await page.getByRole('button',{name:'Rotate',exact:true}).click();
        assert(await page.evaluate(()=>pistonDirections.get('0,1,0').z===1));
        console.log('PASS: Actual right-click conceals redstone, consumes one item, and rotates the piston with a pickaxe.');
        await page.getByRole('button',{name:'Door',exact:true}).click();
        assert.equal(await page.evaluate(()=>pistonModes.get('0,1,0')),'door');
        for(const [width,height,label] of [[1280,800,'desktop'],[390,844,'mobile']]) {
            await page.setViewportSize({width,height});
            assert(await page.locator('#home-panel .world-dialog').evaluate(el=>el.getBoundingClientRect().width<=innerWidth&&el.scrollWidth<=el.clientWidth));
            await page.screenshot({path:`/private/tmp/mc-piston-settings-${label}.png`});
        }
        await page.setViewportSize({width:1280,height:800});
        await page.evaluate(()=>{
            machineReset();gameMode='survival';playerInventory[REDSTONE_DUST_ID]=2;currentBlock=REDSTONE_DUST_ID;
            camera.position.set(0,2.1,3);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
        });
        await page.mouse.click(640,400,{button:'right'});
        assert(await page.evaluate(()=>[...machineCells.values()].filter(t=>t===REDSTONE_DUST_ID).length===1&&playerInventory[REDSTONE_DUST_ID]===1));
        await page.evaluate(()=>{
            machineReset();gameMode='survival';playerInventory[BUTTON_ID]=1;currentBlock=BUTTON_ID;machinePut(0,1,0,3);
            camera.position.set(0,1,4);camera.lookAt(0,1,0);camera.updateMatrixWorld(true);
        });
        await page.mouse.click(640,400,{button:'right'});
        assert(await page.evaluate(()=>getBlock(0,1,1)===BUTTON_ID&&buttonFaces.get('0,1,1').z===1&&playerInventory[BUTTON_ID]===0));
        await page.mouse.click(640,400,{button:'right'});
        assert.equal(await page.evaluate(()=>buttonTimers.get('0,1,1')),1);
        await page.evaluate(()=>machineTicks(1.2));
        assert.equal(await page.evaluate(()=>buttonTimers.size),0);
        console.log('PASS: Actual piston mode controls, responsive panel, dust placement, wall button placement and press/release.');

        await page.evaluate(()=>{
            machineReset();setupPiston();machinePut(1,1,0,3);extendPiston(0,1,0);
            machinePut(-1,1,0,134);hiddenRedstone.add('-1,1,0');
            machinePut(12,5,0,TNT_ID);primeTNT(12,5,0,{launch:{x:1,y:0,z:0}});
            tickMovingTNT(0.1);
        });
        const downloadPromise=page.waitForEvent('download');await page.evaluate(()=>downloadSave());
        const download=await downloadPromise,save=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
        await page.locator('#load-file').setInputFiles({name:'machines.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(save))});
        await page.waitForFunction(()=>movingTNT.size===1&&pistonStates.size===1&&hiddenRedstone.has('-1,1,0'));
        assert(await page.evaluate(()=>getBlock(1,1,0)===PISTON_HEAD_ID&&pistonDirections.get('0,1,0').x===1&&[...movingTNT.values()][0].launchDelay>0));
        console.log('PASS: Actual downloaded save restores concealed wire, piston direction/row/head and an in-progress fuse.');

        await page.evaluate(()=>{
            machineReset();setupPiston();setupPiston(0,2,0);machinePut(1,1,0,6);machinePut(1,2,0,6);
            machinePut(-1,1,0,28);machinePut(-1,2,0,28);machinePut(-2,1,0,31);machineTicks(0.3);
            for(let x=-3;x<=1;x++)machinePut(x,1,2,REDSTONE_DUST_ID);
            machinePut(-2,1,1,REDSTONE_DUST_ID);machinePut(-3,1,3,BUTTON_ID);updateCircuitVisuals();
            for(let x=-1;x<=0;x++)for(let z=-1;z<=0;z++)buildChunkMesh(x,z);
            camera.position.set(4.7,3.4,6);camera.lookAt(0,1.4,0);camera.updateMatrixWorld(true);
        });
        for(const [width,height,label] of [[1280,800,'desktop'],[390,844,'mobile']]) {
            await page.setViewportSize({width,height});
            assert(await page.evaluate(()=>{
                renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.render(scene,camera);
                const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,pixels=new Uint8Array(w*h*4),colors=new Set();
                gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);for(let i=0;i<pixels.length;i+=64)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
                return colors.size>30&&renderer.info.render.triangles>100&&pistonVisuals.size===2;
            }),'Voxel machine scene is visible');
            await page.screenshot({path:`/private/tmp/mc-piston-gate-${label}.png`});
        }
        const extended=await page.evaluate(()=>pistonVisuals.get('0,1,0').userData.plate.position.z);
        await page.evaluate(()=>machineTicks(0.65));
        const retracted=await page.evaluate(()=>pistonVisuals.get('0,1,0').userData.plate.position.z);
        assert(extended-retracted>0.4,'The rendered rod and plate move, not just logical blocks');
        assert.deepEqual(errors,[]);
        console.log('PASS: Animated piston rod and plate, desktop/mobile pixels and screenshots, no browser errors.');
        await page.close();

        const live=await browser.newPage({viewport:{width:1280,height:800}});
        live.on('pageerror',e=>errors.push(e.message));
        await live.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await live.getByRole('button',{name:'Creative',exact:true}).click();
        await live.getByRole('button',{name:'Start Game',exact:true}).click();
        const at=await live.evaluate(()=>{
            const x=Math.round(camera.position.x)+5,z=Math.round(camera.position.z),y=Math.round(camera.position.y)+8;
            for(let dx=-4;dx<=35;dx++)for(let dz=-3;dz<=3;dz++)for(let dy=-1;dy<=6;dy++)
                setBlockNoRebuild(x+dx,y+dy,z+dz,dy===-1?3:0,rebuildQueue);
            setBlockNoRebuild(x,y,z,PISTON_ID,rebuildQueue);pistonDirections.set(`${x},${y},${z}`,{x:1,y:0,z:0});
            setBlockNoRebuild(x,y-1,z,28,rebuildQueue);setBlockNoRebuild(x-1,y-1,z,30,rebuildQueue);
            for(let dy=0;dy<3;dy++)setBlockNoRebuild(x+1,y+dy,z,TNT_ID,rebuildQueue);
            currentBlock=2;creativeFlying=true;controls.isLocked=true;camera.position.set(x-1,y+2,z+2);camera.lookAt(x-1,y-1,z);camera.updateMatrixWorld(true);
            return [x,y,z];
        });
        await live.waitForFunction(()=>rebuildQueue.size===0);
        await live.mouse.move(640,400);
        await live.evaluate(p=>{camera.lookAt(p[0]-1,p[1]-1,p[2]);camera.updateMatrixWorld(true);},at);
        assert.equal(await live.evaluate(()=>expansionRay()?.type),30,'Actual crosshair aims at the lever');
        await live.mouse.down({button:'right'});await live.mouse.up({button:'right'});
        await live.waitForFunction(()=>movingTNT.size>0&&[...movingTNT.values()].some(t=>t.impact));
        await live.evaluate(p=>{camera.position.set(p[0]+8,p[1]+6,p[2]+12);camera.lookAt(p[0]+12,p[1]+3,p[2]);},at);
        await live.screenshot({path:'/private/tmp/mc-tnt-cannon-live.png'});
        await live.waitForFunction(()=>!movingTNT.size,{},{timeout:20000});
        assert(await live.evaluate(p=>getBlock(...p)===PISTON_ID&&[...worldMap].some(([k,t])=>{
            const [x,y,z]=k.split(',').map(Number);return t===0&&x>p[0]+15&&y===p[1]-1&&Math.abs(z-p[2])<3;
        }),at));
        assert.deepEqual(errors,[]);
        console.log('PASS: Real running world, actual right-click lever, visible TNT flight and distant impact without destroying the launcher.');
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
