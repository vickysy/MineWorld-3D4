const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:820}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>requestAnimationFrame=()=>0);
  await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href,{timeout:120000});
  await page.waitForFunction(()=>expansionReady&&!worldLoading,null,{polling:50});
  await page.getByRole('button',{name:'Survival',exact:true}).click();await page.getByRole('button',{name:'Plains',exact:true}).click();
  await page.getByRole('button',{name:'Start Game',exact:true}).click();await page.waitForFunction(()=>isGameStarted&&!worldLoading,null,{polling:50});
  console.log(await page.evaluate(()=>{
   const check=(v,label)=>{if(!v)throw Error(label);};window.forgeCheck=check;
   const saved=seed,totals={},old={};let clustered=0,ores=0,shallow=0,samples=0;
   for(const world of [11,53,198,723]){
    seed=world;
    for(let x=-48;x<48;x++)for(let z=-48;z<48;z++){
     const id=getOreBlock(x,68,z,80),r=hash3(x,68,z,17.7),before=r<.04?38:r>.3&&r<.315?EMERALD_ORE:r>.32&&r<.35?SILVER_ORE:r<.11?37:r<.18?36:0;
     totals[id]=(totals[id]||0)+1;old[before]=(old[before]||0)+1;
     if(id){ores++;if(getOreBlock(x+1,68,z,80)===id)clustered++;}
     if(getOreBlock(x,77,z,80)===36)shallow++;samples++;
     check(getOreBlock(x,79,z,80)===0,'No ore replaces surface topsoil');
    }
   }
   seed=saved;
   check(totals[36]>old[36]*2,'Iron more than doubles in representative underground sample');
   for(const id of [37,38,SILVER_ORE,EMERALD_ORE])check(totals[id]>old[id],'More accessible mineral '+id);
   check(shallow/samples>.25&&clustered/ores>.5,'Shallow iron and contiguous veins');
   for(const id of [3,36,37,38,SILVER_ORE,EMERALD_ORE,IRON_BLOCK,STONE_BRICKS_ID,SANDSTONE]){
    check(getMiningDuration(id,34)===.28&&getMiningDuration(id,0)>1,'Pickaxe speed for '+id);
   }
   clearCombatState();clearExpansionWorld();worldMap.clear();heightCache.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();chunkScanYRanges.clear();
   for(const meshes of chunkMeshes.values())for(const mesh of Object.values(meshes))releaseChunkMesh(mesh);chunkMeshes.clear();rebuildQueue.clear();
   for(const list of [animals,villagers,zombies,creepers,endermen]){for(const m of list)disposeModModel(m.mesh);list.length=0;}
   currentDimension='overworld';selectedTerrain='plains';getSurfaceHeight=()=>79;controls.isLocked=true;gameMode='survival';worldLoading=false;isSleeping=false;
   for(let x=-6;x<=6;x++)for(let z=-6;z<=6;z++)setGenBlock(x,79,z,3);
   setGenBlock(0,80,0,13);camera.position.set(0,81.4,3);camera.lookAt(0,80,0);camera.updateMatrixWorld(true);
   playerInventory={4:3,36:5,37:2,[SILVER_ORE]:3};currentBlock=0;updateHeldItem3D(0);
   document.dispatchEvent(new MouseEvent('mousedown',{button:2}));
   check(!document.getElementById('home-panel').hidden&&document.getElementById('home-title').textContent==='Furnace','Actual right click opens furnace');
   check(!smeltOreAt([0,80,0],36)&&playerInventory[36]===5,'Cold furnace cannot consume ore');
   return {oreTotals:totals,previousTotals:old,adjacentOreFraction:clustered/ores,shallowIronFraction:shallow/samples};
  }));
  assert(await page.getByRole('button',{name:'Smelt one Iron Ingot',exact:true}).isDisabled());
  await page.getByRole('button',{name:'Craft Torches',exact:true}).click();assert.deepEqual(await page.evaluate(()=>[playerInventory[4],playerInventory[16]]),[0,10]);
  await page.getByRole('button',{name:'Add Torch',exact:true}).click();assert.deepEqual(await page.evaluate(()=>[playerInventory[16],furnaceHasHeat([0,80,0])]),[9,true]);
  await page.getByRole('button',{name:'Smelt one Iron Ingot',exact:true}).click();assert.deepEqual(await page.evaluate(()=>[playerInventory[36],playerInventory[IRON_INGOT]]),[4,1]);
  await page.getByRole('button',{name:'Smelt all Iron Ingot',exact:true}).click();assert.deepEqual(await page.evaluate(()=>[playerInventory[36],playerInventory[IRON_INGOT]]),[0,5]);
  assert(await page.getByRole('button',{name:'Smelt one Iron Ingot',exact:true}).isDisabled());
  await page.getByRole('button',{name:'Smelt all Gold Ingot',exact:true}).click();await page.getByRole('button',{name:'Smelt all Silver Ingot',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>[playerInventory[GOLD_INGOT],playerInventory[SILVER_INGOT]]),[2,3]);
  console.log('PASS: actual furnace, torch crafting/placement, single and batch smelting with exact inventory accounting.');
  for(const viewport of [{width:1200,height:820},{width:390,height:844},{width:320,height:740}]){
   await page.setViewportSize(viewport);await page.waitForTimeout(100);
   await page.evaluate(()=>{buildChunkMesh(0,0);buildChunkMesh(-1,0);scene.fog=null;ambientLight.intensity=.8;renderer.render(scene,camera);});
   const overflow=await page.locator('#home-panel .world-dialog').evaluate(el=>el.scrollWidth>el.clientWidth+1||el.getBoundingClientRect().right>innerWidth||[...el.querySelectorAll('button')].some(b=>b.scrollWidth>b.clientWidth+1));assert(!overflow,'Furnace layout fits '+viewport.width);
   await page.screenshot({path:'/private/tmp/furnace-'+viewport.width+'.png'});
  }
  console.log(await page.evaluate(()=>{
   closeFurniturePanel(false);controls.isLocked=true;playerInventory[36]=2;currentBlock=36;camera.updateMatrixWorld(true);
   document.dispatchEvent(new MouseEvent('mousedown',{button:2}));forgeCheck(playerInventory[36]===1&&playerInventory[IRON_INGOT]===6,'Original held-ore right click remains compatible');
   const before=playerInventory[36];forgeCheck(!smeltOreAt([0,80,0],36,-1)&&playerInventory[36]===before,'Reject invalid quantity');
   camera.position.x=40;forgeCheck(!smeltOreAt([0,80,0],36)&&playerInventory[36]===before,'Cannot operate a distant furnace');camera.position.x=0;
   currentBlock=0;camera.updateMatrixWorld(true);document.dispatchEvent(new MouseEvent('mousedown',{button:2}));setBlock(0,80,0,0);
   document.querySelector('[aria-label="Smelt one Iron Ingot"]').click();forgeCheck(playerInventory[36]===before&&document.getElementById('home-panel').hidden,'Destroyed furnace cannot consume ore');
   setBlock(0,80,0,13);playerInventory[36]=130;forgeCheck(smeltOreAt([0,80,0],36,130)===64&&playerInventory[36]===66,'Batch bounded at one stack');
   currentBlock=IRON_INGOT;setWorkbench(null);controls.isLocked=false;isInventoryOpen=true;inventoryUI.style.display='block';blocker.style.display='flex';document.getElementById('pause-menu').style.display='none';chooseCatalogItem(IRON_INGOT);
   forgeCheck(document.getElementById('catalog-recipes').textContent.includes('Iron Ore x1 -> Iron Ingot x1'),'Inventory shows the smelting conversion');
   return 'PASS: compatibility, missing furnace, range, batch limits and visible ingot recipe.';
  }));
  await page.locator('#catalog-recipes').getByRole('button',{name:'Furnace',exact:true}).click();assert(await page.getByRole('heading',{name:'Furnace',exact:true}).isVisible());
  console.log(await page.evaluate(()=>{
   closeFurniturePanel(false);controls.isLocked=true;isInventoryOpen=false;camera.position.set(0,81,4);camera.rotation.set(0,0,0);camera.updateMatrixWorld(true);currentBlock=34;playerInventory[34]=1;
   setBlock(0,81,1,36);document.dispatchEvent(new MouseEvent('mousedown',{button:0}));forgeCheck(miningState?.duration===.28,'Actual ore hit uses fast pickaxe');
   updateMining(.14);forgeCheck(getBlock(0,81,1)===36&&miningState.progress===.5&&miningState.crackMesh,'Fast mining still displays progressive cracks');
   updateMining(.15);forgeCheck(getBlock(0,81,1)===0&&!miningState&&droppedItems.some(d=>d.itemType===36),'Fast mined ore drops a collectible');
   setBlock(0,81,1,3);document.dispatchEvent(new MouseEvent('mousedown',{button:0}));updateMining(.05);document.dispatchEvent(new MouseEvent('mouseup',{button:0}));forgeCheck(!miningState&&getBlock(0,81,1)===3,'Early release still cancels digging');
   setBlock(12,75,12,0);forgeCheck(getBlock(12,75,12)===0,'Richer geology does not refill an excavated cell');
   return 'PASS: actual mining timing, crack progress, drops, cancellation and preservation of edited terrain.';
  }));
  assert.deepEqual(errors,[]);console.log('PASS: easier mining and smelting.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
