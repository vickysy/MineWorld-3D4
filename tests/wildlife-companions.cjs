// NODE=/path/to/node PLAYWRIGHT_MODULE=/path/to/playwright CHROME_PATH=/path/to/chrome
// "$NODE" tests/wildlife-companions.cjs
// WILDLIFE_STANDALONE=1 exercises late addScriptTag loading without the main script/init.
// Missing main hooks are installed in HTTP responses only, never in repository files.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),fallbacks=new Set();
function hook(source,marker,needle,replacement){
    if(source.includes(marker))return source;
    assert(source.includes(needle),'Missing integration anchor: '+needle);fallbacks.add(marker);
    return source.replace(needle,replacement);
}
function harness(source,file){
    if(process.env.WILDLIFE_STANDALONE==='1'){
        source=source.replace(/\s*<script src="wildlife-companions\.js[^\"]*"><\/script>/g,'').replaceAll('initWildlifeCompanions();','');
        source=source.replaceAll('clearWildlifeCompanions();','if(typeof clearWildlifeCompanions===\'function\')clearWildlifeCompanions();')
            .replaceAll('updateWildlifeCompanions(delta);','if(typeof updateWildlifeCompanions===\'function\')updateWildlifeCompanions(delta);')
            .replaceAll('if(isWildlifeCompanionDialogOpen())','if(typeof isWildlifeCompanionDialogOpen===\'function\'&&isWildlifeCompanionDialogOpen())')
            .replaceAll('if(WILDLIFE_ITEMS[blockId])','if(typeof WILDLIFE_ITEMS!==\'undefined\'&&WILDLIFE_ITEMS[blockId])');
    }
    if(file==='game3d.html'){
        source=hook(source,'if(handleWildlifeCompanionClick(e))',
            'if(worldLoading||eatingState)return;',
            'if(worldLoading||eatingState)return;\n            if(typeof handleWildlifeCompanionClick===\'function\'&&handleWildlifeCompanionClick(e))return;');
        source=hook(source,'buildWildlifeHeldItem(blockId)',
            'if(blockId===LEAD_ID)',
            'if(typeof WILDLIFE_ITEMS!==\'undefined\'&&WILDLIFE_ITEMS[blockId]){heldItemGroup.add(buildWildlifeHeldItem(blockId));return;}\n            if(blockId===LEAD_ID)');
        source=hook(source,'saveWildlifeCompanions()',
            'farmAnimals: saveFarmAnimals(),',
            'wildlifeCompanions:typeof saveWildlifeCompanions===\'function\'?saveWildlifeCompanions():[],\n                farmAnimals: saveFarmAnimals(),');
        source=hook(source,'restoreWildlifeCompanions(data.wildlifeCompanions)',
            'restoreFarmAnimals(data.farmAnimals,!onLoaded);',
            'restoreFarmAnimals(data.farmAnimals,!onLoaded);\n                    if(typeof restoreWildlifeCompanions===\'function\')restoreWildlifeCompanions(data.wildlifeCompanions);');
        source=hook(source,'updateWildlifeCompanions(delta)',
            'updateAnimalLeadVisuals();',
            'updateAnimalLeadVisuals();\n            if(typeof updateWildlifeCompanions===\'function\')updateWildlifeCompanions(delta);');
        source=hook(source,'isWildlifeCompanionDialogOpen()',
            'if(photoMode)return;',
            'if(photoMode)return;\n            if(typeof isWildlifeCompanionDialogOpen===\'function\'&&isWildlifeCompanionDialogOpen())return;');
    }else if(file==='world-expansion.js'){
        source=hook(source,'saveWildlifeCompanions()',
            'farmAnimals:saveFarmAnimals(),',
            'wildlifeCompanions:typeof saveWildlifeCompanions===\'function\'?saveWildlifeCompanions():[],farmAnimals:saveFarmAnimals(),');
        source=hook(source,'clearWildlifeCompanions();\n    clearAnimalLeadVisuals()',
            'function clearExpansionWorld() {',
            'function clearExpansionWorld() {\n    if(typeof clearWildlifeCompanions===\'function\')clearWildlifeCompanions();');
        source=hook(source,'snapshotDimension());\n    clearWildlifeCompanions()',
            'dimensionWorlds.set(currentDimension,snapshotDimension());',
            'dimensionWorlds.set(currentDimension,snapshotDimension());\n    if(typeof clearWildlifeCompanions===\'function\')clearWildlifeCompanions();');
        source=hook(source,'restoreWildlifeCompanions(saved',
            'heightCache.clear();clearMicroVoxelOverlay();',
            'heightCache.clear();clearMicroVoxelOverlay();\n    if(typeof restoreWildlifeCompanions===\'function\')restoreWildlifeCompanions(saved?.wildlifeCompanions);');
    }
    return source;
}
(async()=>{
    let server,browser;
    try{
        let url=process.env.GAME_URL;
        if(!url){
            server=http.createServer(async(req,res)=>{
                try{
                    const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
                    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
                    const data=await fs.readFile(file),ext=path.extname(file);
                    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'})[ext]||'application/octet-stream');res.end(data);
                }catch(_error){res.writeHead(404);res.end();}
            });
            await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});url=`http://127.0.0.1:${server.address().port}/game3d.html`;
        }
        browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
        const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        await page.addInitScript(()=>requestAnimationFrame=()=>0);
        await page.route(/\/(game3d\.html|world-expansion\.js)(\?.*)?$/,async route=>{
            const response=await route.fetch(),file=new URL(route.request().url()).pathname.split('/').pop();
            await route.fulfill({response,body:harness(await response.text(),file)});
        });
        await page.goto(url,{timeout:120000});
        await page.waitForFunction(()=>expansionReady&&!worldLoading,null,{polling:50});
        // Main integration can land during this task; never redeclare global consts.
        if(!await page.evaluate(()=>typeof initWildlifeCompanions==='function'))
            await page.addScriptTag({path:path.join(root,'wildlife-companions.js')});
        await page.evaluate(()=>initWildlifeCompanions());
        await page.getByRole('button',{name:'Creative',exact:true}).click();
        await page.getByRole('button',{name:'Plains',exact:true}).click();
        await page.getByRole('button',{name:'Start Game',exact:true}).click();
        await page.waitForFunction(()=>isGameStarted&&!worldLoading,null,{polling:50});
        console.log(await page.evaluate(()=>{
            const checks=[],ok=(value,name)=>{if(!value)throw Error(name);checks.push(name);};window.wolfCheck=ok;
            window.resetWolves=()=>{
                multiplayerRoom=null;clearCombatState();clearExpansionWorld();
                for(const list of [animals,villagers,zombies,creepers,endermen,adventureMobs,droppedItems]){for(const mob of list)disposeModModel(mob.mesh);list.length=0;}
                for(const ms of chunkMeshes.values())for(const mesh of Object.values(ms))releaseChunkMesh(mesh);
                chunkMeshes.clear();rebuildQueue.clear();worldMap.clear();heightCache.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();chunkScanYRanges.clear();
                // The physics fixture is a flat world; portal chunk builds must not grow random trees into it.
                getSurfaceHeight=()=>79;generateTrees=()=>{};generateHouseData=()=>{};
                selectedTerrain='plains';currentDimension='overworld';controls.isLocked=true;isSleeping=false;worldLoading=false;gameMode='survival';gameDifficulty='peaceful';
                isInventoryOpen=false;playerScale=1;currentBlock=0;cancelEating();playerInventory={};wildlifeSpawnTime=Infinity;
                for(let x=-36;x<=36;x++)for(let z=-36;z<=36;z++)setGenBlock(x,79,z,1);
                camera.position.set(0,81.15,4);blocker.style.display=inventoryUI.style.display='none';
            };
            window.newWolf=(x=0,z=0)=>{const wolf=spawnWildlifeWolf(x,80,z);if(!wolf)throw Error('Spawn failed '+x+','+z);wolf.onGround=true;return wolf;};
            window.aimWolf=(wolf,shiftKey=false,button=2)=>{
                camera.lookAt(wolf.mesh.position.clone().add(new THREE.Vector3(0,.15,0)));camera.updateMatrixWorld(true);
                document.dispatchEvent(new MouseEvent('mousedown',{button,shiftKey,bubbles:true,cancelable:true}));
            };
            window.walkWolves=seconds=>{for(let i=0;i<Math.ceil(seconds*60);i++)updateWildlifeCompanions(1/60);};
            window.ownWolf=wolf=>{currentBlock=BONE_ID;playerInventory[BONE_ID]=1;aimWolf(wolf);ok(wolf.owner===wildlifeOwnerId(),'Owned wolf');return wolf;};
            resetWolves();
            const recipeCount=recipes.filter(r=>r.out===BONE_ID).length;initWildlifeCompanions();
            ok(WOLF_EGG_ID===249&&BONE_ID===250&&recipes.filter(r=>r.out===BONE_ID).length===recipeCount,'Reserved IDs and idempotent init');
            for(const id of [WOLF_EGG_ID,BONE_ID]){
                const slot=document.getElementById('inv-'+(id-12));
                ok(isToolItem(id)&&getInventorySlotMapping()[id-12]===id&&slot.dataset.search.includes(id===BONE_ID?'bone':'wolf')&&itemIcon(id),'Real catalog and icon '+id);
                const model=buildWildlifeHeldItem(id);ok(model.userData.modItem&&model.children.length>0,'Held voxel item '+id);disposeModModel(model);
            }
            const w=newWolf();currentBlock=BONE_ID;playerInventory[BONE_ID]=2;aimWolf(w);
            ok(w.owner===wildlifeOwnerId()&&w.state==='follow'&&w.mesh.userData.collar.visible&&playerInventory[BONE_ID]===1,'Actual click tames for exactly one bone');
            ok(!animals.includes(w)&&!getWorldSaveData().spawnedMobs.some(m=>m.id===WOLF_EGG_ID),'Separate from generic livestock and duplicate saves');
            playerInventory[BONE_ID]=0;aimWolf(w);
            ok(w.state==='sit'&&playerInventory[BONE_ID]===0,'Empty held bone still commands owned dog');
            const before=w.mesh.position.clone();camera.position.z=13;walkWolves(4);
            ok(Math.hypot(w.mesh.position.x-before.x,w.mesh.position.z-before.z)<.0001,'Sit stays put even with owner holding bone');
            camera.position.set(0,81.15,4);currentBlock=0;aimWolf(w);camera.position.z=12;walkWolves(5);
            ok(w.mesh.position.z>8&&w.mesh.position.z<11&&w.state==='follow','Following closes distance and stops short');
            camera.position.copy(w.mesh.position).add(new THREE.Vector3(0,1.15,3));currentBlock=39;playerInventory[39]=3;hunger=2;w.hp=8;aimWolf(w);
            ok(w.hp===11&&playerInventory[39]===2&&hunger===2&&!eatingState,'Meat feeds pet instead of player and debits once');
            currentBlock=40;playerInventory[40]=1;aimWolf(w);aimWolf(w);
            ok(w.hp===12&&playerInventory[40]===0&&!eatingState,'Cooked meat caps health; healthy dog consumes nothing');
            const state=w.state;aimWolf(w,false,0);ok(w.hp===12&&w.state===state&&!miningState,'Left click cannot hurt or dig through pet');
            resetWolves();const wild=newWolf();currentBlock=BONE_ID;playerInventory[BONE_ID]=0;aimWolf(wild);
            ok(!wild.owner&&playerInventory[BONE_ID]===0,'No bone means no free tame');
            currentBlock=39;playerInventory[39]=2;aimWolf(wild);ok(!wild.owner&&playerInventory[39]===2&&!eatingState,'Raw meat is not a taming substitute');
            currentBlock=BONE_ID;playerInventory[BONE_ID]=1;
            for(let y=80;y<=83;y++)setGenBlock(0,y,2,3);aimWolf(wild);
            ok(!wild.owner&&playerInventory[BONE_ID]===1,'No taming through a wall');
            return checks;
        }));

        // Exercise the existing Survival workbench, not a synthetic inventory grant.
        await page.evaluate(()=>{
            resetWolves();playerInventory[39]=1;setBlock(1,80,3,12);openWorkbench({x:1,y:80,z:3,type:12});chooseCatalogItem(BONE_ID);
        });
        await page.locator('#catalog-recipes').getByRole('button',{name:'Craft',exact:true}).click();
        assert.deepEqual(await page.evaluate(()=>[playerInventory[39],playerInventory[BONE_ID],currentBlock]),[0,1,250]);
        console.log('PASS: real Survival recipe consumes raw meat and produces one Bone.');

        console.log(await page.evaluate(()=>{
            const checks=[],ok=(v,n)=>{wolfCheck(v,n);checks.push(n);};resetWolves();
            let w=ownWolf(newWolf());const owner=w.owner;w.owner='peer:someone-else';currentBlock=BONE_ID;playerInventory[BONE_ID]=3;aimWolf(w);
            ok(w.state==='follow'&&playerInventory[BONE_ID]===3&&!renameWildlifeCompanion(w,'Taken')&&!setWildlifeCompanionOrder(w,'sit'),'Foreign ownership blocks all commands');
            w.owner=owner;multiplayerRoom={role:'guest',peer:{id:'guest'},worldReady:true};const before=w.mesh.position.clone();camera.position.z=9;walkWolves(2);
            ok(w.mesh.position.equals(before)&&!setWildlifeCompanionOrder(w,'sit')&&!spawnWildlifeWolf(8,80,0),'Guest cannot simulate, command, or spawn');
            multiplayerRoom={role:'host',peer:{id:'host'},worldReady:true};camera.position.z=4;
            ok(setWildlifeCompanionOrder(w,'sit')&&w.owner===owner,'Host keeps durable local ownership');multiplayerRoom=null;
            resetWolves();w=ownWolf(newWolf());camera.position.set(8,81.15,0);
            for(let z=-30;z<=30;z++)for(let y=80;y<=83;y++)setGenBlock(2,y,z,3);
            walkWolves(7);ok(w.mesh.position.x<=.761&&!mobBodyBlocked(w.mesh.position,WILDLIFE_HEIGHT,WILDLIFE_RADIUS),'Tall wall blocks swept-volume following');
            resetWolves();w=ownWolf(newWolf());camera.position.set(9,82.15,0);let highest=80;
            for(let z=-20;z<=20;z++)for(let x=2;x<=5;x++)setGenBlock(x,80,z,3);
            for(let n=0;n<420;n++){updateWildlifeCompanions(1/60);highest=Math.max(highest,w.mesh.position.y);}
            ok(highest>80.95&&highest<81.01&&w.mesh.position.x>6,'One-block ledge is traversable without jumping higher: '+JSON.stringify({highest,pos:w.mesh.position.toArray()}));
            resetWolves();w=ownWolf(newWolf());camera.position.set(8,81.15,0);
            for(let z=-20;z<=20;z++){setGenBlock(2,80,z,3);for(let x=-1;x<=3;x++)setGenBlock(x,82,z,3);}
            walkWolves(4);ok(w.mesh.position.x<=.761&&w.mesh.position.y<80.01,'Low ceiling prevents a one-block step');
            resetWolves();w=ownWolf(newWolf());camera.position.set(8,81.15,0);
            for(let z=-20;z<=20;z++)setGenBlock(2,80,z,98);
            walkWolves(4);ok(w.mesh.position.x<=.761,'Railings remain impassable');
            for(const hazard of [24,LAVA_ID,SPIKE_TRAP_ID]){
                resetWolves();w=ownWolf(newWolf());camera.position.set(8,81.15,0);
                for(let z=-20;z<=20;z++)setGenBlock(2,80,z,hazard);
                walkWolves(3);ok(w.mesh.position.x<=.761&&wildlifeSafeVolume(w.mesh.position),'Avoids hazard '+hazard);
            }
            resetWolves();w=ownWolf(newWolf());camera.position.set(25,81.15,0);const p=w.mesh.position.clone();updateWildlifeCompanions(1000);
            ok(w.mesh.position.distanceTo(p)<.51,'Huge frame gaps cannot tunnel or teleport');
            const snapshot=w.mesh.position.clone();controls.isLocked=false;updateWildlifeCompanions(1);controls.isLocked=true;
            isSleeping=true;updateWildlifeCompanions(1);isSleeping=false;worldLoading=true;updateWildlifeCompanions(1);worldLoading=false;
            updateWildlifeCompanions(NaN);ok(w.mesh.position.equals(snapshot),'Paused, sleeping, loading and invalid updates are inert');
            resetWolves();currentBlock=WOLF_EGG_ID;playerInventory[WOLF_EGG_ID]=2;camera.lookAt(0,79,0);camera.updateMatrixWorld(true);
            document.dispatchEvent(new MouseEvent('mousedown',{button:2}));
            ok(wildlifeCompanions.length===1&&playerInventory[WOLF_EGG_ID]===1,'Actual egg click spawns and consumes once');
            document.dispatchEvent(new MouseEvent('mousedown',{button:2}));
            ok(wildlifeCompanions.length===1&&playerInventory[WOLF_EGG_ID]===1,'Occupied egg placement never consumes');
            resetWolves();gameMode='creative';w=newWolf();currentBlock=BONE_ID;aimWolf(w);ok(w.owner&&playerInventory[BONE_ID]===undefined,'Creative taming has no inventory cost');
            resetWolves();w=newWolf();currentBlock=BONE_ID;playerInventory[BONE_ID]=1;camera.position.z=6;walkWolves(2);
            ok(w.mesh.position.z>1&&!w.owner&&playerInventory[BONE_ID]===1,'Held bone attracts a wild wolf without auto-taming');
            resetWolves();wildlifeSpawnTime=.01;updateWildlifeCompanions(.02);
            ok(wildlifeCompanions.length===1&&wildlifeCompanions[0].natural,'Natural spawning is part of the update hook');
            for(let i=0;i<20;i++)spawnNaturalWildlifeWolf();ok(wildlifeCompanions.length===6,'Natural wild population is capped');
            for(const terrain of ['moon','desert','city']){clearWildlifeCompanions();selectedTerrain=terrain;ok(!spawnNaturalWildlifeWolf(),'No natural wolves in '+terrain);}
            selectedTerrain='plains';currentDimension='nether';ok(!spawnNaturalWildlifeWolf(),'No natural wolves in Nether');currentDimension='overworld';
            return checks;
        }));

        // Actual accessible dialog, keyboard navigation, cancellation and safe text.
        await page.evaluate(()=>{resetWolves();window.dialogDog=ownWolf(newWolf());aimWolf(dialogDog,true);});
        const dialog=page.getByRole('dialog',{name:'Dog',exact:true});await dialog.waitFor({state:'visible'});
        assert.equal(await page.getByLabel('Name',{exact:true}).evaluate(el=>el===document.activeElement),true);
        assert.equal(await page.locator('#pause-menu').isVisible(),false);
        for(let i=0;i<8;i++){await page.keyboard.press('Tab');assert(await dialog.evaluate(el=>el.contains(document.activeElement)));}
        await page.getByLabel('Name',{exact:true}).fill('Cancelled');await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(()=>dialogDog.name),'Dog');
        await page.evaluate(()=>{controls.isLocked=true;aimWolf(dialogDog,true);});
        await page.getByLabel('Name',{exact:true}).fill('<img src=x onerror=1>');
        await dialog.getByRole('radio',{name:'Sit',exact:true}).check();await dialog.getByRole('button',{name:'Save',exact:true}).click();
        assert.deepEqual(await page.evaluate(()=>[dialogDog.name,dialogDog.state,!!dialogDog.mesh.userData.nameLabel,document.querySelectorAll('#wildlife-companion-dialog img').length]),['<img src=x onerror=1>','sit',true,0]);
        await page.evaluate(()=>{controls.isLocked=true;aimWolf(dialogDog,true);});
        await page.getByLabel('Name',{exact:true}).fill('Unavailable');await page.evaluate(()=>dialogDog.owner='peer:changed');
        await dialog.getByRole('button',{name:'Save',exact:true}).click();assert(await dialog.isVisible());
        assert.match(await page.locator('#wildlife-companion-error').textContent(),/no longer available/);
        await page.evaluate(()=>clearWildlifeCompanions());assert.equal(await dialog.isVisible(),false);
        console.log('PASS: modal focus, keyboard containment, cancel/save, ownership recheck and safe names.');

        console.log(await page.evaluate(()=>{
            const checks=[],ok=(v,n)=>{wolfCheck(v,n);checks.push(n);};resetWolves();
            const w=ownWolf(newWolf());renameWildlifeCompanion(w,'Luna');setWildlifeCompanionOrder(w,'sit');w.hp=7;w.mesh.rotation.y=.7;
            const saved=JSON.parse(JSON.stringify(saveWildlifeCompanions()));window.savedDog=saved;
            ok(getWorldSaveData().wildlifeCompanions[0].name==='Luna'&&snapshotDimension().wildlifeCompanions[0].owner===w.owner,'World and dimension snapshots include ownership');
            clearWildlifeCompanions();restoreWildlifeCompanions(saved);
            ok(JSON.stringify(saveWildlifeCompanions())===JSON.stringify(saved),'Name, owner, position, yaw, HP and sit state round-trip');
            restoreWildlifeCompanions(saved);ok(wildlifeCompanions.length===1,'Restore replaces instead of duplicating');
            const base=saved[0];restoreWildlifeCompanions([base,base,{...base,id:'nan',pos:[NaN,80,0]},
                {...base,id:'remote',dimension:'nether'},{...base,id:'owner',owner:{}},{...base,id:'state',state:'wild'},
                {...base,id:'dead',hp:-1},{...base,id:'far',pos:[100001,80,0]},null]);
            ok(wildlifeCompanions.length===1,'Malformed, duplicate, dead and wrong-dimension records rejected');
            restoreWildlifeCompanions();ok(wildlifeCompanions.length===0,'Old saves without companions clear safely');restoreWildlifeCompanions(saved);
            travelThroughPortal('nether');ok(wildlifeCompanions.length===0&&dimensionWorlds.get('overworld').wildlifeCompanions[0].name==='Luna','Portal snapshots before clearing; dog stays behind');
            travelThroughPortal('overworld');ok(wildlifeCompanions.length===1&&wildlifeCompanions[0].name==='Luna'&&wildlifeCompanions[0].state==='sit','Actual return portal restores the sitting dog');
            return checks;
        }));
        const save=await page.evaluate(()=>JSON.stringify(getWorldSaveData()));
        const loaded=await page.evaluate(data=>new Promise(resolve=>{
            clearWildlifeCompanions();loadSaveFile({target:{files:[new File([data],'wolves.json',{type:'application/json'})]}},error=>{
                const p=new THREE.Vector3(...savedDog[0].pos),cells=[];
                for(let x=-1;x<=1;x++)for(let y=79;y<=82;y++)for(let z=-1;z<=1;z++)if(isSolid(x,y,z))cells.push([x,y,z,getBlock(x,y,z)]);
                resolve({error:error?String(error):null,count:wildlifeCompanions.length,safe:wildlifeSafeVolume(p),cells});
            });
        }),save);
        assert(loaded.error===null&&loaded.count===1,'Save-file restoration: '+JSON.stringify(loaded));
        assert.deepEqual(await page.evaluate(()=>saveWildlifeCompanions()),await page.evaluate(()=>savedDog));
        console.log('PASS: real JSON save-file loading and round-trip through both dimensions.');

        await page.evaluate(()=>{
            resetWolves();gameMode='creative';const wild=newWolf(-1.1,0),dog=newWolf(1.1,0);currentBlock=BONE_ID;tameWildlifeWolf(dog);
            renameWildlifeCompanion(dog,'Luna');setWildlifeCompanionOrder(dog,'sit');wild.mesh.rotation.y=.15;dog.mesh.rotation.y=-.25;
            for(let x=-1;x<=0;x++)for(let z=-1;z<=0;z++)buildChunkMesh(x,z);
            camera.position.set(0,82,7);camera.lookAt(0,80.2,0);camera.updateMatrixWorld(true);scene.fog=null;clouds.visible=false;
            scene.background=new THREE.Color(0xa5d0df);ambientLight.intensity=.9;dirLight.intensity=.7;heldItemGroup.visible=false;
            blocker.style.display=inventoryUI.style.display='none';document.getElementById('toast-msg').style.visibility='hidden';
        });
        for(const viewport of [{width:1200,height:800},{width:390,height:844}]){
            await page.setViewportSize(viewport);await page.waitForFunction(w=>renderer.domElement.clientWidth===w,viewport.width,{polling:50});
            const pixels=await page.evaluate(()=>{
                const gl=renderer.getContext(),a=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4),b=new Uint8Array(a.length);
                for(const w of wildlifeCompanions)w.mesh.visible=false;renderer.render(scene,camera);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,a);
                for(const w of wildlifeCompanions)w.mesh.visible=true;renderer.render(scene,camera);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,b);
                let changed=0,red=0;const colors=new Set();
                for(let i=0;i<a.length;i+=4){if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>10)changed++;
                    if(b[i]>b[i+1]*1.5&&b[i]>b[i+2]*1.3&&b[i]>90)red++;if(i%128===0)colors.add(b.slice(i,i+3).join(','));}
                const moving=wildlifeCompanions[0];moving.vx=1;moving.vz=0;animateWalkingAnimal(moving,.25,1/60);
                renderer.render(scene,camera);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,a);
                let motion=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>10)motion++;
                return {changed,red,colors:colors.size,motion};
            });
            assert(pixels.changed>500&&pixels.red>20&&pixels.colors>20&&pixels.motion>10,'Visible animated wolves and red collar: '+JSON.stringify(pixels));
            await page.screenshot({path:path.join(os.tmpdir(),'wildlife-companions-'+viewport.width+'.png')});console.log({viewport,pixels});
            await page.evaluate(()=>{controls.isLocked=true;camera.position.set(1.1,81.15,3);openWildlifeCompanionDialog(wildlifeCompanions[1]);});
            const bounds=await dialog.boundingBox();assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width&&bounds.y+bounds.height<=viewport.height);
            assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),'Dialog content must fit at '+viewport.width);
            await page.screenshot({path:path.join(os.tmpdir(),'wildlife-companions-dialog-'+viewport.width+'.png')});
            await page.evaluate(()=>{closeWildlifeCompanionDialog(false);camera.position.set(0,82,7);camera.lookAt(0,80.2,0);camera.updateMatrixWorld(true);});
        }
        await page.evaluate(()=>{
            const textures=wildlifeCompanions.filter(w=>w.mesh.userData.nameLabel).map(w=>w.mesh.userData.nameLabel.material.map);
            let disposed=0;for(const texture of textures)texture.addEventListener('dispose',()=>disposed++);
            const meshes=wildlifeCompanions.map(w=>w.mesh);clearWildlifeCompanions();
            wolfCheck(disposed===textures.length&&meshes.every(m=>!m.parent)&&!wildlifeCompanions.length,'Clear disposes owned label textures and removes all models');
        });
        assert.deepEqual(errors,[]);console.log('PASS: wildlife companions, GPU desktop/mobile screenshots, and cleanup.');
        console.log('Loader mode:',process.env.WILDLIFE_STANDALONE==='1'?'standalone addScriptTag':'main integration','Temporary harness hooks:',Array.from(fallbacks));
    }finally{
        if(browser)await browser.close();
        if(server)await new Promise(resolve=>server.close(resolve));
    }
})().catch(error=>{console.error(error);process.exitCode=1;});
