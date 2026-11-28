const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>requestAnimationFrame=()=>0);
  await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href,{timeout:120000});
  await page.waitForFunction(()=>expansionReady&&!worldLoading,null,{polling:50});
  console.log(await page.evaluate(()=>{
   const checks=[],ok=(v,name)=>{if(!v)throw Error(name);checks.push(name);};
   clearCombatState();clearExpansionWorld();worldMap.clear();modifiedColumns.clear();columnMinY.clear();chunkScanYRanges.clear();chunkMaxY.clear();heightCache.clear();
   currentDimension='overworld';selectedTerrain='random';seed=42;setWildernessVersion(5);
   const key=(x,y,z)=>x+','+y+','+z,round=p=>[Math.round(p.x),Math.round(p.y),Math.round(p.z)];
   let region=null;
   for(let cx=-3;cx<=3&&!region;cx++)for(let cz=-3;cz<=3&&!region;cz++){
    const c=naturalCaveRegion(cx,cz);if(!c||c.points.some(p=>biomeColumn(Math.round(p.x),Math.round(p.z)).village))continue;
    if(c.points.slice(1).every(p=>{const [x,y,z]=round(p);return naturalCaveAt(x,y,z,getSurfaceHeight(x,z));}))region=c;
   }
   ok(region,'Found a real cliff network with all rooms below ground');window.caveTestRegion=region;
   const {points}=region,minX=Math.floor(Math.min(...points.map(p=>p.x))-12),maxX=Math.ceil(Math.max(...points.map(p=>p.x))+12),
    minZ=Math.floor(Math.min(...points.map(p=>p.z))-12),maxZ=Math.ceil(Math.max(...points.map(p=>p.z))+12),
    minY=Math.floor(Math.min(...points.map(p=>p.y))-8),maxY=Math.ceil(Math.max(...points.map(p=>p.y))+5);
   const directions=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],queue=[round(points[2])],seen=new Set([key(...queue[0])]),shell=new Set();
   for(let index=0;index<queue.length;index++){
    const [x,y,z]=queue[index];
    for(const [dx,dy,dz] of directions){
     const nx=x+dx,ny=y+dy,nz=z+dz,k=key(nx,ny,nz);
     if(nx<minX||nx>maxX||nz<minZ||nz>maxZ||ny<minY||ny>maxY)continue;
     if(isSolidType(getBlock(nx,ny,nz))){shell.add(k);continue;}
     if(seen.has(k)||!naturalCaveAt(nx,ny,nz,getSurfaceHeight(nx,nz)))continue;seen.add(k);queue.push([nx,ny,nz]);
    }
   }
   ok(queue.length>3000,'Connected network has substantial explorable volume');
   for(const [i,p] of points.entries())if(i)ok(seen.has(key(...round(p))),'Connected mouth, branch or chamber '+i);
   for(let t=0;t<=1;t+=.05){const a=points[0],b=points[1],x=Math.round(a.x+(b.x-a.x)*t),y=Math.round(a.y+(b.y-a.y)*t),z=Math.round(a.z+(b.z-a.z)*t);
    ok(!isSolidType(getBlock(x,y,z))||getBlock(x,y,z)===SNOW_LAYER_ID,'Cliff mouth connects the surface to the first junction '+JSON.stringify({x,y,z,h:getSurfaceHeight(x,z),type:getBlock(x,y,z),ranges:naturalCaveColumn(x,z)}));}
   ok(region.tubes.length>=region.points.length+1,'Multiple routes form loops, not one straight corridor');
   ok(Math.max(...queue.map(p=>p[1]))-Math.min(...queue.map(p=>p[1]))>25,'Network has real vertical depth');
   let roofChecks=0,villageChecks=0;
   for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
    const h=getSurfaceHeight(x,z),col=biomeColumn(x,z),u=(x-region.x)*region.nx+(z-region.z)*region.nz,v=-(x-region.x)*region.nz+(z-region.z)*region.nx;
    const air=naturalCaveColumn(x,z,h);
    if(col.village){ok(!air.length,'Village foundations are not carved');villageChecks++;}
    if(u>10&&air.length){ok(air.every(range=>range[1]<=h-4),'Underground roof remains at least three solid blocks');roofChecks++;}
    if(air.length)ok(isSolidType(getBlock(x,air[0][0]-1,z)),'Lowest cave always has solid ground');
   }
   ok(roofChecks>200,'Roof checks cover a large interior area');
   for(let x=-384;x<=384;x+=192)for(let z=-384;z<=384;z+=192){const village=villageRegion(x,z);if(!village)continue;
    for(let dx=-40;dx<=40;dx+=20)for(let dz=-40;dz<=40;dz+=20){ok(!naturalCaveColumn(village.x+dx,village.z+dz).length,'Known village foundation stays solid');villageChecks++;}}
   ok(villageChecks>0,'Village foundation checks actually visit villages');
   const sample=queue.filter((_,i)=>i%23===0).map(([x,y,z])=>[x,y,z,getBlock(x,y,z)]);
   clearCaveNetworks();ok(sample.every(([x,y,z,type])=>getBlock(x,y,z)===type),'Cache eviction preserves every sampled cave voxel');
   const edit=round(points[3]);setGenBlock(...edit,4);ok(getBlock(...edit)===4,'Player-placed blocks override the procedural cave');worldMap.delete(key(...edit));
   const chunkKeys=new Set([...shell].map(k=>{const [x,,z]=k.split(',').map(Number);return Math.floor(x/16)+','+Math.floor(z/16);}));
   const before=performance.now();for(const k of chunkKeys)buildChunkMesh(...k.split(',').map(Number));const buildMs=performance.now()-before;
   let missing=0;const missingExamples=[];
   for(const k of shell){const [x,y,z]=k.split(',').map(Number),meshes=chunkMeshes.get(Math.floor(x/16)+','+Math.floor(z/16));
    if(!Object.values(meshes||{}).some(mesh=>mesh.userData.blockIndices?.has(k))){missing++;if(missingExamples.length<6)missingExamples.push(k);}}
   ok(missing===0,'All cave walls/floors/ceilings are rendered, including across chunks: '+missingExamples.join(';'));
   const p=points[2],floor=naturalCaveColumn(Math.round(p.x),Math.round(p.z)).find(([a,b])=>p.y>=a&&p.y<=b)[0]-.5;
   camera.position.set(p.x,floor+getPlayerHeight(),p.z);camera.lookAt(points[3].x,camera.position.y,points[3].z);camera.updateMatrixWorld(true);
   isGameStarted=true;controls.isLocked=true;isRespawning=isSleeping=worldLoading=false;gameMode='creative';playerScale=1;activeMech=null;resetPlayerFlight();clearMovementInput();velocity.set(0,0,0);
   const start=camera.position.clone();moveForward=true;for(let i=0;i<30;i++)updatePlayerMovement(1/60);moveForward=false;
   ok(camera.position.distanceTo(start)>1,'Player can actually walk through the cave junction');
   const random=Math.random;camera.position.copy(points[3]);natureTick=0;caveVisits.clear();
   try{Math.random=()=>.5;updateWilderness(1.1);}finally{Math.random=random;}
   ok(zombies.some(z=>z.caveResident&&z.mesh.position.y<region.y-10),'Creative mode also populates deeper chambers with cave zombies');
   const snapshot=JSON.stringify(naturalCaveColumn(Math.round(points[3].x),Math.round(points[3].z)));
   const save=getWorldSaveData();ok(save.wildernessVersion===5,'New terrain version is saved');
   window.caveTestSave=save;window.caveTestSnapshot=snapshot;
   for(const terrain of ['plains','mountains','desert','jungle']){
    selectedTerrain=terrain;heightCache.clear();clearCaveNetworks();const c=naturalCaveRegion(0,0),p=c.points[3],x=Math.round(p.x),y=Math.round(p.y),z=Math.round(p.z);
    ok(getBlock(x,y,z)===0,'Other overworld terrain also has underground caves: '+terrain);
    ok(getBlock(x,getSurfaceHeight(x,z),z)!==0,'No random grass potholes in '+terrain);
   }
   selectedTerrain='random';heightCache.clear();clearCaveNetworks();
   const v5=naturalCaveColumn(Math.round(points[3].x),Math.round(points[3].z));ok(JSON.stringify(v5)===snapshot,'Changing terrain and returning rebuilds deterministic caves');
   setWildernessVersion(4);const legacy=points[4],lx=Math.round(legacy.x),ly=Math.round(legacy.y),lz=Math.round(legacy.z);
   ok(!naturalCavesEnabled()&&isSolidType(getBlock(lx,ly,lz)),'Old worlds keep their original underground blocks');setWildernessVersion(5);
   window.renderTestCave=()=>{
    blocker.style.display=inventoryUI.style.display='none';document.getElementById('toast-msg').style.visibility='hidden';
    heldItemGroup.visible=false;clouds.visible=false;scene.fog=null;scene.background=new THREE.Color(0xe100e1);ambientLight.intensity=.9;dirLight.intensity=.2;
    camera.position.set(points[3].x,points[3].y,points[3].z);camera.lookAt(points[6].x,points[6].y+2,points[6].z);camera.updateMatrixWorld(true);renderPlayerView(camera);
    const gl=renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let voidPixels=0;const colors=new Set();for(let i=0;i<pixels.length;i+=4){if(pixels[i]===225&&pixels[i+1]===0&&pixels[i+2]===225)voidPixels++;if(i%128===0)colors.add(pixels.slice(i,i+3).join(','));}
    if(voidPixels>10||colors.size<15)throw Error('Cave GPU image has missing shell or is blank: '+voidPixels+'/'+colors.size);
    return {voidPixels,colors:colors.size};
   };return {checks:checks.length,airVoxels:queue.length,shellVoxels:shell.size,chunks:chunkKeys.size,buildMs,roofChecks,villageChecks};
  }));
  for(const viewport of [{width:1200,height:800},{width:390,height:844}]){
   await page.setViewportSize(viewport);await page.waitForFunction(w=>renderer.domElement.clientWidth===w,viewport.width,{polling:50});
   console.log('Cave GPU:',await page.evaluate(()=>renderTestCave()));await page.screenshot({path:'/private/tmp/cave-network-'+viewport.width+'.png'});
  }
  console.log(await page.evaluate(async()=>{
   await new Promise(resolve=>loadSaveFile({target:{files:[new File([JSON.stringify(caveTestSave)],'caves-v5.json')]}},resolve));
   const p=caveTestRegion.points[3];if(wildernessVersion!==5||JSON.stringify(naturalCaveColumn(Math.round(p.x),Math.round(p.z)))!==caveTestSnapshot)throw Error('Cave terrain changed during save/load');
   return 'PASS: actual v5 save/load preserves caves.';
  }));
  assert.deepEqual(errors,[]);console.log('PASS: branched layered caves, solid roofs/floors, complete chunk meshes, legacy saves and desktop/mobile GPU pixels.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
