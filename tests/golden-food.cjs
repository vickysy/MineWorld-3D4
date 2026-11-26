const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const foodSource=fs.readFileSync(path.join(root,'golden-food.js'),'utf8');

function unitTests(){
 const context={APPLE:196,health:5,maxHealth:9,hunger:2,maxHunger:9,foodProtectionTimer:0,DAY_SECONDS:1200,
  active:true,creative:false,inventory:{252:5,39:2,40:2,196:2},document:{getElementById:()=>null},
  updateHUD(){},resetFoodTimers(){}};
 context.playerIsActive=()=>context.active;context.isCreativeMode=()=>context.creative;
 context.consumeInventoryItem=id=>context.creative||context.inventory[id]>0&&!!context.inventory[id]--;
 vm.createContext(context);vm.runInContext(foodSource+'\nthis.effects=goldenFoodEffects;',context);
 assert(context.consumeAnimatedFood(252));assert.equal(context.hunger,4);assert.equal(context.foodProtectionTimer,0);
 assert.equal(context.health,5);context.updateGoldenFoodEffects(1.25);assert.equal(context.health,5.5);
 context.active=false;const paused=JSON.stringify(context.saveGoldenFoodEffects());context.updateGoldenFoodEffects(400);
 assert.equal(JSON.stringify(context.saveGoldenFoodEffects()),paused);context.active=true;
 const saved=JSON.parse(paused);context.resetGoldenFoodEffects();context.restoreGoldenFoodEffects(saved);
 assert.equal(JSON.stringify(context.saveGoldenFoodEffects()),paused);
 assert.equal(context.absorbGoldenFoodDamage(1.5),0);assert.equal(context.effects.absorption,.5);
 assert.equal(context.absorbGoldenFoodDamage(1),.5);assert.equal(context.effects.absorption,0);
 context.updateGoldenFoodEffects(3.75);assert.equal(context.health,7);assert.equal(context.effects.regeneration,0);
 context.consumeAnimatedFood(252);context.consumeAnimatedFood(252);assert.equal(context.effects.absorption,2);
 context.updateGoldenFoodEffects(1000);assert.equal(context.effects.absorption,0);assert.equal(context.health,9);
 for(const id of [39,40,196]){context.hunger=1;context.consumeAnimatedFood(id);assert.equal(context.hunger,9);assert.equal(context.foodProtectionTimer,1200);}
 context.restoreGoldenFoodEffects({regeneration:1e10,regenerationElapsed:1e10,absorption:1e10,absorptionSeconds:1e10});
 assert.equal(context.effects.regeneration,5);assert.equal(context.effects.absorption,2);assert.equal(context.effects.absorptionSeconds,120);
 context.restoreGoldenFoodEffects({regeneration:NaN,regenerationElapsed:-5,absorption:Infinity,absorptionSeconds:'120'});
 assert(Object.values(context.effects).every(n=>n===0));
 context.restoreGoldenFoodEffects(saved);context.creative=true;context.updateGoldenFoodEffects(.1);assert(Object.values(context.effects).every(n=>n===0));
 context.creative=false;context.hunger=context.maxHunger;context.inventory[252]=1;
 assert(context.consumeAnimatedFood(252),'Golden Apple can be eaten at full hunger');assert.equal(context.hunger,context.maxHunger);
 const full=JSON.stringify(context.saveGoldenFoodEffects());context.updateGoldenFoodEffects(NaN);context.updateGoldenFoodEffects(-1);
 assert.equal(JSON.stringify(context.saveGoldenFoodEffects()),full);assert(!context.consumeAnimatedFood(252),'Empty inventory cannot grant another effect');
 assert.equal(JSON.stringify(context.saveGoldenFoodEffects()),full);
 assert(!context.isAnimatedFood(249)&&!context.isAnimatedFood(250)&&!context.isAnimatedFood(251));
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/audio/world/source.json'),'utf8'));
 const audio=vm.runInNewContext(fs.readFileSync(path.join(root,'world-audio-data.js'),'utf8')+';WORLD_AUDIO_DATA');
 const notices=fs.readFileSync(path.join(root,'THIRD_PARTY_NOTICES.txt'),'utf8');
 for(const kind of ['dirt_step','dirt_break','sand'])for(const [i,file] of manifest.entries[kind].entries()){
  const original=fs.readFileSync(path.join(root,'assets/audio/world',file));
  assert.equal(original.subarray(0,4).toString(),'OggS');assert.deepEqual(Buffer.from(audio[kind][i],'base64'),original);
  assert(notices.includes(file)||/default_(sand|dirt)_footstep\.[12]\.ogg/.test(file));
 }
 assert(notices.includes('worthahep88, CC0'));assert(notices.includes('Mito551, CC BY-SA 3.0'));
 console.log('PASS: bounded, pause-safe, persisted normal-apple effects; meat/apple compatibility; licensed recording integrity.');
}

