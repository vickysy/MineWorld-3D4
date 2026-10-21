const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultNavigationTimeout(120000);
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);await page.waitForFunction(()=>expansionReady);
  console.log(await page.evaluate(()=>{
   const checks=[],check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
   clearExpansionWorld();worldMap.clear();heightCache.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();chunkScanYRanges.clear();
   currentDimension='overworld';selectedTerrain='random';seed=42;playerScale=1;isGameStarted=true;gameMode='creative';
   window.hasTerrainMesh=(x,y,z)=>Object.values(chunkMeshes.get(`${Math.floor(x/16)},${Math.floor(z/16)}`)||{}).some(m=>m.userData.blockIndices?.has(`${x},${y},${z}`));
   camera.position.set(8,800,8);buildChunkMesh(0,0);
   check(hasTerrainMesh(8,getSurfaceHeight(8,8),8),'Ground must render when its chunk is first built 800 blocks above it');
   camera.position.set(8,getSurfaceHeight(8,8)+3,8);updateChunks(camera.position);
   check(hasTerrainMesh(8,getSurfaceHeight(8,8),8),'Returning to ground does not leave a cached empty chunk');
   const dirty=new Set();
   for(let x=14;x<=18;x++)for(let z=5;z<=9;z++)for(let y=-362;y<=-359;y++)setBlockNoRebuild(x,y,z,0,dirty);
   for(const key of dirty)buildChunkMesh(...key.split(',').map(Number));
   for(let x=14;x<=18;x++)for(let z=5;z<=9;z++){
    check(hasTerrainMesh(x,-363,z),'Deep floor survives rebuilding at surface '+x+','+z);
    check(hasTerrainMesh(x,-358,z),'Deep ceiling survives rebuilding at surface '+x+','+z);
   }
   for(let y=-362;y<=-359;y++)for(let z=5;z<=9;z++)for(const x of [13,19])check(hasTerrainMesh(x,y,z),'Deep tunnel sidewall '+x+','+y+','+z);
   camera.position.set(16,-360,7);camera.lookAt(20,-359.5,7);camera.updateMatrixWorld(true);
   blocker.style.display='none';inventoryUI.style.display='none';heldItemGroup.visible=false;clouds.visible=false;scene.fog=null;scene.background.setHex(0xff00ff);
   renderer.render(scene,camera);
   const gl=renderer.getContext(),px=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,px);
   let leaks=0;for(let i=0;i<px.length;i+=4)if(px[i]>250&&px[i+1]<5&&px[i+2]>250)leaks++;
   check(leaks===0,'Enclosed underground room has no sky-colored pixels');
   return {checks:checks.length,skyLeaks:leaks};
  }));
  await page.screenshot({path:'/private/tmp/mc-deep-terrain-solid.png'});
  assert.deepEqual(errors,[]);console.log('PASS: terrain remains solid after high flights and deep cross-chunk excavation.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
