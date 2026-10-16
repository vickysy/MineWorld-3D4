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
        page.on('console',m=>{if(m.type()==='error')console.log(m.text());});
        await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
        await page.goto(pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await page.waitForFunction(()=>expansionReady);
        console.log(await page.evaluate(()=>{
            const checks=[],check=(v,n)=>{if(!v)throw new Error(n);checks.push(n);};
            const originalHeight=getSurfaceHeight;
            const reset=()=>{clearExpansionWorld();worldMap.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();heightCache.clear();restoreMicroEdits([]);resetPlayerFlight();
                for(const list of [villagers,zombies,creepers,animals]){for(const m of list)disposeModModel(m.mesh);list.length=0;}
                selectedTerrain='moon';currentDimension='overworld';getSurfaceHeight=()=>0;camera.position.set(0,2.1,6);playerScale=1;isGameStarted=true;gameMode='creative';controls.isLocked=false;};
            window.homeCityTestReset=reset;reset();
            const put=(x,y,z,t)=>setBlockNoRebuild(x,y,z,t,new Set());
            for(const id of Object.keys(EXTRA_HOME_ITEMS).map(Number).filter(id=>id<104)) {
                const x=(id-82)*3;check(placeFurniture(id,x,1,0),`${getBlockName(id)} places`);
                check(furnitureMeshes.has(`overworld|${x},1,0`),`${getBlockName(id)} has a detailed model`);
            }
            for(const recipe of extraHomeRecipes()) {
                craftingGrid=Object.entries(recipe.ing).flatMap(([id,n])=>Array(n).fill(Number(id)));while(craftingGrid.length<9)craftingGrid.push(0);checkRecipes();
                check(craftingOutput.id===recipe.out,`${getBlockName(recipe.out)} recipe has no conflicts`);
            }
            const tv=furnitureRecord(33,1,0),part=tv.data.parts[0];
            check(furnitureRecord(...part).key===tv.key,'Large TV second block resolves to the same object');
            const dropBefore=droppedItems.length;mineBlock(new THREE.Vector3(...part),false);
            check(getBlock(33,1,0)===0&&getBlock(...part)===0&&droppedItems.length===dropBefore+1,'Mining either TV half drops one item and clears both cells');
            const cabinet=furnitureRecord(18,1,0);cabinet.data.storage={3:4};const before=droppedItems.length;
            mineBlock(new THREE.Vector3(18,2,0),false);
            check(getBlock(18,1,0)===0&&droppedItems.length===before+5,'Mining cabinet upper half drops the cabinet and stored items');
            check(!isSolidType(92),'Rugs do not block walking');
            document.getElementById('home-bed').click();check(currentBlock===14,'Home bed selects the existing functional bed');
            check(parseWorldCommand('查找大电视').id===93&&parseWorldCommand('查找安卓电脑').id===96,'Expanded home items can be found in Chinese');

            reset();const car=spawnCityCar('test',0,0.5,0,0,undefined,'bao8');camera.position.set(2.5,2.1,0);camera.lookAt(0,1.3,0);camera.updateMatrixWorld(true);
            check(playerHitsCityCar(new THREE.Vector3(0,2,0)),'Walking player cannot pass through a parked car');
            check(tryEnterCityCar()&&drivingCar===car,'Player can enter an aimed-at car');
            moveForward=true;for(let i=0;i<60;i++)updateDrivingCar(1/60);moveForward=false;
            check(car.mesh.position.z>2,'W drives the car forward');
            const z=car.mesh.position.z;for(let x=-3;x<=3;x++)for(let y=1;y<=3;y++)put(x,y,Math.ceil(z)+4,3);
            moveForward=true;for(let i=0;i<180;i++)updateDrivingCar(1/60);moveForward=false;
            check(car.mesh.position.z<Math.ceil(z)+2.1&&car.speed===0,'Vehicle stops before a solid wall without tunneling');
            moveBackward=true;moveLeft=true;const yaw=car.mesh.rotation.y;for(let i=0;i<30;i++)updateDrivingCar(1/60);moveBackward=moveLeft=false;
            check(car.mesh.rotation.y!==yaw,'A/D steers while reversing');
            check(leaveCityCar()&&!drivingCar&&!checkCollision(camera.position),'Exiting places the player in clear space');
            for(const model of Object.keys(CAR_MODELS)) {
                const m=createCityCar(undefined,model);const bounds=new THREE.Box3().setFromObject(m);
                check(bounds.getSize(new THREE.Vector3()).z>2.8&&m.userData.wheels.length===4,`${model} has four wheels and an SUV body`);disposeModModel(m);
            }
            const saved=saveWorldExpansion(),savedZ=car.mesh.position.z;clearExpansionWorld();restoreWorldExpansion(saved);
            check(cityCars.get('test').model==='bao8'&&cityCars.get('test').mesh.position.z===savedZ,'Cars retain model and position through save/load');

            reset();selectedTerrain='city';getSurfaceHeight=originalHeight;
            for(let cx=-1;cx<=3;cx++)for(let cz=-1;cz<=1;cz++)generateCityChunk(cx,cz);
            camera.position.set(1,18.1,1);populateCityStreets();updateHomeCity(2);
            check(villagers.filter(v=>v.cityResident).length>=5&&villagers.every(v=>v.cityResident||v.merchantId),'City reliably has residents on streets and merchants at stalls');
            check(cityCars.size>=4,'City streets have multiple cars');
            check(getBlock(40,15,8)===24&&getBlock(40,16,8)===0,'Lake has actual water below the street level');
            check(getBlock(41,16,17)!==0&&getBlock(41,15,17)===24,'Bridge spans lake water between its support pillars');
            check(getBlock(40,17,15)===98&&getBlock(40,17,19)===98,'Bridge has railings outside the driving lanes');
            const bridgeCar=spawnCityCar('bridge',34,16.5,17,Math.PI/2,undefined,'tai7');
            for(let x=34;x<=61;x++)check(carSpaceClear(bridgeCar,new THREE.Vector3(x,16.5,17)),'Bridge is continuously driveable');
            const expansion=saveWorldExpansion();check(expansion.city.residents.length>=5,'City residents are included in saves');
            return `${checks.length} home/city checks passed.`;
        }));
        await page.evaluate(()=>{
            homeCityTestReset();blocker.style.display='none';inventoryUI.style.display='none';
            gameMode='creative';placeFurniture(88,0,1,0);openFurniturePanel(furnitureRecord(0,1,0));
        });
        await page.getByRole('combobox',{name:'Stored item'}).selectOption('3');await page.getByRole('button',{name:'Store',exact:true}).click();
        assert.equal(await page.evaluate(()=>furnitureRecord(0,1,0).data.storage[3]),1);
        await page.getByRole('button',{name:'Take',exact:true}).click();assert.equal(await page.evaluate(()=>furnitureRecord(0,1,0).data.storage[3]),0);
        await page.evaluate(()=>{closeFurniturePanel(false);placeFurniture(86,3,1,0);openFurniturePanel(furnitureRecord(3,1,0));});
        await page.getByRole('checkbox',{name:'Tap',exact:true}).check();
        await page.evaluate(()=>{updateWorldExpansion(0.2);});
        assert.equal(await page.evaluate(()=>furnitureMeshes.get('overworld|3,1,0').userData.stream.visible),true);
        await page.evaluate(()=>{closeFurniturePanel(false);placeFurniture(89,6,1,0);openFurniturePanel(furnitureRecord(6,1,0));});
        await page.getByRole('checkbox',{name:'Light',exact:true}).check();await page.evaluate(()=>updateWorldExpansion(0.2));
        assert(await page.evaluate(()=>furnitureMeshes.get('overworld|6,1,0').userData.light.intensity>0));
        await page.evaluate(()=>{closeFurniturePanel(false);placeFurniture(85,9,1,0);openFurniturePanel(furnitureRecord(9,1,0));});
        await page.getByRole('button',{name:'Flush',exact:true}).click();assert(await page.evaluate(()=>furnitureRecord(9,1,0).data.flushing>0));
        await page.evaluate(()=>{closeFurniturePanel(false);placeFurniture(96,12,1,0);openFurniturePanel(furnitureRecord(12,1,0));});
        await page.getByRole('textbox',{name:'Notes'}).fill('Home computer');await page.getByRole('button',{name:'Save',exact:true}).click();
        assert.equal(await page.evaluate(()=>furnitureRecord(12,1,0).data.note),'Home computer');
        console.log('PASS: Cabinet storage, faucet, lamp, toilet and desktop UI.');

        await page.evaluate(()=>{
            homeCityTestReset();blocker.style.display='none';inventoryUI.style.display='none';heldItemGroup.visible=false;
            scene.background.setHex(0xc3d7df);scene.fog=null;
            for(const meshes of chunkMeshes.values())for(const m of Object.values(meshes))scene.remove(m);chunkMeshes.clear();
            for(let x=-1;x<=1;x++)for(let z=-1;z<=0;z++)buildChunkMesh(x,z);
            camera.position.set(0,2.4,7);
            const ids=[73,74,75,77,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98];
            for(let i=0;i<ids.length;i++) {const x=(i%7)*2-6,z=-Math.floor(i/7)*4;placeFurniture(ids[i],x,1,z);}
            for(let i=0;i<4;i++)spawnCityCar('show-'+i,-6+i*4,0.5,-15,Math.PI,undefined,Object.keys(CAR_MODELS)[i]);
            camera.position.set(10,8,12);camera.lookAt(0,1,-5);camera.updateMatrixWorld(true);syncFurnitureMeshes();renderer.render(scene,camera);
        });
        await page.screenshot({path:'/private/tmp/mc-home-showcase.png'});
        await page.evaluate(()=>{
            camera.position.set(0,2.1,4);placeFurniture(87,0,2,0);furnitureRecord(0,2,0).data.yaw=0;
            syncFurnitureMeshes();camera.lookAt(0,2,0);camera.updateMatrixWorld(true);renderer.render(scene,camera);
        });
        const reflected=await page.evaluate(()=>{
            const mirror=furnitureMeshes.get('overworld|0,2,0').userData.mirror,rt=mirror.getRenderTarget(),pixels=new Uint8Array(256*256*4);
            renderer.readRenderTargetPixels(rt,0,0,256,256,pixels);let n=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>30)n++;
            return n;
        });await page.screenshot({path:'/private/tmp/mc-mirror.png'});assert(reflected>1000,`Mirror has nonblank rendered pixels (${reflected})`);
        await page.evaluate(()=>{isInventoryOpen=true;inventoryUI.style.display='block';switchTab('home');});
        await page.screenshot({path:'/private/tmp/mc-home-desktop.png'});
        await page.setViewportSize({width:390,height:844});await page.evaluate(()=>renderer.render(scene,camera));
        await page.locator('#home-bed').scrollIntoViewIfNeeded();await page.screenshot({path:'/private/tmp/mc-home-mobile.png'});
        assert(await page.locator('#inventory-ui').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));
        assert.deepEqual(errors,[]);await page.close();
        console.log('PASS: Real mirror pixels and all furniture/vehicle models; responsive Home inventory.');
        const live=await browser.newPage({viewport:{width:1440,height:900}});live.on('pageerror',e=>errors.push(e.message));
        await live.goto(pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await live.getByRole('button',{name:'Creative',exact:true}).click();await live.locator('#terrain-select').selectOption('city');
        await live.getByRole('button',{name:'Start Game',exact:true}).click();
        await live.waitForFunction(()=>cityCars.size>=4&&villagers.length>=4,{},{timeout:90000});
        await live.evaluate(()=>{
            for(let x=1;x<=4;x++)for(let z=-1;z<=2;z++){generateCityChunk(x,z);buildChunkMesh(x,z);}
            const car=spawnCityCar('live-bridge',36,16.5,17,Math.PI/2,undefined,'bao5');
            camera.position.set(34,18.1,17);camera.lookAt(36,17.4,17);camera.updateMatrixWorld(true);controls.isLocked=true;selectSlot(1);
        });
        await live.mouse.click(720,450,{button:'right'});await live.waitForFunction(()=>drivingCar?.id==='live-bridge');
        const start=await live.evaluate(()=>drivingCar.mesh.position.x);
        await live.keyboard.down('w');await live.waitForTimeout(1000);await live.keyboard.up('w');
        assert(await live.evaluate(s=>drivingCar.mesh.position.x>s+0.4,start));
        await live.keyboard.press('Space');assert.equal(await live.evaluate(()=>drivingCar.speed),0);
        await live.screenshot({path:'/private/tmp/mc-driving-cabin.png'});
        await live.keyboard.press('e');await live.waitForFunction(()=>!drivingCar);
        await live.evaluate(()=>{creativeFlying=true;camera.position.set(49,30,38);camera.lookAt(46,15,12);camera.updateMatrixWorld(true);});
        await live.waitForTimeout(500);await live.screenshot({path:'/private/tmp/mc-lake-bridge.png'});
        assert(await live.evaluate(()=>renderer.info.render.triangles>100));
        await live.setViewportSize({width:390,height:844});await live.waitForTimeout(200);await live.screenshot({path:'/private/tmp/mc-lake-mobile.png'});
        const downloaded=live.waitForEvent('download');await live.evaluate(()=>downloadSave());
        const saved=JSON.parse(fs.readFileSync(await (await downloaded).path(),'utf8'));
        assert(saved.expansion.city.cars.some(c=>c.id==='live-bridge'&&c.model==='bao5'));assert(saved.expansion.city.residents.length>=4);
        await live.locator('#load-file').setInputFiles({name:'city.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
        await live.waitForFunction(()=>cityCars.has('live-bridge'));
        assert.deepEqual(errors,[]);await live.close();
        console.log('PASS: Actual right-click entry, W driving, Space brake, E exit, lake/bridge rendering and exported city save.');
    } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