async function browserTests(){
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
 const browser=await chromium.launch({headless:process.env.HEADED!=='1',executablePath:process.env.CHROME_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[],failed=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error('Page error:',e.message);});page.on('requestfailed',r=>failed.push(r.url()));
  await page.addInitScript(()=>requestAnimationFrame=()=>0);
  await page.goto(process.env.GAME_URL||pathToFileURL(path.join(root,'game3d.html')).href,{timeout:120000});
  await page.bringToFront();
  assert(await page.evaluate(()=>typeof initGoldenFood==='function'),'Main HTML must load golden-food.js');
  assert.equal(await page.locator('#inv-240').count(),1,'Golden Apple registered once');
  assert(await page.evaluate(()=>!EDIBLE_GARDEN.has(GOLDEN_APPLE)),'Golden Apple is not a garden-harvest reward');
  await page.getByRole('button',{name:'Creative',exact:true}).click();
  await page.getByRole('button',{name:'Plains',exact:true}).click();
  await page.getByRole('button',{name:'Start Game',exact:true}).click();
  try{await page.waitForFunction(()=>controls.isLocked&&!worldLoading,null,{polling:50});}
  catch(error){console.error('Start state:',await page.evaluate(()=>({started:isGameStarted,locked:controls.isLocked,loading:worldLoading,toast:document.getElementById('toast-msg')?.textContent})));throw error;}
  await page.keyboard.press('e');
  for(const query of ['Golden Apple','golden_apple','\u91d1\u82f9\u679c']){
   await page.locator('#catalog-search').fill(query);assert(await page.locator('#inv-240').isVisible());
  }
  assert.equal(await page.locator('#inv-240').evaluate(el=>el.parentElement.id),'tab-food');
  assert(await page.locator('#inv-240 img').evaluate(img=>img.complete&&img.naturalWidth===16));
  await page.locator('#inv-240').click();await page.locator('#catalog-amount').fill('7');
  await page.locator('#inventory-hotbar [data-index="0"]').click();
  assert.deepEqual(await page.evaluate(()=>hotbarItems[0]),{id:252,count:7});
  await page.keyboard.press('e');
  await page.evaluate(()=>{
   window.resetGoldenTest=()=>{
    cancelEating();clearCombatState();resetSurvivalState();gameMode='survival';setDifficulty('normal');
    isSleeping=isRespawning=worldLoading=false;controls.isLocked=true;isInventoryOpen=false;
    inventoryUI.style.display=blocker.style.display='none';document.getElementById('home-panel').hidden=true;
    playerScale=1;camera.position.set(0,180,0);camera.rotation.set(0,0,0);camera.updateMatrixWorld(true);
    health=5;hunger=2;playerInventory={39:4,40:4,196:4,252:4};
    hotbarItems=[{id:252,count:4},{id:252,count:4},{id:3,count:4},...Array(6).fill(null)];selectHotbarIndex(0);updateHUD();
   };resetGoldenTest();
  });
  await page.mouse.move(600,300);await page.mouse.down({button:'left'});
  assert(await page.evaluate(()=>!eatingState&&playerInventory[252]===4),'Left click cannot eat a Golden Apple');await page.mouse.up({button:'left'});
  await page.mouse.down({button:'right'});
  assert.equal(await page.evaluate(()=>eatingState?.id),252,'Real right click starts eating');
  const held=await page.evaluate(()=>{const before=heldItemGroup.position.toArray();updateEating(.6);return {before,after:heldItemGroup.position.toArray(),crumbs:foodCrumbs.length,count:playerInventory[252],hunger};});
  assert.notDeepEqual(held.before,held.after);assert(held.crumbs>0);assert.equal(held.count,4);assert.equal(held.hunger,2);
  assert(await page.evaluate(()=>{const c=foodCrumbs[0],before=c.mesh.position.clone();updateEatingCrumbs(.1);return c.age===.1&&!c.mesh.position.equals(before);}), 'Per-frame crumbs move once');
  await page.mouse.up({button:'right'});
  assert(await page.evaluate(()=>!eatingState&&playerInventory[252]===4&&!foodCrumbs.length&&!foodCrumbRoot));
  await page.mouse.down({button:'right'});await page.evaluate(()=>updateEating(.7));await page.keyboard.press('2');
  await page.evaluate(()=>updateEating(1));await page.mouse.up({button:'right'});
  assert(await page.evaluate(()=>!eatingState&&playerInventory[252]===4),'Same food in another slot cancels');
  await page.mouse.down({button:'right'});await page.mouse.wheel(0,100);await page.evaluate(()=>updateEating(2));await page.mouse.up({button:'right'});
  assert(await page.evaluate(()=>!eatingState&&playerInventory[252]===4),'Wheel switching cancels');
  await page.keyboard.press('1');await page.mouse.down({button:'right'});await page.evaluate(()=>updateEating(.6));await page.keyboard.press('e');
  await page.evaluate(()=>updateEating(2));await page.mouse.up({button:'right'});
  assert(await page.evaluate(()=>!eatingState&&playerInventory[252]===4),'Inventory pause cancels without consuming');
  await page.keyboard.press('e');await page.waitForFunction(()=>controls.isLocked,null,{polling:50});
  await page.mouse.down({button:'right'});await page.evaluate(()=>{updateEating(.5);window.dispatchEvent(new Event('blur'));updateEating(2);});await page.mouse.up({button:'right'});
  assert(await page.evaluate(()=>!eatingState&&playerInventory[252]===4),'Window blur cancels');
  await page.mouse.down({button:'right'});
  await page.evaluate(()=>{for(let i=0;i<95;i++)updateEating(1/60);});assert.equal(await page.evaluate(()=>playerInventory[252]),4);
  await page.evaluate(()=>updateEating(1/60));await page.mouse.up({button:'right'});
  assert.deepEqual(await page.evaluate(()=>[playerInventory[252],hunger,health,goldenFoodEffects.absorption,foodProtectionTimer]),[3,4,5,2,0]);
  await page.evaluate(()=>{for(let i=0;i<200;i++)updateEating(1/60);});assert.equal(await page.evaluate(()=>playerInventory[252]),3,'One hold consumes once');
  assert(await page.locator('#golden-food-status').isVisible());
  await page.evaluate(()=>{takeDamage(1);});assert.deepEqual(await page.evaluate(()=>[health,goldenFoodEffects.absorption]),[5,1],'takeDamage uses absorption');
  await page.evaluate(()=>{takeDamage(2);});assert.deepEqual(await page.evaluate(()=>[health,goldenFoodEffects.absorption]),[4,0]);
  await page.evaluate(()=>updateSurvival(5));assert.equal(await page.evaluate(()=>health),6,'Golden regeneration works despite ordinary recovery delay');
  console.log('PASS: actual Creative catalog, search/hotbar, right-click 1.6s, release/switch/wheel/pause/blur, damage and HUD.');

  await page.evaluate(()=>{resetGoldenTest();playerInventory={223:8,196:1};setWorkbench(null);chooseCatalogItem(252);});
  await page.keyboard.press('e');
  assert(await page.locator('#catalog-recipes button').isDisabled(),'Workbench required');
  await page.evaluate(()=>{worldMap.set('1,179,0',12);setWorkbench([1,179,0]);chooseCatalogItem(252);});
  await page.locator('#catalog-recipes button').click();
  assert.deepEqual(await page.evaluate(()=>[playerInventory[223],playerInventory[196],playerInventory[252]]),[0,0,1],'Actual Craft consumes eight ingots and existing apple');
  assert(await page.locator('#catalog-recipes button').isDisabled());
  await page.evaluate(()=>{craftingGrid=Array(9).fill(GOLD_INGOT);craftingGrid[4]=APPLE;checkRecipes();});
  assert.equal(await page.evaluate(()=>craftingOutput.id),252,'Workbench 3x3 recipe accepts eight ingots around apple');
  await page.evaluate(()=>{craftingGrid[0]=37;checkRecipes();});assert.equal(await page.evaluate(()=>craftingOutput.id),0,'Gold ore is not an ingot');
  await page.evaluate(()=>{craftingGrid.fill(0);resetGoldenTest();consumeAnimatedFood(252);updateSurvival(.7);});
  const save=await page.evaluate(()=>getWorldSaveData());assert(save.goldenFoodEffects,'Effects wired into real save');
  await page.evaluate(data=>{resetGoldenFoodEffects();loadSaveFile({target:{files:[new File([JSON.stringify(data)],'golden-food.json',{type:'application/json'})],value:''}});},save);
  await page.waitForFunction(expected=>JSON.stringify(saveGoldenFoodEffects())===expected,JSON.stringify(save.goldenFoodEffects),{polling:50});
  assert.deepEqual(await page.evaluate(()=>saveGoldenFoodEffects()),save.goldenFoodEffects,'Real save file restores effects');
  await page.evaluate(()=>{controls.isLocked=false;updateSurvival(400);});assert.deepEqual(await page.evaluate(()=>saveGoldenFoodEffects()),save.goldenFoodEffects);
  await page.evaluate(()=>{controls.isLocked=true;respawnPlayer();});assert(await page.evaluate(()=>Object.values(goldenFoodEffects).every(n=>n===0)),'Death clears buffs');
  await page.waitForTimeout(800);
  await page.evaluate(()=>{resetGoldenTest();});
  for(const id of [39,40,196]){
   await page.evaluate(id=>{assignHotbar(0,id);hunger=1;health=5;foodProtectionTimer=0;},id);
   await page.mouse.down({button:'right'});await page.evaluate(()=>{for(let i=0;i<96;i++)updateEating(1/60);});await page.mouse.up({button:'right'});
   assert.deepEqual(await page.evaluate(id=>[playerInventory[id],hunger,health,foodProtectionTimer],id),[3,9,5,1200]);
  }
  for(const id of [39,40]){
   await page.evaluate(id=>assignHotbar(0,id),id);
   await page.mouse.down({button:'left'});
   assert.equal(await page.evaluate(()=>eatingState?.id),id,'Legacy left-click meat eating still starts');
   await page.mouse.up({button:'left'});
   assert(await page.evaluate(id=>!eatingState&&playerInventory[id]===3,id),'Releasing legacy input does not consume food');
  }
  await page.evaluate(()=>{assignHotbar(0,0);controls.isLocked=false;document.getElementById('cooked-meat-ui').style.display='block';});
  await page.getByRole('button',{name:'Eat Cooked Meat',exact:true}).click();await page.waitForFunction(()=>controls.isLocked,null,{polling:50});
  await page.evaluate(()=>{for(let i=0;i<96;i++)updateEating(1/60);});
  assert.deepEqual(await page.evaluate(()=>[playerInventory[40],currentBlock,eatingState]),[2,0,null],'Automatic cooked-meat prompt preserved');
  console.log('PASS: exact workbench recipe, real save-file round trip, pause/death effects, meat/day protection and cooked-meat prompt.');

  const audio=await page.evaluate(async()=>{
   await Promise.all(Object.keys(WORLD_AUDIO_DATA).map(loadWorldAudio));
   if(!Object.keys(WORLD_AUDIO_DATA).every(kind=>worldAudioBuffers.get(kind)?.length))throw Error('Recording decode failed');
   const record=playWorldRecording,calls=[];playWorldRecording=(kind,options)=>{calls.push({kind,...options});return true;};
   try{for(const id of [2,1,3,4,6,23,85,95])for(const action of ['hit','break','place','step'])playBlockSound(action,id);}finally{playWorldRecording=record;}
   const oldContext=audioCtx,oldOutput=soundOutput,oldReady=worldAudioReady,oldRandom=Math.random;
   clearWorldVoices();const clips=[];
   try{
    for(const action of ['old-hit','hit','break']){
     const offline=new OfflineAudioContext(1,44100,44100);audioCtx=offline;soundOutput=null;worldAudioReady=true;Math.random=()=>.5;
     // Offline rendering starts below, without the live context's gesture-based resume.
     offline.resume=()=>Promise.resolve();
     offline.createOscillator=()=>{throw Error('Dirt must not synthesize oscillators');};
     const started=action==='old-hit'?playWorldRecording('dirt_step',{gain:.105,rate:1,duration:.16,lowpass:3800}):playBlockSound(action,2);
     if(!started)throw Error('Dirt clip did not start');
     const data=(await offline.startRendering()).getChannelData(0);let peak=0,energy=0,difference=0,last=0;
     for(let i=1;i<data.length;i++){
      peak=Math.max(peak,Math.abs(data[i]));energy+=data[i]**2;difference+=(data[i]-data[i-1])**2;if(Math.abs(data[i])>1e-6)last=i;
     }
     clips.push({action,peak,rms:Math.sqrt(energy/data.length),brightness:difference/energy,duration:last/44100,voices:worldAudioVoices.size});
    }
   }finally{audioCtx=oldContext;soundOutput=oldOutput;worldAudioReady=oldReady;Math.random=oldRandom;}
   return {calls,clips};
  });
  assert.equal(audio.calls[0].kind,'sand');assert.equal(audio.calls[1].kind,'dirt_break');
  assert.equal(audio.calls[2].kind,'place');assert.equal(audio.calls[3].kind,'dirt_step');
  const expected=[['grass_step','grass_break','grass_step','grass_step'],['hard_place','stone','hard_place','stone_step'],
   ['wood_step','wood','wood','wood_step'],['glass_step','glass','glass_step','glass_step'],['sand','dirt_break','sand','sand'],
   ['hard_place','stone','hard_place','stone_step'],['hard_place','metal','hard_place','stone_step']];
  for(let i=0;i<expected.length;i++)assert.deepEqual(audio.calls.slice(4+i*4,8+i*4).map(c=>c.kind),expected[i]);
  for(const clip of audio.clips.slice(1)){assert(clip.peak<.3&&clip.rms>1e-5);assert(clip.duration>.05&&clip.duration<.3);assert.equal(clip.voices,0);}
  assert(audio.clips[1].brightness<audio.clips[0].brightness,'Dirt hit removes high-frequency rasp');
  console.log('PASS: every embedded audio file decoded; no dirt oscillator; unchanged other material routes; offline dirt metrics:',audio.clips);

  await page.evaluate(()=>{resetGoldenTest();scene.background=new THREE.Color(0x87bbd1);scene.fog=null;ambientLight.intensity=.75;dirLight.intensity=.8;
   document.getElementById('info-panel').style.visibility='hidden';document.getElementById('toast-msg').style.visibility='hidden';
   for(const id of ANIMATED_FOOD){updateHeldItem3D(id);renderer.render(scene,camera);}updateHeldItem3D(252);renderer.render(scene,camera);
  });
  const memory=await page.evaluate(()=>({...renderer.info.memory}));
  await page.evaluate(()=>{for(let i=0;i<30;i++){startEating(252);updateEating(.4);renderer.render(scene,camera);cancelEating();renderer.render(scene,camera);}});
  const after=await page.evaluate(()=>({...renderer.info.memory}));assert(after.geometries<=memory.geometries+1);assert(after.textures<=memory.textures+1);
  for(const viewport of [{width:1200,height:850,fov:90},{width:390,height:844,fov:90},{width:320,height:740,fov:105},{width:1200,height:850,fov:75}]){
   await page.setViewportSize({width:viewport.width,height:viewport.height});await page.waitForFunction(width=>renderer.domElement.width===width,viewport.width,{polling:50});
   await page.evaluate(fov=>{if(typeof setViewFov==='function')setViewFov(fov,false);else{camera.fov=fov;camera.updateProjectionMatrix();}},viewport.fov);
   const pixels=await page.evaluate(()=>{
    cancelEating();updateHeldItem3D(252);heldItemGroup.visible=true;
    const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,a=new Uint8Array(w*h*4),b=new Uint8Array(w*h*4);
    heldItemGroup.visible=false;renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);
    heldItemGroup.visible=true;startEating(252);updateEating(.45);renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);
    let changed=0,gold=0;for(let i=0;i<a.length;i+=4){if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2]){changed++;if(b[i]>130&&b[i+1]>90&&b[i]>b[i+2]*1.3)gold++;}}
    consumeAnimatedFood(252);updateGoldenFoodHUD();return {changed,gold};
   });
   assert(pixels.changed>100&&pixels.gold>50,'Visible gold food in '+JSON.stringify(viewport));
   assert(await page.locator('#golden-food-status').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
   await page.screenshot({path:`/private/tmp/golden-food-${viewport.width}-${viewport.fov}.png`});
  }
  await page.evaluate(()=>{cancelEating();resetSurvivalState();});
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  console.log('PASS: desktop/mobile eating pixels, HUD fit, bounded crumbs and GPU resource cleanup, no page/resource errors.');
 }finally{await browser.close();}
}
unitTests();
if(!process.argv.includes('--unit'))browserTests().catch(error=>{console.error(error);process.exitCode=1;});
