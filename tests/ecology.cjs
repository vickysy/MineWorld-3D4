const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  const url=process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href;
  await page.goto(url);await page.waitForFunction(()=>expansionReady);
  console.log(await page.evaluate(()=>{
   const checks=[],check=(v,s)=>{if(!v)throw Error(s);checks.push(s);};
   selectedTerrain='moon';currentDimension='overworld';worldMap.clear();restoreMicroEdits([]);restoreEcology();
   isGameStarted=true;controls.isLocked=true;gameMode='survival';playerScale=1;camera.position.set(8,201,8);
   chunkMeshes.set('0,0',{});
   const plant=(x,z,id)=>{setBlockNoRebuild(x,199,z,1,rebuildQueue);setBlockNoRebuild(x,200,z,id,rebuildQueue);};
   const seconds=n=>{for(let i=0;i<n;i++)updateEcology(1);};
   plant(2,2,BAMBOO_SEED);seconds(14);check(getBlock(2,200,2)===BAMBOO_SEED,'Seed does not instantly grow');
   seconds(1);check(getBlock(2,200,2)===159,'Seed becomes a bamboo shoot');
   seconds(25);check(getBlock(2,200,2)===158,'Shoot becomes bamboo');
   seconds(30);check(getBlock(2,201,2)===158,'Bamboo grows one segment taller');
   setBlockNoRebuild(2,202,2,3,rebuildQueue);seconds(35);check(getBlock(2,202,2)===3,'Bamboo never replaces a roof');
   setBlockNoRebuild(2,199,2,0,rebuildQueue);check(getBlock(2,200,2)===0&&getBlock(2,201,2)===0,'Unsupported bamboo column is removed');
   plant(5,2,188);seconds(45);check(getBlock(5,200,2)===189,'Berry bush has an intermediate stage');
   seconds(45);check(getBlock(5,200,2)===190,'Berries ripen');
   const fruit=harvestPlant(5,200,2);check(fruit.id===191&&fruit.count===3&&getBlock(5,200,2)===189,'Harvest keeps the bush alive');
   seconds(45);check(getBlock(5,200,2)===190,'Harvested bush regrows berries');
   check(!harvestPlant(6,200,2),'Cannot harvest empty air');
   for(const [x,z,id] of [[3,8,192],[12,8,193]])plant(x,z,id);
   seconds(45);check(getBlock(3,200,8)===199&&getBlock(12,200,8)===200,'Both tree saplings have young stages');
   seconds(45);check(getBlock(3,200,8)===4&&getBlock(12,200,8)===4,'Both saplings become actual trees');
   seconds(100);check(getBlock(3,204,8)===202&&getBlock(12,204,8)===195,'Trees bear cherries and apples');
   const stored=saveEcology();restoreEcology(stored);check(JSON.stringify(saveEcology())===JSON.stringify(stored),'Growth ages survive save and restore');
   plant(6,6,187);controls.isLocked=false;seconds(30);check(getBlock(6,200,6)===187,'Paused games do not advance growth');controls.isLocked=true;
   multiplayerRoom={role:'guest',worldReady:true};seconds(30);check(getBlock(6,200,6)===187,'Guests do not independently grow a different world');multiplayerRoom=null;
   gameMode='survival';setWorkbench(null);craftingGrid=[4,0,0,0,0,0,0,0,0];checkRecipes();check(craftingOutput.id===12,'A workbench can be crafted without a workbench');
   craftingGrid=[4,4,4,4,4,4,0,0,0];checkRecipes();check(craftingOutput.id===0,'Trapdoor recipe requires a table');
   setBlockNoRebuild(8,200,7,12,rebuildQueue);setWorkbench([8,200,7]);checkRecipes();check(craftingOutput.id===197&&craftingOutput.count===2,'Workbench crafts two trapdoors from six wood');
   craftOutputClick();check(playerInventory[197]>=2&&craftingGrid.every(v=>!v),'Workbench consumes the six ingredients once');
   const before=playerInventory[4]||0;craftingGrid=[0,0,0,0,4,4,0,0,0];setWorkbench(null);check(playerInventory[4]===before+2&&craftingGrid.every(v=>!v),'Closing large grid returns materials without loss');
   setWorkbench([8,200,7]);craftingGrid=[4,4,4,4,4,4,0,0,0];checkRecipes();setBlockNoRebuild(8,200,7,0,rebuildQueue);const out=playerInventory[197];craftOutputClick();check(playerInventory[197]===out,'Destroying table invalidates stale craft output');craftingGrid.fill(0);
   gameMode='creative';setWorkbench(null);check(hasWorkbench(),'Creative mode remains unrestricted');
   camera.position.set(8,201,8);setBlockNoRebuild(0,200,0,197,rebuildQueue);
   const slab=trapBounds(-.5,199.5,-.5,197);check(Math.abs(slab.max.y-slab.min.y-.15)<1e-8,'Closed trapdoor is a thin slab');
   for(const scale of [1,.05,.005]){
    playerScale=scale;updatePlayerScaleView();const p=new THREE.Vector3(0,199.65+getPlayerHeight()+.00001,0);
    check(!checkScaledCollision(p),'Stand above closed hatch '+scale);p.y-=.003;check(checkScaledCollision(p),'Hatch supports weight '+scale);
   }
   playerScale=1;updatePlayerScaleView();toggleTrapdoor(0,200,0);check(getBlock(0,200,0)===198,'Hatch opens');
   check(!checkScaledCollision(new THREE.Vector3(0,200,0)),'Open hatch has a passable central shaft');
   camera.position.set(0,200.2,0);toggleTrapdoor(0,200,0);check(getBlock(0,200,0)===198,'Cannot close on a player');
   camera.position.set(8,201,8);toggleTrapdoor(0,200,0);check(getBlock(0,200,0)===197,'Hatch closes when shaft is clear');
   const hit=findMicroBlockHit(new THREE.Vector3(.025,200,.025),new THREE.Vector3(0,-1,0),1);check(hit?.type===197&&Math.abs(hit.distance-.35)<1e-6,'Mining ray matches thin hatch top');
   const leaf=materials[194];check(leaf.alphaTest===.5&&!leaf.transparent,'Cherry leaves preserve cutout depth');
   for(const id of [42,160,161]){const g=natureGeometry(id);check(g.attributes.position.count===42,'Grass uses seven light crossed blades '+id);}
   return {ecologyChecks:checks.length};
  }));
  console.log(await page.evaluate(()=>{
   const check=(v,s)=>{if(!v)throw Error(s);};
   worldMap.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();restoreMicroEdits([]);restoreEcology();selectedTerrain='random';
   const themes=[];
   for(const value of [42,43,44,45,46,47]){
    seed=value;setWildernessVersion(3);const s=findSafeSpawn(),c=biomeColumn(s.x,s.z);themes.push(c.biome);
    check(c.biome===['snow','village','beach'][value%3],'Seed creates intended diverse dry start '+value+': '+c.biome);
    check(isSolid(s.x,c.height,s.z)&&!isWaterType(getBlock(s.x,c.height+1,s.z)),'Safe dry spawn '+value);
   }
   seed=43;setWildernessVersion(3);const s=findSafeSpawn(),v=villageRegion(s.x,s.z);window.gardenVillage=v;
   for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++)generateCottageChunk(Math.floor(v.x/16)+dx,Math.floor(v.z/16)+dz);
   let houses=0;for(const dx of [-16,16])for(const dz of [-16,16])if(getBlock(v.x+dx,v.y+1,v.z+dz+3)===8)houses++;
   check(houses===4,'Village has four cottages with doors: '+houses);
   check(getBlock(v.x,v.y,v.z)===3,'Village roads connect its center');
   return {themes,houses,village:v};
  }));
  console.log(await page.evaluate(()=>{
   const check=(v,s)=>{if(!v)throw Error(s);};
   const v=gardenVillage;camera.position.set(v.x+38,v.y+22,v.z+44);camera.lookAt(v.x,v.y+2,v.z);
   for(const meshes of chunkMeshes.values())for(const m of Object.values(meshes))scene.remove(m);chunkMeshes.clear();
   for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){const cx=Math.floor(v.x/16)+dx,cz=Math.floor(v.z/16)+dz;generateTrees(cx,cz);buildChunkMesh(cx,cz);}
   blocker.style.display='none';inventoryUI.style.display='none';document.getElementById('toast-msg').style.display='none';heldItemGroup.visible=false;clouds.visible=false;scene.fog=null;scene.background.setHex(0x9acfea);dirLight.intensity=.8;
   window.pixelCheck=()=>{renderer.render(scene,camera);const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,a=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);const colors=new Set();for(let i=0;i<a.length;i+=64)colors.add(a.slice(i,i+3).join(','));if(colors.size<40)throw Error('Blank canvas');return colors.size;};
   check(pixelCheck()>40,'Village renders varied pixels');return {villageColors:pixelCheck()};
  }));
  await page.screenshot({path:'/private/tmp/mc-ecology-village.png'});
  console.log(await page.evaluate(()=>{
   const check=(v,s)=>{if(!v)throw Error(s);};const v=gardenVillage;
   camera.position.set(v.x+7,v.y+5,v.z+12);camera.lookAt(v.x,v.y+2,v.z);
   spawnExplosionParticles(v.x,v.y+2,v.z);check(explosionParticles.length===162,'Explosion has more ash particles');
   const smoke=explosionParticles.filter(p=>p.blastSmoke),origin=smoke[0].mesh.position.clone();
   for(let i=0;i<30;i++)updateExplosionParticles(1/60);
   check(smoke.length===108&&smoke[0].mesh.scale.x>1&&smoke[0].mesh.position.distanceTo(origin)>.5,'Smoke expands and travels outwards');pixelCheck();return {smoke:smoke.length};
  }));
  await page.screenshot({path:'/private/tmp/mc-ecology-explosion.png'});
  await page.evaluate(()=>{for(let i=0;i<330;i++)updateExplosionParticles(1/60);if(explosionParticles.length)throw Error('Smoke does not clear');pixelCheck();});
  await page.screenshot({path:'/private/tmp/mc-ecology-after-explosion.png'});
  await page.evaluate(()=>{for(let i=0;i<20;i++)spawnExplosionParticles(0,200,0);if(explosionParticles.length>650)throw Error('Unbounded particles');updateExplosionParticles(10);});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>new Promise(resolve=>setTimeout(()=>{pixelCheck();resolve();},150)));await page.screenshot({path:'/private/tmp/mc-ecology-mobile.png'});
  assert.deepEqual(errors,[]);console.log('PASS: plant lifecycle, fruit harvest, safe growth, save/guest authority, workbench recipes, hatch collision, varied villages and explosion motion.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
