const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultNavigationTimeout(120000);
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  const url=process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href;
  await page.goto(url);await page.waitForFunction(()=>expansionReady);
  console.log(await page.evaluate(async()=>{
   const checks=[],check=(v,s)=>{if(!v)throw Error(s);checks.push(s);};
   seed=42;heightCache.clear();worldMap.clear();selectedTerrain='random';currentDimension='overworld';biomeColumn(0,0);
   const snow=materials[154].map.image.getContext('2d').getImageData(0,0,64,64).data;
   check([...snow].every((v,i)=>i%4===3||v>=247),'Snow texels are white, not saturated colors');
   check([...snow].every((v,i)=>i%4!==0||v===snow[i+1]&&v===snow[i+2]),'Snow has equal RGB channels');
   check(getBlockParticleColor(154)===0xffffff,'Snow debris is white too');
   let solidLand=0,plants=0,water=0,seaPlants=0;const trees=[];window.landmarkCliff=null;window.landmarkSnow=null;
   for(let x=-192;x<=192;x++)for(let z=-192;z<=192;z++){
    const col=biomeColumn(x,z),id=getBlock(x,col.height+1,z);
    if(col.height>9){solidLand++;if(NATURE_PLANTS.has(id))plants++;if(naturalTreeAnchor(x,z))trees.push([x,z]);}
    else if(col.height<7){water++;if(WATER_PLANTS.has(id))seaPlants++;}
    if(!landmarkCliff&&col.cliff&&col.cliff.u===0&&col.cliff.v===0)landmarkCliff=col.cliff;
    if(!landmarkSnow&&col.biome==='snow'&&col.height<35&&landscapeNoise(x/80,z/80,311)<.2)landmarkSnow={x,z,h:col.height};
   }
   check(plants/solidLand<.04,'Land plants occupy less than 4% of surface cells');check(seaPlants/water<.08,'Sea plants occupy less than 8% of underwater floor cells');
   check(new Set(trees.map(([x])=>((x%8)+8)%8)).size>=5,'Tree positions are jittered, not aligned on grid rows');check(landmarkCliff&&landmarkSnow,'Cliff entrance and broad snowy region found');
   const c=landmarkCliff;
   for(let u=-7;u<=23;u++){
    const v=Math.round(u<5?0:Math.sin((u-5)*.13)*2.3),x=c.x+u*c.nx-v*c.nz,z=c.z+u*c.nz+v*c.nx;
    check(getBlock(x,c.floor,z)===0&&getBlock(x,c.floor+1,z)===0,'Walkable side tunnel '+u);
    check(isSolid(x,c.floor-1,z),'Solid tunnel floor '+u);
    if(u>4)check(isSolid(x,c.floor+7,z),'Enclosed tunnel/chamber roof '+u);
   }
   check(getSurfaceHeight(c.x+5*c.nx,c.z+5*c.nz)-getSurfaceHeight(c.x-7*c.nx,c.z-7*c.nz)>=12,'Entrance sits in a tall cliff face');
   window.landmarkScene=(p,look)=>{
    for(const group of chunkMeshes.values())for(const m of Object.values(group))scene.remove(m);chunkMeshes.clear();
    camera.position.fromArray(p);camera.lookAt(new THREE.Vector3(...look));camera.updateMatrixWorld(true);
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){const x=Math.floor(look[0]/CHUNK_SIZE)+dx,z=Math.floor(look[2]/CHUNK_SIZE)+dz;generateTrees(x,z);buildChunkMesh(x,z);}
    blocker.style.display='none';inventoryUI.style.display='none';document.getElementById('toast-msg').style.display='none';heldItemGroup.visible=false;clouds.visible=false;scene.background.setHex(0xb2d9eb);scene.fog=new THREE.Fog(0xb2d9eb,35,75);dirLight.intensity=.65;renderer.render(scene,camera);
   };
   landmarkScene([c.x-14*c.nx+6*c.nz,c.floor+4,c.z-14*c.nz-6*c.nx],[c.x+5*c.nx,c.floor+4,c.z+5*c.nz]);
   const ctx=new OfflineAudioContext(1,22050*4,22050),old=audioCtx;audioCtx=ctx;
   zombieVoiceBuffers=null;zombieVoiceLoading=null;const buffers=await loadZombieVoices();check(buffers.length===3&&buffers.every(b=>b.duration>=1.4),'Three complete CC0 recorded voices decode offline');
   nextZombieVoice=0;playZombieVoice('zombie',0);const rendered=await ctx.startRendering(),pcm=rendered.getChannelData(0);let peak=0,sum=0;for(const s of pcm){peak=Math.max(peak,Math.abs(s));sum+=s*s;}
   check(peak>0.001&&peak<.17&&sum>0,'Recorded voices are audible and attenuated, not full-volume impacts');audioCtx=old;zombieVoiceBuffers=null;zombieVoiceLoading=null;
   return {checks:checks.length,plants:plants/solidLand,seaPlants:seaPlants/water,cliff:landmarkCliff,snow:landmarkSnow,voicePeak:peak};
  }));
  await page.screenshot({path:'/private/tmp/mc-cliff-entrance.png'});
  await page.evaluate(()=>{const c=landmarkCliff;landmarkScene([c.x+8*c.nx,c.floor+1.2,c.z+8*c.nz],[c.x+22*c.nx,c.floor+1.5,c.z+22*c.nz]);});
  await page.screenshot({path:'/private/tmp/mc-cliff-inside.png'});
  await page.evaluate(()=>{const p=landmarkSnow;landmarkScene([p.x+8,p.h+6,p.z+14],[p.x,p.h,p.z]);});
  await page.screenshot({path:'/private/tmp/mc-white-snow.png'});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{renderer.render(scene,camera);});await page.screenshot({path:'/private/tmp/mc-white-snow-mobile.png'});
  const live=await browser.newPage({viewport:{width:1280,height:800}});live.on('pageerror',e=>errors.push(e.message));live.setDefaultNavigationTimeout(120000);
  await live.goto(url);await live.waitForFunction(()=>expansionReady);await live.getByRole('button',{name:'Creative',exact:true}).click();await live.locator('#difficulty-select').selectOption('peaceful');await live.getByRole('button',{name:'Start Game',exact:true}).click();
  await live.waitForFunction(()=>isGameStarted&&selectedTerrain==='random'&&chunkMeshes.size>=12);
  await live.evaluate(()=>{camera.position.y+=10;creativeFlying=true;});const before=await live.evaluate(()=>camera.position.toArray());await live.keyboard.down('w');await live.waitForFunction(p=>camera.position.distanceTo(new THREE.Vector3(...p))>1,before);await live.keyboard.up('w');
  await live.screenshot({path:'/private/tmp/mc-wilderness-live.png'});
  await live.setViewportSize({width:390,height:844});await live.goto(url);await live.waitForFunction(()=>expansionReady);await live.screenshot({path:'/private/tmp/mc-wilderness-menu-mobile.png'});
  assert(await live.locator('#difficulty-select').isVisible());assert.deepEqual(errors,[]);console.log('PASS: white snow, sparse plants, walkable cliff entrance, recorded quiet audio, actual Random World start and W movement.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
