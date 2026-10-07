const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
    const browser = await chromium.launch({
        ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
        headless: true
    });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
        await page.goto(pathToFileURL(path.resolve(__dirname, '../game3d.html')).href);
        await page.waitForFunction(() => typeof THREE !== 'undefined' && typeof findMicroBlockHit === 'function');
        const results = await page.evaluate(() => {
            const passed = [];
            const check = (condition, name) => {
                if (!condition) throw new Error(name);
                passed.push(name);
            };
            // A deterministic solid half-space exercises the actual renderer, input and physics.
            selectedTerrain = 'moon';
            currentDimension = 'overworld';
            getSurfaceHeight = () => 0;
            worldMap.clear();
            heightCache.clear();
            restoreMicroEdits([]);
            for (let x=-3; x<=3; x++) for (let z=-3; z<=3; z++) {
                for (let y=-3; y<=0; y++) worldMap.set(`${x},${y},${z}`,3);
            }
            isGameStarted = true;
            gameMode = 'creative';
            currentBlock = 3;
            controls.isLocked = true;
            playerScale = 1;
            camera.position.set(0.025,2,0.025);
            drinkShrinkPotion();
            check(!checkTinyCollision(camera.position), 'Shrinking lifts previously sunken feet clear of terrain');
            check(camera.near < MICRO_PLAYER_SCALE/10, 'Near clipping plane fits the tiny player');
            check(Math.abs(getPlayerHeight()/MICRO_PLAYER_SCALE-1.6)<1e-8, 'Tiny eye height is 1.6 small blocks');
            camera.position.set(0.025,0.58,0.025);
            camera.lookAt(0.025,0,0.025);
            camera.updateMatrixWorld(true);
            buildChunkMesh(0,0);
            buildChunkMesh(-1,0);
            const before = JSON.stringify([...worldMap]);
            document.dispatchEvent(new MouseEvent('mousedown',{button:0}));
            check(microMinedBlocks.size === 1, 'One mouse press removes exactly one micro voxel');
            check(before === JSON.stringify([...worldMap]), 'Micro mining never removes the parent block');
            check(isMicroMined(0,0,0,10,19,10), 'The selected top voxel is the one removed');
            check(isTinySolidAtPoint(0.075,0.475,0.025), 'Adjacent small voxel remains solid');
            check(isTinySolidAtPoint(0.025,0.425,0.025), 'The voxel below the hole remains solid');
            check(moveTinyAxis('y',-2), 'Swept fall hits the floor even at high speed');
            check(Math.abs(camera.position.y-0.53)<0.00002, 'Digging underfoot drops the player exactly one small block');
            check(!checkTinyCollision(camera.position), 'The fallen player is not inside solid terrain');

            scene.updateMatrixWorld(true);
            const inside = new THREE.Vector3(0.025,0.475,0.025);
            for (const dir of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,-1,0]]) {
                const ray = new THREE.Raycaster(inside,new THREE.Vector3(...dir),0,0.04);
                const surfaces = ray.intersectObjects(microVoxelGroup.children);
                check(surfaces.length>0 && Math.abs(surfaces[0].distance-0.025)<0.00001,
                    `Real inward-facing hole surface ${dir}`);
            }
            const sourceMesh = chunkMeshes.get('0,0')[3];
            const matrix = new THREE.Matrix4();
            sourceMesh.getMatrixAt(sourceMesh.userData.blockIndices.get('0,0,0'),matrix);
            check(matrix.elements[0]===0, 'Original parent cube is removed from the instanced render');

            const timings = [];
            for (let i=1; i<24; i++) {
                camera.lookAt(camera.position.x,camera.position.y-1,camera.position.z);
                camera.updateMatrixWorld(true);
                const time = performance.now();
                document.dispatchEvent(new MouseEvent('mousedown',{button:0}));
                timings.push(performance.now()-time);
                check(microMinedBlocks.size===i+1, `Repeated click ${i+1} removes one voxel`);
                moveTinyAxis('y',-0.2);
            }
            check(Math.abs(camera.position.y-(0.58-24/20))<0.00002, 'A shaft crosses the parent-block boundary without a void');
            check(getBlock(0,0,0)===3 && getBlock(0,-1,0)===3, 'Both large blocks still contain their unmined volume');
            check(miningState===null, 'No delayed whole-block mining is running');

            const size = microMinedBlocks.size;
            camera.lookAt(camera.position.x,camera.position.y+1,camera.position.z);
            camera.updateMatrixWorld(true);
            document.dispatchEvent(new MouseEvent('mousedown',{button:0}));
            check(microMinedBlocks.size===size && miningState===null, 'A ray miss never falls back to whole-block mining');

            const saved = Array.from(microMinedBlocks);
            restoreMicroEdits(saved);
            updateMicroVoxelOverlay();
            check(!checkTinyCollision(camera.position), 'Saved micro tunnels retain their collision after loading');
            check(microMeshes.size>0, 'Saved tunnels rebuild their real geometry');
            const downward = findMicroBlockHit(camera.position,new THREE.Vector3(0,-1,0));
            check(downward && downward.y===-1 && downward.my===15, 'Targeting from inside the parent selects the next intact voxel');

            const negative = microCellAt(-0.525,-0.525,-0.525);
            check(negative.x===-1 && negative.mx===19 && negative.my===19 && negative.mz===19, 'Negative coordinates map to the correct micro cell');
            const crossOrigin = new THREE.Vector3(-0.475,0.7,0.025);
            const negativeHit = findMicroBlockHit(crossOrigin,new THREE.Vector3(0,-1,0));
            check(negativeHit.mx===0 && negativeHit.x===0, 'Boundary micro target uses exact integer grid traversal');
            mineMicroBlock(negativeHit);
            updateMicroVoxelOverlay();
            scene.updateMatrixWorld(true);
            const edgeRay = new THREE.Raycaster(new THREE.Vector3(-0.475,0.475,0.025),new THREE.Vector3(-1,0,0),0,0.04);
            check(edgeRay.intersectObjects(microVoxelGroup.children).length>0, 'Adjacent large block supplies the wall at a boundary hole');

            // A two-cell-high, one-cell-wide tunnel fits; its roof and sides stay solid.
            for (let mz=4; mz<=10; mz++) for (let my=16; my<=17; my++) {
                mineMicroBlock({x:1,y:0,z:0,mx:10,my,mz,type:3});
            }
            camera.position.set(1.025,0.38,0.025);
            check(!checkTinyCollision(camera.position), 'Player fits in a two-small-block-high tunnel');
            check(!moveTinyAxis('z',-0.25), 'Player walks along the miniature tunnel');
            check(moveTinyAxis('x',0.1), 'Tunnel wall blocks sideways movement');
            check(moveTinyAxis('y',0.1), 'Tunnel roof blocks upward movement');

            currentDimension='nether';
            check(!isMicroMined(0,0,0,10,19,10), 'Micro edits do not leak into another dimension');
            currentDimension='overworld';
            setBlock(0,0,0,2);
            updateMicroVoxelOverlay();
            check(!isMicroMined(0,0,0,10,19,10), 'Replacing a parent block clears its old micro holes');

            // Small construction uses the same grid as excavation, including cross-parent doors.
            const floorHit={x:2,y:0,z:0,mx:10,my:19,mz:10,type:3,norm:new THREE.Vector3(0,1,0)};
            camera.position.set(2.2,0.58,0.1);
            gameMode='survival';
            playerInventory[4]=4;
            check(placeMicroBlock(floorHit,4),'A small block can be placed on the natural ground');
            const small=offsetMicroCell(floorHit,0,1,0);
            check(getMicroType(small)===4 && getBlock(2,1,0)===0,'Placement adds one small block without changing the air parent');
            check(playerInventory[4]===3,'Successful small placement consumes one item');
            check(isTinySolidAtPoint(2.025,0.525,0.025),'A placed small block has collision');
            check(!isTinySolidAtPoint(2.075,0.525,0.025),'The adjacent unfilled small cell is still air');
            const smallHit={...small,type:4,norm:new THREE.Vector3(0,1,0)};
            check(placeMicroBlock(smallHit,4),'A second small block stacks on the first');
            check(getMicroType(offsetMicroCell(small,0,1,0))===4,'Two placements make a two-small-block-high column');
            check(!placeMicroBlock(floorHit,4) && playerInventory[4]===2,'Occupied placement neither overwrites nor consumes material');
            mineMicroBlock(smallHit);
            check(getMicroType(small)===0 && getMicroType(offsetMicroCell(small,0,1,0))===4,'Mining a placed cell removes just that cell');
            scene.updateMatrixWorld(true);
            const smallRay=new THREE.Raycaster(new THREE.Vector3(2.025,0.625,0.025),new THREE.Vector3(0,-1,0),0,0.1);
            const smallSurfaces=smallRay.intersectObjects(microVoxelGroup.children);
            check(smallSurfaces.length>0 && Math.abs(smallSurfaces[0].distance-0.025)<0.00001,'Placed geometry ends at the exact small-cell face');

            camera.position.set(2.025,0.58,0.025);
            check(!placeMicroBlock(floorHit,4) && playerInventory[4]===2,'Cannot place a block through the player');
            camera.position.set(2.2,0.58,0.1);
            playerInventory[8]=2;
            const doorFloor={...floorHit,mx:4};
            check(placeMicroBlock(doorFloor,8),'A miniature door places successfully');
            const door=offsetMicroCell(doorFloor,0,1,0), doorTop=offsetMicroCell(door,0,1,0);
            check(getMicroType(door)===8 && getMicroType(doorTop)===9 && playerInventory[8]===1,'One door item occupies exactly two vertically adjacent small cells');
            check(toggleMicroDoor(doorTop),'Right-clicking the upper half opens the entire small door');
            check(getMicroType(door)===10 && getMicroType(doorTop)===11,'Both door halves update together');
            camera.position.set(1.725,0.58,0.025);
            check(!checkTinyCollision(camera.position),'The player can stand inside an open miniature doorway');
            toggleMicroDoor(door);
            check(getMicroType(door)===10,'Door closing cannot trap the player');
            camera.position.set(2.2,0.58,0.1);
            toggleMicroDoor(door);
            camera.position.set(1.725,0.58,0.025);
            check(checkTinyCollision(camera.position),'Closed miniature doors block the player');
            camera.position.set(2.2,0.58,0.1);

            gameMode='creative';
            const edgeFloor={...floorHit,mx:6,my:18,y:1};
            setMicroPlacement(edgeFloor,3);
            check(placeMicroBlock(edgeFloor,8),'A door can span two parent blocks');
            const edgeDoor=offsetMicroCell(edgeFloor,0,1,0), edgeTop=offsetMicroCell(edgeDoor,0,1,0);
            check(edgeDoor.y===1 && edgeTop.y===2 && getMicroType(edgeTop)===9,'Door halves keep exact scale across a parent boundary');
            toggleMicroDoor(edgeTop);
            check(getMicroType(edgeDoor)===10 && getMicroType(edgeTop)===11,'Cross-parent door halves open together');

            const sensorFloor={...floorHit,mx:15};
            check(placeMicroBlock(sensorFloor,48),'A miniature glass sensor door places');
            const sensor=offsetMicroCell(sensorFloor,0,1,0);
            camera.position.set(2.325,0.58,0.025);
            updateTinySensorDoors();
            check(getMicroType(sensor)===50,'Approaching opens the tiny sensor door');
            camera.position.set(2.45,0.58,0.3);
            updateTinySensorDoors();
            check(getMicroType(sensor)===48,'Moving away closes the tiny sensor door');

            const tinySaved=Array.from(microPlacedBlocks);
            restoreMicroEdits(Array.from(microMinedBlocks),tinySaved);
            updateMicroVoxelOverlay();
            check(getMicroType(door)===8 && getMicroType(edgeTop)===11,'Placed blocks and door state survive save/load');
            check(microMeshes.has(microParentKey(2,1,0)),'Small buildings in an air parent have a visible mesh after load');

            camera.position.set(2.275,0.65,0.125);
            camera.lookAt(2.275,0.5,0.125);
            camera.updateMatrixWorld(true);
            currentBlock=4;
            const countBefore=microPlacedBlocks.size;
            document.dispatchEvent(new MouseEvent('mousedown',{button:2}));
            check(microPlacedBlocks.size===countBefore+1,'Actual right-click input adds exactly one small block');
            check(getBlock(2,1,0)===0,'Right-click never falls back to whole-block placement');

            camera.position.set(1.025,0.38,-0.175);
            camera.lookAt(1.025,0.36,-0.4);
            document.getElementById('blocker').style.display='none';
            document.getElementById('inventory-ui').style.display='none';
            heldItemGroup.visible=false;
            microTarget.visible=false;
            scene.fog=null;
            renderer.render(scene,camera);
            return { passed, averageMineMs: timings.reduce((a,b)=>a+b,0)/timings.length,
                geometryVertices: [...microMeshes.values()].reduce((a,m)=>a+m.geometry.attributes.position.count,0) };
        });
        console.log(JSON.stringify(results,null,2));
        await page.screenshot({path:'/private/tmp/micro-world-desktop.png'});
        for (const viewport of [{width:1280,height:800},{width:390,height:844}]) {
            await page.setViewportSize(viewport);
            const pixels = await page.evaluate(() => {
                camera.aspect=innerWidth/innerHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(innerWidth,innerHeight);
                renderer.render(scene,camera);
                const gl=renderer.getContext(), colors=new Set();
                let background=0;
                const pixel=new Uint8Array(4);
                for(let x=0.2; x<0.85; x+=0.1) for(let y=0.2; y<0.85; y+=0.1) {
                    gl.readPixels(Math.floor(gl.drawingBufferWidth*x),Math.floor(gl.drawingBufferHeight*y),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
                    colors.add(Array.from(pixel).join(','));
                    if(pixel[0]===0 && pixel[1]===0 && pixel[2]===0) background++;
                }
                return {colors:colors.size,background};
            });
            assert.ok(pixels.colors>4, 'Tunnel canvas has visible textured surfaces');
            assert.equal(pixels.background,0, 'No empty black pixels inside the tunnel');
            console.log({viewport,pixels});
        }
        await page.screenshot({path:'/private/tmp/micro-world-mobile.png'});
        await page.setViewportSize({width:1280,height:800});
        await page.evaluate(()=>{
            camera.aspect=innerWidth/innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(innerWidth,innerHeight);
            camera.position.set(1.95,0.65,0.3);
            camera.lookAt(1.83,0.55,0.025);
            renderer.render(scene,camera);
        });
        await page.screenshot({path:'/private/tmp/micro-build-desktop.png'});
        assert.deepEqual(errors,[],'No runtime errors');

        const live = await browser.newPage({viewport:{width:1280,height:800}});
        live.on('pageerror',e=>errors.push(e.message));
        await live.goto(pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await live.getByRole('button',{name:'Creative',exact:true}).click();
        await live.getByRole('button',{name:'Start Game',exact:true}).click();
        await live.waitForFunction(()=>isGameStarted && chunkMeshes.size>=9);
        await live.evaluate(()=>{
            controls.isLocked=true;
            drinkShrinkPotion();
        });
        await live.waitForFunction(()=> Math.abs(velocity.y)<0.00001 && !checkTinyCollision(camera.position));
        const natural = await live.evaluate(()=>{
            const n=MICRO_BLOCK_DIVISIONS;
            camera.position.x=(Math.floor((camera.position.x+0.5)*n)+0.5)/n-0.5;
            camera.position.z=(Math.floor((camera.position.z+0.5)*n)+0.5)/n-0.5;
            camera.lookAt(camera.position.x,camera.position.y-1,camera.position.z);
            camera.updateMatrixWorld(true);
            currentBlock=3;
            const y=camera.position.y;
            const oldSize=microMinedBlocks.size;
            document.dispatchEvent(new MouseEvent('mousedown',{button:0}));
            return {y,oldSize};
        });
        await live.waitForFunction(({y,oldSize})=>
            microMinedBlocks.size===oldSize+1 && Math.abs(camera.position.y-(y-0.05))<0.001 && Math.abs(velocity.y)<1e-6,
            natural,{timeout:15000});
        console.log('PASS: Actual generated world and running animation loop land exactly one micro block down.');
        await live.screenshot({path:'/private/tmp/micro-world-live.png'});
        assert.deepEqual(errors,[],'No errors in live gameplay');
    } finally {
        await browser.close();
    }
})().catch(error=>{console.error(error);process.exitCode=1;});
