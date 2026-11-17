const path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:process.env.UNCAPPED?['--disable-frame-rate-limit','--disable-gpu-vsync']:[]});
 try{
  const page=await browser.newPage({viewport:{width:960,height:540}});
  page.on('pageerror',err=>console.error(err.message));
  await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
  await page.evaluate(terrain=>{
   controls.lock=()=>{controls.isLocked=true;};
   window.startNewGame(true,terrain);controls.isLocked=true;gameMode='creative';
   camera.position.set(0,getSurfaceHeight(0,0)+3,0);camera.lookAt(25,camera.position.y,25);
   creativeFlying=true;blocker.style.display='none';moveForward=true;
  },process.env.BENCH_TERRAIN||'plains');
  console.log(await page.evaluate(()=>new Promise(resolve=>{
   const times=[];let start=0,previous=0;
   function sample(now){
    if(!start)start=now;
    if(now-start>3500&&previous)times.push(now-previous);
    previous=now;
    if(now-start<10500||times.length<10)return requestAnimationFrame(sample);
    const sorted=[...times].sort((a,b)=>a-b);
    resolve({fps:+(1000*times.length/times.reduce((a,b)=>a+b,0)).toFixed(1),p50ms:sorted[Math.floor(times.length*.5)],p95ms:sorted[Math.floor(times.length*.95)],frames:times.length,drawCalls:renderer.info.render.calls,chunks:chunkMeshes.size,viewport:'960x540',terrain:selectedTerrain});
   }requestAnimationFrame(sample);
  })));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
