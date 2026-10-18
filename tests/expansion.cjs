const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async()=>{
    const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try {
        const errors=[];
        const page=await browser.newPage({viewport:{width:1440,height:900}});
        page.on('pageerror',e=>errors.push(e.message));
        page.on('console',m=>{if(m.type()==='info') console.log(m.text());});
        await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
        await page.goto(pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await page.waitForFunction(()=>expansionReady);
        console.log(await page.evaluate(()=>{
            const passed=[];
            const check=(value,name)=>{if(!value) throw new Error(name);passed.push(name);};
            window.expansionOriginalHeight=getSurfaceHeight;
            const reset=(floor=0)=>{
                clearExpansionWorld();worldMap.clear();heightCache.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();
                restoreMicroEdits([]);restoreFineVoxelEdits([]);clearMech();resetPlayerFlight();
                for(const list of [zombies,creepers,villagers,animals]) {for(const m of list) disposeModModel(m.mesh);list.length=0;}
                selectedTerrain='moon';currentDimension='overworld';getSurfaceHeight=()=>floor;
                camera.position.set(0,floor+2.1,5);playerScale=1;gameMode='creative';isGameStarted=true;controls.isLocked=false;
                window.testPut=(x,y,z,t)=>setBlockNoRebuild(x,y,z,t,new Set());
            };
            window.expansionTestReset=reset;
            const finish=()=>{let n=0;while(commandJob && n++<1000) tickCommandJob();check(!commandJob,'Command finishes in bounded batches');};
            reset();
            testPut(0,9,0,24);
            for(let i=0;i<150;i++) tickWaterFlow(0.1);
            check(getBlock(0,9,0)===0,'Poured water falls above sea level');
            let volume=0;for(const [key,t] of worldMap) if(t===24) volume+=waterAmount(...key.split(',').map(Number));
            check(volume===8,'Water volume is conserved after falling and spreading');
            check([...worldMap].filter(([,t])=>t===24).length>1,'Water spreads sideways on solid ground');
            reset();
            for(let y=1;y<=5;y++) for(const [x,z] of [[1,0],[-1,0],[0,1],[0,-1]]) testPut(x,y,z,3);
            testPut(0,5,0,24);for(let i=0;i<100;i++) tickWaterFlow(0.1);
            check(waterAmount(0,1,0)===8,'Walls contain flowing water');
            testPut(1,1,0,0);for(let i=0;i<100;i++) tickWaterFlow(0.1);
            check([...worldMap].some(([k,t])=>t===24&&k!=='0,1,0'),'Breaking a wall restarts flow');
            reset();testPut(0,1,0,24);testPut(1,1,0,LAVA_ID);tickWaterFlow(0.1);
            check(getBlock(1,1,0)===OBSIDIAN_ID,'Water turns neighboring lava into obsidian');
            reset();testPut(0,1,0,24);waterAmounts.set('0,1,0',1);camera.position.set(0,2.1,0);
            check(!getPlayerEnvironment().headInWater,'Shallow water does not submerge eyes');
            console.info('PASS: Water falling, spreading, conservation, barriers and lava.');

            reset();
            for(let x=-1;x<=1;x++) for(let z=-1;z<=1;z++) if(x||z)testPut(x,1,z,32);
            check(activatePortalNear(1,1,1),'Eight-table ring opens a portal');
            check(getBlock(0,1,0)===NETHER_PORTAL_ID && !isSolid(0,1,0),'Portal is purple and passable, not lava');
            testPut(1,1,1,0);
            check(activePortals.size===0&&getBlock(0,1,0)===0,'Broken ring closes its portal');
            for(const axis of ['x','z']) {
                reset();
                for(let u=0;u<4;u++) for(let y=1;y<=5;y++) if(u===0||u===3||y===1||y===5)testPut(axis==='x'?u:0,y,axis==='z'?u:0,OBSIDIAN_ID);
                check(activatePortalNear(0,1,0),`Obsidian frame activates along ${axis}`);
                check(activePortals.values().next().value.cells.length===6,'Obsidian portal has six interior cells');
            }
            reset();
            // As in live play, generate the arrival neighborhood before placing the edits to preserve.
            for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)generateHouseData(x,z);
            testPut(8,1,8,51);placeFurniture(FRIDGE_ID,5,1,0);
            furnitureRecord(5,1,0).data.food[40]=3;waterAmounts.set('4,1,4',4);worldMap.set('4,1,4',24);
            const friend=spawnEnderman(3,1,3,true);friend.hp=5;
            const tinyCell=microCellAt(20,3,20,2);setMicroPlacement(tinyCell,4);
            travelThroughPortal('nether');
            check(getMicroType(tinyCell)!==4,'Miniature edits do not leak into the Nether');
            check(currentDimension==='nether'&&activePortals.size===1,'Nether travel creates return portal');
            check(!checkScaledCollision(camera.position),'Arrival position is collision-free');
            check(getBlock(Math.round(camera.position.x),Math.round(camera.position.y-getPlayerHeight()-0.1),Math.round(camera.position.z))!==LAVA_ID,'Arrival has a dry platform');
            testPut(12,8,12,59);travelThroughPortal('overworld');
            check(getMicroType(tinyCell)===4,'Miniature edits survive a dimension round trip');
            check(getBlock(8,1,8)===51&&getBlock(5,1,0)===FRIDGE_ID,'Overworld structures survive round trip');
            check(furnitureRecord(5,1,0).data.food[40]===3&&waterAmounts.get('4,1,4')===4,'Furniture and water state survive travel');
            check(endermen.length===1&&endermen[0].friendly&&endermen[0].hp===5,'Friendly Enderman returns with its health');
            travelThroughPortal('nether');check(getBlock(12,8,12)===59,'Nether edits survive return visit');
            console.info('PASS: Both portal shapes, breakage, dry arrival and dimension persistence.');

            reset();gameMode='survival';playerInventory[72]=1;camera.position.set(0,2.1,4);camera.lookAt(0,0.5,0);camera.updateMatrixWorld(true);
            check(useSpawnEgg(72)&&endermen.length===1&&playerInventory[72]===0,'Enderman egg spawns and consumes in Survival');
            check(endermen[0].friendly&&!damageMob(endermen[0],1),'Egg Enderman is a protected companion');
            const wild=spawnEnderman(4,1,0);check(damageMob(wild,2)&&wild.hp===6&&wild.anger===20,'Wild Enderman takes gradual damage and becomes angry');
            check(wild.mesh.children.length>=8,'Enderman has limbs, a head and purple eyes');
            camera.position.set(0,2.1,5);controls.isLocked=true;for(let i=0;i<30;i++) updateEndermen(1/60);
            check(Number.isFinite(wild.mesh.position.y)&&wild.hp===6,'Enderman animation runs without corrupting health or position');
            controls.isLocked=false;summonModPack('mobs');check(playerInventory[72]===8,'Mods pack includes Enderman eggs');
            console.info('PASS: Enderman egg, companion protection and hostile damage.');

            reset();gameMode='survival';playerInventory[73]=2;
            check(placeFurniture(73,0,1,0)&&getBlock(0,2,0)===80&&playerInventory[73]===1,'Fridge placement reserves two blocks and consumes one');
            testPut(2,2,0,3);check(!placeFurniture(73,2,1,0)&&playerInventory[73]===1,'Blocked fridge placement consumes nothing');
            for(let id=74;id<=79;id++) {playerInventory[id]=1;check(placeFurniture(id,(id-73)*2,1,0),`Furniture ${id} places`);}
            syncFurnitureMeshes();check(furnitureMeshes.size===7,'All seven detailed furniture models render');
            const fridge=furnitureRecord(0,1,0);fridge.data.food[40]=2;
            const saved=saveWorldExpansion();clearExpansionWorld();restoreWorldExpansion(saved);syncFurnitureMeshes();
            check(furnitureRecord(0,2,0).data.food[40]===2,'Fridge upper half resolves to saved food storage');
            const chair=furnitureRecord(12,1,0);camera.position.set(12,2.1,2);
            sitInChair(chair);check(seatedAt?.key===chair.key,'Office chair accepts sitting');
            const seated=camera.position.clone();moveForward=true;updatePlayerMovement(1/60);moveForward=false;
            check(camera.position.equals(seated),'Seated player stays in chair');
            check(standFromChair()&&!seatedAt,'Player stands from chair safely');
            for(const recipe of recipes.filter(r=>HOME_ITEMS[r.out])) {
                craftingGrid=[];for(const [id,n] of Object.entries(recipe.ing))for(let i=0;i<n;i++)craftingGrid.push(Number(id));
                while(craftingGrid.length<9)craftingGrid.push(0);checkRecipes();
                check(craftingOutput.id===recipe.out,`Recipe produces ${HOME_ITEMS[recipe.out]}`);
            }
            console.info('PASS: Furniture models, placement, sitting, food state and crafting.');

            reset();
            for(const text of ['创建20×20空间','做一个20乘20的空间','用水把20x20区域填满','建20×20×8房间'])check(parseWorldCommand(text).width===20,`Chinese dimensions: ${text}`);
            check(parseWorldCommand('用水把整个世界填满').kind==='flood','Whole-world flood parses');
            check(parseWorldCommand('帮我找到苹果电脑').id===77,'Chinese item lookup parses longest alias');
            check(parseWorldCommand('查找 office chair').id===79,'English item names also work');
            let rejected=false;try{parseWorldCommand('创建999×999空间');}catch(e){rejected=true;}check(rejected,'Oversized command is rejected');
            camera.position.set(0,2,0);executeWorldCommand(parseWorldCommand('创建20×20空间'));
            check(commandJob.changes.length===2800,'20 by 20 command edits exactly its bounded floor and volume');
            tickCommandJob();check(commandJob.index===256,'World editing uses bounded frame batches');finish();
            check(getBlock(0,0,0)===63&&getBlock(0,1,0)===0&&!checkScaledCollision(camera.position),'Space has solid floor and safe player position');
            executeWorldCommand({kind:'undo'});finish();check(getBlock(0,0,0)===3,'Undo restores previous terrain');
            gameMode='creative';camera.position.set(0,2.1,5);placeFurniture(73,0,1,0);furnitureRecord(0,1,0).data.food[40]=7;
            camera.position.set(0,2.1,0);executeWorldCommand(parseWorldCommand('创建4×4空间'));finish();
            check(getBlock(0,1,0)===0&&getBlock(0,2,0)===0,'Space command removes both halves of fridge');
            executeWorldCommand({kind:'undo'});finish();
            check(getBlock(0,1,0)===73&&getBlock(0,2,0)===80&&furnitureRecord(0,1,0).data.food[40]===7,'Undo restores both fridge halves and contents');
            executeWorldCommand(parseWorldCommand('用水把全世界填满'));
            check(getBlock(10000,30,10000)===24&&getBlock(10000,60,10000)===0,'Flood applies to ungenerated distant regions at bounded waterline');
            check(getBlock(0,1,0)===73,'Global flood preserves buildings');
            buildChunkMesh(6,6);check(chunkMeshes.get('6,6')[24].count<1000,'Flood rendering skips fully submerged interior water');
            executeWorldCommand({kind:'undo'});check(worldFloodHeight===null&&getBlock(10000,30,10000)===0,'Undo cancels global flood');
            executeWorldCommand(parseWorldCommand('查找冰箱'));check(isInventoryOpen&&document.getElementById('tab-home').style.display==='flex'&&currentBlock===73,'Find item opens and selects the right inventory tab');
            console.info('PASS: Chinese parser, safe batched edits, undo, global flood and item lookup.');

            reset();selectedTerrain='city';getSurfaceHeight=window.expansionOriginalHeight;seed=1223;heightCache.clear();
            check(getSurfaceHeight(0,0)===16,'City terrain uses a stable base elevation');
            let buildings=0;
            for(let cx=-1;cx<=1;cx++)for(let cz=-1;cz<=1;cz++) {
                generateCityChunk(cx,cz);
                const bx=cx*CHUNK_SIZE+5,bz=cz*CHUNK_SIZE+5;
                if(getBlock(bx+5,17,bz)!==8)continue;
                buildings++;
                check(getBlock(bx+5,18,bz)===9&&getBlock(bx+5,17,bz+1)===0,'Building has a two-block entrance and interior space');
                let roof=20;while(getBlock(bx+5,roof+4,bz+5)===63)roof+=4;
                for(let y=17;y<=roof;y++)check(getBlock(bx+8,y,bz+8)===7,'Continuous ladder reaches upper floors');
                for(let floor=0;floor<(roof-16)/4;floor++)for(let step=1;step<=4;step++) {
                    const y=16+floor*4+step;
                    check(getBlock(bx+step,y,bz+2)===63&&getBlock(bx+step,y+1,bz+2)===0&&getBlock(bx+step,y+2,bz+2)===0,`Stair tread ${cx},${cz} floor ${floor} step ${step} has two blocks of headroom`);
                }
            }
            check(buildings>=4,'City contains multiple accessible buildings');
            setTerrainChoice('city');check(terrainChoice==='city'&&document.getElementById('terrain-select').value==='city','City is retained by terrain selection');
            return `${passed.length} expansion checks passed.`;
        }));

        await page.evaluate(()=>{
            expansionTestReset();isInventoryOpen=false;inventoryUI.style.display='none';blocker.style.display='none';
            gameMode='survival';playerInventory[73]=1;playerInventory[39]=2;placeFurniture(73,0,1,0);openFurniturePanel(furnitureRecord(0,1,0));
        });
        await page.locator('#home-content .home-row').first().getByRole('button',{name:'Store',exact:true}).click();
        assert.equal(await page.evaluate(()=>furnitureRecord(0,1,0).data.food[39]),1);
        await page.locator('#home-content .home-row').first().getByRole('button',{name:'Take',exact:true}).click();
        assert.equal(await page.evaluate(()=>playerInventory[39]),2);
        await page.evaluate(()=>{closeFurniturePanel(false);gameMode='creative';placeFurniture(77,2,1,0);openFurniturePanel(furnitureRecord(2,1,0));});
        await page.getByRole('textbox',{name:'Notes'}).fill('My city home');
        await page.getByRole('button',{name:'Save',exact:true}).click();
        assert.equal(await page.evaluate(()=>furnitureRecord(2,1,0).data.note),'My city home');
        await page.evaluate(()=>{closeFurniturePanel(false);placeFurniture(76,4,1,0);openFurniturePanel(furnitureRecord(4,1,0));});
        await page.getByRole('checkbox',{name:'Power'}).check();
        await page.getByRole('combobox',{name:'Channel'}).selectOption('1');
        assert.equal(await page.evaluate(()=>furnitureRecord(4,1,0).data.channel),1);
        await page.evaluate(()=>{closeFurniturePanel(false);placeFurniture(74,6,1,0);openFurniturePanel(furnitureRecord(6,1,0));});
        await page.locator('.home-game .lit').click();assert.equal(await page.locator('#home-content p').textContent(),'Score: 1');
        await page.evaluate(()=>{closeFurniturePanel(false);openCommandPanel();});
        await page.getByRole('textbox',{name:'输入中文命令'}).fill('创建20×20空间');
        await page.getByRole('button',{name:'检查命令',exact:true}).click();
        await page.getByRole('button',{name:'执行',exact:true}).click();
        await page.evaluate(()=>{while(commandJob)tickCommandJob();});
        assert.equal(await page.locator('#command-result').textContent(),'已完成。');
        await page.screenshot({path:'/private/tmp/mc-commands-desktop.png'});
        await page.setViewportSize({width:390,height:844});
        assert(await page.locator('.world-dialog:visible').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}));
        await page.screenshot({path:'/private/tmp/mc-commands-mobile.png'});
        console.log('PASS: Actual food buttons, editable notes, TV, minigame and Chinese command form; desktop/mobile dialogs.');

        const downloadEvent=page.waitForEvent('download');await page.evaluate(()=>downloadSave());
        const save=JSON.parse(fs.readFileSync(await (await downloadEvent).path(),'utf8'));
        assert(save.expansion && save.expansion.furniture);
        await page.locator('#load-file').setInputFiles({name:'expanded-world.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(save))});
        await page.waitForFunction(()=>isGameStarted);
        assert.deepEqual(errors,[]);
        await page.close();

        const live=await browser.newPage({viewport:{width:1440,height:900}});
        live.on('pageerror',e=>errors.push(e.message));
        await live.goto(pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await live.getByRole('button',{name:'Creative',exact:true}).click();
        await live.locator('#terrain-select').selectOption('city');
        await live.getByRole('button',{name:'Start Game',exact:true}).click();
        await live.waitForFunction(()=>isGameStarted&&chunkMeshes.size>=9,{},{timeout:90000});
        await live.evaluate(()=>{creativeFlying=true;camera.position.set(1,30,30);camera.lookAt(22,24,5);camera.updateMatrixWorld(true);});
        await live.waitForTimeout(1500);
        await live.screenshot({path:'/private/tmp/mc-city-desktop.png'});
        console.log('PASS: Live City start and nonblank render.',await live.evaluate(()=>({terrain:selectedTerrain,chunks:chunkMeshes.size,triangles:renderer.info.render.triangles})));
        await live.evaluate(()=>{
            for(let i=0;i<7;i++){for(let y=25;y<=28;y++)setBlockNoRebuild(1+i*2,y,25,0,rebuildQueue);setBlockNoRebuild(1+i*2,24,25,63,rebuildQueue);placeFurniture(73+i,1+i*2,25,25);}
            syncFurnitureMeshes();camera.position.set(7,28,33);camera.lookAt(7,25.2,25);camera.updateMatrixWorld(true);
        });
        await live.waitForTimeout(700);await live.screenshot({path:'/private/tmp/mc-furniture-desktop.png'});
        await live.setViewportSize({width:390,height:844});await live.waitForTimeout(300);await live.screenshot({path:'/private/tmp/mc-city-mobile.png'});
        assert.deepEqual(errors,[]);
        await live.close();
        console.log('PASS: Expansion save/load and live desktop/mobile render without browser errors.');
    } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
