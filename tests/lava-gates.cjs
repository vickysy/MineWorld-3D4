const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

(async()=>{
    const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try {
        const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
        page.setDefaultNavigationTimeout(120000);
        page.on('pageerror',e=>errors.push(e.message));
        await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
        await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await page.waitForFunction(()=>expansionReady&&typeof stepLavaFlow==='function');
        console.log(await page.evaluate(()=>{
            window.flowGateReset=()=>{
                clearExpansionWorld();clearMech();resetPlayerFlight();worldMap.clear();heightCache.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();
                restoreMicroEdits([]);rebuildQueue.clear();chunkQueue.length=0;cancelMining();
                for(const meshes of chunkMeshes.values())for(const mesh of Object.values(meshes))scene.remove(mesh);chunkMeshes.clear();
                for(const list of [villagers,zombies,creepers,animals,endermen]){for(const m of list)disposeModModel(m.mesh);list.length=0;}
                for(const p of explosionParticles)disposeModModel(p.mesh);explosionParticles.length=0;
                currentDimension='overworld';selectedTerrain='moon';getSurfaceHeight=()=>0;
                for(let x=-30;x<=30;x++)for(let z=-30;z<=30;z++)worldMap.set(`${x},0,${z}`,3);
                camera.position.set(0,2.1,0);camera.lookAt(0,2.1,-10);camera.updateMatrixWorld(true);
                gameMode='creative';playerScale=1;isGameStarted=true;controls.isLocked=true;isSleeping=false;playerTired=false;
                currentBlock=2;blocker.style.display='none';inventoryUI.style.display='none';heldItemGroup.visible=false;clouds.visible=false;
                document.getElementById('home-panel').hidden=true;document.getElementById('command-panel').hidden=true;
                scene.fog=null;scene.background.setHex(0xb9dae9);
            };
            window.flowPut=(x,y,z,t)=>setBlockNoRebuild(x,y,z,t,rebuildQueue);
            window.flowTicks=seconds=>{for(let i=0;i<Math.ceil(seconds*60);i++)tickLavaFlow(1/60);};
            window.gateTicks=seconds=>{for(let i=0;i<Math.ceil(seconds*60);i++)tickRedstoneMachines(1/60);};
            window.allLava=()=>[...worldMap].filter(([,t])=>t===LAVA_ID).map(([key])=>key.split(',').map(Number));
            const passed=[],check=(v,label)=>{if(!v)throw Error(label);passed.push(label);};
            flowGateReset();flowPut(0,18,0,LAVA_ID);flowTicks(0.05);
            check(getBlock(0,18,0)===0&&getBlock(0,14,0)===LAVA_ID,'Gravity starts in 50ms and drops four cells');
            check(allLava().every(([x,,z])=>x===0&&z===0),'Falling lava does not fan sideways in midair');
            flowTicks(0.3);check(allLava().every(([,y])=>y===1),'High lava reaches the floor quickly');
            check(allLava().length>1&&allLava().reduce((s,p)=>s+lavaAmount(...p),0)===8,'Grounded lava spreads without adding volume');

            flowGateReset();camera.position.set(0,26.6,20);check(pourLavaBucket(0,25,0)===128,'Large bucket still pours 128 cells');
            flowTicks(0.05);check(allLava().length===128&&allLava().every(([,y])=>y===21),'Every cell of the large bucket falls in the first update');
            flowTicks(0.5);check(allLava().every(([,y])=>y===1),'Large sheet settles instead of trickling through a small queue');
            check(allLava().reduce((s,p)=>s+lavaAmount(...p),0)===1024,'Large bucket conserves all 1024 fluid units');
            const start=performance.now();flowTicks(3);const elapsed=performance.now()-start;
            check(lavaQueue.size===0,'Stable pool sleeps instead of wasting every simulation tick');
            check(allLava().reduce((s,p)=>s+lavaAmount(...p),0)===1024,'Settled volume is conserved');
            const drain=allLava().find(p=>lavaAmount(...p)>0);flowPut(drain[0],0,drain[2],0);flowPut(drain[0],-1,drain[2],0);
            flowTicks(0.1);check(lavaAmount(drain[0],-1,drain[2])>0,'Removing a pool floor wakes gravity immediately');

            flowGateReset();flowPut(0,5,0,24);flowPut(0,10,0,LAVA_ID);flowTicks(0.1);
            check(getBlock(0,6,0)===OBSIDIAN_ID,'Fast falling lava reacts before passing through water');
            check(!allLava().some(([,y])=>y<5),'Water reaction cannot be skipped by fast descent');
            flowGateReset();flowPut(1,8,0,24);flowPut(0,10,0,LAVA_ID);flowTicks(0.05);
            check(getBlock(0,8,0)===OBSIDIAN_ID,'Side water on a crossed cell also makes obsidian');
            for(const type of [2,3,4,5,6,21,44]) {
                flowGateReset();flowPut(0,7,0,type);flowPut(0,12,0,LAVA_ID);flowTicks(0.05);
                check(getBlock(0,7,0)===type&&getBlock(0,8,0)===LAVA_ID&&!burningBlocks.size,`Falling lava stops at material ${type} without burning it`);
            }
            flowGateReset();for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)flowPut(x,2,z,3);
            flowPut(0,3,0,LAVA_ID);flowTicks(0.4);
            check(allLava().some(([,y])=>y===1),'Lava runs off a platform and down its edge');
            check(allLava().reduce((s,p)=>s+lavaAmount(...p),0)===8,'Runoff conserves volume');

            window.makeGate=(dx=0,dz=-1)=>{
                flowGateReset();camera.lookAt(dx*10,2.1,dz*10);camera.updateMatrixWorld(true);
                if(!executeWorldCommand(parseWorldCommand('建造活塞门')))throw Error('Gate command failed');
                const p=(u,y,v)=>[dx*7+dz*u+dx*v,y,dz*7-dx*u+dz*v];
                return {dx,dz,p,lever:[...machineCells].find(([,t])=>t===30)[0].split(',').map(Number)};
            };
            window.walkGate=(gate,u,start=-1.5,sign=1)=>{
                const at=gate.p(u,2.1,start);camera.position.set(...at);camera.lookAt(at[0]+gate.dx*sign,at[1],at[2]+gate.dz*sign);camera.updateMatrixWorld(true);
                velocity.set(0,0,0);moveForward=true;
                for(let i=0;i<120;i++)updatePlayerMovement(1/60);
                moveForward=false;velocity.set(0,0,0);
                return (camera.position.x-gate.dx*7)*gate.dx+(camera.position.z-gate.dz*7)*gate.dz;
            };
            for(const [dx,dz] of [[0,-1],[0,1],[1,0],[-1,0]]) {
                const gate=makeGate(dx,dz);
                for(let u=-4;u<=3;u++)for(let y=1;y<=2;y++)check(isSolid(...gate.p(u,y,0)),`Closed wall has no gap at ${dx},${dz}:${u},${y}`);
                for(const u of [-1,-0.5,0])check(walkGate(gate,u)<-0.65,`Normal walking is blocked across closed gate lane ${dx},${dz}:${u}`);
                camera.position.set(0,2.1,0);flowPut(...gate.lever,31);gateTicks(0.3);
                check(!pistonStates.size,`Lever opens all four pistons ${dx},${dz}`);
                for(const u of [-1,-0.5,0])check(walkGate(gate,u)>1.5,`Normal walking crosses open gate lane ${dx},${dz}:${u}`);
                check(walkGate(gate,-0.5,1.5,-1)<-1.5,`Open gate can be crossed from reverse side ${dx},${dz}`);
                camera.position.set(...gate.p(-0.5,2.1,0));flowPut(...gate.lever,30);gateTicks(10);
                check(!pistonStates.size,`Person in doorway prevents closure ${dx},${dz}`);
                camera.position.set(0,2.1,0);gateTicks(9);check(pistonStates.size===4,`Gate closes after clearing doorway ${dx},${dz}`);
                check(walkGate(gate,-0.5)<-0.65,`Closed again means blocked again ${dx},${dz}`);
                const saved=saveRedstoneMachines();restoreRedstoneMachines(saved);check(walkGate(gate,-0.5)<-0.65,`Saved closed gate still blocks walking ${dx},${dz}`);
            }
            makeGate();check(undoMachineCommand()&&pistonStates.size===0,'Unused corrected gate can be undone without leaving heads');
            return `${passed.length} lava gravity and actual gate traversal checks passed. 3s fluid simulation: ${Math.round(elapsed)}ms.`;
        }));

        // Test the actual lever click, then inspect closed/open geometry at both viewport sizes.
        await page.evaluate(()=>{window.visualGate=makeGate();camera.position.set(...visualGate.p(-4,2.1,-3));camera.lookAt(...visualGate.lever);camera.updateMatrixWorld(true);});
        await page.mouse.click(640,400,{button:'right'});
        assert(await page.evaluate(()=>getBlock(...visualGate.lever)===31));
        await page.evaluate(()=>{camera.position.set(0,2.1,0);gateTicks(0.3);});
        assert.equal(await page.evaluate(()=>pistonStates.size),0);
        for(const [width,height,label] of [[1280,800,'desktop'],[390,844,'mobile']]) {
            await page.setViewportSize({width,height});
            for(const closed of [true,false]) {
                const pixels=await page.evaluate(({closed,width,height})=>{
                    camera.position.set(0,2.1,0);flowPut(...visualGate.lever,closed?30:31);gateTicks(closed?9:0.3);
                    for(let x=-1;x<=0;x++)for(let z=-1;z<=0;z++)buildChunkMesh(x,z);
                    camera.position.set(...visualGate.p(-0.5,2.3,-7));camera.lookAt(...visualGate.p(-0.5,1.4,0));camera.updateMatrixWorld(true);
                    camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height);renderer.render(scene,camera);
                    const gl=renderer.getContext(),p=new Uint8Array(4),colors=new Set();for(let x=20;x<gl.drawingBufferWidth;x+=35)for(let y=20;y<gl.drawingBufferHeight;y+=35){gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);colors.add(p.slice(0,3).join(','));}return colors.size;
                },{closed,width,height});
                assert(pixels>10);await page.screenshot({path:`/private/tmp/mc-gate-${closed?'closed':'open'}-${label}.png`});
            }
        }
        assert.deepEqual(errors,[]);console.log('PASS: Real lever click, normal-size movement, and visible open/closed gates on desktop/mobile.');
        await page.close();

        const live=await browser.newPage({viewport:{width:1280,height:800}});
        live.setDefaultNavigationTimeout(120000);live.on('pageerror',e=>errors.push(e.message));
        await live.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await live.waitForFunction(()=>expansionReady);
        await live.getByRole('button',{name:'Creative',exact:true}).click();
        await live.getByRole('button',{name:'Moon',exact:true}).click();
        await live.getByRole('button',{name:'Start Game',exact:true}).click({timeout:60000});
        await live.waitForFunction(()=>controls.isLocked&&isGameStarted);
        await live.mouse.move(640,400);
        await live.evaluate(()=>{
            const x=Math.round(camera.position.x),z=Math.round(camera.position.z);
            let top=0;for(let dx=-24;dx<=24;dx++)for(let dz=-24;dz<=24;dz++)top=Math.max(top,getSurfaceHeight(x+dx,z+dz));
            const y=top+40,dirty=new Set();window.livePool={x,y,z};
            for(let dx=-24;dx<=24;dx++)for(let dz=-24;dz<=24;dz++)setBlockNoRebuild(x+dx,y,z+dz,3,dirty);
            addDirtyChunksToQueue(dirty,true);creativeFlying=true;velocity.set(0,0,0);
            camera.position.set(x,y+16,z+22);camera.lookAt(x,y+6,z);camera.updateMatrixWorld(true);
        });
        await live.waitForFunction(()=>rebuildQueue.size===0,{},{timeout:60000});
        assert.equal(await live.evaluate(()=>{const {x,y,z}=livePool;window.livePourStart=performance.now();return pourLavaBucket(x,y+18,z);}),128);
        await live.waitForFunction(()=>{const {x,y,z}=livePool;return getBlock(x,y+18,z)===0;},{},{timeout:3000});
        await live.waitForFunction(()=>{
            const {y}=livePool,cells=[...worldMap].filter(([,t])=>t===LAVA_ID);
            return cells.length>0&&cells.every(([key])=>Number(key.split(',')[1])===y+1);
        },{},{timeout:5000});
        const descent=await live.evaluate(()=>performance.now()-livePourStart);
        assert(descent<3000,`Live lava descent took ${descent}ms`);
        assert.equal(await live.evaluate(()=>[...worldMap].filter(([,t])=>t===LAVA_ID).reduce((sum,[key])=>sum+lavaAmount(...key.split(',').map(Number)),0)),1024);
        await live.waitForFunction(()=>rebuildQueue.size===0,{},{timeout:60000});
        assert(await live.evaluate(()=>{
            const {x,y,z}=livePool;camera.position.set(x,y+14,z+22);camera.lookAt(x,y+1,z);camera.updateMatrixWorld(true);renderer.render(scene,camera);
            const gl=renderer.getContext(),p=new Uint8Array(4);let lavaPixels=0;
            for(let px=10;px<gl.drawingBufferWidth;px+=15)for(let py=10;py<gl.drawingBufferHeight;py+=15){gl.readPixels(px,py,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);if(p[0]>100&&p[0]>p[1]*1.3&&p[1]>p[2]*1.2)lavaPixels++;}
            return lavaPixels>30;
        }),'The flowing pool must actually render, not only exist in world data');
        await live.screenshot({path:'/private/tmp/mc-lava-live.png'});
        assert.deepEqual(errors,[]);console.log(`PASS: Live animation drops all 128 lava cells onto the floor in ${Math.round(descent)}ms, conserves volume and renders the pool.`);
    } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
