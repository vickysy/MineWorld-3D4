const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultNavigationTimeout(120000);
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
  await page.waitForFunction(()=>expansionReady);
  const report=await page.evaluate(()=>{
   const checks=[],check=(v,s)=>{if(!v)throw Error(s);checks.push(s);};
   check(document.querySelector('#terrain-select').value==='random','Random World is the default menu option');
   check(document.querySelector('#difficulty-select option[value=peaceful]'),'Peaceful is selectable');
   clearExpansionWorld();worldMap.clear();heightCache.clear();selectedTerrain='random';currentDimension='overworld';seed=42;
   window.natureLocations={};const samples=[];
   for(let x=-400;x<=400;x+=8)for(let z=-400;z<=400;z+=8){const col=biomeColumn(x,z);samples.push(col.height);natureLocations[col.biome]??={x,z,h:col.height};}
   for(const biome of ['snow','bamboo','autumn','meadow','ocean','cliffs'])check(natureLocations[biome],'Generated biome: '+biome);
   const first=biomeColumn(43,37);biomeCache.clear();check(JSON.stringify(first)===JSON.stringify(biomeColumn(43,37)),'Same seed repeats the landscape');
   seed=99;check(JSON.stringify(first)!==JSON.stringify(biomeColumn(43,37)),'Different seeds vary the landscape');seed=42;heightCache.clear();
   check(Math.max(...samples)-Math.min(...samples)>30,'Terrain has substantial height variation');
   const snow=natureLocations.snow;check(getBlock(snow.x,snow.h,snow.z)===154,'Snow biome has mineable snow blocks');
   let cave=null,plant=null;
   for(let x=-160;x<160&&!cave;x+=2)for(let z=-160;z<160&&!cave;z+=2){const h=getSurfaceHeight(x,z);for(let y=8;y<h-2;y++)if(getBlock(x,y,z)===0&&getBlock(x,y+1,z)===0&&isSolid(x,y-1,z)){cave={x,y,z};break;}}
   check(cave,'Caves have air space over solid floors');camera.position.set(cave.x,cave.y+1,cave.z);buildChunkMesh(Math.floor(cave.x/CHUNK_SIZE),Math.floor(cave.z/CHUNK_SIZE));
   const meshes=chunkMeshes.get(`${Math.floor(cave.x/CHUNK_SIZE)},${Math.floor(cave.z/CHUNK_SIZE)}`);
   check(Object.values(meshes).some(m=>m.userData.blockIndices.has(`${cave.x},${cave.y-1},${cave.z}`)),'Unmined cave floor is rendered, not a void');
   for(let i=0;i<40;i++){const p=findSafeSpawn();check(isSolid(p.x,getSurfaceHeight(p.x,p.z),p.z)&&!isWaterType(getBlock(p.x,getSurfaceHeight(p.x,p.z)+1,p.z)),'Dry solid spawn '+i);}
   for(const biome of ['bamboo','autumn']){const p=natureLocations[biome];for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)generateTrees(Math.floor(p.x/CHUNK_SIZE)+a,Math.floor(p.z/CHUNK_SIZE)+b);}
   check([...worldMap.values()].includes(158),'Bamboo stalks generate');check([...worldMap.values()].some(id=>id>=155&&id<=157),'Colored forest leaves generate');
   for(const id of Object.keys(NATURE_ITEMS).map(Number)){check(!!materials[id]&&roomCellValid([0,0,0,id]),'New item material and network ID '+id);check(Object.values(getInventorySlotMapping()).includes(id),'New item selectable '+id);}
   for(const base of hiddenByBase.keys())for(const template of [132,133,134,hiddenByBase.get(174)]){
    const result=hiddenCraft({[template]:1,[base]:1});check(result?.id===hiddenByBase.get(base),'Hidden conversion '+template+' + '+base);
    check(!isSolidType(result.id)&&materials[result.id]===materials[base],'Hidden block uses base material and is passable '+base);
   }
   check(!hiddenCraft({132:2,174:1})&&!hiddenCraft({132:1,174:1,3:1}),'Hidden recipe rejects extras');
   craftingGrid.fill(0);craftingGrid[0]=132;craftingGrid[1]=174;checkRecipes();check(craftingOutput.id===430&&craftingOutput.count===1,'Real crafting grid converts red brick');craftingGrid.fill(0);checkRecipes();
   check(!roomCellValid([0,0,0,99999]),'Unknown network IDs rejected');

   worldMap.clear();heightCache.clear();selectedTerrain='moon';gameMode='creative';playerScale=1;isGameStarted=true;controls.isLocked=true;
   for(let x=-8;x<=8;x++)for(let z=-8;z<=8;z++){worldMap.set(`${x},39,${z}`,3);for(let y=40;y<=43;y++)worldMap.set(`${x},${y},${z}`,0);}
   worldMap.set('0,40,0',159);camera.position.set(0,41.1,0);updateWilderness(.1);check(itchTimer===0,'Creative bamboo contact has no itch');gameMode='survival';updateWilderness(.1);check(itchTimer>0,'Survival bamboo contact triggers itch');
   const hp=health;updateWilderness(.1);check(health===hp,'Itch does not silently drain health');
   for(const id of WATER_PLANTS){worldMap.set('0,40,0',id);check(waterAmount(0,40,0)===8,'Waterlogged plant water volume '+id);check(getEnvironmentTypeAt(0,40,0)===24,'Waterlogged plant oxygen '+id);camera.position.set(0,40.4,0);check(getPlayerEnvironment().waterFraction>0,'Waterlogged plant buoyancy '+id);}
   worldMap.set('0,40,0',165);worldMap.set('1,40,0',43);check(quenchLava(1,40,0,new Set())&&getBlock(1,40,0)===44,'Coral water quenches lava');
   for(const m of zombies)disposeModModel(m.mesh);zombies=[];
   const mesh=createZombieModel();mesh.position.set(2,40,0);scene.add(mesh);zombies.push({mesh,kind:'zombie',hp:3,hurtTimer:0,deathTimer:0,dying:false,vx:0,vy:0,vz:0,onGround:true,walkTime:0,soundTimer:100});
   camera.position.set(2,40.6,.3);health=maxHealth;setDifficulty('peaceful');updateEntities(.05);check(health===maxHealth&&zombies[0].vx===0&&zombies[0].vz===0,'Peaceful zombie cannot chase or hurt player');
   setDifficulty('normal');gameMode='creative';updateEntities(.05);check(health===maxHealth&&zombies[0].vx===0,'Creative zombie cannot chase or hurt player');
   gameMode='survival';updateEntities(.05);check(health<maxHealth,'Normal Survival zombie still attacks');
   setDifficulty('peaceful');check(getWorldSaveData().gameDifficulty==='peaceful','Difficulty saved with world');

   const model=createRemotePlayer(),p={x:0,y:42,z:0,ry:0,scale:1,dimension:'overworld',held:4,mech:null};
   updateRemoteAppearance(model,p);check(model.userData.heldId===4&&model.userData.held.material[0].map===materials[4][0].map,'Remote wood uses the actual wood material');
   p.mech={id:71,form:'robot'};p.scale=2;updateRemoteAppearance(model,p);check(model.userData.mechId===71&&!model.children[0].visible,'Remote Bumblebee replaces the human');
   p.mech.form='vehicle';p.scale=MECH_TYPES[71].vehicleScale;updateRemoteAppearance(model,p);check(model.userData.form==='vehicle'&&!model.userData.mech.userData.cannon.visible,'Remote vehicle pose folds panels and hides cannon');
   p.mech=null;p.scale=1;p.held=174;updateRemoteAppearance(model,p);check(model.children[0].visible&&model.userData.heldId===174&&!model.userData.mech,'Returning human also updates held brick');disposeModModel(model);
   check(!remoteAppearance({held:-1,mech:{id:99,form:'bad'}}).mech,'Invalid avatar metadata rejected');
   return {checks:checks.length,locations:natureLocations,cave};
  });console.log(report);

  await page.evaluate(()=>{
   clearWilderness();for(const group of chunkMeshes.values())for(const m of Object.values(group))scene.remove(m);chunkMeshes.clear();worldMap.clear();heightCache.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();
   for(const list of [zombies,creepers,villagers,animals]){for(const m of list)scene.remove(m.mesh);list.length=0;}
   gameMode='creative';selectedTerrain='random';playerScale=1;seed=42;isGameStarted=true;controls.isLocked=false;
   const p=natureLocations.autumn;camera.position.set(p.x+12,p.h+8,p.z+18);camera.lookAt(p.x,p.h+2,p.z);
   for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const x=Math.floor(p.x/CHUNK_SIZE)+dx,z=Math.floor(p.z/CHUNK_SIZE)+dz;generateTrees(x,z);buildChunkMesh(x,z);}
   blocker.style.display='none';inventoryUI.style.display='none';document.getElementById('hud-container').style.display='flex';heldItemGroup.visible=false;clouds.visible=false;scene.background.setHex(0xafd6e4);scene.fog=null;dirLight.intensity=.9;renderer.render(scene,camera);
  });
  const pixels=()=>page.evaluate(()=>{renderer.render(scene,camera);const gl=renderer.getContext(),p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4),c=new Set();gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);for(let i=0;i<p.length;i+=256)c.add(`${p[i]},${p[i+1]},${p[i+2]}`);return c.size;});
  assert(await pixels()>20);await page.screenshot({path:'/private/tmp/mc-wilderness-autumn.png'});
  await page.setViewportSize({width:390,height:844});assert(await pixels()>20);await page.screenshot({path:'/private/tmp/mc-wilderness-mobile.png'});
  await page.setViewportSize({width:1280,height:800});
  await page.evaluate(()=>{
   for(const group of chunkMeshes.values())for(const m of Object.values(group))scene.remove(m);chunkMeshes.clear();
   const p=Object.values(natureLocations).find(p=>p.h<5)||(()=>{for(let x=-400;x<400;x+=4)for(let z=-400;z<400;z+=4)if(biomeColumn(x,z).height<5&&biomeColumn(x,z).warm)return {x,z,h:biomeColumn(x,z).height};})();
   camera.position.set(p.x,p.h+2,p.z+3);camera.lookAt(p.x+6,p.h+1,p.z-8);
   for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)buildChunkMesh(Math.floor(p.x/CHUNK_SIZE)+dx,Math.floor(p.z/CHUNK_SIZE)+dz);
   for(let i=0;i<30;i++)updateWilderness(.1);scene.background.setHex(0x397b94);document.getElementById('toast-msg').style.display='none';renderer.render(scene,camera);
  });assert(await pixels()>20);assert(await page.evaluate(()=>natureFish.length)>0);await page.screenshot({path:'/private/tmp/mc-wilderness-ocean.png'});
  const before=await page.evaluate(()=>natureFish[0].mesh.position.toArray());await page.evaluate(()=>{for(let i=0;i<60;i++)updateWilderness(1/60);});assert.notDeepEqual(await page.evaluate(()=>natureFish[0].mesh.position.toArray()),before);
  assert.deepEqual(errors,[]);console.log('PASS: terrain, caves, plants, hidden recipes, peaceful combat, avatar models, desktop/mobile pixels and moving fish');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
