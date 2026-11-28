const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>requestAnimationFrame=()=>0);
  await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href,{timeout:120000});
  await page.waitForFunction(()=>expansionReady&&!worldLoading,null,{polling:50});
  console.log(await page.evaluate(()=>{
   const checks=[],ok=(v,name)=>{if(!v)throw Error(name);checks.push(name);};
   clearCombatState();clearExpansionWorld();worldMap.clear();heightCache.clear();restoreMicroEdits([]);setWildernessVersion(4);
   currentDimension='overworld';selectedTerrain='plains';getSurfaceHeight=()=>79;isGameStarted=controls.isLocked=true;
   gameMode='creative';gameDifficulty='normal';worldLoading=isSleeping=isRespawning=isInventoryOpen=false;activeMech=null;playerScale=1;
   resetPlayerFlight();clearMovementInput();health=maxHealth;resetSurvivalState();camera.position.set(0,81.1,0);
   const geometry=ladderGeometry();geometry.computeBoundingBox();const size=geometry.boundingBox.getSize(new THREE.Vector3());
   ok(size.z===.25&&size.y===1,'Ladder is exactly one quarter block thick and one block high');
   ok(!materials[7].transparent&&materials[7].alphaTest===.5,'Ladder has solid wooden rungs and cutout gaps, not transparent cubes');
   for(let face=0;face<4;face++){
    worldMap.clear();const [dx,dz]=LADDER_SIDES[face];
    for(let y=80;y<=85;y++){setGenBlock(0,y,0,7);setGenBlock(dx,y,dz,3);}
    ok(ladderFacing(0,81,0)===face,'Ladder attaches to wall direction '+face);
    const bound=ladderBounds(-.5,80.5,-.5,face),extent=bound.getSize(new THREE.Vector3());
    ok(Math.abs(Math.min(extent.x,extent.z)-.25)<1e-8,'Quarter-thickness bounds in direction '+face);
    for(const scale of [1,.05,.005]){
     playerScale=scale;updatePlayerScaleView();resetPlayerFlight();clearMovementInput();velocity.set(0,0,0);
     const front=(.25-.1*scale);camera.position.set(dx*front,81,dz*front);
     ok(getPlayerEnvironment().onLadder,'Wall ladder contact at scale '+scale+' face '+face);
     holdingSpace=true;const start=camera.position.y;for(let i=0;i<15;i++)updatePlayerMovement(1/60);
     ok(camera.position.y>start+.7*scale,'Wall ladder climbs at scale '+scale+' face '+face);holdingSpace=false;
     camera.position.set(-dx*.35,81,-dz*.35);ok(!getPlayerEnvironment().onLadder,'Empty side of cell is not a ladder at scale '+scale+' face '+face);
    }
    playerScale=1;const origin=new THREE.Vector3(-dx*2,81,-dz*2),direction=new THREE.Vector3(dx,0,dz);
    const ray=traceVoxelRay(origin,direction,5,type=>type===7||isSolidType(type));
    ok(ray?.type===7&&Math.abs(ray.distance-2.25)<1e-8,'Ray targets the thin face, not the empty cube front: '+face);
    buildChunkMesh(0,0);const mesh=chunkMeshes.get('0,0')[7],matrix=new THREE.Matrix4();mesh.getMatrixAt(mesh.userData.blockIndices.get('0,81,0'),matrix);
    const transformed=geometry.boundingBox.clone().applyMatrix4(matrix);ok(transformed.intersectsBox(bound)&&transformed.getSize(new THREE.Vector3()).distanceTo(extent)<.2,'Rendered ladder follows its wall');
   }
   getSurfaceHeight=()=>-100;
   for(const scale of [.05,.005]){
    worldMap.clear();restoreMicroEdits([]);restoreFineVoxelEdits([]);playerScale=scale;updatePlayerScaleView();resetPlayerFlight();clearMovementInput();
    const base=.5;for(let y=0;y<12;y++){const c=microCellAt(base+.5*scale,base+(y+.5)*scale,base+.5*scale);setMicroPlacement(c,7);setMicroPlacement(offsetMicroCell(c,0,0,-1),3);}
    camera.position.set(base+.5*scale,base+2*scale,base+.4*scale);velocity.set(0,0,0);holdingSpace=true;
    const start=camera.position.y;for(let i=0;i<30;i++)updatePlayerMovement(1/60);holdingSpace=false;
    ok(camera.position.y>start+1.5*scale,'Placed miniature ladder climbs at scale '+scale);
    const c=microCellAt(base+.5*scale,base+3.5*scale,base+.5*scale),box=ladderMicroBounds(c);
    ok(Math.abs(box.max.z-box.min.z-scale*.25)<1e-9,'Miniature thickness also scales by one quarter');
    const from=new THREE.Vector3(base+.5*scale,base+3.5*scale,base+1.5*scale),hit=findMicroBlockHit(from,new THREE.Vector3(0,0,-1),3*scale);
    ok(hit?.type===7&&Math.abs(hit.distance-1.25*scale)<scale*.0001,'Miniature targeting uses the thin ladder surface');
   }
   getSurfaceHeight=()=>79;playerScale=1;updatePlayerScaleView();restoreMicroEdits([]);restoreFineVoxelEdits([]);worldMap.clear();camera.position.set(0,81.1,0);resetPlayerFlight();clearMovementInput();
   const random=Math.random,stream=updateChunks;updateChunks=()=>{};
   try{
    for(const terrain of ['plains','moon'])for(const difficulty of ['easy','normal','hard','peaceful']){
     selectedTerrain=terrain;gameDifficulty=difficulty;dayTime=Math.PI*1.5;gameMode='creative';
     for(const zombie of zombies)disposeModModel(zombie.mesh);zombies.length=0;
     Math.random=()=>.001;prevTime=performance.now()-16;animate();Math.random=random;
     ok(zombies.length>0,'Actual night frame spawns zombies in Creative '+terrain+'/'+difficulty);
     const zombie=zombies[0];zombie.mesh.position.set(.8,80,0);zombie.onGround=true;zombie.wanderTime=100;zombie.wanderMoving=false;
     for(const list of [villagers,animals,creepers,endermen]){for(const mob of list)disposeModModel(mob.mesh);list.length=0;}
     camera.position.set(0,81.1,0);const hp=health;
     for(let i=0;i<90;i++)updateZombieEncounter(zombie,1/60);
     ok(zombie.encounterTarget!==camera&&health===hp,'Creative zombie does not chase or hurt player '+difficulty);
    }
    selectedTerrain='plains';gameMode='survival';gameDifficulty='normal';const z=zombies[0];z.mesh.position.set(.8,80,0);z.attackCooldown=0;z.onGround=true;
    updateZombieEncounter(z,.1);ok(z.encounterTarget===camera&&health<maxHealth,'Survival contact still hurts');
   }finally{Math.random=random;updateChunks=stream;}
   for(const zombie of zombies)disposeModModel(zombie.mesh);zombies.length=0;
   for(const ms of chunkMeshes.values())for(const m of Object.values(ms))releaseChunkMesh(m);chunkMeshes.clear();worldMap.clear();rebuildQueue.clear();
   gameMode='creative';setDifficulty('normal');selectedTerrain='plains';
   for(let x=-3;x<=3;x++)for(let y=80;y<=85;y++)setGenBlock(x,y,-1,3);
   for(let y=80;y<=84;y++)setGenBlock(0,y,0,7);
   for(let x=-1;x<=0;x++)for(let z=-1;z<=0;z++)buildChunkMesh(x,z);
   blocker.style.display=inventoryUI.style.display='none';document.getElementById('toast-msg').style.visibility='hidden';heldItemGroup.visible=false;clouds.visible=false;scene.fog=null;scene.background=new THREE.Color(0xaacbdd);ambientLight.intensity=.9;
   camera.position.set(3.2,83,4);camera.lookAt(0,82,0);camera.updateMatrixWorld(true);renderPlayerView(camera);
   return {checks:checks.length,ladderSize:size.toArray()};
  }));
  for(const viewport of [{width:1200,height:800},{width:390,height:844}]){
   await page.setViewportSize(viewport);await page.waitForFunction(w=>renderer.domElement.clientWidth===w,viewport.width,{polling:50});
   assert(await page.evaluate(()=>{renderPlayerView(camera);const gl=renderer.getContext(),p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4),colors=new Set();gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);for(let i=0;i<p.length;i+=128)colors.add(p.slice(i,i+3).join(','));return colors.size>20;}));
   await page.screenshot({path:'/private/tmp/thin-ladder-'+viewport.width+'.png'});
  }
  assert.deepEqual(errors,[]);console.log('PASS: thin wall ladders, scaled climbing/targeting and naturally spawning non-attacking Creative zombies.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
