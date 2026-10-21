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
   clearExpansionWorld();worldMap.clear();heightCache.clear();seed=42;selectedTerrain='random';currentDimension='overworld';
   const stats=version=>{
    setWildernessVersion(version);let steep=0;const anchors=new Set();
    for(let x=-384;x<384;x+=4)for(let z=-384;z<384;z+=4){const c=biomeColumn(x,z);if(Math.abs(c.height-biomeColumn(x+1,z).height)>2||Math.abs(c.height-biomeColumn(x,z+1).height)>2)steep++;
     if(c.cliff&&c.height>c.cliff.floor+14)anchors.add(c.cliff.x+','+c.cliff.z);}
    return {steep,anchors:anchors.size};
   };
   const old=stats(1),current=stats(2);
   check(current.anchors>old.anchors*1.4,'More distinct cliffs in the same explored area');
   check(current.steep>old.steep*1.4,'More actual steep rock faces, not just renamed hills');
   let crossed=0;
   for(let x=-384;x<=384;x+=96)for(let z=-384;z<384;z++)for(const [a,b] of [[[x-1,z],[x,z]],[[z,x-1],[z,x]]]){
    const left=biomeColumn(...a),right=biomeColumn(...b);
    if(left.cliff&&left.cliff.u>8&&left.height>baseLandscapeHeight(...a)+10){
     check(Math.abs(left.height-right.height)<=10,'Raised cliffs continue across region boundaries');crossed++;
    }
   }
   check(crossed>10,'Boundary test actually crosses elevated landforms');
   for(let i=0;i<20;i++){const p=findSafeSpawn();check(!!p.look&&isSolid(p.x,getSurfaceHeight(p.x,p.z),p.z),'Dry spawn with a cliff in view '+i);}
   let site=null,cliff=null;
   for(let x=-160;x<=160&&!site;x+=8)for(let z=-160;z<=160&&!site;z+=8)if(biomeColumn(x,z).biome==='meadow')site=cottageSite(x,z);
   check(site,'House site on dry, gentle terrain');window.cottageTestSite=site;
   for(let x=-160;x<=160&&!cliff;x+=4)for(let z=-160;z<=160&&!cliff;z+=4){const c=biomeColumn(x,z);if(c.cliff&&Math.abs(c.height-biomeColumn(x+2,z).height)>6)cliff={x,z};}
   check(cliff&&!cottageSite(cliff.x,cliff.z),'Do not bulldoze steep cliffs to generate a house');
   const {x,y,z}=site;window.houseBuild=buildCottage(x,y,z,0);
   const at=(dx,dy,dz)=>getBlock(x+dx,y+dy,z+dz);
   check(at(0,1,3)===8&&at(0,2,3)===9,'Usable two-block entry door');
   check(at(0,7,0)===61&&at(4,5,0)===61,'Sloping roof rises to a ridge');
   check(at(4,2,-1)===6&&at(4,3,-1)===6,'Tall side windows');
   check(at(-3,1,-3)===14&&at(2,1,0)===82&&at(2,2,0)===89,'Bed, desk and lamp are real furniture');
   for(let dx=-4;dx<=4;dx++)for(let dz=-4;dz<=3;dz++)check(isSolid(x+dx,y-1,z+dz),'Foundation is supported '+dx+','+dz);
   check(!cottageSite(x,z,true),'Natural generation will not overwrite an existing building');
   for(const key of houseBuild.dirty)buildChunkMesh(...key.split(',').map(Number));syncFurnitureMeshes();
   camera.position.set(x,y+2.1,z+4.25);camera.lookAt(x,y+1.5,z+3);camera.updateMatrixWorld(true);controls.isLocked=true;isGameStarted=true;gameMode='creative';currentBlock=2;
   check(checkScaledCollision(new THREE.Vector3(x,y+2.1,z+3)),'Closed door blocks a player');
   document.dispatchEvent(new MouseEvent('mousedown',{button:2}));
   check(at(0,1,3)===10&&!checkScaledCollision(new THREE.Vector3(x,y+2.1,z+3)),'Right-click opens the door and passage');
   camera.rotation.set(0,0,0);moveForward=true;for(let i=0;i<55;i++)updatePlayerMovement(1/60);moveForward=false;
   check(camera.position.z<z+3,'Player really walks through the open entrance');controls.isLocked=false;
   check(getWorldSaveData().wildernessVersion===2,'Terrain generation version is saved');
   blocker.style.display='none';inventoryUI.style.display='none';heldItemGroup.visible=false;clouds.visible=false;scene.fog=new THREE.Fog(0xb8d9e8,45,85);scene.background.setHex(0xb8d9e8);dirLight.intensity=.8;
   window.renderCottage=()=>{camera.position.set(x+16,y+9,z+19);camera.lookAt(x,y+3,z);for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)buildChunkMesh(Math.floor(x/16)+dx,Math.floor(z/16)+dz);syncFurnitureMeshes();renderer.render(scene,camera);};renderCottage();
   return {checks:checks.length,old,current,crossed,site};
  }));
  await page.screenshot({path:'/private/tmp/mc-new-cottage.png'});
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>renderer.domElement.width===Math.floor(innerWidth*renderer.getPixelRatio()),null,{polling:100});await page.evaluate(()=>{renderer.render(scene,camera);});await page.screenshot({path:'/private/tmp/mc-new-cottage-mobile.png'});
  await page.setViewportSize({width:1280,height:800});await page.waitForFunction(()=>renderer.domElement.width===Math.floor(innerWidth*renderer.getPixelRatio()),null,{polling:100});
  console.log(await page.evaluate(()=>{
   const {x,y,z}=cottageTestSite;camera.position.set(x,y+2.1,z+2);camera.lookAt(x,y+1.7,z-3);renderer.render(scene,camera);
   const gl=renderer.getContext(),px=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,px);
   const colors=new Set();for(let i=0;i<px.length;i+=64)colors.add(`${px[i]},${px[i+1]},${px[i+2]}`);if(colors.size<20)throw Error('Blank cottage interior');return {interiorColors:colors.size};
  }));await page.screenshot({path:'/private/tmp/mc-new-cottage-inside.png'});
  console.log(await page.evaluate(async()=>{
   const save=getWorldSaveData(),modern=biomeColumn(37,17).height;
   await new Promise(resolve=>loadSaveFile({target:{files:[new File([JSON.stringify(save)],'world.json')]}},resolve));
   if(wildernessVersion!==2||biomeColumn(37,17).height!==modern)throw Error('New terrain changed after save/load');
   setWildernessVersion(1);const legacy=biomeColumn(37,17).height;delete save.wildernessVersion;
   await new Promise(resolve=>loadSaveFile({target:{files:[new File([JSON.stringify(save)],'old-world.json')]}},resolve));
   if(wildernessVersion!==1||biomeColumn(37,17).height!==legacy)throw Error('Old save was forced into a different landscape');
   return 'PASS: current and legacy terrain versions survive actual save loading.';
  }));
  assert.deepEqual(errors,[]);console.log('PASS: denser continuous cliffs, safe cottage sites, foundations, furniture and usable doors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
