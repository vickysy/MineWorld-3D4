const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {createHash}=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>requestAnimationFrame=()=>0);
  await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href,{timeout:120000});
  await page.waitForFunction(()=>expansionReady&&!worldLoading,null,{polling:50});
  await page.getByRole('button',{name:'Creative',exact:true}).click();
  await page.getByRole('button',{name:'Plains',exact:true}).click();
  await page.getByRole('button',{name:'Start Game',exact:true}).click();
  await page.waitForFunction(()=>isGameStarted&&controls.isLocked&&!worldLoading,null,{polling:50});
  // Fingerprints of the original pixel icons, vertices, normals and colors from 9b852b1.
  const originalSwords={33:'10aa24c5ea9af5e364a96d014906402e819e6ef522856ce872fed5409008a10a',241:'d7a0feac3c4870f5c2722910377bd6868e85c99a5ea06cda1b2fc5c94412dd53',242:'9745dc17db6aa8b8539901b75771b4a58b989f7ee64349a77dc4bb58ea24c4eb',243:'856a6efa661ab6d41c96251a4773fffb0b64931fec9202df7ace7a017a183597',244:'6778a67c6799e4c81d0de187b9bfbb5bb7e05785c5193823eb71d739ef55ecb3'};
  const swordData=await page.evaluate(()=>[33,241,242,243,244].map(id=>({id,grid:weaponPattern(id).grid,attributes:Object.fromEntries(Object.entries(weaponGeometry(id).attributes).map(([key,attr])=>[key,Array.from(attr.array)]))})));
  for(const {id,grid,attributes} of swordData)assert.equal(createHash('sha256').update(JSON.stringify({grid,attributes})).digest('hex'),originalSwords[id],'Original pixel sword unchanged: '+id);
  console.log('PASS: all five sword shapes, icons and colors exactly match the original pixel models.');
  console.log(await page.evaluate(()=>{
   const checks=[],ok=(v,label)=>{if(!v)throw Error(label);checks.push(label);};window.handCheck=ok;
   clearCombatState();clearExpansionWorld();worldMap.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();chunkScanYRanges.clear();heightCache.clear();
   for(const ms of chunkMeshes.values())for(const m of Object.values(ms))releaseChunkMesh(m);chunkMeshes.clear();rebuildQueue.clear();
   for(const list of [villagers,animals,zombies,creepers,endermen]){for(const m of list)disposeModModel(m.mesh);list.length=0;}
   currentDimension='overworld';selectedTerrain='plains';getSurfaceHeight=()=>79;isGameStarted=true;gameMode='creative';isSleeping=false;isInventoryOpen=false;isRespawning=false;controls.isLocked=true;playerScale=1;activeMech=null;resetPlayerFlight();
   for(let x=-16;x<16;x++)for(let z=-16;z<16;z++)setGenBlock(x,79,z,1);
   for(let x=-1;x<=0;x++)for(let z=-1;z<=0;z++)buildChunkMesh(x,z);
   camera.position.set(0,81,4);camera.rotation.set(0,0,0);camera.updateMatrixWorld(true);scene.fog=null;clouds.visible=false;scene.background=new THREE.Color(0xa3cddf);ambientLight.intensity=.8;dirLight.intensity=.7;
   blocker.style.display=inventoryUI.style.display='none';document.getElementById('toast-msg').style.visibility='hidden';heldItemGroup.visible=true;
   window.equipHand=id=>{currentBlock=id;updateHeldItem3D(id);cancelMining();handCooldown=0;resetHandAnimation();};
   for(const id of [33,241,242,243,244,34,54]){
    equipHand(id);const rig=heldItemGroup.children[0],mesh=rig.userData.weapon,grip=new THREE.Vector3((3-7.5)*.065,(7.5-13)*.065,0);
    mesh.updateMatrix();grip.applyMatrix4(mesh.matrix);ok(grip.length()<1e-8,'Weapon pivots at its grip: '+id);
    rig.updateMatrixWorld(true);ok(rig.userData.gripArm.children.length===1,'Arm is one continuous mesh: '+id);
    ok(new THREE.Box3().setFromObject(rig.userData.gripArm).containsPoint(rig.localToWorld(new THREE.Vector3())),'Fist encloses weapon grip: '+id);
   }
   for(const profile of Object.keys(HAND_SWING_POSES)){
    for(const time of [0,1])ok([...sampleHandPose(profile,time)].every(v=>Math.abs(v)<1e-8),'Rest endpoint '+profile+'/'+time);
    for(let t=0;t<1;t+=.01)ok([...sampleHandPose(profile,t)].every(Number.isFinite),'Finite pose '+profile+'/'+t.toFixed(2));
   }
   for(const id of [33,241,242,243,244,34,54,58]){
    equipHand(id);document.dispatchEvent(new MouseEvent('mousedown',{button:0}));updateHandSwing(.055);
    camera.updateMatrixWorld(true);const raised=heldItemGroup.position.clone(),yaw=heldItemGroup.rotation.y;
    const tip=heldItemGroup.localToWorld(new THREE.Vector3(0,.55,0)).project(camera);updateHandSwing(.1);camera.updateMatrixWorld(true);
    const strike=heldItemGroup.localToWorld(new THREE.Vector3(0,.55,0)).project(camera);
    ok(heldItemGroup.position.x===raised.x&&heldItemGroup.position.y<raised.y-.08,'Straight downstroke with no sideways translation: '+id);
    ok(heldItemGroup.rotation.z===0&&heldItemGroup.rotation.y===yaw,'No wrist roll or animated yaw: '+id);
    ok(Math.abs(tip.x-strike.x)<1e-7&&strike.y<tip.y-.1,'Projected swing stays vertical on screen: '+id);
    if(SWORD_DAMAGE[id]){
     const blade=heldItemGroup.children[0].userData.weapon,edge=blade.localToWorld(new THREE.Vector3((11-7.5)*.065,(7.5-7)*.065,0)),center=blade.localToWorld(new THREE.Vector3((10-7.5)*.065,(7.5-6)*.065,0));
     ok(edge.y<center.y-.012,'Original pixel blade edge faces the downstroke: '+id);
     ok(Math.abs(heldItemGroup.rotation.x)<=.4,'Sword tilts modestly instead of flipping toward the camera: '+id);
     ok(raised.y-heldItemGroup.position.y>.4&&heldItemGroup.position.z===raised.z,'Clear downstroke without pushing the hand toward the camera: '+id);
    }
    updateHandSwing(.25);ok(handSwing===0&&heldItemGroup.rotation.x===0&&heldItemGroup.position.x===.4,'Clean recovery '+id);
   }
   equipHand(0);document.dispatchEvent(new MouseEvent('mousedown',{button:0}));updateHandSwing(.14);
   ok(heldItemGroup.position.z< -1&&heldItemGroup.position.x<.25,'Bare fist reaches forward and inward');
   const remaining=handCooldown;currentBlock=34;updateHeldItem3D(34);
   ok(handSwing===0&&handCooldown===remaining&&!beginHandSwing(),'Changing items resets pose but cannot bypass hit cooldown');
   updateHandSwing(.4);const restRotation=heldItemGroup.rotation.clone();beginHandSwing();updateHandSwing(.1);controls.isLocked=false;updateHandSwing(.1);
   ok(handSwing===0&&heldItemGroup.rotation.equals(restRotation),'Paused animation returns to rest');controls.isLocked=true;
   const position=camera.position.clone(),quaternion=camera.quaternion.clone();
   for(const id of [0,33,34,54,58,57,3]){
    const sampled=[];
    for(const fps of [30,60,144]){
     equipHand(id);beginHandSwing();let time=0;
     while(time<.18-1e-9){const dt=Math.min(1/fps,.18-time);updateHandSwing(dt);time+=dt;}
     sampled.push([...heldItemGroup.position.toArray(),...heldItemGroup.rotation.toArray().slice(0,3)]);
    }
    ok(sampled.every(p=>p.every((v,i)=>Math.abs(v-sampled[0][i])<1e-8)),'Frame-rate independent '+id);
   }
   ok(position.equals(camera.position)&&quaternion.equals(camera.quaternion),'Animation does not change aim or player position');
   for(const scale of [1,.05,.005,2]){
    playerScale=scale;updatePlayerScaleView();equipHand(34);beginHandSwing();updateHandSwing(.15);
    ok(Math.abs(heldItemGroup.position.z/scale+1.05)<1e-8&&heldItemGroup.scale.x===scale,'Motion scales with the player: '+scale);
   }
   playerScale=1;updatePlayerScaleView();equipHand(34);gameMode='survival';playerInventory[34]=1;setGenBlock(0,81,1,3);
   document.dispatchEvent(new MouseEvent('mousedown',{button:0}));ok(miningState?.duration===.28,'Actual pickaxe click starts faster mining duration');
   let repeats=0,last=handSwing;
   for(let i=0;i<40;i++){if(i===19){setGenBlock(0,81,1,3);document.dispatchEvent(new MouseEvent('mousedown',{button:0}));}updateMining(1/60);updateHandSwing(1/60);if(handSwing>last)repeats++;last=handSwing;}
   ok(repeats>=1&&getBlock(0,81,1)===0,'Held mining repeats swings and breaks the target once');
   document.dispatchEvent(new MouseEvent('mouseup',{button:0}));updateHandSwing(.4);ok(handSwing===0&&!miningState,'Mouse release ends mining and settles the hand');
   gameMode='creative';equipHand(55);arrowCooldown=0;
   document.dispatchEvent(new MouseEvent('mousedown',{button:2}));ok(flyingArrows.length===1&&handSwingAction==='use','Actual bow shot uses release animation');
   const firstSwing=handSwing;updateHandSwing(.05);const after=handSwing;document.dispatchEvent(new MouseEvent('mousedown',{button:2}));
   ok(flyingArrows.length===1&&handSwing===after&&after<firstSwing,'Rejected shot neither restarts animation nor fires another arrow');
   clearFlyingArrows();equipHand(35);document.dispatchEvent(new MouseEvent('mousedown',{button:2}));updateHandSwing(.06);
   ok(heldItemGroup.position.z>-.73&&heldItemGroup.rotation.x>0,'Gun recoils back, not a sword slash');
   equipHand(0);currentBlock=39;playerInventory[39]=2;updateHeldItem3D(39);startEating(39);updateHandSwing(.1);updateEating(.1);
   ok(eatingState&&heldItemGroup.position.z===-.48,'Eating keeps its separate pose');cancelEating();equipHand(0);
   return {checks:checks.length,summary:'Continuous arms holding weapons; straight vertical sword/pickaxe paths; aim/cooldowns preserved; mining, scale, pause and food.'};
  }));
  const allScreens=[];
  for(const viewport of [{width:1200,height:800},{width:390,height:844},{width:320,height:740}]){
   await page.setViewportSize(viewport);await page.waitForFunction(w=>renderer.domElement.clientWidth===w,viewport.width,{polling:50});
   await page.evaluate(()=>{
    const point=new THREE.Vector3();
    for(const id of [33,241,242,243,244,34,54,58,57,35,55,56]){
     for(const action of [35,55,56,57].includes(id)?['melee','use']:['melee']){
      equipHand(id);const mesh=heldItemGroup.children[0].userData.weapon,arm=heldItemGroup.children[0].userData.gripArm,armStart=arm.getWorldQuaternion(new THREE.Quaternion());let maxX=0,maxY=0;
      for(let t=0;t<=1;t+=.025){
       startHandAnimation(action);updateHandSwing(t*HAND_SWING_SECONDS);camera.updateMatrixWorld(true);
       if([33,241,242,243,244,34,54,58].includes(id)){
        handCheck(armStart.angleTo(arm.getWorldQuaternion(new THREE.Quaternion()))<1e-6,'Forearm does not twist or flip during vertical swings');
        handCheck(new THREE.Box3().setFromObject(arm).containsPoint(heldItemGroup.getWorldPosition(new THREE.Vector3())),'Fist keeps the grip throughout the swing');
        const sleeve=arm.children[0],vertices=sleeve.geometry.attributes.position;let bottom=Infinity;
        for(let i=0;i<vertices.count;i++)bottom=Math.min(bottom,point.fromBufferAttribute(vertices,i).applyMatrix4(sleeve.matrixWorld).project(camera).y);
        handCheck(bottom< -1,'Forearm continues below the viewport instead of floating: '+id+'/'+innerWidth+'/'+t);
       }
       const positions=mesh.geometry.attributes.position;
       for(let i=0;i<positions.count;i++){
        point.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld).project(camera);
        maxX=Math.max(maxX,Math.abs(point.x));maxY=Math.max(maxY,Math.abs(point.y));
       }
      }
      handCheck(maxX<1&&maxY<1,'Full weapon trajectory framed '+id+'/'+action+'/'+innerWidth+': '+maxX+','+maxY);
     }
    }
   });
  }
  for(const viewport of [{width:1200,height:800},{width:390,height:844}]){
   await page.setViewportSize(viewport);await page.waitForFunction(w=>renderer.domElement.clientWidth===w,viewport.width,{polling:50});
   const results=[];
   for(const [id,name] of [[33,'Sword'],[34,'Pickaxe'],[0,'Punch']]){
    const frames=[];
    for(const t of [0,.16,.44,.72,1]){
     const result=await page.evaluate(({id,t})=>{
      equipHand(id);if(t>0){beginHandSwing();updateHandSwing(t*HAND_SWING_SECONDS);}else updateHandSwing(0);
      camera.updateMatrixWorld(true);
      const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,base=new Uint8Array(w*h*4),pixels=new Uint8Array(base.length);
      heldItemGroup.visible=false;renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,base);
      heldItemGroup.visible=true;renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      let count=0,minX=w,maxX=-1,minY=h,maxY=-1;const colors=new Set();let hash=0;
      for(let i=0;i<pixels.length;i+=4){
       if(i%256===0){colors.add(pixels.slice(i,i+3).join(','));hash=(Math.imul(hash,31)+pixels[i]+pixels[i+1]*3+pixels[i+2]*7)|0;}
       if(Math.abs(base[i]-pixels[i])+Math.abs(base[i+1]-pixels[i+1])+Math.abs(base[i+2]-pixels[i+2])<8)continue;
       const x=i/4%w,y=Math.floor(i/4/w);count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      }
      return {count,colors:colors.size,hash,bounds:[minX,maxX,minY,maxY]};
     },{id,t});
     assert(result.count>120,'Visible held model '+name+'/'+viewport.width+'/'+t+': '+JSON.stringify(result));
     assert(result.colors>20,'Nonblank scene');frames.push(result.hash);
     allScreens.push({label:`${viewport.width} ${name} ${Math.round(t*100)}%`,image:(await page.screenshot()).toString('base64'),mobile:viewport.width===390});
     results.push({name,t,...result});
    }
    assert(new Set(frames).size>=4,'Different rendered animation frames '+name);assert(frames[0]===frames[4],'Pixels return to exact idle '+name);
   }
   console.log({viewport,frames:results.length,minimumVisiblePixels:Math.min(...results.map(r=>r.count)),minimumColors:Math.min(...results.map(r=>r.colors))});
  }
  const sheet=await browser.newPage({viewport:{width:1500,height:760},deviceScaleFactor:1});
  for(const mobile of [false,true]){
   const images=allScreens.filter(s=>s.mobile===mobile);
   await sheet.setContent('<html><body style="margin:0;background:#202624;color:white;font:14px sans-serif;display:grid;grid-template-columns:repeat(5,1fr);gap:4px">'+images.map(s=>`<div><div>${s.label}</div><img style="width:100%;height:${mobile?260:200}px;object-fit:contain" src="data:image/png;base64,${s.image}"></div>`).join('')+'</body></html>');
   await sheet.locator('img').evaluateAll(images=>Promise.all(images.map(i=>i.decode())));
   await sheet.screenshot({path:'/private/tmp/hand-actions-'+(mobile?'mobile':'desktop')+'.png',fullPage:true});
  }
  assert.deepEqual(errors,[]);console.log('PASS: first-person animation, desktop/mobile GPU pixels and screenshots.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
