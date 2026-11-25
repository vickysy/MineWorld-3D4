const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>requestAnimationFrame=()=>0);
  await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href,{timeout:120000});
  await page.waitForFunction(()=>expansionReady&&!worldLoading,null,{polling:50});
  await page.getByRole('button',{name:'Creative',exact:true}).click();await page.getByRole('button',{name:'Plains',exact:true}).click();
  await page.getByRole('button',{name:'Start Game',exact:true}).click();await page.waitForFunction(()=>isGameStarted&&!worldLoading,null,{polling:50});
  console.log(await page.evaluate(()=>{
   const checks=[],ok=(v,name)=>{if(!v)throw Error(name);checks.push(name);};window.leadCheck=ok;
   clearCombatState();clearExpansionWorld();worldMap.clear();heightCache.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();chunkScanYRanges.clear();
   for(const ms of chunkMeshes.values())for(const m of Object.values(ms))releaseChunkMesh(m);chunkMeshes.clear();rebuildQueue.clear();
   for(const list of [animals,villagers,zombies,creepers,endermen]){for(const m of list)disposeModModel(m.mesh);list.length=0;}
   getSurfaceHeight=()=>79;selectedTerrain='plains';currentDimension='overworld';controls.isLocked=true;isSleeping=false;worldLoading=false;gameMode='survival';gameDifficulty='peaceful';
   for(let x=-16;x<=20;x++)for(let z=-16;z<=16;z++)setGenBlock(x,79,z,1);
   window.newFarmAnimal=(type,x=0,z=0)=>{spawnAnimal(type,x,80,z,true);const a=animals[animals.length-1];a.onGround=true;return a;};
   window.aimLead=(p)=>{camera.lookAt(p);camera.updateMatrixWorld(true);document.dispatchEvent(new MouseEvent('mousedown',{button:2}));};
   window.walkFarm=(seconds)=>{for(let i=0;i<seconds*60;i++){for(const a of animals){if(updateLedAnimal(a,1/60)){const p=a.mesh.position.clone();moveWalkingMob(a,1/60,a.mesh.userData.mobHeight,a.mesh.userData.mobRadius);animateWalkingAnimal(a,p.distanceTo(a.mesh.position),1/60);}}}};
   window.clearFarm=()=>{clearAnimalLeadVisuals();for(const a of animals)disposeModModel(a.mesh);animals.length=0;};
   ok(getBlockName(LEAD_ID)==='Lead'&&isToolItem(LEAD_ID),'Lead registered as tool');
   const slot=document.getElementById('inv-'+(LEAD_ID-12));ok(slot.closest('#tab-weapon')&&slot.dataset.search.includes('牵引绳')&&itemIcon(LEAD_ID),'Searchable Tools icon and Chinese alias');
   const recipe=recipes.find(r=>r.out===LEAD_ID);ok(recipe.ing[STRING_ITEM]===4&&recipe.count===1&&recipeNeedsWorkbench(recipe),'Four string recipe requires workbench');
   currentBlock=LEAD_ID;updateHeldItem3D(LEAD_ID);playerInventory[LEAD_ID]=1;camera.position.set(0,81.15,4);
   let cow=newFarmAnimal('cow');aimLead(cow.mesh.position.clone().add(new THREE.Vector3(0,.3,0)));
   ok(cow.lead&&!cow.lead.anchor&&playerInventory[LEAD_ID]===0&&cow.hp===10,'Actual right click tethers, consumes one lead, does not hurt');
   aimLead(cow.mesh.position.clone().add(new THREE.Vector3(0,.3,0)));
   ok(!cow.lead&&playerInventory[LEAD_ID]===1,'Empty lead stack can still untie and refund exactly one');
   aimLead(cow.mesh.position.clone().add(new THREE.Vector3(0,.3,0)));currentBlock=3;updateHeldItem3D(3);
   for(let i=0;i<240;i++){camera.position.z+=.035;walkFarm(1/60);}
   ok(cow.mesh.position.z>7&&cow.lead&&cow.mesh.position.distanceTo(leadTarget(cow))<4,'Follows walking player while another item is held');
   ok(Math.abs(cow.mesh.userData.leftLeg.rotation.x)>.01,'Following animates walking legs');
   releaseAnimalLead(cow,true);clearFarm();currentBlock=LEAD_ID;updateHeldItem3D(LEAD_ID);camera.position.set(0,81.15,4);cow=newFarmAnimal('cow');
   for(let x=-3;x<=3;x++)for(let y=80;y<=82;y++)setGenBlock(x,y,2,3);
   aimLead(cow.mesh.position.clone().add(new THREE.Vector3(0,.3,0)));
   ok(!cow.lead&&playerInventory[LEAD_ID]===1,'Cannot tether through a wall');
   for(let x=-3;x<=3;x++)for(let y=80;y<=82;y++)setGenBlock(x,y,2,0);
   ok(attachAnimalLead(cow),'Attach after removing wall');camera.position.set(9,81.15,0);
   for(let z=-10;z<=10;z++)for(let y=80;y<=82;y++)setGenBlock(4,y,z,3);
   walkFarm(3);ok(cow.mesh.position.x<3&&cow.lead&&!mobBodyBlocked(cow.mesh.position,cow.mesh.userData.mobHeight,cow.mesh.userData.mobRadius),'Lead cannot pull cow through a wall');
   for(let z=-10;z<=10;z++)for(let y=80;y<=82;y++)setGenBlock(4,y,z,0);
   cow.mesh.position.set(0,80,0);cow.vy=0;cow.onGround=true;cow.lead.steerTime=0;
   for(let x=4;x<=10;x++)for(let z=-4;z<=4;z++)setGenBlock(x,80,z,3);
   camera.position.set(9,82.15,0);walkFarm(4);ok(cow.mesh.position.x>5&&cow.mesh.position.y>80.9,'Can walk up an ordinary one-block step');
   for(let x=4;x<=10;x++)for(let z=-4;z<=4;z++)setGenBlock(x,80,z,0);
   cow.mesh.position.set(0,80,0);cow.vy=0;cow.onGround=true;cow.lead.steerTime=0;camera.position.set(9,81.15,0);
   for(let z=-10;z<=10;z++)setGenBlock(4,80,z,LEAD_POST_ID);
   walkFarm(3);ok(cow.mesh.position.x<3&&cow.lead,'Cannot step over a railing while following');
   for(let z=-10;z<=10;z++)setGenBlock(4,80,z,0);
   cow.mesh.position.set(1,80,0);cow.vy=0;cow.onGround=true;camera.position.set(4,81.1,3);setBlock(4,80,0,LEAD_POST_ID);
   aimLead(new THREE.Vector3(4,80,0));ok(cow.lead.anchor?.join(',')==='4,80,0','Actual right click ties lead to railing');
   camera.position.set(-10,81,5);walkFarm(4);ok(cow.mesh.position.distanceTo(new THREE.Vector3(4,80,0))<3,'Anchored animal stays near farm, not player');
   const saved=saveFarmAnimals();ok(saved.length===1&&saved[0].lead.anchor[0]===4&&snapshotDimension().farmAnimals.length===1,'Farm saved in world and dimension snapshot');
   clearFarm();restoreFarmAnimals(saved);cow=animals[0];ok(cow.farmAnimal&&cow.lead.anchor[0]===4&&cow.hp===10,'Restore animal and railing anchor');
   const beforeDrop=droppedItems.length;setBlock(4,80,0,0);walkFarm(1/60);walkFarm(1/60);
   ok(!cow.lead&&droppedItems.length===beforeDrop+1&&droppedItems.at(-1).itemType===LEAD_ID,'Broken post drops exactly one consumed lead');
   playerInventory[LEAD_ID]=2;attachAnimalLead(cow);camera.position.set(50,81,0);walkFarm(1/60);
   ok(!cow.lead&&cow.mesh.position.x<10,'Excess distance releases rope instead of teleporting cow');
   camera.position.set(3,81.15,3);attachAnimalLead(cow);cow.hp=0;cow.dying=true;cow.deathTimer=.03;
   const deadDrops=droppedItems.length;updateEntities(.1);ok(!animals.includes(cow)&&droppedItems.length===deadDrops+1,'Death releases lead once');
   clearFarm();gameMode='creative';for(let i=0;i<9;i++)newFarmAnimal(i%2?'sheep':'cow',i,0);
   for(let i=0;i<8;i++)ok(attachAnimalLead(animals[i]),'Attach creative animal '+i);
   ok(!attachAnimalLead(animals[8])&&animals.filter(a=>a.lead).length===8,'Eight carried lead limit');
   for(const a of animals)releaseAnimalLead(a,true);
   ok(playerInventory[LEAD_ID]===0,'Creative leads never create survival inventory');
   clearFarm();restoreFarmAnimals([{type:'cow',pos:[NaN,80,0]},{type:'zombie',pos:[0,80,0]}]);ok(animals.length===0,'Malformed farm entries rejected');
   return {checks:checks.length,summary:'Clicks, inventory, follow, walls, hills, railings, persistence, death and limits.'};
  }));
  await page.evaluate(()=>{
   gameMode='survival';playerInventory[STRING_ITEM]=4;playerInventory[LEAD_ID]=0;camera.position.set(0,81,4);
   setBlock(1,80,3,12);openWorkbench({x:1,y:80,z:3});
  });
  await page.locator('#catalog-search').fill('牵引绳');await page.locator('#inv-236').click();
  await page.locator('#catalog-recipes').getByRole('button',{name:'Craft',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>[playerInventory[LEAD_ID],playerInventory[STRING_ITEM],currentBlock]),[1,0,248]);
  console.log('PASS: Search and craft Lead through the real workbench UI.');
  await page.evaluate(()=>{
   controls.isLocked=true;isInventoryOpen=false;setBlock(1,80,3,0);document.activeElement?.blur();
   gameMode='creative';clearFarm();camera.position.set(1,82.2,7);camera.lookAt(0,80.5,0);camera.updateMatrixWorld(true);
   const a=newFarmAnimal('cow',-2,0),b=newFarmAnimal('sheep',2,0);attachAnimalLead(a);attachAnimalLead(b);b.lead.anchor=[4,80,0];setBlock(4,80,0,LEAD_POST_ID);
   a.mesh.rotation.y=.3;b.mesh.rotation.y=-.5;currentBlock=LEAD_ID;updateHeldItem3D(LEAD_ID);updateHandSwing(0);updateAnimalLeadVisuals();
   for(let x=-1;x<=0;x++)for(let z=-1;z<=0;z++)buildChunkMesh(x,z);syncFurnitureMeshes();
   scene.fog=null;clouds.visible=false;scene.background=new THREE.Color(0xa3cddf);ambientLight.intensity=.8;dirLight.intensity=.7;
   blocker.style.display=inventoryUI.style.display='none';document.getElementById('toast-msg').style.visibility='hidden';
  });
  for(const viewport of [{width:1200,height:800},{width:390,height:844}]){
   await page.setViewportSize(viewport);await page.waitForFunction(w=>renderer.domElement.clientWidth===w,viewport.width,{polling:50});
   const pixels=await page.evaluate(()=>{
    updateHandSwing(0);updateAnimalLeadVisuals();const gl=renderer.getContext(),a=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4),b=new Uint8Array(a.length);
    for(const line of leadVisuals.values())line.visible=false;renderer.render(scene,camera);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,a);
    for(const line of leadVisuals.values())line.visible=true;renderer.render(scene,camera);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,b);
    let changed=0;const colors=new Set();for(let i=0;i<a.length;i+=4){if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>8)changed++;if(i%128===0)colors.add(b.slice(i,i+3).join(','));}
    return {changed,colors:colors.size,lines:leadVisuals.size};
   });
   assert(pixels.changed>15&&pixels.colors>30&&pixels.lines===2,'Visible ropes and world: '+JSON.stringify(pixels));console.log({viewport,pixels});
   await page.screenshot({path:'/private/tmp/animal-leads-'+viewport.width+'.png'});
  }
  const farmSave=await page.evaluate(()=>JSON.stringify(getWorldSaveData()));
  await page.evaluate(data=>{clearFarm();loadSaveFile({target:{files:[new File([data],'farm.json',{type:'application/json'})]}});},farmSave);
  await page.waitForFunction(()=>animals.filter(a=>a.farmAnimal).length===2,null,{polling:50});
  assert.deepEqual(await page.evaluate(()=>animals.filter(a=>a.farmAnimal).map(a=>({type:a.type,lead:!!a.lead,anchor:a.lead?.anchor}))),[
   {type:'cow',lead:true,anchor:null},{type:'sheep',lead:true,anchor:[4,80,0]}]);
  console.log('PASS: Actual saved-world file restores both animals and their different rope states.');
  assert.deepEqual(errors,[]);console.log('PASS: animal leads and desktop/mobile GPU screenshots.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
