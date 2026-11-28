const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>requestAnimationFrame=()=>0);
  await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href,{timeout:120000});
  await page.waitForFunction(()=>expansionReady&&!worldLoading,null,{polling:50});
  await page.getByRole('button',{name:'Survival',exact:true}).click();await page.getByRole('button',{name:'Plains',exact:true}).click();
  await page.getByRole('button',{name:'Start Game',exact:true}).click();
  await page.waitForFunction(()=>isGameStarted&&controls.isLocked&&!worldLoading,null,{polling:50});
  console.log(await page.evaluate(async()=>{
   const checks=[],ok=(v,name)=>{if(!v)throw Error(name);checks.push(name);};
   window.repairReset=()=>{
    cancelEating();clearCombatState();clearExpansionWorld();worldMap.clear();modifiedColumns.clear();columnMinY.clear();heightCache.clear();
    for(const ms of chunkMeshes.values())for(const mesh of Object.values(ms))releaseChunkMesh(mesh);chunkMeshes.clear();rebuildQueue.clear();
    getSurfaceHeight=()=>-100;selectedTerrain='plains';currentDimension='overworld';setWildernessVersion(4);playerScale=1;updatePlayerScaleView();
    activeMech=null;resetPlayerFlight();clearMovementInput();gameMode='survival';setDifficulty('normal');
    controls.isLocked=isGameStarted=true;worldLoading=isRespawning=isSleeping=isInventoryOpen=false;
    health=maxHealth;hunger=maxHunger;resetSurvivalState();velocity.set(0,0,0);camera.rotation.set(0,0,0);
    camera.position.set(0,79.5+getPlayerHeight(),0);homeSpawnPoint={x:0,y:camera.position.y,z:0};
    for(let x=-5;x<=5;x++)for(let z=-5;z<=5;z++)setGenBlock(x,79,z,3);
    blocker.style.display=inventoryUI.style.display='none';heldItemGroup.visible=true;
   };
   for(const fps of [30,60,144]){
    repairReset();camera.position.y+=8;
    for(let i=0;i<fps*3;i++)updatePlayerMovement(1/fps);
    ok(health<maxHealth&&health>0,'Airborne after reset still takes fall damage at '+fps+' FPS');
    const hp=health;for(let i=0;i<fps;i++)updatePlayerMovement(1/fps);ok(health===hp,'Landing hurts only once at '+fps+' FPS');
   }
   repairReset();camera.position.y+=9;
   updateFallDamage(camera.position.clone(),{onLadder:true,waterFraction:0,lavaFraction:0},false);
   for(let i=0;i<180;i++)updatePlayerMovement(1/60);ok(health<maxHealth,'Letting go of a ladder does not make the fall immune');
   repairReset();for(let y=80;y<88;y++)setGenBlock(0,y,0,3);
   camera.position.y=87.5+getPlayerHeight();updatePlayerMovement(1/60);moveRight=true;
   for(let i=0;i<20;i++)updatePlayerMovement(1/60);moveRight=false;
   for(let i=0;i<180;i++)updatePlayerMovement(1/60);ok(health<maxHealth&&health>0,'Actually walking off a high ledge hurts');
   repairReset();camera.position.y+=28;
   for(let i=0;i<240&&!isRespawning;i++)updatePlayerMovement(1/60);
   ok(health===0&&isRespawning,'A lethal fall triggers death');await new Promise(resolve=>setTimeout(resolve,800));
   ok(!isRespawning&&health===maxHealth&&Math.abs(camera.position.y-homeSpawnPoint.y)<.01,'Death returns to the home spawn');
   for(const scale of [1,.05,.005]){
    repairReset();playerScale=scale;updatePlayerScaleView();camera.position.y=79.5+getPlayerHeight()+8*scale;
    for(let i=0;i<180;i++)updatePlayerMovement(1/60);ok(health<maxHealth&&health>0,'Fall distance respects player scale '+scale);
   }
   repairReset();camera.position.y+=2;for(let i=0;i<120;i++)updatePlayerMovement(1/60);ok(health===maxHealth,'Short fall stays safe');
   repairReset();gameMode='creative';camera.position.y+=30;for(let i=0;i<240;i++)updatePlayerMovement(1/60);ok(health===maxHealth,'Creative stays immune');
   repairReset();for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)for(let y=80;y<=83;y++)setGenBlock(x,y,z,24);
   camera.position.y+=12;for(let i=0;i<240;i++)updatePlayerMovement(1/60);ok(health===maxHealth,'Water cushions a fall');
   repairReset();health=5;hunger=2;takeDamage(1);const damaged=health;
   for(let i=0;i<10;i++)updateSurvival(.5);ok(health===damaged,'No healing during the post-hit delay');
   for(let i=0;i<12;i++)updateSurvival(.5);ok(health>damaged,'Low but nonempty hunger allows gradual recovery');
   hunger=0;const hp=health;for(let i=0;i<24;i++)updateSurvival(.5);ok(health===hp,'Empty hunger does not heal');
   hunger=2;for(let i=0;i<5;i++){takeDamage(.1);updateSurvival(1);}const recent=health;
   controls.isLocked=false;updateSurvival(60);ok(health===recent,'Pause does not heal or advance survival timers');controls.isLocked=true;
   repairReset();health=4;hunger=1;playerInventory[GOLDEN_APPLE]=2;currentBlock=GOLDEN_APPLE;updateHeldItem3D(currentBlock);
   document.dispatchEvent(new MouseEvent('mousedown',{button:2}));for(let i=0;i<96;i++)updateEating(1/60);
   document.dispatchEvent(new MouseEvent('mouseup',{button:2}));ok(playerInventory[GOLDEN_APPLE]===1,'Right-click consumes one golden apple');
   for(let i=0;i<10;i++)updateSurvival(.5);ok(health>=6&&goldenFoodEffects.absorption===2,'Golden apple heals two hearts and grants two shield hearts');
   repairReset();return checks;
  }));
  for(const viewport of [{width:1200,height:800},{width:390,height:844}]){
   await page.setViewportSize(viewport);await page.waitForFunction(w=>renderer.domElement.clientWidth===w,viewport.width,{polling:50});
   console.log(await page.evaluate(()=>{
    const ok=(v,name)=>{if(!v)throw Error(name);};repairReset();
    for(const fov of [75,90,105])for(const id of [0,33,34,54,55,GOLDEN_APPLE,LEAD_ID]){
     setViewFov(fov,false);currentBlock=id;updateHeldItem3D(id);resetHandAnimation();
     for(const t of [0,.2,.5,.7,1]){
      if(id===GOLDEN_APPLE)animateHeldFood({id,elapsed:t*FOOD_EAT_SECONDS});else{startHandAnimation('melee');updateHandSwing(t*HAND_SWING_SECONDS);}
      camera.updateMatrixWorld(true);const mesh=heldItemGroup.children[0].userData.gripArm.children[0],vertices=mesh.geometry.attributes.position;
      let bottom=Infinity;const p=new THREE.Vector3();for(let i=0;i<vertices.count;i++)bottom=Math.min(bottom,p.fromBufferAttribute(vertices,i).applyMatrix4(mesh.matrixWorld).project(camera).y);
      ok(bottom< -1,'Sleeve remains connected to screen edge: '+[id,fov,t,innerWidth]);
      ok(heldItemGroup.children[0].userData.gripArm.children.length===1,'No separate wrist or sleeve pieces');
     }
    }
    setViewFov(90,false);currentBlock=33;updateHeldItem3D(33);resetHandAnimation();camera.position.set(0,82,0);camera.updateMatrixWorld(true);
    scene.background=new THREE.Color(0x424c50);scene.fog=null;clouds.visible=false;ambientLight.intensity=1;dirLight.intensity=0;
    const wall=new THREE.Mesh(new THREE.BoxGeometry(10,10,.1),new THREE.MeshBasicMaterial({color:0xff00ff}));wall.position.set(0,82,-.35);scene.add(wall);
    const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
    const pixels=()=>{const p=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
    heldItemGroup.visible=false;renderPlayerView(camera);const plain=pixels();heldItemGroup.visible=true;
    renderer.render(scene,camera);const old=pixels();renderPlayerView(camera);const fixed=pixels();
    let clipped=0,visible=0;for(let i=0;i<plain.length;i+=4){if(Math.abs(plain[i]-old[i])+Math.abs(plain[i+1]-old[i+1])+Math.abs(plain[i+2]-old[i+2])>15)clipped++;
     if(Math.abs(plain[i]-fixed[i])+Math.abs(plain[i+1]-fixed[i+1])+Math.abs(plain[i+2]-fixed[i+2])>15)visible++;}
    ok(visible>2000&&visible>clipped*4,'GPU: close wall no longer clips the wrist '+visible+'/'+clipped);
    const saved=[camera.layers.mask,scene.background,scene.fog,renderer.autoClear,renderer.info.autoReset],quat=camera.quaternion.clone();hurtViewTime=.2;renderPlayerView(camera);
    ok(saved.every((value,i)=>value===[camera.layers.mask,scene.background,scene.fog,renderer.autoClear,renderer.info.autoReset][i])&&quat.equals(camera.quaternion),'Render pass restores all camera/scene state');
    photoMode=true;renderPlayerView(camera);const photo=pixels();let photoDifference=0;for(let i=0;i<plain.length;i++)if(photo[i]!==plain[i])photoDifference++;
    ok(photoDifference===0,'Photo mode never draws the hand through a wall');photoMode=false;hurtViewTime=0;
    renderPlayerView(camera);window.repairWall=wall;return {width:innerWidth,oldVisibleHandPixels:clipped,fixedVisibleHandPixels:visible};
   }));
   await page.screenshot({path:'/private/tmp/hand-wall-'+viewport.width+'.png'});
   await page.evaluate(()=>{scene.remove(repairWall);repairWall.geometry.dispose();repairWall.material.dispose();});
  }
  assert.deepEqual(errors,[]);console.log('PASS: actual falling/respawn, low-hunger recovery, golden apple and unbroken first-person hand.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
