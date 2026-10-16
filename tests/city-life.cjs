const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

(async()=>{
    const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try {
        const errors=[],page=await browser.newPage({viewport:{width:1440,height:900}});
        page.on('pageerror',e=>errors.push(e.message));
        await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
        await page.goto(pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);await page.waitForFunction(()=>expansionReady);
        console.log(await page.evaluate(()=>{
            const checks=[],check=(v,n)=>{if(!v)throw new Error(n);checks.push(n);};
            const height=getSurfaceHeight;
            const reset=()=>{
                clearExpansionWorld();worldMap.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();heightCache.clear();restoreMicroEdits([]);restoreFineVoxelEdits([]);resetPlayerFlight();
                for(const list of [villagers,zombies,creepers,animals]){for(const m of list)disposeModModel(m.mesh);list.length=0;}
                playerScale=1;gameMode='creative';isGameStarted=true;controls.isLocked=true;selectedTerrain='city';currentDimension='overworld';getSurfaceHeight=height;camera.position.set(1,18.1,1);
            };
            reset();
            for(const scale of [1,0.05,0.005,0.0005,0.00005,0.000005,0.0000005]) {
                reset();getSurfaceHeight=()=>-100;selectedTerrain='moon';playerScale=scale;
                const base=isTinyMode()?0.5:0;
                for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)for(let y=0;y<5;y++) {
                    const p=[base+(x+0.5)*scale,base+(y+0.5)*scale,base+(z+0.5)*scale];
                    if(isTinyMode())setMicroPlacement(microCellAt(...p),LAVA_ID);else worldMap.set(p.map(Math.round).join(','),LAVA_ID);
                }
                camera.position.set(base+0.5*scale,base+2.8*scale,base+0.5*scale);const start=camera.position.y;
                check(getPlayerEnvironment().lavaFraction>0.99,`Lava detects body at scale ${scale}`);
                for(let i=0;i<120;i++)updatePlayerMovement(1/60);
                check(camera.position.y>start+0.5*scale,`Lava is buoyant at scale ${scale}`);
                for(let i=0;i<600;i++)updatePlayerMovement(1/60);const surface=camera.position.y;
                for(let i=0;i<120;i++)updatePlayerMovement(1/60);
                check(Math.abs(camera.position.y-surface)<scale*0.02,`Lava floating stabilizes at scale ${scale}`);
                camera.position.y=start;velocity.set(0,0,0);holdingSpace=true;for(let i=0;i<30;i++)updatePlayerMovement(1/60);
                check(camera.position.y>start+0.7*scale,`Space rises through lava at scale ${scale}`);
            }
            reset();const oldHeight=getSurfaceHeight(10,20);currentDimension='nether';heightCache.clear();
            check(getSurfaceHeight(10,20)!==oldHeight,'Nether terrain is independent of City terrain');
            const heights=new Set();let lava=0,rock=0;
            for(let x=-64;x<64;x+=4)for(let z=-64;z<64;z+=4){heights.add(getSurfaceHeight(x,z));if(getBlock(x,6,z)===LAVA_ID)lava++;if(getBlock(x,getSurfaceHeight(x,z),z)===127)rock++;check(getBlock(x,6,z)!==24,'No natural water in Nether');}
            check(heights.size>15&&lava>10&&rock>10,'Nether contains varied ridges, lava lakes and netherrack');
            generateHouseData(0,0);generateTrees(0,0);spawnVillager();spawnVillagerAt(0,20,0);spawnAnimal('cow',0,20,0);
            check(villagers.length===0&&animals.length===0&&worldMap.size===0,'No houses, trees, villagers or animals generate in Nether');
            check(!useSpawnEgg(67),'Villager egg cannot introduce villagers in Nether');
            camera.position.set(0,20,0);populateNetherEndermen();check(endermen.length===3,'Nether starts with visible Endermen even in Creative');
            reset();generateCityChunk(-1,0);generateCityChunk(0,-1);generateCityChunk(1,-1);updateCityLife();
            check(marketStalls.size===4&&villagers.filter(v=>v.merchantId).length===4,'Market by spawn has four staffed stalls');
            const merchant=villagers.find(v=>v.merchantId),p=merchant.mesh.position.clone();for(let i=0;i<120;i++)updateEntities(1/60);
            check(Math.hypot(merchant.mesh.position.x-p.x,merchant.mesh.position.z-p.z)<0.001,'Stall merchants remain at their counter');
            check(getBlock(8,17,-12)===8&&getBlock(8,18,-12)===9,'School has a usable two-block entrance');
            setBlockNoRebuild(8,17,-12,10,new Set());setBlockNoRebuild(8,18,-12,11,new Set());
            for(const [x,z] of [[8,-12],[8,-11],[9,-11],[9,-10],[9,-9]])check(!checkCollision(new THREE.Vector3(x,18.1,z)),'School entrance connects to a clear classroom aisle');
            check(getBlock(7,17,-7)===82&&getBlock(7,21,-7)===82,'Both school floors have classroom desks');
            check(getBlock(13,20,-3)===7&&getBlock(13,24,-3)===7,'School ladder passes through upper floor and roof');
            check(getBlock(25,17,-7)===128&&getBlock(24,19,-12)===51,'Football field has a ball and goals');
            const ball=furnitureRecord(25,17,-7);camera.position.set(25,18.1,-9);kickFootball(ball);
            check(getBlock(25,17,-7)===0&&getBlock(25,17,-3)===128,'Football can be kicked across a clear field');
            check(parseWorldCommand('去学校').landmark==='school'&&parseWorldCommand('去地摊').landmark==='market','Chinese commands locate new landmarks');
            const stock=marketStalls.values().next().value;stock.stock[0]=7;
            const saved=JSON.parse(JSON.stringify(saveWorldExpansion()));clearExpansionWorld();restoreWorldExpansion(saved);
            check(marketStalls.get(stock.id).stock[0]===7,'Market stock survives save/load');
            return `${checks.length} lava, Nether and city-life checks passed.`;
        }));
        assert.deepEqual(errors,[]);await page.close();

        const live=await browser.newPage({viewport:{width:1440,height:900}});live.on('pageerror',e=>errors.push(e.message));
        await live.goto(pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await live.getByRole('button',{name:'Creative',exact:true}).click();await live.locator('#terrain-select').selectOption('city');await live.getByRole('button',{name:'Start Game',exact:true}).click();
        await live.waitForFunction(()=>villagers.some(v=>v.merchantId),{},{timeout:90000});
        await live.mouse.move(720,450);
        await live.evaluate(()=>{
            const m=villagers.find(v=>v.merchantId);camera.position.set(m.mesh.position.x,18.1,m.mesh.position.z+3);camera.lookAt(m.mesh.position.x,17.8,m.mesh.position.z);camera.updateMatrixWorld(true);
            controls.isLocked=true;selectSlot(1);gameMode='survival';playerInventory[4]=6;playerInventory[120]=0;
        });
        await live.mouse.down({button:'right'});await live.mouse.up({button:'right'});await live.getByRole('heading',{name:'Bakery Stall'}).waitFor();
        await live.locator('#home-content').getByRole('button',{name:'Trade',exact:true}).first().click();
        assert(await live.evaluate(()=>playerInventory[4]===4&&playerInventory[120]===1));
        await live.screenshot({path:'/private/tmp/mc-market-trade.png'});
        await live.evaluate(()=>{closeFurniturePanel(false);gameMode='creative';creativeFlying=true;controls.isLocked=true;camera.position.set(-6,24,16);camera.lookAt(-7,18,8);camera.updateMatrixWorld(true);heldItemGroup.visible=false;});
        await live.waitForTimeout(700);await live.screenshot({path:'/private/tmp/mc-market.png'});
        await live.evaluate(()=>{camera.position.set(8,25,4);camera.lookAt(9,20,-7);camera.updateMatrixWorld(true);});
        await live.waitForTimeout(500);await live.screenshot({path:'/private/tmp/mc-school-football.png'});
        await live.evaluate(()=>{camera.position.set(9,18.1,-8);camera.lookAt(8,18,-11);camera.updateMatrixWorld(true);});
        await live.waitForTimeout(300);await live.screenshot({path:'/private/tmp/mc-classroom.png'});
        await live.evaluate(()=>travelThroughPortal('nether'));
        await live.waitForFunction(()=>endermen.length>=3&&chunkMeshes.size>4,{},{timeout:90000});
        assert(await live.evaluate(()=>villagers.length===0&&animals.length===0));
        await live.evaluate(()=>{creativeFlying=true;camera.position.y+=9;camera.position.z+=8;camera.lookAt(camera.position.x+10,6,camera.position.z-20);camera.updateMatrixWorld(true);});
        await live.waitForTimeout(1200);await live.screenshot({path:'/private/tmp/mc-nether-new.png'});
        await live.setViewportSize({width:390,height:844});await live.waitForTimeout(300);await live.screenshot({path:'/private/tmp/mc-nether-mobile.png'});
        assert(await live.evaluate(()=>renderer.info.render.triangles>100));
        assert.deepEqual(errors,[]);console.log('PASS: Live merchant transactions, market/school/classroom rendering, Nether travel and mobile render.');
    } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
