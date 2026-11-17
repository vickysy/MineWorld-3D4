const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  const page=await browser.newPage({viewport:{width:950,height:640}}),errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
  await page.waitForFunction(()=>typeof traceVoxelRay==='function'&&expansionReady);
  console.log(await page.evaluate(()=>{
   const check=(v,s)=>{if(!v)throw Error(s);};
   worldMap.clear();clearExpansionWorld();restoreMicroEdits([]);selectedTerrain='random';seed=42;setWildernessVersion(3);
   isGameStarted=true;gameMode='creative';playerScale=1;controls.isLocked=true;currentDimension='overworld';getSurfaceHeight=()=>20;
   for(let x=0;x<32;x++)for(let z=0;z<16;z++){setGenBlock(x,20,z,1);setGenBlock(x,21,z,0);}
   buildChunkMesh(0,0);buildChunkMesh(1,0);scene.fog=null;scene.background.setHex(0xff00ff);
   blocker.style.display='none';inventoryUI.style.display='none';heldItemGroup.visible=false;clouds.visible=false;
   window.aimAt=(p,q)=>{camera.position.fromArray(p);camera.lookAt(...q);camera.updateMatrixWorld(true);};
   window.groundPixels=()=>{
    aimAt([16,23,8],[16,20,8]);renderer.render(scene,camera);
    const gl=renderer.getContext(),p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
    gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);
    let leaks=0,green=0;for(let i=0;i<p.length;i+=4){if(p[i]>240&&p[i+1]<15&&p[i+2]>240)leaks++;if(p[i+1]>p[i]&&p[i+1]>p[i+2])green++;}
    check(gl.getError()===gl.NO_ERROR,'WebGL state error');check(!leaks&&green>p.length/4*.98,'Gap or missing grass texture: '+leaks+' sky pixels, '+green+' green pixels');return p;
   };
   const before=groundPixels();let changed=0;
   // A fall that crosses the entire thin platform within one frame must still land.
   setGenBlock(3,45,4,TRAPDOOR);camera.position.set(3,48,4);velocity.set(0,-180,0);
   updatePlayerMovement(.05);
   check(Math.abs(camera.position.y-getPlayerHeight()-(44.5+.15))<.001,'Fast fall stays on the thin hatch');
   setGenBlock(3,45,4,0);
   for(const [x,id] of [[15,132],[16,133],[17,134]]){
    currentBlock=id;aimAt([x,23,2],[x,20,2]);document.dispatchEvent(new MouseEvent('mousedown',{button:2}));
    check(getBlock(x,21,2)===id&&getBlock(x,20,2)===1,'Placed hidden block preserves supporting grass '+id);
    for(let j=0;j<3;j++){buildChunkMesh(0,0);buildChunkMesh(1,0);}
    const after=groundPixels();for(let i=0;i<before.length;i++)if(before[i]!==after[i])changed++;
   }
   check(!changed,'Unrelated grass pixels changed: '+changed);
   for(const [x,id] of [[15,132],[16,133],[17,134]])check(!isSolid(x,21,2)&&isSolid(x,20,2),'Hidden blocks remain walk-through above solid grass '+id);
   return {hiddenPlacements:3,normalScale:playerScale,unrelatedPixelChanges:changed};
  }));
  await page.screenshot({path:'/private/tmp/mc-repairs-grass-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>renderer.domElement.clientWidth===390,null,{polling:100});
  await page.evaluate(()=>groundPixels());await page.screenshot({path:'/private/tmp/mc-repairs-grass-mobile.png'});
  console.log(await page.evaluate(()=>{
   const check=(v,s)=>{if(!v)throw Error(s);};
   setBlockNoRebuild(8,21,8,TRAPDOOR,rebuildQueue);setBlockNoRebuild(8,22,8,3,rebuildQueue);
   aimAt([8,24,10],[8,22,8]);currentBlock=4;
   for(const id of [TRAPDOOR_OPEN,TRAPDOOR]){
    document.dispatchEvent(new MouseEvent('mousedown',{button:2}));
    check(getBlock(8,21,8)===id&&getBlock(8,22,8)===3,'Covered hatch toggles without deleting cover');
   }
   setGenBlock(8,22,8,TRAPDOOR);aimAt([8,25,8],[8,22,8]);
   document.dispatchEvent(new MouseEvent('mousedown',{button:2,shiftKey:true}));
   check(getBlock(8,21,8)===TRAPDOOR_OPEN&&getBlock(8,22,8)===TRAPDOOR,'Shift operates the lower of stacked trapdoors');
   const car=spawnCityCar('drive-test',8,20.5,8,0);aimAt([10.6,22,8],[8,21.3,8]);
   setBlockNoRebuild(8,21,8,0,rebuildQueue);setBlockNoRebuild(8,22,8,0,rebuildQueue);
   currentBlock=Number(Object.keys(CAR_ITEMS)[0]);document.dispatchEvent(new MouseEvent('mousedown',{button:2}));
   check(drivingCar===car,'Enter the parked car while holding a car item');
   for(let x=6;x<=10;x++)for(let z=12;z<22;z++)setGenBlock(x,21,z,3);
   document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));
   for(let i=0;i<130;i++)updatePlayerMovement(1/60);
   document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW'}));
   check(car.mesh.position.z>15&&car.mesh.position.y===21.5,'Car actually drives over a one-block curb: '+car.mesh.position.toArray());
   const end=car.mesh.position.toArray();drivingCar=null;
   for(let x=7;x<=9;x++)for(let y=22;y<=24;y++)setGenBlock(x,y,6,59);
   detonateAt([8,23,7]);check(getBlock(8,23,6)===0,'Explosion removes a real brick wall');
   buildChunkMesh(0,0);check(!chunkMeshes.get('0,0')[59]?.userData.blockIndices.has('8,23,6'),'Wall disappears in the rebuilt mesh');
   for(let x=5;x<=11;x++)for(let z=1;z<=7;z++)setGenBlock(x,30,z,3);
   createNuclearMissile([8,36,10],[8,20,4],0);let frames=0;
   while(nuclearMissiles.length&&frames++<1000)updateNuclearMissiles(1/60);
   check(nukeJobs[0]?.y===30,'Missile hits the roof instead of passing through to ground: '+JSON.stringify(nukeJobs[0]));
   while(nukeJobs.length)tickNuclearBlast();check(getBlock(8,30,4)===0,'Roof impacted by missile is destroyed');
   return {coveredHatch:'open and closed',carPosition:end,missileImpact:'roof'};
  }));
  console.log(await page.evaluate(()=>{
   clearExpansionWorld();worldMap.clear();selectedTerrain='moon';getSurfaceHeight=()=>-20;
   for(const m of villagers)scene.remove(m.mesh);villagers=[];
   spawnVillagerAt(0,1,0);const v=villagers[0];aimAt([0,2.05,6],[0,2.05,0]);
   for(const [id,shouldHit] of [[6,true],[4,true],[3,false],[OBSIDIAN_ID,false],[BARRIER_ID,false]]){
    v.hp=4;v.hurtTimer=0;v.dying=false;setGenBlock(0,2,3,id);shootRangedWeapon(35);
    if((v.hp<4)!==shouldHit)throw Error('Penetration rule for '+id);
    if([OBSIDIAN_ID,BARRIER_ID].includes(id)&&getBlock(0,2,3)!==id)throw Error('Protected wall was destroyed');
   }
   return 'Gun passes one glass/wood layer; solid and protected cover stop the shot.';
  }));
  assert.deepEqual(errors,[]);console.log('PASS: gameplay repairs');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
