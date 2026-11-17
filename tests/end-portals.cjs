const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1000,height:620}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
  await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
  console.log(await page.evaluate(()=>{
   const ok=(v,msg)=>{if(!v)throw Error(msg);};
   worldMap.clear();clearExpansionWorld();selectedTerrain='plains';currentDimension='overworld';seed=42;heightCache.clear();
   controls.isLocked=true;isGameStarted=true;gameMode='creative';blocker.style.display='none';heldItemGroup.visible=false;
   window.stepInside=(x,y,z)=>{camera.position.set(x,y+getPlayerHeight()-.45,z);velocity.set(0,0,0);portalCooldown=0;portalExitRequired=false;animate();};
   for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++){
    setGenBlock(x,79,z,3);if((x||z)&&!(x===1&&z===1))setGenBlock(x,80,z,OBSIDIAN_ID);
   }
   ok(!activatePortalNear(1,80,0),'Incomplete ring stays closed');
   camera.position.set(1,84,1);camera.lookAt(1,79,1);camera.updateMatrixWorld(true);currentBlock=OBSIDIAN_ID;
   document.dispatchEvent(new MouseEvent('mousedown',{button:2}));
   ok(getBlock(1,80,1)===OBSIDIAN_ID&&getBlock(0,80,0)===END_PORTAL_ID,'Placing the eighth stone opens an End portal');
   stepInside(0,80,0);ok(currentDimension==='end','Walking into horizontal ring reaches End');
   ok(endermen.length>=3&&villagers.length===0&&animals.length===0,'End has Endermen and no village mobs');
   ok(!checkScaledCollision(camera.position),'Player arrives clear of stone');
   ok(getBlock(8,getSurfaceHeight(8,8),8)===END_STONE_ID&&getBlock(8,endIslandBottom(getSurfaceHeight(8,8))-1,8)===0,'End island has an underside');
   ok(getBlock(48,14,48)===0,'Space between islands is open');
   const p=[...activePortals.values()][0];ok(p.block===END_PORTAL_ID,'The arrival island has a return ring');
   setGenBlock(3,70,3,51);window.endSave=getWorldSaveData();
   stepInside(...p.cells[0]);ok(currentDimension==='overworld'&&!endermen.length&&getBlock(0,80,0)===END_PORTAL_ID,'Returns to the same built ring');
   for(let u=0;u<4;u++)for(let v=0;v<5;v++)if(!u||u===3||!v||v===4)setGenBlock(7+u,80+v,0,OBSIDIAN_ID);
   activatePortalNear(7,80,0);stepInside(8,81,0);ok(currentDimension==='nether'&&endermen.length===0,'Upright obsidian still goes to Nether');
   playerInventory[ENDER_EGG_ID]=2;
   ok(!useSpawnEgg(ENDER_EGG_ID)&&playerInventory[ENDER_EGG_ID]===2,'Egg is refused without cost in Nether');
   for(let j=0;j<12;j++)updateEndermen(13);ok(!endermen.length,'No timed Nether spawns');
   restoreWorldExpansion({...saveWorldExpansion(),endermen:[{x:0,y:10,z:0,hp:8,eggId:72}]});
   ok(!endermen.length,'Legacy Nether save cannot restore an Enderman');
   return 'PASS: actual placement and walk-through, both dimensions, safe return, egg and legacy-save restrictions.';
  }));
  await page.evaluate(()=>new Promise((resolve,reject)=>{
   const file=new File([JSON.stringify(endSave)],'end.json',{type:'application/json'});
   loadSaveFile({target:{files:[file]}},err=>err?reject(err):resolve());
  }));
  assert(await page.evaluate(()=>currentDimension==='end'&&getBlock(3,70,3)===51&&endermen.length>=3&&[...activePortals.values()][0].block===END_PORTAL_ID));
  await page.evaluate(()=>{
   creativeFlying=true;camera.position.set(17,47,43);camera.lookAt(0,26,0);controls.isLocked=true;blocker.style.display='none';animate();
  });
  await page.screenshot({path:'/private/tmp/mc-end-island.png'});
  await page.evaluate(()=>stepInside(...[...activePortals.values()][0].cells[0]));
  assert(await page.evaluate(()=>currentDimension==='overworld'&&getBlock(0,80,0)===END_PORTAL_ID&&!endermen.length));
  assert.deepEqual(errors,[]);console.log('PASS: load inside End, preserve edits and return to original Overworld.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
