const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1000,height:650},acceptDownloads:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
  await page.waitForFunction(()=>expansionReady);
  console.log(await page.evaluate(()=>{
   const ok=(v,msg)=>{if(!v)throw Error(msg);};
   currentDimension='overworld';selectedTerrain='random';seed=42;setWildernessVersion(4);worldMap.clear();clearExpansionWorld();isGameStarted=true;
   for(const meshes of chunkMeshes.values())for(const mesh of Object.values(meshes)){scene.remove(mesh);mesh.geometry.dispose();}chunkMeshes.clear();
   let web=null;
   for(let n=0;n<100&&!web;n++){
    const c=cliffRegion((n%10-5)*96,(Math.floor(n/10)-5)*96);if(!c)continue;
    for(let u=4;u<33&&!web;u++)for(let v=-6;v<=6&&!web;v++)for(let dy=1;dy<=5;dy++){
     const x=c.x+u*c.nx-v*c.nz,z=c.z+u*c.nz+v*c.nx,y=c.floor+dy;
     if(getBlock(x,y,z)===COBWEB){web=[x,y,z];break;}
    }
   }
   ok(web&&isSolid(...[web[0],web[1]+1,web[2]]),'Natural cave webs hang from a solid ceiling');
   let village;for(let n=0;n<400&&!village;n++)village=villageRegion((n%20-10)*192,(Math.floor(n/20)-10)*192);
   ok(village,'Village exists');window.testVillage=village;
   const {x,z,y}=village;
   for(let cx=Math.floor((x-48)/16);cx<=Math.floor((x+48)/16);cx++)for(let cz=Math.floor((z-48)/16);cz<=Math.floor((z+48)/16);cz++)generateHouseData(cx,cz);
   for(const [dx,dz] of VILLAGE_HOMES){
    ok(getBlock(x+dx,y,z+dz)===63,'Large house floor');
    ok(getBlock(x+dx,y+1,z+dz+5)===8&&getBlock(x+dx+5,y+2,z+dz+4)===0,'Door and spacious interior');
    ok(getBlock(x+dx,y,z+dz+9)===23,'Door connects to village path');
   }
   ok(getBlock(x+9,y,z-35)===24&&getBlock(x+10,y+1,z-35)===3,'Well retains water with stone rim');
   ok(getBlock(x-10,y+11,z+37)===7&&getBlock(x-9,y+12,z+39)===63,'Lookout ladder reaches upper deck');
   ok([...worldMap.values()].filter(t=>[RICE_GREEN,RICE_RIPE].includes(t)).length>50,'Rice paddy is planted');
   ok([...worldMap.values()].filter(t=>[FLOWER_RED,FLOWER_BLUE].includes(t)).length>20,'Roadside flowers');
   for(let cx=Math.floor((x-48)/16);cx<=Math.floor((x+48)/16);cx++)for(let cz=Math.floor((z-48)/16);cz<=Math.floor((z+48)/16);cz++)buildChunkMesh(cx,cz);
   camera.position.set(x,y+4,z);populateVillagePaths();
   const residents=villagers.filter(v=>v.villageRoute);ok(residents.length>=3,'Residents are on loaded paths');
   const start=residents[0].mesh.position.clone();controls.isLocked=true;for(let n=0;n<120;n++)updateEntities(1/60);
   ok(residents[0].mesh.position.distanceTo(start)>.7,'Resident actually walks');ok(villageRoad(Math.round(residents[0].mesh.position.x)-x,Math.round(residents[0].mesh.position.z)-z),'Walker stays on path');
   window.villageSave=getWorldSaveData();window.testCheck=ok;
   camera.position.set(x+8,y+36,z+58);camera.lookAt(x,y+1,z);blocker.style.display='none';inventoryUI.style.display='none';heldItemGroup.visible=false;
   syncFurnitureMeshes();renderer.render(scene,camera);
   return {naturalCobweb:web,homes:6,residents:residents.length,flowers:[...worldMap.values()].filter(t=>[FLOWER_RED,FLOWER_BLUE].includes(t)).length};
  }));
  await page.screenshot({path:'/private/tmp/mc-village-expanded.png'});
  console.log(await page.evaluate(()=>{
   const ok=testCheck;clearExpansionWorld();worldMap.clear();currentDimension='overworld';selectedTerrain='moon';heightCache.clear();gameMode='survival';
   window.realHeight=getSurfaceHeight;getSurfaceHeight=()=>0;controls.isLocked=true;camera.position.set(0,2.1,4);currentBlock=34;
   setGenBlock(0,1,0,COBWEB);mineBlock({x:0,y:1,z:0},false);
   ok(getBlock(0,1,0)===0&&droppedItems.some(d=>d.itemType===STRING_ITEM),'Web drops string');
   ok(!hasInventoryItem(FISHING_ROD),'Survival rod requires crafting');
   setGenBlock(2,1,3,12);setWorkbench([2,1,3]);craftingGrid=[4,4,4,STRING_ITEM,STRING_ITEM,0,0,0,0];checkRecipes();ok(craftingOutput.id===FISHING_ROD,'Workbench recipe');
   playerInventory[FISHING_ROD]=1;currentBlock=FISHING_ROD;
   for(let x=-3;x<=3;x++)for(let z=-3;z<=2;z++)setGenBlock(x,1,z,24);
   camera.lookAt(0,1,0);camera.updateMatrixWorld(true);
   document.dispatchEvent(new MouseEvent('mousedown',{button:2}));ok(fishingCast,'Right click casts onto water');
   const old=playerInventory[RAW_FISH]||0;document.dispatchEvent(new MouseEvent('mousedown',{button:2}));ok(!fishingCast&&(playerInventory[RAW_FISH]||0)===old,'Early reel catches nothing');
   fishingClick({button:2});fishingCast.age=fishingCast.bite+.1;fishingClick({button:2});
   ok(playerInventory[RAW_FISH]===old+1&&!fishingCast,'Bite and reel gives one fish');
   const pos=[5,1,0];setGenBlock(5,0,0,2);setGenBlock(6,0,0,24);setBlock(...pos,RICE_SHOOTS);
   for(const next of [RICE_GREEN,RICE_RIPE]){const p=plantGrowth.get('overworld|'+pos);p.age=100;growPlant(...pos,p);ok(getBlock(...pos)===next,'Rice grows beside water');}
   ok(harvestPlant(...pos).id===RICE&&getBlock(...pos)===RICE_SHOOTS,'Rice harvest leaves shoots');
   const p=plantGrowth.get('overworld|'+pos);setGenBlock(6,0,0,3);p.age=100;growPlant(...pos,p);ok(getBlock(...pos)===RICE_SHOOTS,'Dry rice pauses growth');
   getSurfaceHeight=realHeight;
   return 'PASS: web drops, crafted rod, cast/reel timing and irrigated rice.';
  }));
  console.log(await page.evaluate(()=>{
   const ok=testCheck;currentDimension='overworld';selectedTerrain='moon';worldMap.clear();clearExpansionWorld();heightCache.clear();camera.position.set(0,15,0);gameMode='creative';
   const plan=parseWorldCommand('帮我建造牢房12×10×5');ok(plan.shape==='prison','Chinese prison command');
   startConstruction(plan);while(commandJob)tickCommandJob();const r=constructionRegions[0];
   ok(getBlock(r.x+1,r.y+2,r.z)===98,'Front wall uses existing railing');
   ok(isSolid(r.x+1,r.y+2,r.z),'Bars block passage');
   ok(getBlock(r.x+6,r.y+1,r.z)===8&&getBlock(r.x+6,r.y+2,r.z)===9,'Cell has full-height closable entrance');
   ok(getBlock(r.x+6,r.y+1,r.z+1)===0,'Entrance opens into free space');
   buildChunkMesh(Math.floor(r.x/16),Math.floor(r.z/16));
   ok(Object.values(chunkMeshes.get(Math.floor(r.x/16)+','+Math.floor(r.z/16))).some(m=>m.userData.blockIndices?.has([r.x+1,r.y+2,r.z].join(','))),'Procedural prison bars are rendered');
   return 'PASS: bounded command, rendered solid bars, working door cells, empty interior.';
  }));
  console.log(await page.evaluate(()=>{
   const ok=testCheck;clearExpansionWorld();worldMap.clear();selectedTerrain='plains';heightCache.clear();camera.position.set(0,20,0);seed=42;
   for(let x=-24;x<=24;x++)for(let z=-24;z<=24;z++){setGenBlock(x,15,z,3);setGenBlock(x,25,z,3);}
   ok(weatherColumn(0,0).top===25.5,'Stone roof intercepts rain');
   setGenBlock(0,25,0,2);rainColumns.clear();ok(weatherColumn(0,0).top===15.5,'Dirt roof leaks rain');
   ok(weatherColumn(0,0,true).top===25.5,'Snow stops on roof');
   setGenBlock(0,25,0,6);rainColumns.clear();ok(weatherColumn(0,0).top===25.5,'Glass roof blocks rain');
   for(let c=0;c<10;c++){weatherClock=c*240+180;if(weatherKind()==='rain')break;}
   const wetTime=weatherClock;
   for(let n=0;n<40;n++)updateWeather(.05);
   ok(weatherVisual.particles.filter(Boolean).every(p=>p.hidden||p.y>=25.5),'No falling rain rendered below stone roof');
   for(let x=-24;x<=24;x++)for(let z=-24;z<=24;z++)setGenBlock(x,25,z,2);
   rainColumns.clear();weatherVisual.particles.length=0;for(let n=0;n<15;n++)updateWeather(.05);
   ok(weatherVisual.particles.some(p=>p&&!p.hidden&&p.y<25),'Drops fall through mud ceiling');
   camera.position.y=35;weatherVisual.particles.length=0;rainColumns.clear();
   for(let x=-24;x<=24;x++)for(let z=-24;z<=24;z++)setGenBlock(x,25,z,24);
   for(let n=0;n<40;n++)updateWeather(.05);
   ok(weatherVisual.spray.length===0,'No water ripple or splash on water');
   for(let x=-24;x<=24;x++)for(let z=-24;z<=24;z++)setGenBlock(x,25,z,3);
   rainColumns.clear();weatherVisual.particles.length=0;for(let n=0;n<60;n++)updateWeather(.05);
   ok(weatherVisual.spray.length>0,'Rain splashes on solid surfaces');
   weatherClock=0;updateWeather(0);ok(!weatherVisual.drops.visible,'Clear interval disables rain draw');
   return 'PASS: rain/clear intervals, roof shielding, mud leaks, solid splashes, no water ripples.';
  }));
  console.log(await page.evaluate(()=>{
   const ok=testCheck,sc=new THREE.Scene();sc.background=new THREE.Color(0);sc.fog=new THREE.Fog(0,172,240);
   const cube=new THREE.Mesh(new THREE.BoxGeometry(4,4,4),new THREE.MeshBasicMaterial({color:0xffffff}));cube.position.set(0,0,-205);sc.add(cube);
   const cam=new THREE.PerspectiveCamera(75,1000/650,.1,320),gl=renderer.getContext();
   const pixel=angle=>{cam.rotation.y=angle;cam.updateMatrixWorld(true);renderer.render(sc,cam);const v=cube.position.clone().project(cam),p=new Uint8Array(4);gl.readPixels(Math.floor((v.x+1)*gl.drawingBufferWidth/2),Math.floor((v.y+1)*gl.drawingBufferHeight/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return p[0];};
   const straight=pixel(0),side=pixel(.6);ok(Math.abs(straight-side)<=2&&straight>20&&straight<230,'Fog must not change with view angle: '+straight+'/'+side);
   return {fogStraight:straight,fogAtSide:side};
  }));
  await page.evaluate(()=>new Promise(resolve=>loadSaveFile({target:{files:[new File([JSON.stringify(villageSave)],'village.json')]}},resolve)));
  await page.evaluate(()=>{
   controls.isLocked=true;isInventoryOpen=false;camera.position.set(testVillage.x+8,testVillage.y+32,testVillage.z+48);camera.lookAt(testVillage.x,testVillage.y+2,testVillage.z);
   updateChunks(camera.position);while(chunkQueue.length){const c=chunkQueue.shift();buildChunkIfMissing(c.x,c.z);}
   while(horizon.queue.length||horizon.dirty.size)updateTerrainHorizon(lastChunkX,lastChunkZ);
   syncFurnitureMeshes();
   testCheck(villagers.filter(v=>v.villageRoute).length===6,'Residents restore without duplicates');
  });
  await page.keyboard.press('t');
  await page.getByRole('button',{name:'Take Photo',exact:true}).waitFor();
  console.log(await page.evaluate(()=>{
   const ok=testCheck;window.oldWeatherKind=weatherKind;weatherKind=()=> 'rain';
   const size=worldMap.size;
   for(let n=0;n<100;n++)updateWeather(.1);
   ok(weatherVisual.drops.count===300&&worldMap.size===size,'Pooled rain does not modify terrain');
   const mat=new THREE.Matrix4(),scale=new THREE.Vector3();weatherVisual.drops.getMatrixAt(0,mat);scale.setFromMatrixScale(mat);
   ok(scale.y===0||scale.y>scale.x*10,'Rain drops are short narrow streaks');renderer.render(scene,camera);
   return 'PASS: bounded rain particles; terrain is unchanged.';
  }));
  await page.screenshot({path:'/private/tmp/mc-weather-rain.png'});
  console.log(await page.evaluate(()=>{
   const ok=testCheck;weatherKind=()=> 'snow';const size=worldMap.size;
   for(let n=0;n<200;n++)updateWeather(.1);
   ok(weatherVisual.drops.count===190&&worldMap.size===size,'Snow has no terrain side effects');
   const mat=new THREE.Matrix4(),scale=new THREE.Vector3();weatherVisual.drops.getMatrixAt(0,mat);scale.setFromMatrixScale(mat);
   ok(scale.x===scale.y&&scale.y===scale.z,'Snow is tiny cubes');renderer.render(scene,camera);
   return 'PASS: small snow cubes, fixed particle budget and no accumulation.';
  }));
  await page.screenshot({path:'/private/tmp/mc-weather-snow.png'});
  await page.evaluate(()=>{weatherKind=oldWeatherKind;weatherClock=0;updateWeather(0);});
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Take Photo',exact:true}).click();
  const file=await(await download).path(),bytes=fs.readFileSync(file);assert.equal(bytes.subarray(1,4).toString(),'PNG');assert(bytes.length>15000);
  assert.equal(await page.evaluate(()=>document.querySelector('#crosshair').getBoundingClientRect().width>0&&getComputedStyle(document.querySelector('#crosshair')).visibility),'hidden');
  await page.screenshot({path:'/private/tmp/mc-photo-mode-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>renderer.domElement.width===390,null,{polling:50});await page.evaluate(()=>renderer.render(scene,camera));
  const box=await page.locator('#photo-tools').boundingBox();assert(box.x>=0&&box.x+box.width<=390);
  await page.screenshot({path:'/private/tmp/mc-photo-mode-mobile.png'});
  await page.keyboard.press('t');assert.equal(await page.evaluate(()=>photoMode),false);
  assert.deepEqual(errors,[]);console.log('PASS: actual T key, shutter PNG download, clean image, desktop/mobile controls and T to exit.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
