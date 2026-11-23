const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>requestAnimationFrame=()=>0);
  await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);await page.waitForFunction(()=>expansionReady);
  await page.getByRole('button',{name:'Creative',exact:true}).click();await page.getByRole('button',{name:'Plains',exact:true}).click();await page.getByRole('button',{name:'Start Game',exact:true}).click();
  await page.waitForFunction(()=>controls.isLocked);await page.keyboard.press('e');
  assert.equal(await page.locator('#inventory-hotbar button').count(),9);assert(await page.evaluate(()=>hotbarItems.every(s=>!s)));
  await page.locator('#catalog-search').fill('金块');await page.locator('#inv-215').click();assert.equal(await page.evaluate(()=>currentBlock),0);
  await page.locator('#catalog-amount').fill('64');await page.locator('#inventory-hotbar [data-index="2"]').click();
  assert.deepEqual(await page.evaluate(()=>hotbarItems[2]),{id:227,count:64});
  await page.locator('#catalog-search').fill('Silver Pyramid');await page.locator('#inv-221').click();await page.locator('#catalog-amount').fill('12');
  await page.locator('#inventory-hotbar [data-index="7"]').click();assert.deepEqual(await page.evaluate(()=>hotbarItems[7]),{id:233,count:12});
  await page.keyboard.press('e');await page.keyboard.press('3');assert.equal(await page.evaluate(()=>currentBlock),227);
  await page.mouse.wheel(0,100);assert.equal(await page.evaluate(()=>currentBlock),0);
  await page.keyboard.press('e');await page.locator('#catalog-search').fill('');await page.getByRole('button',{name:'Blocks',exact:true}).click();
  await page.evaluate(()=>{renderer.render(scene,camera);});await page.screenshot({path:'/private/tmp/mc-creative-catalog.png'});
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>renderer.domElement.width===390,null,{polling:50});
  await page.locator('#catalog-search').fill('Gold');await page.locator('#inv-215').click();
  assert(await page.locator('#inventory-hotbar').evaluate(el=>el.scrollWidth<=el.clientWidth));
  assert(await page.locator('#inv-215').evaluate(el=>el.scrollHeight<=el.clientHeight&&el.scrollWidth<=el.clientWidth));
  await page.screenshot({path:'/private/tmp/mc-creative-catalog-mobile.png'});
  console.log('PASS: actual Creative menu, nine empty slots, Chinese search, selected quantities, keyboard, wheel and mobile fit.');
  console.log(await page.evaluate(()=>{
   window.ok=(v,s)=>{if(!v)throw Error(s);};
   window.testReset=()=>{closeFurniturePanel(false);clearExpansionWorld();worldMap.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();chunkScanYRanges.clear();heightCache.clear();
    for(const ms of chunkMeshes.values())for(const m of Object.values(ms))releaseChunkMesh(m);chunkMeshes.clear();rebuildQueue.clear();
    for(const list of [villagers,animals,zombies,creepers,endermen]){for(const m of list)disposeModModel(m.mesh);list.length=0;}
    currentDimension='overworld';selectedTerrain='plains';isGameStarted=true;isInventoryOpen=false;controls.isLocked=true;gameMode='creative';
    inventoryUI.style.display=blocker.style.display='none';scene.background=new THREE.Color(0x91c6e9);scene.fog=null;ambientLight.intensity=.6;dirLight.intensity=.8;heldItemGroup.visible=false;
    document.getElementById('toast-msg').style.visibility='hidden';document.getElementById('info-panel').style.visibility='hidden';
    for(let x=-8;x<=8;x++)for(let z=-8;z<=8;z++)setGenBlock(x,79,z,3);
    camera.position.set(0,82,4);camera.lookAt(0,80,0);camera.updateMatrixWorld(true);
   };testReset();
   gameMode='survival';playerInventory={};ok(!hasInventoryItem(34)&&!hasInventoryItem(35),'No free survival tools');
   currentBlock=34;document.dispatchEvent(new MouseEvent('mousedown',{button:0}));ok(!miningState,'Missing pickaxe cannot be used');
   setGenBlock(0,80,0,12);document.dispatchEvent(new MouseEvent('mousedown',{button:2}));
   ok(isInventoryOpen&&workbenchFocus?.join(',')==='0,80,0','Missing tool does not block workbench interaction');
   isInventoryOpen=false;controls.isLocked=true;inventoryUI.style.display=blocker.style.display='none';setGenBlock(0,80,0,0);
   playerInventory[4]=10;playerInventory[3]=10;currentBlock=4;setWorkbench(null);craftingGrid.fill(0);craftSlotClick(0);ok(craftingOutput.id===12,'One wood crafts a workbench');craftOutputClick();ok(playerInventory[12]===1,'Workbench earned');
   setGenBlock(2,80,3,12);setWorkbench([2,80,3]);craftingGrid=[4,4,3,3,3,0,0,0,0];checkRecipes();ok(craftingOutput.id===34,'Stone and wood make a pickaxe at table');
   craftOutputClick();ok(playerInventory[34]===1&&hasInventoryItem(34),'Crafted tool becomes usable');
   setGenBlock(0,80,0,13);setGenBlock(1,80,0,16);currentBlock=37;playerInventory[37]=2;
   document.dispatchEvent(new MouseEvent('mousedown',{button:2}));ok(playerInventory[GOLD_INGOT]===1&&playerInventory[37]===1,'Right click furnace converts ore to ingot');
   for(const [ingot,block] of [[GOLD_INGOT,GOLD_BLOCK],[SILVER_INGOT,SILVER_BLOCK],[IRON_INGOT,IRON_BLOCK],[EMERALD,EMERALD_BLOCK],[38,SAPPHIRE_BLOCK]]){
    craftingGrid.fill(ingot);checkRecipes();ok(craftingOutput.id===block,'Nine materials make '+getBlockName(block));
    craftingGrid.fill(0);craftingGrid[0]=block;checkRecipes();ok(craftingOutput.id===ingot&&craftingOutput.count===9,'Block unpacks losslessly');
   }
   ok(materials[GOLD_BLOCK].map!==materials[37].map,'Gold block is not the ore texture');
   for(const id of [GOLD_PYRAMID,SILVER_PYRAMID]){const g=treasureGeometry(id);g.computeBoundingBox();ok(Math.abs(g.boundingBox.max.y-.5)<.001&&Math.abs(g.boundingBox.min.y+.5)<.001,'Pyramid fits a block');ok(!occludesBlockFaces(id),'Pyramid does not hide neighboring walls');}
   return 'PASS: survival workbench/tool progression, real furnace interaction, metal/gem recipes and full-color pyramids.';
  }));
  console.log(await page.evaluate(()=>{
   testReset();currentBlock=CHEST_ID;camera.position.set(0,84,0);camera.lookAt(0,79,0);camera.updateMatrixWorld(true);
   document.dispatchEvent(new MouseEvent('mousedown',{button:2}));ok(getBlock(0,80,0)===CHEST_ID,'Actual right click places chest');
   camera.position.set(4,80,0);camera.lookAt(0,80,0);camera.updateMatrixWorld(true);document.dispatchEvent(new MouseEvent('mousedown',{button:2}));
   ok(getBlock(1,80,0)===CHEST_ID,'Clicking chest side places second chest');
   const a=furnitureRecord(0,80,0),b=furnitureRecord(1,80,0);ok(chestMembers(a).length===2,'Two adjacent chests join');
   ok(!placeFurniture(CHEST_ID,2,80,0),'Third chest cannot corrupt a double chest');
   gameMode='survival';playerInventory={[GOLD_INGOT]:70};requestChestTransfer(a,0,'store',GOLD_INGOT,64);
   ok(playerInventory[GOLD_INGOT]===6&&chestSlots(a.data)[0].count===64,'Deposit consumes exact survival amount');
   requestChestTransfer(a,0,'store',GOLD_INGOT,6);ok(playerInventory[GOLD_INGOT]===6,'Full stack rejects extra without loss');
   requestChestTransfer(b,0,'store',GOLD_INGOT,6);ok(playerInventory[GOLD_INGOT]===0,'Second half stores separately');
   requestChestTransfer(a,0,'take',GOLD_INGOT,12);ok(playerInventory[GOLD_INGOT]===12&&chestSlots(a.data)[0].count===52,'Partial withdrawal exact');
   const saved=saveWorldExpansion();furnitureData.clear();restoreWorldExpansion(JSON.parse(JSON.stringify(saved)));
   ok(chestSlots(furnitureRecord(0,80,0).data)[0].count===52,'Chest content survives serialization');
   const r=furnitureRecord(0,80,0);openFurniturePanel(r);ok(document.querySelectorAll('.chest-cell').length===64,'Large chest has 64 actual slots');
   currentBlock=GOLD_INGOT;ok(!handleTreasureClick({button:2}),'Holding an ingot allows chest interaction');
   return 'PASS: actual placement, joining, capacity, partial transfers and saved chest contents.';
  }));
  await page.getByRole('button',{name:'Take Gold Ingot x52',exact:true}).click();assert.equal(await page.evaluate(()=>playerInventory[GOLD_INGOT]),64);
  await page.screenshot({path:'/private/tmp/mc-chest-mobile.png'});
  await page.setViewportSize({width:1200,height:850});await page.waitForFunction(()=>renderer.domElement.width===1200,null,{polling:50});
  await page.evaluate(()=>{openFurniturePanel(furnitureRecord(1,80,0));});await page.screenshot({path:'/private/tmp/mc-chest-desktop.png'});
  console.log(await page.evaluate(()=>{
   closeFurniturePanel(false);const before=droppedItems.length;mineBlock(new THREE.Vector3(1,80,0),false);
   ok(droppedItems.slice(before).some(d=>d.itemType===GOLD_INGOT&&d.count===6),'Breaking chest drops one stack, not 64 meshes');
   ok(chestMembers(furnitureRecord(0,80,0)).length===1,'Other half survives as single chest');
   const savedBar=JSON.parse(JSON.stringify({items:hotbarItems,active:activeHotbarSlot}));restoreHotbar();restoreHotbar(savedBar);ok(JSON.stringify(hotbarItems)===JSON.stringify(savedBar.items),'Hotbar persists');
   return 'PASS: breaking one half preserves the other; contents drop with exact counts; hotbar round trip.';
  }));
  console.log(await page.evaluate(()=>{
   testReset();const at=[0,80,0];setBlock(...at,CHEST_ID);const chest=furnitureRecord(...at);chest.data.chestSlots=[{id:GOLD_INGOT,count:4}];
   const sent=[],send=sendRoomPacket;sendRoomPacket=(conn,p)=>sent.push(p);
   try{
    const entry={owner:'test-owner',conn:{peer:'guest'}},room={positions:new Map([['guest',{x:0,y:81,z:2,dimension:'overworld'}]])};
    const packet={request:1001,at,index:0,action:'take',id:GOLD_INGOT,count:3,dimension:'overworld'};
    receiveChestRequest(room,entry,packet);receiveChestRequest(room,entry,packet);
    ok(chestSlots(chest.data)[0].count===1&&sent.every(p=>p.moved===3),'Duplicate request returns receipt without taking twice');
    receiveChestRequest(room,{owner:'test-owner',conn:{peer:'guest'}},packet);
    ok(chestSlots(chest.data)[0].count===1&&sent.at(-1).moved===3,'Reconnect uses persisted receipt');
    receiveChestRequest(room,{owner:'second-owner',conn:{peer:'guest'}},{...packet,request:1002});
    ok(!chestSlots(chest.data)[0]&&sent.at(-1).moved===1,'Competing withdrawal receives only remaining items');
   }finally{sendRoomPacket=send;}
   return 'PASS: host-serialized competing withdrawals and duplicate/reconnect receipts.';
  }));
  await page.evaluate(async()=>{
   assignHotbar(5,GOLD_BLOCK,37);playerInventory[GOLD_INGOT]=11;furnitureRecord(0,80,0).data.chestSlots=[{id:EMERALD,count:9}];
   const data=getWorldSaveData(),file=new File([JSON.stringify(data)],'test-world.json',{type:'application/json'});
   playerInventory={};restoreHotbar();await new Promise((resolve,reject)=>loadSaveFile({target:{files:[file]}},e=>e?reject(e):resolve()));
   ok(playerInventory[GOLD_INGOT]===11&&hotbarItems[5]?.count===37&&currentBlock===GOLD_BLOCK,'Real save file restores inventory and selected hotbar');
   ok(chestSlots(furnitureRecord(0,80,0).data)[0]?.id===EMERALD,'Real save file restores chest');
  });
  for(const [dimension,terrain] of [['end','plains'],['overworld','desert'],['nether','plains']]){
   console.log(await page.evaluate(({dimension,terrain})=>{
    testReset();worldMap.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();currentDimension=dimension;selectedTerrain=terrain;seed=42;heightCache.clear();
    scene.background.setHex(dimension==='end'?0x221930:dimension==='nether'?0x2a0600:0x91c6e9);clouds.visible=dimension==='overworld';dirLight.intensity=dimension==='end'?.65:dimension==='nether'?.35:.8;
    let site;for(let radius=0;radius<4&&!site;radius++)for(let a=-radius;a<=radius&&!site;a++)for(let b=-radius;b<=radius;b++){const candidate=ruinCandidate(a,b);if(candidate){site=candidate;break;}}
    ok(site,'Natural ruin candidate for '+dimension);generateRuinsNearChunk(Math.floor(site.x/16),Math.floor(site.z/16));
    const chest=furnitureRecord(site.x,site.y+1,site.z-2);ok(chest?.id===CHEST_ID,'Exploration generation creates treasure chest');
    ok(chestSlots(chest.data).filter(Boolean).length>=4,'Ruin contains actual varied loot');
    const old=chestSlots(chest.data)[0].count;chestTransfer(chest,0,'take',chestSlots(chest.data)[0].id,64);generateRuinsNearChunk(Math.floor(site.x/16),Math.floor(site.z/16));ok(!chestSlots(chest.data)[0],'Loot does not regenerate on reload');
    ok(isSolid(site.x,site.y,site.z-2),'Chest has solid floor');
    for(let step=1;step<=6;step++)ok(isSolid(site.x,Math.max(site.y-step,getSurfaceHeight(site.x,site.z+6+step)),site.z+6+step),'Entrance approach is supported');
    const at=[site.x-2,site.y+1,site.z];setBlock(...at,0);generateRuinsNearChunk(Math.floor(site.x/16),Math.floor(site.z/16));ok(getBlock(...at)===0,'Player edits remain');
    for(let cx=Math.floor((site.x-8)/16);cx<=Math.floor((site.x+8)/16);cx++)for(let cz=Math.floor((site.z-8)/16);cz<=Math.floor((site.z+8)/16);cz++)buildChunkMesh(cx,cz);
    camera.position.set(site.x+17,site.y+15,site.z+21);camera.lookAt(site.x,site.y+2,site.z);syncFurnitureMeshes();renderer.render(scene,camera);
    const gl=renderer.getContext(),px=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4),colors=new Set();gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,px);for(let i=0;i<px.length;i+=512)colors.add(px.slice(i,i+3).join(','));ok(colors.size>12,'Ruin renders actual varied pixels');
    return {dimension,site,lootTaken:old,renderColors:colors.size};
   },{dimension,terrain}));
   await page.screenshot({path:`/private/tmp/mc-ruin-${dimension}.png`});
  }
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>renderer.domElement.width===390,null,{polling:50});
  assert(await page.evaluate(()=>{renderer.render(scene,camera);return renderer.info.render.triangles>1000;}));
  await page.screenshot({path:'/private/tmp/mc-ruin-mobile.png'});
  assert(await page.evaluate(()=>{
   testReset();worldMap.clear();currentDimension='end';heightCache.clear();const site=ruinCandidate(0,0);
   setBlock(site.x,site.y+1,site.z,51);return !generateRuin(site)&&getBlock(site.x,site.y+1,site.z)===51;
  }),'Ruin generation preserves existing player construction');
  assert.deepEqual(errors,[]);console.log('PASS: all three natural ruins, real loot, non-regeneration, solid floors, render pixels and no runtime errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
