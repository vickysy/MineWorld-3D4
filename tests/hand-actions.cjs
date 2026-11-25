const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
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
    equipHand(id);const mesh=heldItemGroup.children[0],grip=new THREE.Vector3((3-7.5)*.065,(7.5-13)*.065,0);
    mesh.updateMatrix();grip.applyMatrix4(mesh.matrix);ok(grip.length()<1e-8,'Weapon pivots at its grip: '+id);
   }
   for(const profile of Object.keys(HAND_SWING_POSES)){
    for(const time of [0,1])ok([...sampleHandPose(profile,time)].every(v=>Math.abs(v)<1e-8),'Rest endpoint '+profile+'/'+time);
    for(let t=0;t<1;t+=.01)ok([...sampleHandPose(profile,t)].every(Number.isFinite),'Finite pose '+profile+'/'+t.toFixed(2));
   }
   for(const id of [33,34,54]){
    equipHand(id);document.dispatchEvent(new MouseEvent('mousedown',{button:0}));updateHandSwing(.055);
    const raised=heldItemGroup.position.clone();updateHandSwing(.1);
    ok(heldItemGroup.position.x<raised.x-.15&&heldItemGroup.position.y<raised.y-.08,'Diagonal downstroke, not vertical bob: '+id);
    ok(heldItemGroup.rotation.z>.5,'Wrist turns with the downstroke: '+id);
    updateHandSwing(.25);ok(handSwing===0&&heldItemGroup.rotation.x===0&&heldItemGroup.position.x===.4,'Clean recovery '+id);
   }
   equipHand(0);document.dispatchEvent(new MouseEvent('mousedown',{button:0}));updateHandSwing(.14);
   ok(heldItemGroup.position.z< -1&&heldItemGroup.position.x<.25,'Bare fist reaches forward and inward');
   const remaining=handCooldown;currentBlock=34;updateHeldItem3D(34);
   ok(handSwing===0&&handCooldown===remaining&&!beginHandSwing(),'Changing items resets pose but cannot bypass hit cooldown');
   updateHandSwing(.4);beginHandSwing();updateHandSwing(.1);controls.isLocked=false;updateHandSwing(.1);
   ok(handSwing===0&&heldItemGroup.rotation.x===0&&heldItemGroup.rotation.y===0&&heldItemGroup.rotation.z===0,'Paused animation returns to rest');controls.isLocked=true;
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
    ok(Math.abs(heldItemGroup.position.z/scale+.95)<.05&&heldItemGroup.scale.x===scale,'Motion scales with the player: '+scale);
   }
   playerScale=1;updatePlayerScaleView();equipHand(34);gameMode='survival';playerInventory[34]=1;setGenBlock(0,81,1,3);
   document.dispatchEvent(new MouseEvent('mousedown',{button:0}));ok(miningState?.duration===.65,'Actual pickaxe click starts original mining duration');
   let repeats=0,last=handSwing;
   for(let i=0;i<40;i++){updateMining(1/60);updateHandSwing(1/60);if(handSwing>last)repeats++;last=handSwing;}
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
   return {checks:checks.length,summary:'Grip pivots; distinct diagonal tools and forward punch; aim/cooldowns preserved; mining, ranged use, scale, pause and food.'};
  }));
  const allScreens=[];
  for(const viewport of [{width:1200,height:800},{width:390,height:844},{width:320,height:740}]){
   await page.setViewportSize(viewport);await page.waitForFunction(w=>renderer.domElement.clientWidth===w,viewport.width,{polling:50});
   await page.evaluate(()=>{
    const point=new THREE.Vector3();
    for(const id of [33,241,242,243,244,34,54,58,57,35,55,56]){
     for(const action of [35,55,56,57].includes(id)?['melee','use']:['melee']){
      equipHand(id);const mesh=heldItemGroup.children[0];let maxX=0,maxY=0;
      for(let t=0;t<=1;t+=.025){
       startHandAnimation(action);updateHandSwing(t*HAND_SWING_SECONDS);camera.updateMatrixWorld(true);
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
      if(id!==0)handCheck(minX>0&&maxX<w-1&&minY>0&&maxY<h-1,'Entire tool stays inside '+w+'x'+h+' at '+t+': '+JSON.stringify({minX,maxX,minY,maxY}));
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
