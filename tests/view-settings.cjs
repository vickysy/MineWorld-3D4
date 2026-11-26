const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>requestAnimationFrame=()=>0);
  await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href,{timeout:120000});
  await page.waitForFunction(()=>expansionReady&&!worldLoading,null,{polling:50});
  assert.equal(await page.evaluate(()=>camera.fov),90);
  await page.locator('#menu-view-fov').focus();await page.keyboard.press('End');
  assert.deepEqual(await page.evaluate(()=>[camera.fov,mechCamera.fov,localStorage.getItem(VIEW_FOV_STORAGE),document.getElementById('pause-view-fov').value]),[105,105,'105','105']);
  await page.reload();await page.waitForFunction(()=>expansionReady&&!worldLoading,null,{polling:50});assert.equal(await page.evaluate(()=>camera.fov),105);
  await page.getByRole('button',{name:'Creative',exact:true}).click();await page.getByRole('button',{name:'Plains',exact:true}).click();
  await page.getByRole('button',{name:'Start Game',exact:true}).click();await page.waitForFunction(()=>isGameStarted&&!worldLoading,null,{polling:50});
  const projections=await page.evaluate(()=>{
   const position=camera.position.clone(),rotation=camera.quaternion.clone(),scale=playerScale;
   camera.updateMatrixWorld(true);const point=new THREE.Vector3(camera.aspect*.9,0,-1).applyMatrix4(camera.matrixWorld),values=[];
   for(const fov of [75,90,105]){setViewFov(fov,false);values.push(point.clone().project(camera).x);}
   if(!position.equals(camera.position)||!rotation.equals(camera.quaternion)||playerScale!==scale)throw Error('FOV changes must not move, rotate or resize the player');
   if(setViewFov(NaN)!==false||setViewFov(Infinity)!==false)throw Error('Invalid FOV accepted');
   setViewFov(900,false);if(camera.fov!==105)throw Error('Maximum FOV');setViewFov(-20,false);if(camera.fov!==75)throw Error('Minimum FOV');
   return values;
  });assert(projections[0]>1&&projections[1]<1&&projections[2]<projections[1],'Wider FOV reveals more of the same world');
  await page.evaluate(()=>{showToast('Current terrain: Plains');controls.unlock();});
  await page.locator('#pause-menu').waitFor({state:'visible'});
  assert(!(await page.locator('#toast-msg').isVisible()),'Gameplay toast never covers pause controls');
  await page.locator('#pause-view-fov').focus();await page.keyboard.press('Home');
  assert.equal(await page.evaluate(()=>camera.fov),75);await page.keyboard.press('End');assert.equal(await page.evaluate(()=>camera.fov),105);
  for(const viewport of [{width:1200,height:800},{width:390,height:844}]){
   await page.setViewportSize(viewport);await page.waitForTimeout(100);
   const fit=await page.locator('#pause-menu .view-setting').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&el.scrollWidth<=el.clientWidth+1;});assert(fit,'FOV control fits '+viewport.width);
   await page.screenshot({path:'/private/tmp/view-settings-'+viewport.width+'.png'});
  }
  assert.deepEqual(errors,[]);console.log('PASS: default wide view, real menu/pause slider, persistence, projection, unchanged player physics and responsive controls.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
