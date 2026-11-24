const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.addInitScript(()=>requestAnimationFrame=()=>0);
  await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
  await page.waitForFunction(()=>typeof initVoxelStyle==='function'&&expansionReady,null,{polling:50});
  await page.getByRole('button',{name:'Creative',exact:true}).click();await page.getByRole('button',{name:'Plains',exact:true}).click();await page.getByRole('button',{name:'Start Game',exact:true}).click();
  await page.waitForFunction(()=>controls.isLocked&&!worldLoading,null,{polling:50});
  console.log(await page.evaluate(async()=>{
   window.ok=(v,s)=>{if(!v)throw Error(s);};
   await Promise.all(Object.keys(WORLD_AUDIO_DATA).map(loadWorldAudio));
   const lengths={};for(const [kind,data] of Object.entries(WORLD_AUDIO_DATA)){
    const decoded=worldAudioBuffers.get(kind);ok(decoded?.length===data.length,'Decode all recordings: '+kind);
    for(const {buffer,normal} of decoded){const samples=buffer.getChannelData(0);let energy=0;for(const s of samples)energy+=s*s;ok(Math.sqrt(energy/samples.length)>.0001&&normal<=3,'Audible nonempty recording: '+kind);}
    lengths[kind]=decoded.map(d=>Number(d.buffer.duration.toFixed(2)));
   }
   ok(new Set(['cow','sheep','pig','horse','villager'].map(k=>WORLD_AUDIO_DATA[k][0])).size===5,'Distinct species recordings');
   const old=playWorldRecording,calls=[];playWorldRecording=(kind,opts)=>{calls.push({kind,...opts});return true;};
   try{
    playBlockSound('break',1);playBlockSound('break',2);playBlockSound('break',3);playBlockSound('place',2);playBlockSound('break',6);playBlockSound('step',OAK_PLANKS_ID);
    ok(calls.map(c=>c.kind).join(',')==='grass_break,dirt_break,stone,place,glass,wood_step','Material/action routing');
    const v={type:'sheep',mesh:{position:camera.position.clone()},voiceTimer:0};updateAnimalVoice(v,.1);ok(calls.at(-1).kind==='sheep'&&v.voiceTimer>=5&&v.voiceTimer<=14,'Idle calls are spaced apart');
   }finally{playWorldRecording=old;}
   clearWorldVoices();ok(!playWorldRecording('cow',{position:camera.position.clone().addScalar(50)}),'Distant animals quiet');
   for(let i=0;i<20;i++)playWorldRecording('cow');ok(worldAudioVoices.size===10,'Voice concurrency bounded');clearWorldVoices();
   window.resetLiving=()=>{
    clearCombatState();clearExpansionWorld();worldMap.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();chunkScanYRanges.clear();heightCache.clear();
    for(const meshes of chunkMeshes.values())for(const mesh of Object.values(meshes))releaseChunkMesh(mesh);chunkMeshes.clear();rebuildQueue.clear();
    for(const list of [villagers,animals,zombies,creepers,endermen]){for(const m of list)disposeModModel(m.mesh);list.length=0;}
    selectedTerrain='plains';currentDimension='overworld';getSurfaceHeight=()=>79;isGameStarted=true;gameMode='creative';controls.isLocked=true;isSleeping=false;playerScale=1;creativeFlying=false;
    for(let x=-16;x<=16;x++)for(let z=-16;z<=16;z++)setGenBlock(x,79,z,1);
    blocker.style.display=inventoryUI.style.display='none';heldItemGroup.visible=false;scene.fog=null;clouds.visible=false;scene.background=new THREE.Color(0x9bcce6);ambientLight.intensity=.8;dirLight.intensity=.7;
    camera.position.set(0,82,8);camera.lookAt(0,81,0);camera.updateMatrixWorld(true);
   };resetLiving();return {decodedRecordings:Object.values(WORLD_AUDIO_DATA).flat().length,durations:lengths};
  }));
  console.log(await page.evaluate(()=>{
   spawnVillagerAt(0,80,0);const v=villagers[0];Object.assign(v,{vx:3,vy:0,vz:0,onGround:true,timer:100});
   for(let z=-3;z<=3;z++)for(let y=80;y<=81;y++)setGenBlock(2,y,z,3);
   for(let i=0;i<60;i++)moveWalkingMob(v,.05,1.98,.4);
   ok(v.mesh.position.x<=1.1001&&!mobBodyBlocked(v.mesh.position,1.98,.4),'Full villager stopped by two-high wall: '+v.mesh.position.x);
   v.mesh.position.set(0,80,0);v.vx=100;moveWalkingMob(v,.2,1.98,.4);ok(v.mesh.position.x<=1.1001,'Fast frame cannot tunnel');
   v.mesh.position.set(0,86,0);v.vx=0;v.vy=-40;moveWalkingMob(v,.5,1.98,.4);ok(Math.abs(v.mesh.position.y-80)<.001,'Long fall lands on floor');
   for(let z=-3;z<=3;z++)setGenBlock(2,81,z,0);v.vx=3;moveWalkingMob(v,.6,1.98,.4);ok(v.mesh.position.x>1.2&&v.mesh.position.y>80.99,'Can step up one block');
   v.mesh.position.set(0,80,0);v.onGround=true;setGenBlock(1,82,0,3);moveWalkingMob(v,.5,1.98,.4);ok(v.mesh.position.x<=1.1001&&v.mesh.position.y<80.01,'Cannot step into low ceiling');setGenBlock(1,82,0,0);
   setGenBlock(2,80,0,8);setGenBlock(2,81,0,9);v.mesh.position.set(0,80,0);v.onGround=true;moveWalkingMob(v,1,1.98,.4);ok(v.mesh.position.x<1.11,'Closed door blocks');
   setGenBlock(2,80,0,10);setGenBlock(2,81,0,11);v.mesh.position.set(0,80,0);moveWalkingMob(v,1,1.98,.4);ok(v.mesh.position.x>2.5,'Open door permits passage');
   setGenBlock(2,80,0,132);setGenBlock(2,81,0,132);v.mesh.position.set(0,80,0);moveWalkingMob(v,1,1.98,.4);ok(v.mesh.position.x>2.5,'Secret blocks remain passable');
   resetLiving();spawnVillagerAt(0,80,0);const victim=villagers[0];setGenBlock(1,80,0,SPIKE_TRAP_ID);victim.mesh.position.x=.10005;
   updateSpikeDamage(victim,.01);ok(victim.hp===2&&victim.hurtTimer>0,'Spikes hurt on contact, flash red');updateSpikeDamage(victim,.1);ok(victim.hp===2,'Spike damage not frame-dependent');
   updateSpikeDamage(victim,.5);ok(victim.dying,'Continued contact kills villager');updateMobDamageState(victim,1);ok(victim.ashStarted,'Death emits ash');
   resetLiving();spawnVillagerAt(0,80,0);setGenBlock(1,80,0,GOLD_PYRAMID);villagers[0].mesh.position.x=.10005;updateSpikeDamage(villagers[0],1);ok(villagers[0].hp===4,'Decorative gold is not a trap');
   return 'PASS: two-high walls, swept high-speed collision, falling, one-block steps, ceilings, doors, hidden blocks and spike death.';
  }));
  console.log(await page.evaluate(()=>{
   resetLiving();spawnVillagerAt(0,80,0);const target=villagers[0];camera.position.set(0,81,7);camera.lookAt(0,81,0);camera.updateMatrixWorld(true);currentBlock=BOW_ID;
   document.dispatchEvent(new MouseEvent('mousedown',{button:2}));ok(flyingArrows.length===1&&target.hp===4,'Real right click launches visible arrow without instant damage');
   const start=flyingArrows[0].mesh.position.clone();updateFlyingArrows(.1);ok(flyingArrows[0].mesh.position.distanceTo(start)>2&&flyingArrows[0].velocity.y<0,'Arrow moves with gravity');
   for(let i=0;i<30;i++)updateFlyingArrows(.02);ok(target.hp===2,'Travelling arrow hits villager once');
   target.hp=4;target.hurtTimer=0;clearFlyingArrows();
   for(const wall of [3,6]){
    setGenBlock(0,81,3,wall);fireArrow(CROSSBOW_ID);for(let i=0;i<12;i++)updateFlyingArrows(.02);
    ok(target.hp===4&&flyingArrows[0]?.stuck?.join(',')==='0,81,3','Wall stops arrow and protects villager: '+wall);
    const stuck=flyingArrows[0].mesh.position.clone();updateFlyingArrows(1);ok(flyingArrows[0].mesh.position.equals(stuck),'Arrow remains embedded');
    controls.isLocked=false;const life=flyingArrows[0].life;updateFlyingArrows(5);ok(flyingArrows[0].life===life,'Pause freezes arrows');controls.isLocked=true;
    setGenBlock(0,81,3,0);updateFlyingArrows(.1);ok(!flyingArrows[0].stuck&&flyingArrows[0].mesh.position.y<stuck.y,'Unsupported arrow falls');clearFlyingArrows();
   }
   for(let i=0;i<55;i++){arrowCooldown=0;fireArrow(BOW_ID);}ok(flyingArrows.length===48,'Projectile cap');clearCombatState();ok(!flyingArrows.length,'World reset clears arrows');
   return 'PASS: actual bow input, visible projectile, gravity, damage on arrival, stone/glass obstruction, embedded arrows, pause, cleanup.';
  }));
  console.log(await page.evaluate(()=>{
   resetLiving();window.showcase=[];
   const human=createRemotePlayer();human.position.set(-5,80.5,0);human.rotation.y=Math.PI;showcase.push(human);
   spawnVillagerAt(-3,80,0);showcase.push(villagers[0].mesh);
   for(const [type,x] of [['cow',-1],['sheep',1],['pig',3],['horse',5]]){ok(spawnAnimal(type,x,80,0),'Animal spawns on dry land');showcase.push(animals.at(-1).mesh);}
   for(const mesh of showcase){const b=new THREE.Box3().setFromObject(mesh);ok(b.min.y>79.45&&b.max.y>80.4,'Feet and head correctly framed');ok(mesh.userData.head&&mesh.userData.leftLeg,'Named animated joints');}
   ok(human.children[0]===human.userData.head&&human.children[5]===human.userData.rightLeg,'Remote animation contract');
   for(const id of [OAK_PLANKS_ID,STONE_BRICKS_ID,QUARTZ_BLOCK_ID]){ok(materials[id].map.image.width===16,'New original block texture');setGenBlock(Math.floor(id-OAK_PLANKS_ID)*2-2,80,-3,id);}
   for(let x=-1;x<=0;x++)for(let z=-1;z<=0;z++)buildChunkMesh(x,z);
   window.renderLiving=()=>{camera.updateMatrixWorld(true);renderer.render(scene,camera);const gl=renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4),colors=new Set();gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);for(let i=0;i<pixels.length;i+=256)colors.add(pixels.slice(i,i+3).join(','));ok(colors.size>80,'3D scene nonblank');return colors.size;};
   camera.position.set(1,83.3,11.5);camera.lookAt(0,80.4,0);return {renderColors:renderLiving(),models:showcase.length};
  }));
  await page.screenshot({path:'/private/tmp/mc-living-desktop.png'});
  const before=await page.evaluate(()=>animals[0].mesh.userData.leftLeg.rotation.x);
  await page.evaluate(()=>{for(const a of animals){a.vx=.5;a.vz=.5;a.timer=100;}updateEntities(.16);renderLiving();});
  assert.notEqual(await page.evaluate(()=>animals[0].mesh.userData.leftLeg.rotation.x),before);
  await page.screenshot({path:'/private/tmp/mc-living-walking.png'});
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>renderer.domElement.clientWidth===390,null,{polling:50});
  await page.evaluate(()=>{camera.position.set(0,85,23);camera.lookAt(0,80.4,0);renderLiving();});await page.screenshot({path:'/private/tmp/mc-living-mobile.png'});
  await page.evaluate(()=>controls.unlock());await page.locator('#sound-volume').waitFor({state:'visible'});await page.locator('#sound-volume').focus();await page.keyboard.press('Home');for(let i=0;i<5;i++)await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>soundVolume),.25);assert.equal(await page.locator('#sound-volume-value').textContent(),'25%');
  assert(await page.locator('#pause-menu').evaluate(el=>{const r=el.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight;}));
  await page.screenshot({path:'/private/tmp/mc-living-volume-mobile.png'});
  assert.deepEqual(errors,[]);console.log('PASS: six models, original pixel skins, walking limbs, desktop/mobile render checks, volume control and no runtime errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
