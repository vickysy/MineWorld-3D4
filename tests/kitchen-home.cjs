const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

(async()=>{
    const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try {
        const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
        await page.goto(pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await page.waitForFunction(()=>expansionReady);
        console.log(await page.evaluate(()=>{
            const checks=[],check=(v,n)=>{if(!v)throw new Error(n);checks.push(n);};
            const reset=()=>{
                clearExpansionWorld();worldMap.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();heightCache.clear();restoreMicroEdits([]);resetPlayerFlight();
                for(const list of [villagers,zombies,creepers,animals]){for(const m of list)disposeModModel(m.mesh);list.length=0;}
                for(const meshes of chunkMeshes.values())for(const m of Object.values(meshes))scene.remove(m);chunkMeshes.clear();
                selectedTerrain='moon';currentDimension='overworld';getSurfaceHeight=()=>0;playerScale=1;gameMode='creative';isGameStarted=true;controls.isLocked=false;
                camera.position.set(0,2.1,8);blocker.style.display='none';inventoryUI.style.display='none';heldItemGroup.visible=false;
            };
            window.kitchenReset=reset;reset();
            const put=(x,y,z,t)=>setBlockNoRebuild(x,y,z,t,new Set());
            for(const id of Object.keys(KITCHEN_ITEMS).map(Number)) {
                const x=((id-104)%6)*4,z=-Math.floor((id-104)/6)*4;
                check(placeFurniture(id,x,1,z),`${getBlockName(id)} places`);
                const model=furnitureMeshes.get(`overworld|${x},1,${z}`);
                check(model?.children.length>0,`${getBlockName(id)} has visible geometry`);
                const icon=document.querySelector(`#inv-${id-12} img`);
                check(icon?.src.startsWith('data:image/png')&&icon.naturalWidth>0,`${getBlockName(id)} has an inventory icon`);
            }
            for(const recipe of kitchenRecipes()) {
                craftingGrid=Object.entries(recipe.ing).flatMap(([id,n])=>Array(n).fill(Number(id)));while(craftingGrid.length<9)craftingGrid.push(0);checkRecipes();
                check(craftingOutput.id===recipe.out,`${getBlockName(recipe.out)} recipe resolves`);
            }
            reset();
            for(const [x,z] of [[0,8],[8,0],[0,-8],[-8,0]]) {
                camera.position.set(x,2.1,z);check(placeFurniture(118,0,1,0),'Dining table places in each facing');
                const r=furnitureRecord(0,1,0),parts=r.data.parts;check(parts.length===3&&parts.every(p=>getBlock(...p)===99),'Dining table reserves four cells');
                const before=droppedItems.length;mineBlock(new THREE.Vector3(...parts[2]),false);
                check(getBlock(0,1,0)===0&&parts.every(p=>getBlock(...p)===0)&&droppedItems.length===before+1,'Mining any dining-table part removes one whole table');
            }
            camera.position.set(0,2.1,8);put(1,1,0,3);
            check(!placeFurniture(118,0,1,0)&&getBlock(0,1,0)===0,'Table cannot overwrite an occupied footprint');put(1,1,0,0);
            check(placeFurniture(112,0,1,0)&&getBlock(0,2,0)===80,'Shower wall reserves both height cells');
            mineBlock(new THREE.Vector3(0,2,0),false);check(getBlock(0,1,0)===0,'Shower upper part resolves to glass item');
            for(let x=0;x<3;x++)check(placeFurniture(83,x,1,0),'Sofa section places beside its neighbor');
            updateWorldExpansion(0.2);
            const middle=furnitureMeshes.get('overworld|1,1,0');
            check(middle.userData.sofaArms.every(a=>!a.visible),'Three sofa sections join without inner armrests');
            check(furnitureRecord(2,1,0).data.yaw===0,'Neighbor sofa automatically matches its facing');
            mineBlock(new THREE.Vector3(2,1,0),false);updateWorldExpansion(0.2);
            check(middle.userData.sofaArms[1].visible,'Exposed sofa arm returns when neighbor is removed');
            check(placeFurniture(126,2,1,0),'Two-cell large sofa attaches');updateWorldExpansion(0.2);
            const large=furnitureMeshes.get('overworld|2,1,0');
            check(!middle.userData.sofaArms[1].visible&&!large.userData.sofaSections[0].userData.sofaArms[0].visible,'Small and large sofas join into an extra-large sofa');
            check(!large.userData.sofaSections[0].userData.sofaArms[1].visible&&!large.userData.sofaSections[1].userData.sofaArms[0].visible,'Large sofa has no middle arms');
            reset();gameMode='survival';playerInventory[119]=1;playerInventory[120]=2;
            check(placeFurniture(119,0,1,0)&&playerInventory[119]===0,'Placing a plate consumes one in Survival');
            camera.position.set(0,2.1,3);camera.lookAt(0,1,0);camera.updateMatrixWorld(true);currentBlock=120;
            check(handleExpansionClick({button:2})&&furnitureRecord(0,1,0).data.foodItem===120&&playerInventory[120]===1,'Right click puts one doughnut on a plate');
            check(furnitureMeshes.get('overworld|0,1,0').userData.foodMesh?.children.length>0,'Plated food is actually rendered');
            handleExpansionClick({button:2});check(playerInventory[120]===1,'Occupied plate does not consume more food');
            const saved=JSON.parse(JSON.stringify(saveWorldExpansion()));clearExpansionWorld();restoreWorldExpansion(saved);updateWorldExpansion(0.2);
            check(furnitureRecord(0,1,0).data.foodItem===120&&furnitureMeshes.get('overworld|0,1,0').userData.foodMesh,'Plated food survives serialized save/load');
            const before=droppedItems.length;mineBlock(new THREE.Vector3(0,1,0),false);
            check(droppedItems.length===before+2,'Breaking a filled plate drops plate plus food once each');
            reset();check(parseWorldCommand('查找巴斯光年').id===115&&parseWorldCommand('查找微波炉').id===105,'New items can be found by Chinese commands');
            return `${checks.length} kitchen/home checks passed.`;
        }));

        await page.evaluate(()=>{kitchenReset();placeFurniture(106,0,1,0);gameMode='survival';playerInventory[39]=2;playerInventory[40]=0;openFurniturePanel(furnitureRecord(0,1,0));});
        await page.locator('#home-content').getByRole('button',{name:'Cook',exact:true}).click();
        assert.equal(await page.evaluate(()=>playerInventory[39]),1);
        await page.evaluate(()=>{for(let i=0;i<20;i++)updateWorldExpansion(0.2);});
        assert.equal(await page.locator('#cooking-status').textContent(),'Cooked Meat: 1');
        await page.locator('#home-content').getByRole('button',{name:'Take',exact:true}).click();
        assert.equal(await page.evaluate(()=>playerInventory[40]),1);
        await page.evaluate(()=>{document.getElementById('cooked-meat-ui').style.display='none';closeFurniturePanel(false);gameMode='creative';placeFurniture(119,3,1,0);placeFoodOnPlate({x:3,y:1,z:0},122);health=2;hunger=1;openFurniturePanel(furnitureRecord(3,1,0));});
        await page.locator('#home-content').getByRole('button',{name:'Eat',exact:true}).click();
        assert(await page.evaluate(()=>health===maxHealth&&hunger===maxHunger&&!furnitureRecord(3,1,0).data.foodItem&&getBlock(3,1,0)===119));
        await page.evaluate(()=>{controls.unlock();placeFurniture(104,6,1,0);gameMode='survival';playerInventory[45]=1;playerInventory[65]=0;openFurniturePanel(furnitureRecord(6,1,0));});
        await page.getByRole('checkbox',{name:'Water',exact:true}).check();
        await page.locator('#home-content').getByRole('button',{name:'Fill Bucket',exact:true}).click();
        assert(await page.evaluate(()=>playerInventory[45]===0&&playerInventory[65]===1));
        await page.evaluate(()=>updateWorldExpansion(0.2));
        assert(await page.evaluate(()=>furnitureMeshes.get('overworld|6,1,0').userData.stream.visible));
        console.log('PASS: Actual cooking, serving/eating and hydrant UI.');

        await page.evaluate(()=>{
            kitchenReset();scene.background.setHex(0xc2dce7);scene.fog=null;
            for(let x=-1;x<=1;x++)for(let z=-1;z<=0;z++)buildChunkMesh(x,z);
            for(const [id,x,y,z] of [[73,-5,1,-3],[106,-3,1,-3],[107,-3,2,-3],[82,-2,1,-3],[105,-2,2,-3],[82,-1,1,-3],[111,-1,2,-3],[118,1,1,0],[119,1,2,0],[119,2,2,0],[113,2,2,1],[83,-4,1,1],[83,-3,1,1],[126,-2,1,1],[112,5,1,-3],[86,6,1,-3],[87,6,2,-3]])placeFurniture(id,x,y,z);
            placeFoodOnPlate({x:1,y:2,z:0},120);placeFoodOnPlate({x:2,y:2,z:0},122);
            for(const [i,id] of [114,115,116,117].entries()){placeFurniture(82,-5+i,1,-6);placeFurniture(id,-5+i,2,-6);}
            updateWorldExpansion(0.2);camera.position.set(7,6,8);camera.lookAt(0,1,-2);camera.updateMatrixWorld(true);renderer.render(scene,camera);
        });
        await page.screenshot({path:'/private/tmp/mc-kitchen-living.png'});
        await page.evaluate(()=>{camera.position.set(-2,3,-2);camera.lookAt(-3.5,2,-6);camera.updateMatrixWorld(true);renderer.render(scene,camera);});
        await page.screenshot({path:'/private/tmp/mc-toy-figurines.png'});
        assert(await page.evaluate(()=>{
            renderer.render(scene,camera);const gl=renderer.getContext(),pixels=new Uint8Array(1440*900*4);gl.readPixels(0,0,1440,900,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
            let colorful=0;for(let i=0;i<pixels.length;i+=4)if(Math.max(pixels[i],pixels[i+1],pixels[i+2])-Math.min(pixels[i],pixels[i+1],pixels[i+2])>40)colorful++;
            return colorful>10000;
        }));
        await page.evaluate(()=>{isInventoryOpen=true;inventoryUI.style.display='block';switchTab('home');});
        await page.getByRole('combobox',{name:'Home category'}).selectOption('Kitchen');
        await page.getByRole('searchbox',{name:'Search Home'}).fill('Microwave');
        assert.equal(await page.locator('#tab-home > .slot:visible').count(),1);
        await page.getByRole('searchbox',{name:'Search Home'}).fill('');
        await page.screenshot({path:'/private/tmp/mc-kitchen-inventory-desktop.png'});
        await page.setViewportSize({width:390,height:844});
        await page.locator('#inv-93').scrollIntoViewIfNeeded();
        await page.screenshot({path:'/private/tmp/mc-kitchen-inventory-mobile.png'});
        assert(await page.locator('#inventory-ui').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));
        await page.evaluate(()=>{inventoryUI.style.display='none';renderer.render(scene,camera);});
        await page.screenshot({path:'/private/tmp/mc-figurines-mobile.png'});
        assert.deepEqual(errors,[]);
        console.log('PASS: Detailed scene, nonblank canvas, category/search and responsive inventory.');
    } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
