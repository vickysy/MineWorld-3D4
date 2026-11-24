const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.setDefaultNavigationTimeout(120000);
  await page.addInitScript(()=>requestAnimationFrame=()=>0);await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
  await page.waitForFunction(()=>expansionReady&&typeof generateDesertTemple==='function',null,{polling:50});
  await page.getByRole('button',{name:'Creative',exact:true}).click();await page.getByRole('button',{name:'Plains',exact:true}).click();await page.getByRole('button',{name:'Start Game',exact:true}).click();await page.waitForFunction(()=>controls.isLocked,null,{polling:50});
  await page.keyboard.press('e');
  for(const [query,id] of [['掠夺者',245],['监守者',246],['马刷怪蛋',247],['木剑',241],['石剑',242],['金剑',243],['蓝宝石剑',244]]){
   await page.locator('#catalog-search').fill(query);assert(await page.locator('#inv-'+(id-12)).isVisible(),query);await page.locator('#inv-'+(id-12)).click();await page.locator('#inventory-hotbar [data-index="0"]').click();assert.equal(await page.evaluate(()=>currentBlock),id);
  }
  await page.keyboard.press('e');
  console.log(await page.evaluate(async()=>{
   window.ok=(v,s)=>{if(!v)throw Error(s);};window.resetAdventure=()=>{
    clearCombatState();clearExpansionWorld();for(const d of droppedItems)disposeModModel(d.mesh);droppedItems.length=0;worldMap.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();chunkScanYRanges.clear();heightCache.clear();
    for(const ms of chunkMeshes.values())for(const m of Object.values(ms))releaseChunkMesh(m);chunkMeshes.clear();rebuildQueue.clear();
    for(const list of [villagers,animals,zombies,creepers,endermen]){for(const m of list)disposeModModel(m.mesh);list.length=0;}
    currentDimension='overworld';selectedTerrain='plains';getSurfaceHeight=()=>79;isGameStarted=true;gameMode='creative';gameDifficulty='normal';isSleeping=false;isInventoryOpen=false;isRespawning=false;controls.isLocked=true;health=maxHealth;playerScale=1;activeMech=null;resetPlayerFlight();
    for(let x=-30;x<=30;x++)for(let z=-30;z<=30;z++)setGenBlock(x,79,z,1);
    camera.position.set(0,81.3,4);camera.lookAt(0,80.5,0);camera.updateMatrixWorld(true);blocker.style.display=inventoryUI.style.display='none';heldItemGroup.visible=true;scene.fog=null;clouds.visible=false;scene.background=new THREE.Color(0xa3cddf);document.getElementById('toast-msg').style.visibility='hidden';ambientLight.intensity=.65;dirLight.intensity=.6;
   };resetAdventure();
   await Promise.all(['pig','pig_hurt'].map(loadWorldAudio));const old=playWorldRecording,calls=[];playWorldRecording=(kind,opts)=>{calls.push({kind,...opts});return true;};
   try{const pig={type:'pig',mesh:{position:camera.position.clone()},voiceTimer:0};updateAnimalVoice(pig,.1);playMobVoice(pig);ok(calls[0].kind==='pig'&&calls[0].gain>=.5,'Audible pig idle');ok(calls[1].kind==='pig'&&calls[1].duration<=.5,'Short grunt replaces angry squeal');}finally{playWorldRecording=old;}
   currentBlock=0;updateHeldItem3D(0);ok(heldItemGroup.children[0].userData.emptyHand,'Visible empty hand');document.dispatchEvent(new MouseEvent('mousedown',{button:0}));updateHandSwing(.08);const raised=heldItemGroup.position.y;updateHandSwing(.17);ok(heldItemGroup.position.y<raised-.2,'Hand swings from raised to lowered');updateHandSwing(.2);ok(handSwing===0&&heldItemGroup.rotation.x===0,'Hand returns to rest');
   camera.position.set(0,80,4);camera.lookAt(0,80,0);camera.updateMatrixWorld(true);for(let z=-1;z<=4;z++)for(let y=80;y<=81;y++)setGenBlock(0,y,z,0);setGenBlock(0,80,0,3);setGenBlock(0,80,-1,3);
   document.dispatchEvent(new MouseEvent('mousedown',{button:0}));document.dispatchEvent(new MouseEvent('mousedown',{button:0}));ok(getBlock(0,80,0)===0&&getBlock(0,80,-1)===0,'Attack cooldown must not slow Creative block mining: '+JSON.stringify({front:getBlock(0,80,0),rear:getBlock(0,80,-1),cooldown:handCooldown}));resetAdventure();
   spawnAnimal('sheep',0,80,0);const sheep=animals[0];camera.position.set(0,81,2.5);camera.lookAt(0,80.5,0);camera.updateMatrixWorld(true);
   document.dispatchEvent(new MouseEvent('mousedown',{button:0}));ok(sheep.hp===7&&sheep.panicTime===4&&!sheep.dying,'First punch starts flight without killing');
   document.dispatchEvent(new MouseEvent('mousedown',{button:0}));ok(sheep.hp===7,'Spam cannot multiply damage');const before=sheep.mesh.position.clone();for(let i=0;i<45;i++){updateEntities(1/60);updateHandSwing(1/60);}ok(sheep.mesh.position.distanceTo(before)>2,'Sheep runs away');
   camera.lookAt(sheep.mesh.position);camera.updateMatrixWorld(true);document.dispatchEvent(new MouseEvent('mousedown',{button:0}));ok(sheep.hp===7,'Out of reach requires chasing');
   for(let i=0;i<7;i++){sheep.hurtTimer=0;damageMob(sheep,1);}ok(sheep.dying,'Eight separate bare-handed hits');
   resetAdventure();spawnAnimal('cow',0,80,0);const cow=animals[0];camera.position.set(0,81,3);camera.lookAt(0,80.5,0);camera.updateMatrixWorld(true);for(let y=80;y<=82;y++)setGenBlock(0,y,1,3);currentBlock=0;document.dispatchEvent(new MouseEvent('mousedown',{button:0}));ok(cow.hp===10,'Melee cannot hit through wall');
   resetAdventure();gameMode='survival';setGenBlock(2,80,4,12);setWorkbench([2,80,4]);
   for(const [id,material] of [[WOOD_SWORD,OAK_PLANKS_ID],[STONE_SWORD,3],[GOLD_SWORD,GOLD_INGOT],[SAPPHIRE_SWORD,38]]){
    craftingGrid=[material,material,4,0,0,0,0,0,0];checkRecipes();ok(craftingOutput.id===id,'Workbench recipe '+id);
    const model=buildWeaponModel(id);ok(model.geometry.attributes.position.count>200&&new Set(weaponPattern(id).grid.flat().filter(Boolean)).size>=4,'Pixel silhouette and dimensional weapon '+id);disposeModModel(model);
   }
   craftingGrid.fill(0);setWorkbench(null);camera.position.set(0,81,4);camera.lookAt(0,79.5,0);camera.updateMatrixWorld(true);currentBlock=HORSE_EGG;playerInventory[HORSE_EGG]=2;
   document.dispatchEvent(new MouseEvent('mousedown',{button:2}));ok(animals.length===1&&animals[0].eggId===HORSE_EGG&&playerInventory[HORSE_EGG]===1,'Actual horse egg consumes once: '+JSON.stringify({count:animals.length,inventory:playerInventory[HORSE_EGG],toast:document.getElementById('toast-msg').textContent,ray:expansionRay(),locked:controls.isLocked}));
   document.dispatchEvent(new MouseEvent('mousedown',{button:2}));ok(animals.length===1&&playerInventory[HORSE_EGG]===1,'Occupied spot does not consume egg');
   ok(!spawnAdventureMob(HORSE_EGG,1,80,4),'Horse cannot spawn through workbench');
   const snapshot=snapshotDimension();ok(snapshot.companions.some(m=>m.id===HORSE_EGG),'Horse saved across dimension travel');
   const jumpingHorse=animals[0];jumpingHorse.mesh.position.y+=2;jumpingHorse.hp=17;
   const save=getWorldSaveData(),file=new File([JSON.stringify(save)],'adventure.json',{type:'application/json'});
   await new Promise((resolve,reject)=>loadSaveFile({target:{files:[file]}},e=>e?reject(e):resolve()));
   ok(animals.some(m=>m.eggId===HORSE_EGG&&m.hp===17&&m.mesh.position.y===82),'Actual save/load preserves jumping horse and health');
   return 'PASS: catalog, louder pig grunt, visible swinging hand, fleeing animals, real reach, hit cooldown and walls.';
  }));
  console.log(await page.evaluate(()=>{
   resetAdventure();spawnAnimal('horse',0,80,0);const horse=animals[0];currentBlock=0;camera.position.set(0,81.4,3);camera.lookAt(0,81,0);camera.updateMatrixWorld(true);document.dispatchEvent(new MouseEvent('mousedown',{button:2}));ok(ridingHorse===horse,'Right click mounts actual horse');ok(!canCreativeFly(),'No flight on horseback');
   camera.rotation.set(0,0,0);moveForward=true;for(let i=0;i<30;i++)updatePlayerMovement(1/60);moveForward=false;ok(horse.mesh.position.z< -2,'W moves horse');ok(Math.abs(camera.position.y-horse.mesh.position.y-2.1)<.001,'Camera follows saddle');
   const y=horse.mesh.position.y;holdingSpace=true;for(let i=0;i<15;i++)updatePlayerMovement(1/60);ok(horse.mesh.position.y>y+.8,'Horse jumps');for(let i=0;i<60;i++)updatePlayerMovement(1/60);
   for(let x=-4;x<=4;x++)for(let z=-10;z<=-6;z++)setGenBlock(x,80,z,3);moveForward=true;for(let i=0;i<75;i++)updatePlayerMovement(1/60);moveForward=false;ok(horse.mesh.position.z<-6&&horse.mesh.position.y>80.99,'Ride up one block');
   for(let x=-5;x<=5;x++)for(let y=80;y<=84;y++)setGenBlock(x,y,-12,3);moveForward=true;for(let i=0;i<120;i++)updatePlayerMovement(1/60);moveForward=false;ok(horse.mesh.position.z>-10.56&&!mobBodyBlocked(horse.mesh.position,3,.95),'Horse and rider stop at wall');
   document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyE'}));ok(!ridingHorse&&!checkScaledCollision(camera.position),'E safely dismounts');
   const mesh=createRemotePlayer();updateRemoteAppearance(mesh,{held:SAPPHIRE_SWORD,riding:'horse',scale:1});ok(mesh.userData.horse&&mesh.userData.held.userData.weaponId===SAPPHIRE_SWORD,'Remote rider and exact weapon');updateRemoteAppearance(mesh,{held:0,scale:1});ok(!mesh.userData.horse,'Remote dismount removes mount');disposeModModel(mesh);
   resetAdventure();spawnAnimal('horse',0,80,0);ok(mountHorse(animals[0]),'Mount before blocked dismount test');
   ok(!drinkShrinkPotion()&&playerScale===1&&!enterMech(71)&&!activeMech,'Cannot resize or transform while mounted');sitInChair({key:'test',x:0,y:80,z:3});ok(!seatedAt,'Cannot sit while mounted');
   for(let x=-5;x<=5;x++)for(let z=-5;z<=5;z++)if(x||z)for(let y=80;y<86;y++)setGenBlock(x,y,z,3);
   ok(!dismountHorse()&&ridingHorse,'Blocked dismount stays mounted');clearAdventureMobs();ok(!ridingHorse&&!adventureMobs.length,'Reset releases mount');
   return 'PASS: mounting, steering, jumping, one-block step, walls, safe/blocked dismount and remote appearance.';
  }));
  console.log(await page.evaluate(()=>{
   resetAdventure();camera.position.set(0,81,8);let p=spawnAdventureMob(PILLAGER_EGG,0,80,0);gameMode='survival';p.attackTimer=0;updateAdventureMobs(.02);ok(flyingArrows.some(a=>a.enemy),'Pillager shoots visible crossbow arrow');for(let i=0;i<60;i++)updateFlyingArrows(1/60);ok(health<maxHealth,'Pillager arrow hits player');
   clearFlyingArrows();health=maxHealth;p.attackTimer=0;for(let y=80;y<=83;y++)setGenBlock(0,y,4,3);updateAdventureMobs(.05);ok(!flyingArrows.length,'Pillager cannot shoot through wall');
   resetAdventure();let w=spawnAdventureMob(WARDEN_EGG,0,80,0);camera.position.set(0,81,10);adventurePlayerLast.copy(camera.position);gameMode='survival';updateAdventureMobs(.05);ok(w.vz===0&&w.heard===0,'Still player outside sniff range does not attract blind Warden');
   camera.position.z-=.1;updateAdventureMobs(.05);ok(w.heard>0&&w.vz>0,'Warden hears footsteps and approaches');
   gameMode='creative';camera.position.set(0,81,1.6);w.attackTimer=0;for(let i=0;i<60;i++)updateAdventureMobs(1/60);ok(health===maxHealth,'Creative is safe');gameMode='survival';gameDifficulty='peaceful';for(let i=0;i<60;i++)updateAdventureMobs(1/60);ok(health===maxHealth,'Peaceful is safe');
   gameDifficulty='normal';w.attackTimer=0;updateAdventureMobs(.05);ok(health<maxHealth,'Close Warden melee attack');
   const data=getWorldSaveData();ok(data.spawnedMobs.some(m=>m.id===WARDEN_EGG),'New egg mobs save');
   return 'PASS: pillager projectile/collision, Warden hearing, Survival threats and Creative/Peaceful safety.';
  }));
  console.log(await page.evaluate(()=>{
   resetAdventure();worldMap.clear();getSurfaceHeight=()=>79;const site={x:0,y:79,z:0,kind:'desert',rx:0,rz:0};ok(generateRuin(site),'Build expanded temple');
   // Flood-fill walking cells with one-block steps and two clear cells of headroom.
   const start=[0,80,13],queue=[start],seen=new Set([start.join(',')]);
   for(let i=0;i<queue.length;i++){const [x,y,z]=queue[i];for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])for(const dy of [0,1,-1]){
    const nx=x+dx,ny=y+dy,nz=z+dz,key=[nx,ny,nz].join(',');if(Math.abs(nx)>13||Math.abs(nz)>14||ny<72||ny>94||seen.has(key))continue;
    if(isSolid(nx,ny-1,nz)&&!isSolid(nx,ny,nz)&&!isSolid(nx,ny+1,nz)&&(!dy||!isSolid(x,Math.max(y,ny)+1,z))){seen.add(key);queue.push([nx,ny,nz]);}
   }}
   for(const [x,y,z] of [[0,80,-2],[7,84,-5],[-3,72,0],[3,72,0],[0,72,-3],[0,72,3]]){const c=furnitureRecord(x,y,z);ok(c?.id===CHEST_ID&&chestSlots(c.data).filter(Boolean).length>=4,'Real chest on each floor');ok([[1,0],[-1,0],[0,1],[0,-1]].some(([a,b])=>seen.has([x+a,y,z+b].join(','))),'Chest is reachable from entrance on floor '+y);}
   for(let x=-5;x<=5;x++)for(let z=-5;z<=5;z++)ok(isSolid(x,71,z),'Solid vault floor');
   ok(getBlock(9,87,12)===175&&getBlock(0,94,0)===SANDSTONE,'Tower motif and pyramid apex');
   const chest=furnitureRecord(7,84,-5);chestTransfer(chest,0,'take',chestSlots(chest.data)[0].id,64);generateRuin(site);ok(!chestSlots(chest.data)[0],'No regenerating treasure');
   for(let x=-1;x<=0;x++)for(let z=-1;z<=1;z++)buildChunkMesh(x,z);syncFurnitureMeshes();heldItemGroup.visible=false;camera.position.set(25,100,30);camera.lookAt(0,85,0);renderer.render(scene,camera);
   const gl=renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4),colors=new Set();gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);for(let i=0;i<pixels.length;i+=256)colors.add(pixels.slice(i,i+3).join(','));ok(colors.size>32&&renderer.info.render.triangles>1000,'Temple pixels visible: '+colors.size);return {reachableCells:seen.size,templeColors:colors.size};
  }));
  await page.screenshot({path:'/private/tmp/mc-adventure-temple.png'});
  await page.evaluate(()=>{resetAdventure();for(let x=-1;x<=0;x++)for(let z=-1;z<=0;z++)buildChunkMesh(x,z);spawnAdventureMob(PILLAGER_EGG,-2,80,0);spawnAdventureMob(WARDEN_EGG,1,80,0);spawnAnimal('horse',4,80,0);camera.position.set(0,82.5,8);camera.lookAt(1,81,0);currentBlock=SAPPHIRE_SWORD;updateHeldItem3D(currentBlock);updateHandSwing(0);renderer.render(scene,camera);});
  await page.screenshot({path:'/private/tmp/mc-adventure-mobs.png'});
  await page.evaluate(()=>{currentBlock=0;updateHeldItem3D(0);updateHandSwing(0);renderer.render(scene,camera);});await page.screenshot({path:'/private/tmp/mc-adventure-hand.png'});
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>renderer.domElement.clientWidth===390,null,{polling:50});
  const mobile=await page.evaluate(()=>{
   camera.position.set(1,84,16);camera.lookAt(1,81,0);updateHandSwing(0);renderer.render(scene,camera);
   const gl=renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4),colors=new Set();gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);for(let i=0;i<pixels.length;i+=256)colors.add(pixels.slice(i,i+3).join(','));
   for(const m of [...adventureMobs,...animals]){const c=new THREE.Box3().setFromObject(m.mesh).getCenter(new THREE.Vector3()).project(camera);ok(Math.abs(c.x)<.95&&Math.abs(c.y)<.95,'All three models framed on mobile');}
   return {colors:colors.size,triangles:renderer.info.render.triangles};
  });await page.screenshot({path:'/private/tmp/mc-adventure-mobile.png'});assert(mobile.colors>32&&mobile.triangles>500,JSON.stringify(mobile));console.log({mobile});
  assert.deepEqual(errors,[]);console.log('PASS: desktop/mobile views and no browser exceptions.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
