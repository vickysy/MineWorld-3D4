const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>requestAnimationFrame=()=>0);
  await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href,{timeout:120000});
  await page.waitForFunction(()=>expansionReady,null,{polling:50});
  await page.getByRole('button',{name:'Creative',exact:true}).click();await page.getByRole('button',{name:'Plains',exact:true}).click();await page.getByRole('button',{name:'Start Game',exact:true}).click();
  await page.waitForFunction(()=>controls.isLocked&&!worldLoading,null,{polling:50});
  console.log(await page.evaluate(()=>{
   window.ok=(v,s)=>{if(!v)throw Error(s);};
   window.resetPolish=()=>{
    clearCombatState();clearExpansionWorld();
    for(const list of [villagers,animals,zombies,creepers,endermen,droppedItems,explosionParticles]){for(const e of list)disposeModModel(e.mesh);list.length=0;}
    for(const ms of chunkMeshes.values())for(const m of Object.values(ms))releaseChunkMesh(m);chunkMeshes.clear();rebuildQueue.clear();
    worldMap.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();chunkScanYRanges.clear();heightCache.clear();
    currentDimension='overworld';selectedTerrain='plains';getSurfaceHeight=()=>79;isGameStarted=true;gameMode='creative';gameDifficulty='normal';isSleeping=false;controls.isLocked=true;health=maxHealth;playerScale=1;resetPlayerFlight();activeMech=null;
    for(let x=-26;x<=26;x++)for(let z=-26;z<=26;z++){setGenBlock(x,79,z,1);for(let y=80;y<=84;y++)setGenBlock(x,y,z,0);}
    camera.position.set(0,81,3);camera.lookAt(0,80.5,0);camera.updateMatrixWorld(true);scene.background=new THREE.Color(0xa3cddf);scene.fog=null;clouds.visible=false;ambientLight.intensity=.7;dirLight.intensity=.6;heldItemGroup.visible=false;document.getElementById('toast-msg').style.visibility='hidden';
   };
   resetPolish();
   window.probePanic=(fps,type)=>{
    resetPolish();for(let x=-5;x<=5;x++)for(let y=80;y<=82;y++)setGenBlock(x,y,-3,3);
    spawnAnimal(type,0,80,0);const a=animals[0],children=a.mesh.children.length,rootCount=scene.children.length;damageMob(a,1);let maxTurn=0,distance=0,last=a.mesh.rotation.y;
    for(let i=0;i<fps*3;i++){
     const before=a.mesh.position.clone();updateEntities(1/fps);const angle=a.mesh.rotation.y;
     maxTurn=Math.max(maxTurn,Math.abs(Math.atan2(Math.sin(angle-last),Math.cos(angle-last))));last=angle;
     distance+=Math.hypot(a.mesh.position.x-before.x,a.mesh.position.z-before.z);
     ok(!mobBodyBlocked(a.mesh.position,a.mesh.userData.mobHeight,a.mesh.userData.mobRadius),'Fleeing animal never enters wall');
     ok(a.mesh.children.length===children&&scene.children.length===rootCount,'No duplicate animal meshes during hurt/run');
     a.mesh.traverse(o=>{for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])ok(m.opacity===1&&!m.transparent&&m.depthWrite,'Living animal stays opaque');});
    }
    return {fps,type,maxTurn,distance};
   };
   return probePanic(60,'cow');
  }));
  if(process.env.PROBE_ONLY)return;
  for(const fps of [30,60,120])for(const type of ['cow','sheep']){
   const result=await page.evaluate(({fps,type})=>probePanic(fps,type),{fps,type});
   assert(result.maxTurn<=6/fps+.0001,JSON.stringify(result));assert(result.distance>2,JSON.stringify(result));console.log(result);
  }
  console.log(await page.evaluate(async()=>{
   resetPolish();
   const families=[[3,'stone'],[STONE_BRICKS_ID,'stone'],[82,'wood'],[151,'wood'],[152,'wood'],[126,'cloth'],[149,'cloth'],[85,'ceramic'],[86,'ceramic'],[87,'glass'],[95,'metal'],[105,'metal']];
   const original=playWorldRecording,calls=[];playWorldRecording=(kind,options)=>{calls.push({kind,...options});return true;};
   try{
    for(const [id,family] of families){ok(blockSoundFamily(id)===family,'Material family '+id);for(const action of ['hit','break','place'])playBlockSound(action,id);}
    playSound('pickup');ok(calls.at(-1).kind==='wood_step'&&calls.at(-1).gain<.05,'Pickup uses quiet recording, not oscillator chirp');
    playSound('door');ok(calls.at(-1).kind==='wood','Furniture hinge uses recording');playSound('glass');ok(calls.at(-1).kind==='glass','Glass break uses recording, not sharp oscillators');
    currentBlock=3;ok(placeFurniture(82,5,80,0),'Actually place wooden table');ok(calls.at(-1).kind==='wood','Furniture uses placed id, not held stone');
    for(const c of calls)ok(WORLD_AUDIO_DATA[c.kind]?.length>0,'Every routed material has a real recording '+c.kind);
    ok(calls.some(c=>c.kind==='hard_place'&&c.lowpass===2200&&c.rate<1),'Stone has a low, solid impact');
   }finally{playWorldRecording=original;}
   const kinds=[...new Set(calls.map(c=>c.kind))];await Promise.all(kinds.map(loadWorldAudio));
   for(const kind of kinds)ok(worldAudioBuffers.get(kind)?.length,'Recording decodes offline '+kind);
   return 'PASS: furniture/stone material routing, decoded recordings and non-chirping pickup.';
  }));
  console.log(await page.evaluate(()=>{
   for(const difficulty of ['easy','normal','hard']){
    resetPolish();setDifficulty(difficulty);dayTime=Math.PI*1.5;spawnVillagerAt(0,80,0);adventureSpawnTime=20;updateAdventureMobs(.01);
    ok(adventureMobs.length===2&&adventureMobs.every(m=>m.raid),'Creative village visitors at '+difficulty);
    for(let i=0;i<60;i++)updateAdventureMobs(1/60);ok(health===maxHealth&&!flyingArrows.length,'Creative player stays protected at '+difficulty);
   }
   resetPolish();dayTime=Math.PI*1.5;spawnVillagerAt(0,80,0);adventureSpawnTime=20;updateAdventureMobs(.01);
   ok(adventureMobs.length===2&&adventureMobs.every(m=>m.raid),'Night visitors spawn in Creative');
   const home=adventureMobs[0].raid.home;ok(!startVillageRaid(home),'One bounded visit per village per night');
   villagers[0].mesh.position.x+=2;ok(!startVillageRaid(nearbyPillagerVillage()),'Walking villagers do not trigger another raid');
   for(let i=0;i<90;i++)updateAdventureMobs(1/60);ok(health===maxHealth&&!flyingArrows.length,'Creative visitors do not attack');
   gameDifficulty='peaceful';clearAdventureMobs();adventureSpawnTime=20;updateAdventureMobs(.01);ok(!adventureMobs.length,'Peaceful disables natural raids');
   gameDifficulty='normal';dayTime=Math.PI/2;ok(!startVillageRaid(home),'No daytime village raids');
   resetPolish();dayTime=Math.PI*1.5;setGenBlock(6,80,-10,WHEAT_RIPE);
   const raider=spawnAdventureMob(PILLAGER_EGG,6,80,-9);raider.eggId=null;raider.raid={home:{x:0,y:79,z:0,farm:true},exit:[22,80,0],time:75,target:null,loot:null,leaving:false};
   updateAdventureMobs(.02);ok(getBlock(6,80,-10)===WHEAT_YOUNG&&raider.raid.loot?.id===WHEAT,'Visit actually harvests a mature village crop');
   ok(raider.raid.leaving&&raider.raid.loot.count===2,'Only a small harvest, then retreat');
   damageMob(raider,100);for(let i=0;i<110;i++)updateAdventureMobs(1/60);ok(droppedItems.some(d=>d.itemType===WHEAT&&d.count===2),'Defeated raider drops stolen crop');
   resetPolish();dayTime=Math.PI*1.5;setGenBlock(6,80,-10,WHEAT_RIPE);setGenBlock(7,80,-10,WHEAT_RIPE);camera.position.set(-15,81,15);
   ok(startVillageRaid({x:0,y:79,z:0,farm:true}),'Start natural field visit');
   for(let i=0;i<1500;i++)updateAdventureMobs(1/30);
   ok(!adventureMobs.length&&droppedItems.some(d=>d.itemType===WHEAT),'Visitors actually walk to field and retreat without becoming stuck');
   const homeAgain={x:0,y:79,z:0,farm:true};ok(!startVillageRaid(homeAgain),'A departed group cannot repeat the same night');
   dayTime=Math.PI/2;updateAdventureMobs(.01);dayTime=Math.PI*1.5;ok(startVillageRaid(homeAgain),'Sleep-style clock reset still allows a visit the following night');
   resetPolish();const saved=3;setBlock(0,74,0,saved);ok(!generateDesertTemple({x:0,y:79,z:0,rx:0,rz:0}),'Temple preflight protects underground edits');ok(getBlock(0,74,0)===saved&&!worldMap.has('ruin_0,0'),'Failed generation leaves edits and marker alone');
   return 'PASS: Creative night visitors, safe/Peaceful/daytime behavior, limited harvest, recovered loot and build protection.';
  }));
  const visuals=await page.evaluate(()=>{
   resetPolish();for(let x=-1;x<=0;x++)for(let z=-1;z<=0;z++)buildChunkMesh(x,z);
   spawnAnimal('cow',-2,80,0);spawnAnimal('sheep',0,80,0);spawnMobFromEgg(68,2,80,0);spawnMobFromEgg(69,4,80,0);
   const zombie=zombies[0].mesh,creeper=creepers[0].mesh;
   ok(zombie.userData.head.geometry.parameters.depth===.5,'Zombie has cubic head');ok(Math.abs(zombie.userData.leftArm.rotation.x+Math.PI/2)<.01,'Zombie reaches forwards');
   ok(['leftLeg','rightLeg','backLeftLeg','backRightLeg'].every(k=>creeper.userData[k]?.isGroup),'Four jointed creeper feet');
   ok(creeper.userData.head.material[4].map&&zombie.userData.head.material[4].map,'Faces have pixel textures');
   const leg=animals[0].mesh.userData.leftLeg,parts=leg.children;
   const boxes=parts.map(p=>new THREE.Box3().setFromObject(p));ok(boxes[0].min.y>=boxes[1].max.y-1e-6,'Hoof and leg do not overlap');
   ok(animals[0].mesh.userData.body.material.map.minFilter===THREE.NearestMipmapLinearFilter,'Moving skins use minification filtering');
   camera.position.set(1,82.6,10);camera.lookAt(1,80.6,0);camera.updateMatrixWorld(true);
   window.readPolishPixels=()=>{const gl=renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;};
   renderer.render(scene,camera);const before=readPolishPixels();
   damageMob(animals[0],1);damageMob(animals[1],1);
   for(let i=0;i<45;i++){updateEntities(1/60);renderer.render(scene,camera);}
   const after=readPolishPixels();ok(after.some((value,i)=>value!==before[i]),'Running models visibly move');
   renderer.clear(true,true,true);renderer.render(scene,camera);const clean=readPolishPixels();
   let different=0;for(let i=0;i<after.length;i++)if(after[i]!==clean[i])different++;
   ok(different===0,'Rendered frame contains no old-position ghost pixels: '+different);
   const colors=new Set();for(let i=0;i<clean.length;i+=256)colors.add(clean.slice(i,i+3).join(','));ok(colors.size>60,'Nonblank scene');
   return {colors:colors.size,residualPixels:different};
  });console.log(visuals);await page.screenshot({path:'/private/tmp/mc-polish-running.png'});
  await page.evaluate(()=>{animals[0].mesh.position.set(-2,80,0);animals[1].mesh.position.set(0,80,0);for(const m of [...animals,...creepers,...zombies]){m.mesh.rotation.y=0;}renderer.render(scene,camera);});
  await page.screenshot({path:'/private/tmp/mc-polish-models.png'});
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>renderer.domElement.clientWidth===390,null,{polling:50});
  const mobile=await page.evaluate(()=>{camera.position.set(1,83,17);camera.lookAt(1,80.6,0);renderer.render(scene,camera);for(const m of [...animals,...creepers,...zombies]){const p=new THREE.Box3().setFromObject(m.mesh).getCenter(new THREE.Vector3()).project(camera);ok(Math.abs(p.x)<.95&&Math.abs(p.y)<.95,'Mobile models in frame');}return renderer.info.render.triangles;});
  assert(mobile>500);await page.screenshot({path:'/private/tmp/mc-polish-mobile.png'});
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
