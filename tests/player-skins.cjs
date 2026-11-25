const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>requestAnimationFrame=()=>0);
  const url=process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href;
  await page.goto(url,{timeout:120000});await page.waitForFunction(()=>skinEditor&&!worldLoading,null,{polling:50});
  await page.getByRole('button',{name:'Your Skin',exact:true}).click();assert(await page.locator('#skin-editor').isVisible());
  await page.waitForTimeout(200);await page.screenshot({path:'/private/tmp/skin-editor-default.png'});
  const original=await page.evaluate(()=>encodeSkinPixels(skinEditor.draft));
  await page.locator('#skin-color').evaluate(el=>el.value='#ed3048');
  await page.locator('#skin-pixels').click({position:{x:108,y:108}});
  const painted=await page.evaluate(()=>encodeSkinPixels(skinEditor.draft));assert.notEqual(painted,original);
  assert.deepEqual(await page.evaluate(()=>[...skinEditor.draft.getContext('2d').getImageData(12,12,1,1).data]),[237,48,72,255]);
  await page.getByRole('button',{name:'Undo',exact:true}).click();assert.equal(await page.evaluate(()=>encodeSkinPixels(skinEditor.draft)),original);
  await page.getByRole('button',{name:'Redo',exact:true}).click();assert.equal(await page.evaluate(()=>encodeSkinPixels(skinEditor.draft)),painted);
  await page.locator('#skin-part').selectOption('rightArm');await page.locator('#skin-layer').selectOption('overlay');
  await page.locator('#skin-brush').fill('2');await page.locator('#skin-pixels').click({position:{x:36,y:228}});
  assert.deepEqual(await page.evaluate(()=>[...skinEditor.draft.getContext('2d').getImageData(45,45,1,1).data]),[237,48,72,255]);
  await page.getByRole('button',{name:'Erase',exact:true}).click();await page.locator('#skin-pixels').click({position:{x:36,y:228}});
  assert.equal(await page.evaluate(()=>skinEditor.draft.getContext('2d').getImageData(45,45,1,1).data[3]),0);
  await page.getByRole('button',{name:'Pencil',exact:true}).click();await page.locator('#skin-layer').selectOption('base');
  await page.locator('#skin-pixels').click({position:{x:36,y:228}});
  await page.getByRole('button',{name:'Save Skin',exact:true}).click();assert(!(await page.locator('#skin-editor').isVisible()));
  const saved=await page.evaluate(()=>localSkinPacket);assert.equal(await page.evaluate(()=>localStorage.getItem(PLAYER_SKIN_STORAGE)),saved);
  await page.reload();await page.waitForFunction(()=>skinEditor&&!worldLoading,null,{polling:50});assert.equal(await page.evaluate(()=>localSkinPacket),saved);
  await page.getByRole('button',{name:'Your Skin',exact:true}).click();
  const image=async(w,h,photo=false)=>Buffer.from(await page.evaluate(({w,h,photo})=>{
   const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');
   if(photo){ctx.fillStyle='#ec362b';ctx.fillRect(0,0,w/2,h);ctx.fillStyle='#285bd4';ctx.fillRect(w/2,0,w/2,h);}
   else{ctx.fillStyle='#43a077';ctx.fillRect(0,0,w,h);ctx.fillStyle='#e6b653';ctx.fillRect(44,20,4,12);}
   return c.toDataURL('image/png').split(',')[1];
  },{w,h,photo}),'base64');
  await page.locator('#skin-file').setInputFiles({name:'bad.png',mimeType:'image/png',buffer:await image(32,32)});
  await page.waitForFunction(()=>document.getElementById('skin-status').textContent.includes('64 x 64'),null,{polling:50});
  assert.equal(await page.evaluate(()=>encodeSkinPixels(skinEditor.draft)),saved,'Invalid image must not destroy draft');
  await page.locator('#skin-file').setInputFiles({name:'my-skin.png',mimeType:'image/png',buffer:await image(64,64)});
  await page.waitForFunction(()=>document.getElementById('skin-status').textContent==='',null,{polling:50});
  assert.deepEqual(await page.evaluate(()=>[...skinEditor.draft.getContext('2d').getImageData(44,20,1,1).data]),[230,182,83,255]);
  const imported=await page.evaluate(()=>encodeSkinPixels(skinEditor.draft));
  const network=[];page.on('request',r=>network.push(r.url()));
  await page.locator('#skin-photo-file').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:await image(160,120,true)});
  await page.waitForFunction(()=>!!skinEditor.photo,null,{polling:50});
  for(const [id,value] of [['#skin-photo-zoom','3'],['#skin-photo-x','100']])await page.locator(id).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input'));},value);
  await page.getByRole('button',{name:'Apply Photo',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>[...skinEditor.draft.getContext('2d').getImageData(12,12,1,1).data]),[40,91,212,255],'Crop chooses right-hand blue region');
  assert.equal(await page.evaluate(()=>skinEditor.draft.getContext('2d').getImageData(44,20,1,1).data[0]),230,'Photo preserves clothing');
  assert(network.every(u=>!/^https?:/.test(u)),'Photo editing must not upload an image');
  await page.getByRole('button',{name:'Undo',exact:true}).click();assert.equal(await page.evaluate(()=>encodeSkinPixels(skinEditor.draft)),imported);
  await page.getByRole('button',{name:'Redo',exact:true}).click();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download skin PNG',exact:true}).click();
  const download=await downloadPromise;await download.saveAs('/private/tmp/daniel-test-skin.png');const png=fs.readFileSync('/private/tmp/daniel-test-skin.png');assert.equal(png.readUInt32BE(16),64);assert.equal(png.readUInt32BE(20),64);
  const previewPixels=()=>page.evaluate(()=>{
   const {renderer,model}=skinEditor.view;model.visible=false;renderSkinPreview();const gl=renderer.getContext(),p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4),base=new Uint8Array(p.length),colors=new Set();
   gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,base);model.visible=true;renderSkinPreview();
   gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);let visible=0;
   for(let i=0;i<p.length;i+=4){if(i%128===0)colors.add(p.slice(i,i+3).join(','));if(Math.abs(p[i]-base[i])+Math.abs(p[i+1]-base[i+1])+Math.abs(p[i+2]-base[i+2])>8)visible++;}
   return {colors:colors.size,visible};
  });
  for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:320,height:740}]){
   await page.setViewportSize(viewport);await page.waitForTimeout(150);const pixels=await previewPixels();console.log({viewport,pixels});
   await page.screenshot({path:'/private/tmp/skin-editor-'+viewport.width+'.png'});
   assert(pixels.colors>4&&pixels.visible>300,'Nonblank skin preview '+viewport.width+': '+JSON.stringify(pixels));
   const overflow=await page.evaluate(()=>{const d=skinEditor.dialog;return d.scrollWidth>d.clientWidth+1||[...d.querySelectorAll('button,select')].filter(el=>el.offsetWidth).some(el=>el.scrollWidth>el.clientWidth+2);});assert(!overflow,'Editor controls fit '+viewport.width);
   await page.screenshot({path:'/private/tmp/skin-editor-'+viewport.width+'.png'});
  }
  await page.setViewportSize({width:1280,height:900});
  await page.locator('#skin-rotation').evaluate(el=>{el.value=90;el.dispatchEvent(new Event('input'));});assert(Math.abs(await page.evaluate(()=>skinEditor.view.model.rotation.y)-Math.PI/2)<1e-8);
  await page.getByRole('button',{name:'Close skin editor',exact:true}).click();assert.equal(await page.evaluate(()=>localSkinPacket),saved,'Cancel keeps the saved skin');
  console.log(await page.evaluate(()=>{
   const check=(v,name)=>{if(!v)throw Error(name);};
   const legacy=document.createElement('canvas');legacy.width=64;legacy.height=32;const c=legacy.getContext('2d');c.fillStyle='#b84455';c.fillRect(44,20,4,12);
   const normalized=normalizedSkinImage(legacy);check(normalized.getContext('2d').getImageData(36,52,1,1).data[0]===184,'Legacy skin mirrors right arm to left');
   check(!decodeSkinPixels('https://example.com/skin.png')&&!decodeSkinPixels('x'.repeat(21848)),'Reject URLs and malformed pixel payloads');
   const model=buildSkinAvatar(getLocalPlayerSkin());check(model.children.length===6&&model.userData.rightArm.children.length===1,'Avatar uses continuous limbs');
   for(const part of ['rightArm','leftArm']){const limb=model.userData[part].children[0];check(limb.geometry.index.count===36&&limb.material.map===model.userData.skinTexture,'Closed cuboid shares skin atlas');}
   const packets=[],entry={conn:{open:true,send:p=>packets.push(p)}},room={peer:{id:'self'},skins:new Map()};
   sendLocalRoomSkin(room,entry);sendLocalRoomSkin(room,entry);check(packets.length===2&&packets.every(p=>JSON.stringify(p).length<16300),'Skin sent once in two bounded messages, not on each pose');
   const receiver={peer:{id:'receiver'},skins:new Map()};check(!receiveRoomSkinPart(receiver,'self',packets[1]),'Reject missing first part');
   check(!receiveRoomSkinPart(receiver,'self',packets[0])&&receiveRoomSkinPart(receiver,'self',packets[1])&&receiver.skins.get('self')===localSkinPacket,'Lossless bounded reassembly');
   const skin=defaultPlayerSkin();check(receiveRoomSkin(room,'friend',encodeSkinPixels(skin))&&!receiveRoomSkin(room,'friend',encodeSkinPixels(skin)),'Remote skin decoded once');
   check(!receiveRoomSkin(room,'self',encodeSkinPixels(skin))&&!receiveRoomSkin(room,'bad','x'.repeat(30000)),'Reject self overwrite and large packet');
   check(!receiveRoomSkin(room,'__proto__',encodeSkinPixels(skin))&&!receiveRoomSkin(room,'constructor',encodeSkinPixels(skin)),'Reject prototype keys in network identities');
   applyAvatarSkin(model,skin);check(model.userData.skinTexture.image.width===64,'Remote material receives actual pixels');disposeModModel(model);
   currentBlock=33;updateHeldItem3D(33);const rig=heldItemGroup.children[0],texture=rig.userData.ownedTextures[0];let disposed=0;texture.addEventListener('dispose',()=>disposed++);
   check(rig.userData.gripArm.children[0].material.map===texture,'Held hand uses player skin');currentBlock=0;updateHeldItem3D(0);check(disposed===1,'Switching items releases old skin texture once');
   return 'PASS: legacy skin, solid arms, atlas ownership, guarded multiplayer packets and texture disposal.';
  }));
  assert.deepEqual(errors,[]);console.log('PASS: paint, undo/redo, layers, file import, local photo crop, download, persistence and desktop/mobile preview.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
