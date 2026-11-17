const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  const url=process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href;
  await page.goto(url);await page.waitForFunction(()=>expansionReady);
  console.log(await page.evaluate(()=>{
   const check=(ok,label)=>{if(!ok)throw Error(label);};
   selectedTerrain='moon';worldMap.clear();restoreMicroEdits([]);clearExpansionWorld();isGameStarted=true;gameMode='survival';controls.isLocked=true;
   camera.position.set(8,203,6);camera.lookAt(8,200,6);camera.updateMatrixWorld(true);currentBlock=187;playerInventory[187]=2;setBlockNoRebuild(8,200,6,1,rebuildQueue);
   document.dispatchEvent(new MouseEvent('mousedown',{button:2}));check(getBlock(8,201,6)===187&&playerInventory[187]===1,'Actual right click plants and consumes a seed');
   setBlockNoRebuild(8,201,6,190,rebuildQueue);camera.lookAt(8,201,6);camera.updateMatrixWorld(true);
   const before=playerInventory[191]||0;document.dispatchEvent(new MouseEvent('mousedown',{button:2}));check(getBlock(8,201,6)===189&&playerInventory[191]===before+3,'Actual right click harvests berries');
   currentBlock=191;hunger=1;document.dispatchEvent(new MouseEvent('mousedown',{button:0}));check(hunger===maxHunger&&playerInventory[191]===before+2,'Actual left click eats held fruit');
   setBlockNoRebuild(8,201,6,12,rebuildQueue);currentBlock=4;playerInventory[4]=10;document.dispatchEvent(new MouseEvent('mousedown',{button:2}));
   check(isInventoryOpen&&hasWorkbench()&&document.getElementById('craft-8').style.display!=='none','Actual right click opens nine workbench slots');
   return {actualClicks:4};
  }));
  for(let i=0;i<6;i++)await page.locator('#craft-'+i).click();
  assert.match(await page.locator('#craft-out').textContent(),/Trapdoor x2/);await page.locator('#craft-out').click();
  assert.equal(await page.evaluate(()=>playerInventory[197]),2);
  await page.screenshot({path:'/private/tmp/mc-workbench-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/private/tmp/mc-workbench-mobile.png'});
  assert(await page.locator('#craft-out').isVisible());
  await page.setViewportSize({width:1200,height:800});
  console.log(await page.evaluate(()=>{
   const check=(ok,s)=>{if(!ok)throw Error(s);};
   inventoryUI.style.display='none';blocker.style.display='none';document.getElementById('toast-msg').style.display='none';heldItemGroup.visible=false;clouds.visible=false;
   for(const meshes of chunkMeshes.values())for(const m of Object.values(meshes))scene.remove(m);chunkMeshes.clear();worldMap.clear();restoreMicroEdits([]);
   for(let x=2;x<=14;x++)for(let z=2;z<=14;z++){setGenBlock(x,200,z,1);setGenBlock(x,199,z,2);}
   playerScale=1;updatePlayerScaleView();camera.position.set(8,204,13);camera.lookAt(8,200.5,7);
   scene.fog=null;scene.background.setHex(0xff00ff);buildChunkMesh(0,0);scene.updateMatrixWorld(true);
   let checked=0;
   window.checkGrassSurface=()=>{
    scene.updateMatrixWorld(true);const meshes=[...Object.values(chunkMeshes.get('0,0')||{}),...microVoxelGroup.children];
    for(let x=6.01;x<10;x+=.13)for(let z=6.01;z<10;z+=.13){
     const hits=new THREE.Raycaster(new THREE.Vector3(x,202,z),new THREE.Vector3(0,-1,0),0,2).intersectObjects(meshes);
     check(hits.length&&Math.abs(hits[0].point.y-200.5)<1e-5,'Grass surface has no holes '+x+','+z);checked++;
    }
    renderer.render(scene,camera);return checked;
   };
   checkGrassSurface();return {normalGrassRays:checked};
  }));
  await page.screenshot({path:'/private/tmp/mc-grass-surface.png'});
  console.log(await page.evaluate(()=>{playerScale=.05;updatePlayerScaleView();camera.position.set(8,200.58,8);camera.lookAt(8,200.5,7.8);markMicroNeighborhood(8,200,8);updateMicroVoxelOverlay();return {tinyGrassRays:checkGrassSurface()};}));
  await page.screenshot({path:'/private/tmp/mc-grass-tiny.png'});
  console.log(await page.evaluate(()=>{
   const check=(v,s)=>{if(!v)throw Error(s);};
   restoreMicroEdits([]);clearMicroVoxelOverlay();worldMap.clear();selectedTerrain='moon';isInventoryOpen=false;controls.isLocked=true;isGameStarted=true;
   playerScale=1;updatePlayerScaleView();gameMode='creative';creativeFlying=false;velocity.set(0,0,0);holdingSpace=false;moveForward=moveBackward=moveLeft=moveRight=false;
   setBlockNoRebuild(0,198,0,3,rebuildQueue);setBlockNoRebuild(0,200,0,197,rebuildQueue);camera.position.set(0,203,0);
   for(let i=0;i<180;i++)updatePlayerMovement(1/60);
   check(camera.position.y>201,'Player lands on the closed trapdoor');
   camera.position.z=.1;toggleTrapdoor(0,200,0);
   for(let i=0;i<180;i++)updatePlayerMovement(1/60);
   check(camera.position.y<200.3&&camera.position.y>199.8,'Player actually falls through the open trapdoor and lands below '+camera.position.y);
   return {landedBelow:camera.position.y};
  }));
  assert.deepEqual(errors,[]);console.log('PASS: actual planting, harvest, eating, table clicks, grass surface rays at both sizes and hatch fall physics.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
