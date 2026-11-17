const path=require('node:path'),{pathToFileURL}=require('node:url'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const page=await browser.newPage({viewport:{width:960,height:540}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
  console.log(await page.evaluate(()=>{
   const check=(v,msg)=>{if(!v)throw Error(msg);};
   worldMap.clear();seed=42;currentDimension='overworld';selectedTerrain='random';setWildernessVersion(3);let v;
   for(let i=0;i<400&&!v;i++)v=villageRegion((i%20-10)*192,Math.floor(i/20-10)*192);
   check(v,'Village region exists for test seed');
   const x=v.x+6,z=v.z,y=getSurfaceHeight(x,z);
   generateVillageChunk(Math.floor(x/16),Math.floor(z/16));
   check(getBlock(x,y,z)===2&&[WHEAT_GREEN,WHEAT_RIPE].includes(getBlock(x,y+1,z)),'Village wheat grows on soil');
   check(getBlock(x+2,y,z)===24,'Irrigation between rows');
   setGenBlock(x,y+1,z,0);currentBlock=WHEAT_SEEDS;playerInventory[WHEAT_SEEDS]=1;gameMode='survival';isGameStarted=true;controls.isLocked=true;
   camera.position.set(x,y+3,z);camera.lookAt(x,y,z);camera.updateMatrixWorld(true);
   document.dispatchEvent(new MouseEvent('mousedown',{button:2}));
   check(getBlock(x,y+1,z)===WHEAT_YOUNG&&playerInventory[WHEAT_SEEDS]===0,'One seed planted on dirt');
   for(const next of [WHEAT_GREEN,WHEAT_RIPE]){
    const plant=plantGrowth.get(currentDimension+'|'+[x,y+1,z]);plant.age=60;
    growPlant(x,y+1,z,plant);check(getBlock(x,y+1,z)===next,'Grows to stage '+next);
   }
   const prev=playerInventory[WHEAT]||0;
   document.dispatchEvent(new MouseEvent('mousedown',{button:2}));
   check(playerInventory[WHEAT]===prev+2&&getBlock(x,y+1,z)===WHEAT_YOUNG,'Harvest leaves planted shoots');
   const crowns=new Set();
   for(let i=0;i<8;i++){
    let shape='';for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=-2;dy<=1;dy++)shape+=+canopyCell(x+i,z,dx,dy,dz);
    crowns.add(shape);
   }
   check(crowns.size>5,'Tree crowns vary with location');
   let dirty=new Set();markBlockChunks(-1,-1,dirty);check(dirty.size===3,'Negative chunk edge includes both neighbors');
   dirty.clear();markBlockChunks(-3,-3,dirty);check(dirty.size===1,'Interior edit touches just one chunk');
   worldMap.set('1,1,1',48);worldMap.set('2,1,1',82);check(sensorDoorCells.size&&furnitureCells.has('2,1,1'),'Door and furniture indexing');
   worldMap.set('1,1,1',0);worldMap.clear();check(!sensorDoorCells.size&&!furnitureCells.size,'Indices respect replacement and reset');
   selectedTerrain='mountains';heightCache.clear();
   updateTerrainHorizon(0,0);while(horizon.queue.length||horizon.dirty.size)updateTerrainHorizon(0,0);
   const tile=horizon.slots[horizonSlot(13,0)];check(tile?.x===13&&!tile.masked,'Visible distant tile at 208 blocks');
   const cells=new Map();
   for(const [dx,dz,w,d,y] of tile.runs)for(let a=0;a<w;a++)for(let b=0;b<d;b++){
    const x=tile.x*16+dx+a,z=tile.z*16+dz+b;
    check(Math.max(SEA_LEVEL,getSurfaceHeight(x,z))===y&&!cells.has(x+','+z),'Far column must match the playable mountain, without overlap');cells.set(x+','+z,y);
   }
   check(cells.size===256,'Every far column has a horizontal top at the correct height');
   maskTerrainHorizon(13,0,true);check(tile.masked,'Detailed terrain replaces far surface');
   maskTerrainHorizon(13,0,false);
   while(horizon.dirty.size)updateTerrainHorizon(0,0);
   const far=new THREE.Vector3(216,getSurfaceHeight(216,8)+.5,8);
   camera.position.set(1,125,8);camera.lookAt(far);
   for(const m of horizon.pages.values())m.visible=m===tile.batch;
   const count=tile.batch.count;tile.batch.count=tile.end;
   const mat=new THREE.Matrix4(),saved=[];for(let j=0;j<tile.begin;j++){tile.batch.getMatrixAt(j,mat);saved.push(mat.clone());tile.batch.setMatrixAt(j,horizon.empty);}tile.batch.instanceMatrix.needsUpdate=true;
   for(const m of scene.children)m.visible=m===horizon.mesh||m.isLight;
   scene.fog=null;scene.background.setHex(0xff00ff);renderer.render(scene,camera);
   const gl=renderer.getContext(),pix=new Uint8Array(4),q=far.clone().project(camera);
   gl.readPixels(Math.floor((q.x+1)*gl.drawingBufferWidth/2),Math.floor((q.y+1)*gl.drawingBufferHeight/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pix);
   check(pix[1]>pix[0]&&pix[1]>pix[2],'Distant terrain is rendered, not sky: '+pix);
   tile.batch.count=count;saved.forEach((m,i)=>tile.batch.setMatrixAt(i,m));tile.batch.instanceMatrix.needsUpdate=true;
   for(const m of horizon.pages.values())m.visible=true;
   updateTerrainHorizon(-40,31);while(horizon.queue.length||horizon.dirty.size)updateTerrainHorizon(-40,31);
   check(horizon.slots.every(t=>Math.abs(t.x+40)<=15&&Math.abs(t.z-31)<=15),'No stale tiles after teleport');
   const packets=[],entry={ready:true,conn:{open:true,send:p=>packets.push(p)}};
   multiplayerRoom={worldReady:true,entered:true,role:'host',peer:{id:'test'},positions:new Map(),connections:new Map([['guest',entry]]),nextTick:0,dirty:new Map()};
   for(let t=0;t<1000;t+=100)updateMultiplayer(t);
   check(packets.filter(p=>p.type==='pos').length===1,'Idle player sends one pose, not ten');
   entry.conn.bufferSize=5;camera.position.x++;updateMultiplayer(1000);check(packets.length===1,'Stale pose skipped on busy link');
   entry.conn.bufferSize=0;updateMultiplayer(1100);check(packets.length===2&&packets[1].x===camera.position.x,'Latest pose sent when link recovers');
   return {wheat:'planted, ripened and harvested',distinctCrowns:crowns.size,farTileBlocks:208,farPixel:[...pix],idlePacketsPerSecond:1};
  }));
  await page.evaluate(()=>{
   multiplayerRoom=null;blocker.style.display='none';inventoryUI.style.display='none';
   scene.background.setHex(0xa9d2e7);scene.fog=new THREE.Fog(0xa9d2e7,172,240);
   camera.position.set(-640,95,496);camera.lookAt(-510,15,580);horizon.trees.visible=true;renderer.render(scene,camera);
  });
  await page.screenshot({path:'/private/tmp/mc-far-terrain-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>renderer.domElement.width===390,null,{polling:50});
  await page.evaluate(()=>{
   renderer.render(scene,camera);const gl=renderer.getContext(),px=new Uint8Array(4);
   gl.readPixels(195,310,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);if(px[1]===0)throw Error('Blank mobile far terrain');
  });
  await page.screenshot({path:'/private/tmp/mc-far-terrain-mobile.png'});
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
