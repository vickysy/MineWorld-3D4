const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:760}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>requestAnimationFrame=()=>0);
  await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);await page.waitForFunction(()=>expansionReady);
  console.log(await page.evaluate(()=>{
   const ok=(v,s)=>{if(!v)throw Error(s);};window.ok=ok;
   window.preparePortalTest=()=>{
    cancelMining();clearExpansionWorld();worldMap.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();chunkScanYRanges.clear();heightCache.clear();restoreMicroEdits([]);
    for(const ms of chunkMeshes.values())for(const m of Object.values(ms))releaseChunkMesh(m);chunkMeshes.clear();rebuildQueue.clear();
    for(const list of [villagers,animals,zombies,creepers,endermen]){for(const m of list)disposeModModel(m.mesh);list.length=0;}
    currentDimension='overworld';selectedTerrain='plains';isGameStarted=true;gameMode='creative';playerScale=1;isInventoryOpen=false;controls.isLocked=true;portalCooldown=0;portalExitRequired=false;
    document.getElementById('mod-ui').style.display='none';blocker.style.display='none';inventoryUI.style.display='none';heldItemGroup.visible=false;
    document.getElementById('toast-msg').style.visibility='hidden';document.getElementById('info-panel').style.visibility='hidden';
    scene.background=new THREE.Color(0x95c8ed);scene.fog=null;ambientLight.intensity=.6;dirLight.intensity=.8;
    camera.fov=65;camera.updateProjectionMatrix();
    for(let x=-6;x<=6;x++)for(let z=-6;z<=6;z++)setGenBlock(x,79,z,3);
   };
   window.placeFromFace=(type,eye,aim)=>{currentBlock=type;camera.position.fromArray(eye);camera.lookAt(...aim);camera.updateMatrixWorld(true);document.dispatchEvent(new MouseEvent('mousedown',{button:2}));};
   preparePortalTest();placeFromFace(32,[-1,83,-1],[-1,79,-1]);
   ok(getBlock(-1,80,-1)===32,'First table placed by real input');
   placeFromFace(32,[3,80,-1],[-1,80,-1]);
   ok(getBlock(0,80,-1)===32,'Right click on a table side must place the next table, not open Mods');
   return 'PASS: adjacent table placement does not open the mod panel.';
  }));
  console.log(await page.evaluate(()=>{
   const ring=[[-1,-1],[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0]];
   for(const type of [32,OBSIDIAN_ID,BLACKSTONE_ID])for(const cover of [0,160,SNOW_LAYER_ID,FLOWER_RED]){
    preparePortalTest();gameMode='survival';playerInventory[type]=8;
    setGenBlock(0,80,0,cover);
    for(let i=0;i<ring.length;i++){
     const [x,z]=ring[i];placeFromFace(type,[x,84,z],[x,79,z]);
     ok(getBlock(x,80,z)===type,'Each of eight real right clicks places one frame block');
     if(i<7)ok(activePortals.size===0,'Incomplete frame stays inactive');
    }
    ok(playerInventory[type]===0,'Eight ring blocks cost exactly eight items');
    const target=type===32?NETHER_PORTAL_ID:END_PORTAL_ID;
    ok(getBlock(0,80,0)===target,'Eighth block activates, including grass and thin snow in center');
    ok(getBlock(0,79,0)===3,'Portal never removes its supporting floor');
    ok(getBlock(-1,81,-1)===0,'Frame is one block tall, not an impassable two-high wall');
   }
   preparePortalTest();
   for(const [x,z] of ring)placeFromFace(BLACKSTONE_ID,[x,84,z],[x,79,z]);
   camera.position.set(0,80.5+getPlayerHeight()+.001,1.2);camera.rotation.set(0,0,0);camera.updateMatrixWorld(true);velocity.set(0,0,0);moveForward=true;creativeFlying=false;
   for(let n=0;n<120&&currentDimension==='overworld';n++){updatePlayerMovement(1/60);animate();}
   clearMovementInput();ok(currentDimension==='end','Walking off the one-high rim into the center reaches End');
   preparePortalTest();
   setGenBlock(0,80,0,51);
   for(const [x,z] of ring)placeFromFace(32,[x,84,z],[x,79,z]);
   ok(activePortals.size===0&&getBlock(0,80,0)===51,'A solid center is preserved instead of destroyed');
   setBlock(0,80,0,0);placeFromFace(2,[0,83,3],[0,80,1]);
   ok(currentDimension==='nether','Right clicking completed ring activates and enters Nether');
   preparePortalTest();
   for(let i=0;i<ring.length;i++){const [x,z]=ring[i];placeFromFace(i===7?OBSIDIAN_ID:BLACKSTONE_ID,[x,84,z],[x,79,z]);}
   ok(activePortals.size===0,'Mixed frames are not accidentally accepted');
   preparePortalTest();for(const [x,z] of ring)placeFromFace(32,[x,84,z],[x,79,z]);
   for(let cx=-1;cx<=0;cx++)for(let cz=-1;cz<=0;cz++)buildChunkMesh(cx,cz);
   camera.position.set(4,84.5,5);camera.lookAt(0,80,0);renderer.render(scene,camera);
   return 'PASS: 96 actual placements, survival costs, center plants/snow, one-high rings, walking into End, Nether entry, solid center and mixed-frame protection.';
  }));
  await page.screenshot({path:'/private/tmp/mc-ring-fixed.png'});
  console.log(await page.evaluate(()=>{
   preparePortalTest();selectedTerrain='random';seed=42;heightCache.clear();let cold=null;
   for(let x=-160;x<=160&&!cold;x+=8)for(let z=-160;z<=160;z+=8){if(biomeColumn(x,z).biome==='snow'){cold=[x,getSurfaceHeight(x,z)+3,z];break;}}
   ok(cold,'Find an actual snowy biome');camera.position.fromArray(cold);weatherClock=0;
   for(let i=0;i<461;i++)updateWeather(.1);
   ok(weatherKind()==='snow'&&weatherVisual.drops.visible,'Natural snow starts without a forced weather function');
   const first=weatherVisual.particles.find(p=>p&&!p.hidden),y=first.y;updateWeather(.1);ok(first.y<y,'Snow falls, not static points');
   const size=worldMap.size;for(let i=0;i<40;i++)updateWeather(.1);ok(worldMap.size===size,'Snowfall does not create terrain blocks');
   selectedTerrain='mountains';heightCache.clear();camera.position.set(0,65,0);ok(weatherKind()==='snow','Mountain peaks also receive snow');
   selectedTerrain='plains';heightCache.clear();camera.position.set(0,82,4);camera.lookAt(0,80,-5);weatherClock=0;
   for(let cx=-1;cx<=0;cx++)for(let cz=-1;cz<=0;cz++)buildChunkMesh(cx,cz);
   return 'PASS: actual automatic snowfall and motion in snowy terrain and mountains.';
  }));
  await page.evaluate(()=>{openCommandPanel();});
  await page.getByRole('button',{name:'下雪',exact:true}).click();
  await page.getByRole('button',{name:'执行',exact:true}).click();
  assert.equal(await page.evaluate(()=>weatherKind()),'snow');
  console.log(await page.evaluate(()=>{
   const saved=saveOutdoors();restoreOutdoors(saved);ok(weatherKind()==='snow','Weather command survives save/restore');
   currentDimension='nether';ok(weatherKind()==='clear','No weather in Nether');currentDimension='overworld';
   const before=JSON.stringify(weatherOverride);multiplayerRoom={role:'guest'};ok(!setWorldWeather('rain')&&JSON.stringify(weatherOverride)===before,'Guest cannot change shared weather');multiplayerRoom=null;
   updateWeather(.1);ok(weatherVisual.particles.some(p=>p&&!p.hidden&&Math.abs(p.y-camera.position.y)<3),'Snow is visible near eye height immediately');
   renderer.render(scene,camera);const gl=renderer.getContext(),base=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,base);
   weatherVisual.drops.visible=false;renderer.render(scene,camera);const dry=new Uint8Array(base.length);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,dry);
   let different=0;for(let i=0;i<base.length;i+=4)if(base[i]!==dry[i]||base[i+1]!==dry[i+1]||base[i+2]!==dry[i+2])different++;
   ok(different>15,'Snow changes real canvas pixels');weatherVisual.drops.visible=true;renderer.render(scene,camera);
   return {snowPixels:different};
  }));
  await page.screenshot({path:'/private/tmp/mc-visible-snow.png'});
  console.log(await page.evaluate(()=>{
   weatherClock=weatherOverride.until+1;ok(weatherKind()!=='snow','Forced snow expires');weatherOverride=null;
   preparePortalTest();weatherOverride={kind:'rain',until:weatherClock+300};camera.position.set(0,82,4);setBlock(0,80,0,24);rainColumns.clear();
   const random=Math.random;Math.random=()=>.5;
   try{
    ok(fishingBiteDelay(0,80,0)===3.5,'Exposed water has a shorter fishing wait in rain');
    setBlock(0,83,0,3);rainColumns.clear();ok(fishingBiteDelay(0,80,0)===6.5,'Solid roofs prevent the rain fishing bonus');
    setBlock(0,83,0,0);rainColumns.clear();weatherOverride={kind:'clear',until:weatherClock+300};
    ok(fishingBiteDelay(0,80,0)===6.5,'Clear weather keeps the original fishing pace');
   }finally{Math.random=random;weatherOverride=null;}
   updateWeather(0);
   preparePortalTest();gameMode='survival';currentBlock=2;setBlock(0,80,0,3);camera.position.set(0,81,4);camera.lookAt(0,80,0);camera.updateMatrixWorld(true);
   document.dispatchEvent(new MouseEvent('mousedown',{button:0}));ok(miningState&&miningState.stage===0,'Actual left click starts tiny cracks');
   const counts=[];let previous=new Set();
   for(let stage=0;stage<10;stage++){
    if(stage)updateMining(miningState.duration*.101);
    ok(miningState.stage===stage&&getBlock(0,80,0)===3,'Block remains through progressive stage '+stage);
    const mesh=miningState.crackMesh,data=mesh.material.map.image.getContext('2d').getImageData(0,0,16,16).data,points=new Set();
    for(let i=0;i<256;i++)if(data[i*4+3]>150)points.add(i);
    ok([...previous].every(i=>points.has(i)),'Cracks extend without jumping or disappearing');
    const reached=new Set([points.values().next().value]),queue=[...reached];
    for(const i of queue)for(const [dx,dy] of [[-1,-1],[1,1],[1,-1],[-1,1],[-1,0],[1,0],[0,-1],[0,1]]){
     const x=i%16+dx,y=Math.floor(i/16)+dy,j=y*16+x;if(x>=0&&x<16&&y>=0&&y<16&&points.has(j)&&!reached.has(j)){reached.add(j);queue.push(j);}
    }
    ok(reached.size===points.size,'Every crack joins a branch, not scattered dots');
    ok(mesh.isMesh&&mesh.children.length===0,'One overlay draw, not hundreds of fragment meshes');
    counts.push(points.size);previous=points;
   }
   ok(counts[0]===2&&counts[9]>counts[0]*10&&counts[9]<256*.5,'Tiny initial cracks, visible growth, most texture remains exposed');
   document.dispatchEvent(new MouseEvent('mouseup',{button:0}));ok(!miningState&&getBlock(0,80,0)===3,'Release removes progress without destroying block');
   document.dispatchEvent(new MouseEvent('mousedown',{button:0}));updateMining(1.4);
   ok(getBlock(0,80,0)===0&&droppedItems.length>0,'Completion removes block and leaves collectible');
   for(let cx=-1;cx<=0;cx++)for(let cz=-1;cz<=0;cz++)buildChunkMesh(cx,cz);
   const examples=new THREE.Group();scene.add(examples);window.crackExamples=examples;
   for(const [i,p] of [0,.5,.9].entries()){
    const position=new THREE.Vector3((i-1)*1.5,81,0),block=new THREE.Mesh(boxGeo,materials[3]);block.position.copy(position);examples.add(block,createBlockCrackOverlay(position,p));
   }
   camera.position.set(0,82.6,4.3);camera.lookAt(0,81,0);heldItemGroup.visible=false;renderer.render(scene,camera);
   return {crackPixelsPerStage:counts};
  }));
  await page.screenshot({path:'/private/tmp/mc-cracks-stages.png'});
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>renderer.domElement.width===390,null,{polling:50});
  await page.evaluate(()=>{camera.position.set(3,84,8);camera.lookAt(0,81,0);renderer.render(scene,camera);});
  await page.screenshot({path:'/private/tmp/mc-cracks-mobile.png'});
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
