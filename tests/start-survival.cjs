const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>requestAnimationFrame=()=>0);
  const opened=Date.now();await page.goto(url,{timeout:120000});
  await page.waitForFunction(()=>!!menuPanorama&&document.getElementById('world-loading').hidden,null,{polling:50});
  console.log('Initial menu ms:',Date.now()-opened);
  const pixels=()=>page.evaluate(()=>{
   renderStartPanorama(0);
   const gl=renderer.getContext(),data=new Uint8Array(160*100*4);
   gl.readPixels(Math.floor(gl.drawingBufferWidth*.6),Math.floor(gl.drawingBufferHeight*.3),160,100,gl.RGBA,gl.UNSIGNED_BYTE,data);
   const colors=new Set();for(let i=0;i<data.length;i+=4)colors.add(data[i]+','+data[i+1]+','+data[i+2]);return colors.size;
  });
  assert(await pixels()>20,'Real textured 3D menu, not blank');
  assert(await page.evaluate(()=>menuPanorama.world.getObjectByName('menu-tree-trunks').material===materials[4]&&menuPanorama.world.getObjectByName('menu-tree-leaves').material===materials[5]),'Menu uses the actual world wood/leaves materials');
  await page.screenshot({path:'/private/tmp/menu-desktop-final.png'});
  assert(await page.evaluate(()=>{
   renderStartPanorama(.01);const p=menuPanorama.view.position.clone(),q=menuPanorama.view.quaternion.clone(),snow=menuPanorama.flakes[1];
   for(let i=0;i<120;i++)renderStartPanorama(1/60);
   return p.equals(menuPanorama.view.position)&&!q.equals(menuPanorama.view.quaternion)&&snow!==menuPanorama.flakes[1];
  }),'Stationary camera turns while snow falls');
  assert(await page.locator('.play-mode img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>0)),'Offline icons loaded');
  await page.getByRole('button',{name:'Play with Others',exact:true}).click();
  assert(await page.locator('#host-mode-btn').isVisible(),'Multiplayer remains accessible');
  await page.evaluate(()=>hideMultiplayerMenu());
  for(const viewport of [{width:390,height:844},{width:320,height:740},{width:844,height:390}]){
   await page.setViewportSize(viewport);await page.waitForTimeout(120);await page.evaluate(()=>renderStartPanorama(0));
   assert(await pixels()>20,'Menu pixels visible at '+JSON.stringify(viewport));
   const overflow=await page.evaluate(()=>{
    const menu=document.getElementById('start-menu');return menu.scrollWidth>menu.clientWidth+1||[...menu.querySelectorAll('button,select')].filter(e=>!e.hidden).some(e=>e.scrollWidth>e.clientWidth+2);
   });assert(!overflow,'Menu text fits '+JSON.stringify(viewport));
   if(viewport.width===390)await page.screenshot({path:'/private/tmp/menu-mobile-final.png'});
  }
  await page.setViewportSize({width:1200,height:800});
  for(const mode of ['Creative','Survival']){
   await page.getByRole('button',{name:mode,exact:true}).click();
   for(const difficulty of ['easy','normal','hard','peaceful']){
    await page.locator('#difficulty-select').selectOption(difficulty);
    assert.deepEqual(await page.evaluate(()=>[gameMode,gameDifficulty]),[mode.toLowerCase(),difficulty]);
   }
  }
  await page.locator('#difficulty-select').selectOption('hard');await page.locator('#terrain-select').selectOption('mountains');
  const start=Date.now();await page.getByRole('button',{name:'Start Game',exact:true}).click();
  await page.waitForFunction(()=>isGameStarted&&!worldLoading&&document.getElementById('world-loading').hidden,null,{polling:50});
  console.log('World ready ms:',Date.now()-start);assert(Date.now()-start<6000,'World loads under six seconds on this test machine');
  assert.deepEqual(await page.evaluate(()=>[gameMode,gameDifficulty,selectedTerrain,chunkMeshes.size>=9]),['survival','hard','mountains',true]);
  console.log(await page.evaluate(async()=>{
   const results=[],ok=(value,name)=>{if(!value)throw Error(name);results.push(name);};
   window.resetSurvivalTest=()=>{
    clearCombatState();clearExpansionWorld();worldMap.clear();heightCache.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();chunkScanYRanges.clear();restoreMicroEdits([]);
    selectedTerrain='plains';currentDimension='overworld';getSurfaceHeight=()=>-100;playerScale=1;activeMech=null;resetPlayerFlight();clearMovementInput();
    gameMode='survival';setDifficulty('normal');isGameStarted=true;isRespawning=false;controls.isLocked=true;isSleeping=false;worldLoading=false;
    health=maxHealth;hunger=maxHunger;velocity.set(0,0,0);camera.rotation.set(0,0,0);
    resetSurvivalState();for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++)worldMap.set(`${x},79,${z}`,3);
    camera.position.set(0,79.5+getPlayerHeight(),0);playerInventory={39:3,40:3};
   };
   resetSurvivalTest();
   for(const difficulty of ['easy','normal','hard']){
    setDifficulty(difficulty);health=maxHealth;hurtFeedbackTimer=0;takeDamage(1);ok(health===maxHealth-SURVIVAL_RULES[difficulty].damage,'Difficulty affects damage: '+difficulty);
    hunger=maxHunger;hungerTimer=0;foodProtectionTimer=0;
    for(let i=0;i<180;i++)updateSurvival(1);ok(hunger===maxHunger,'Hunger slower than old three-minute rule: '+difficulty);
   }
   resetSurvivalTest();health=5;hunger=9;for(let i=0;i<16;i++)updateSurvival(.5);ok(health===5.5,'Well-fed gradual regeneration');
   takeDamage(1);const damaged=health;for(let i=0;i<10;i++)updateSurvival(.5);ok(health===damaged,'No immediate regeneration after a hit');
   controls.isLocked=false;const timers=[hungerTimer,foodProtectionTimer,recoveryDelay];updateSurvival(120);ok(JSON.stringify(timers)===JSON.stringify([hungerTimer,foodProtectionTimer,recoveryDelay]),'Pause freezes survival');controls.isLocked=true;
   resetSurvivalTest();currentBlock=39;health=5;hunger=2;updateHeldItem3D(39);
   document.dispatchEvent(new MouseEvent('mousedown',{button:2,bubbles:true,cancelable:true}));ok(eatingState?.id===39,'Actual right-click begins eating raw meat');updateEating(.6);ok(playerInventory[39]===3&&hunger===2,'No food consumed before animation ends');
   document.dispatchEvent(new MouseEvent('mouseup',{button:2}));ok(!eatingState&&playerInventory[39]===3,'Releasing cancels without consuming');
   startEating(39);for(let i=0;i<100;i++)updateEating(1/60);ok(playerInventory[39]===2&&hunger===maxHunger&&health===5,'One meal completes once; health does not instantly fill');
   ok(foodProtectionTimer===DAY_SECONDS,'One meat keeps hunger full for a game day');
   for(let i=0;i<200;i++)updateEating(1/60);ok(playerInventory[39]===2,'No repeated consumption after completion');
   startEating(39);currentBlock=3;updateEating(.1);ok(!eatingState,'Changing item cancels eating');
   currentBlock=39;startEating(39);controls.isLocked=false;updateEating(.1);ok(!eatingState,'Pausing cancels eating');controls.isLocked=true;
   currentBlock=0;ok(eatCookedMeat(),'Cooked meat prompt begins animation even with empty hand');for(let i=0;i<100;i++)updateEating(1/60);ok(playerInventory[40]===2&&currentBlock===0,'Cooked prompt consumes one and restores held item');
   resetSurvivalTest();camera.position.y+=8;resetFallTracking(true);for(let i=0;i<120;i++)updatePlayerMovement(1/60);ok(health<maxHealth&&health>0,'High fall damages on landing');
   const landed=health;for(let i=0;i<90;i++)updatePlayerMovement(1/60);ok(health===landed,'Standing does not repeat fall damage');
   resetSurvivalTest();camera.position.y+=2;resetFallTracking(true);for(let i=0;i<120;i++)updatePlayerMovement(1/60);ok(health===maxHealth,'Short fall is safe');
   resetSurvivalTest();updatePlayerMovement(1/60);fallState.peak=150;camera.position.x=12;worldMap.set('12,79,0',3);for(let i=0;i<30;i++)updatePlayerMovement(1/60);ok(health===maxHealth,'Teleport never inherits previous falling height');
   resetSurvivalTest();gameMode='creative';camera.position.y+=12;resetFallTracking(true);for(let i=0;i<140;i++)updatePlayerMovement(1/60);ok(health===maxHealth,'Creative fall is safe');
   resetSurvivalTest();for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)for(let y=80;y<=82;y++)worldMap.set(`${x},${y},${z}`,24);
   camera.position.y+=10;resetFallTracking(true);for(let i=0;i<180;i++)updatePlayerMovement(1/60);ok(health===maxHealth,'Water catches a fall');
   resetSurvivalTest();playerScale=.05;updatePlayerScaleView();
   camera.position.set(0,79.5+getPlayerHeight()+.4,0);resetFallTracking(true);for(let i=0;i<150;i++)updatePlayerMovement(1/60);ok(health<maxHealth&&health>0,'Tiny fall damage uses the tiny block scale');
   resetSurvivalTest();takeDamage(1);hurtViewTime=.3;const quaternion=camera.quaternion.clone();
   renderPlayerView(camera);ok(camera.quaternion.equals(quaternion),'Damage tilt never modifies aim or physics camera');
   for(let i=0;i<60;i++)updateSurvival(1/60);ok(hurtViewTime===0,'Damage tilt settles');
   const source=playWorldRecording,calls=[];playWorldRecording=(kind,options)=>{calls.push({kind,...options});return true;};
   try{
    const entity={kind:'zombie',mesh:{position:camera.position.clone()}};
    for(const phase of ['idle','hurt','death'])playHostileVoice(entity,phase);
    entity.kind='pillager';for(const phase of ['idle','hurt'])playHostileVoice(entity,phase);
    entity.kind='creeper';startCreeperHiss(entity);playHostileVoice(entity,'death');
    ok(calls.map(c=>c.kind).join(',')==='zombie,zombie_hurt,zombie_death,pillager,pillager_hurt,creeper_fuse,creeper_death','Separate event-specific monster recordings');
    for(const id of [1,2,3,4,6,85,95])for(const action of ['hit','break','place'])playBlockSound(action,id);
    ok(calls.every(c=>WORLD_AUDIO_DATA[c.kind]),'All sound routes have offline recordings');
   }finally{playWorldRecording=source;}
   await Promise.all(Object.keys(WORLD_AUDIO_DATA).map(loadWorldAudio));
   ok(Object.keys(WORLD_AUDIO_DATA).every(k=>worldAudioBuffers.get(k)?.length),'Every recording decodes offline');
   clearWorldVoices();ok(!playWorldRecording('zombie',{position:camera.position.clone().add(new THREE.Vector3(100,0,0))}),'Far monsters silent');
   const c={kind:'creeper',mesh:{position:camera.position.clone()}};startCreeperHiss(c);const voices=worldAudioVoices.size;startCreeperHiss(c);ok(worldAudioVoices.size===voices&&c.stopHiss,'Fuse starts only once');stopCreeperHiss(c);ok(!c.stopHiss,'Aborted fuse stops audio');
   return results;
  }));
  await page.evaluate(()=>{
   resetSurvivalTest();currentBlock=39;updateHeldItem3D(39);
   worldMap.set('0,80,-2',13);worldMap.set('1,80,-2',16);
   camera.position.set(0,81,1);camera.lookAt(0,80,-2);camera.updateMatrixWorld(true);
  });
  await page.mouse.down({button:'right'});await page.mouse.up({button:'right'});
  console.log('Cooking input:',await page.evaluate(()=>({hit:expansionRay(),inventory:[playerInventory[39],playerInventory[40]],eating:eatingState,locked:controls.isLocked,prompt:document.getElementById('cooked-meat-ui').style.display})));
  await page.locator('#cooked-meat-ui').waitFor({state:'visible'});
  assert.deepEqual(await page.evaluate(()=>[playerInventory[39],playerInventory[40],eatingState]),[2,4,null],'Right-click furnace cooks instead of eating');
  await page.getByRole('button',{name:'Eat Cooked Meat',exact:true}).click();
  await page.waitForFunction(()=>controls.isLocked,null,{polling:50});
  assert(await page.evaluate(()=>{for(let i=0;i<100;i++)updateEating(1/60);return playerInventory[40]===3&&!eatingState;}),'Actual cooked-food prompt completes one meal');
  await page.evaluate(()=>{
   const preview=new THREE.Scene();preview.background=new THREE.Color(0xc9d8d4);preview.add(new THREE.HemisphereLight(0xffffff,0x838b7b,1));
   const light=new THREE.DirectionalLight(0xffffff,.55);light.position.set(-4,6,8);preview.add(light);
   [buildCreeper(),buildZombie(),buildPillager()].forEach((mob,i)=>{mob.position.x=(i-1)*1.65;preview.add(mob);});
   const view=new THREE.PerspectiveCamera(35,innerWidth/innerHeight,.1,30);view.position.set(0,1.5,5.8);view.lookAt(0,.55,0);
   for(const el of document.querySelectorAll('body>div,body>section,body>button'))el.style.display='none';
   renderer.render(preview,view);
  });
  await page.screenshot({path:'/private/tmp/hostile-faces-final.png'});
  assert.deepEqual(errors,[]);console.log('PASS: menu, loading, difficulty, hunger, food, fall damage, hurt view and sound events.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
