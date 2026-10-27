const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
    const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
    try {
        const page = await browser.newPage({viewport:{width:1000,height:750}}), errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        await page.addInitScript(()=>window.requestAnimationFrame=()=>0);
        await page.goto(process.env.GAME_URL || pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await page.waitForFunction(()=>expansionReady);
        console.log(await page.evaluate(()=>{
            const check=(ok,name)=>{if(!ok)throw Error(name);};
            selectedTerrain='moon';currentDimension='overworld';worldMap.clear();restoreMicroEdits([]);
            isGameStarted=true;gameMode='creative';playerScale=.05;updatePlayerScaleView();
            camera.position.set(8,200,-4);camera.lookAt(8,200,12);camera.fov=30;camera.updateProjectionMatrix();
            setGenBlock(8,200,8,6);setGenBlock(8,200,10,5);setGenBlock(8,199,10,4);
            buildChunkMesh(0,0);markMicroNeighborhood(8,200,8);updateMicroVoxelOverlay();
            const keep=new Set([...Object.values(chunkMeshes.get('0,0')),microVoxelGroup]);
            for(const child of scene.children)if(!child.isLight&&!keep.has(child))child.visible=false;
            scene.background=new THREE.Color(0xff00ff);scene.fog=null;
            blocker.style.display='none';inventoryUI.style.display='none';
            window.sampleView=()=>{
                renderer.render(scene,camera);const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,px=new Uint8Array(w*h*4);
                gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);
                let green=0,sky=0,gray=0,total=0;
                for(let y=Math.floor(h*.47);y<h*.53;y++)for(let x=Math.floor(w*.47);x<w*.53;x++){
                    const i=(y*w+x)*4,r=px[i],g=px[i+1],b=px[i+2];total++;
                    if(g>r*1.25&&g>b*1.1)green++;
                    if(r>150&&b>150&&g<120)sky++;
                    if(Math.max(r,g,b)-Math.min(r,g,b)<30)gray++;
                }
                return {green,sky,gray,total};
            };
            const leaves=sampleView();
            check(leaves.green>leaves.total*.2,'Leaves remain visible through a miniature glass window: '+JSON.stringify(leaves));
            return {leaves};
        }));
        await page.screenshot({path:'/private/tmp/mc-glass-leaves.png'});
        console.log(await page.evaluate(()=>{
            const checks=[],check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
            for(const id of [5,155,156,157]){
                const m=materials[id],p=m.map.image.getContext('2d').getImageData(0,0,64,64).data;
                let holes=0;for(let i=3;i<p.length;i+=4)if(!p[i])holes++;
                check(holes>200&&holes<1400,'Leaf cutout has real holes '+id);
                check(!m.transparent&&m.alphaTest===.5&&m.depthWrite,'Opaque leaf pixels write depth, holes do not '+id);
                const tiny=getMicroMaterials(id)[0],q=tiny.map.image.getContext('2d').getImageData(0,0,320,320).data;
                check(q.some((v,i)=>i%4===3&&v===0),'Miniature texture preserves alpha '+id);
                check(isSolidType(id),'Leaves remain solid '+id);
            }
            check(!materials[6].depthWrite&&materials[6].depthTest,'Glass does not erase later transparent objects and still tests solid depth');
            setGenBlock(8,200,9,3);buildChunkMesh(0,0);updateMicroVoxelOverlay();
            for(const scale of [1,.05,.005,.0005]){
                playerScale=scale;updatePlayerScaleView();updateMicroVoxelOverlay();
                const view=sampleView();check(view.gray>view.total*.9&&view.sky===0,'Stone wall visible through glass at scale '+scale+': '+JSON.stringify(view));
            }
            // Put glass and stone in the same micro mesh, testing mixed material groups.
            restoreMicroEdits([]);
            for(const level of [1,2]){
                const n=microDivisions(level),parentX=11+level,c={x:parentX,y:200,z:8,mx:n/2,my:n/2,mz:n/2,level};
                setMicroPlacement(c,6);setMicroPlacement({...c,mz:c.mz+1},3);
                markMicroNeighborhood(parentX,200,8);buildChunkMesh(0,0);
                playerScale=1/n;updatePlayerScaleView();updateMicroVoxelOverlay();
                camera.position.set(parentX+.5/n,200+.5/n,7.8);camera.lookAt(parentX+.5/n,200+.5/n,9);camera.fov=3/n*20;camera.updateProjectionMatrix();
                const view=sampleView();check(view.gray>view.total*.9&&view.sky===0,'Adjacent miniature stone is not culled behind miniature glass '+level+': '+JSON.stringify(view));
            }
            return {renderChecks:checks.length};
        }));
        await page.screenshot({path:'/private/tmp/mc-glass-stone.png'});
        console.log(await page.evaluate(()=>{
            const checks=[],check=(ok,name)=>{if(!ok)throw Error(name);checks.push(name);};
            worldMap.clear();restoreMicroEdits([]);modifiedColumns.clear();chunkMaxY.clear();
            for(const meshes of chunkMeshes.values())for(const mesh of Object.values(meshes))scene.remove(mesh);chunkMeshes.clear();
            selectedTerrain='random';seed=42;heightCache.clear();setWildernessVersion(2);
            let spot=null;
            for(let x=-300;x<300&&!spot;x+=4)for(let z=-300;z<300&&!spot;z+=4){
                const h=getSurfaceHeight(x,z);
                if(h<15||biomeColumn(x,z).biome!=='snow')continue;
                const around=[];for(const dx of [-10,0,10])for(const dz of [-10,0,10])around.push(biomeColumn(x+dx,z+dz));
                if(around.every(c=>c.biome==='snow'&&Math.abs(c.height-h)<3))spot={x,z,h};
            }
            check(spot,'Found snow biome');window.snowSpot=spot;
            const {x,z,h}=spot;
            check(getBlock(x,h+1,z)===SNOW_LAYER_ID,'Thin snow lies above terrain');
            check(getBlock(x,h,z)===1&&getBlock(x,h-1,z)===2,'Solid grass and dirt under snow, not a hollow gap');
            const geo=natureGeometry(SNOW_LAYER_ID);geo.computeBoundingBox();
            check(Math.abs(geo.boundingBox.max.y-geo.boundingBox.min.y-.1)<1e-6,'Snow is one tenth of a block thick');
            check(Math.abs(geo.boundingBox.min.y+.5)<1e-6,'Snow rests directly on supporting block');
            for(const scale of [1,.05,.005]){
                playerScale=scale;updatePlayerScaleView();camera.position.set(x,h+.5+SNOW_LAYER_HEIGHT+getPlayerHeight()+.0001,z);
                check(!checkScaledCollision(camera.position),'Clear directly above thin snow '+scale);
                check(checkScaledCollision(camera.position.clone().add(new THREE.Vector3(0,-.002,0))),'Snow surface supports player '+scale);
            }
            playerScale=.05;updatePlayerScaleView();
            markMicroNeighborhood(x,h+1,z);buildChunkMesh(Math.floor(x/16),Math.floor(z/16));updateMicroVoxelOverlay();scene.updateMatrixWorld(true);
            const origin=new THREE.Vector3(x+.025,h+.8,z+.025),ray=new THREE.Raycaster(origin,new THREE.Vector3(0,-1,0),0,1);
            const hits=ray.intersectObjects(microVoxelGroup.children);
            check(hits.length&&Math.abs(hits[0].point.y-(h+.6))<1e-5,'Micro snow mesh has a real top at the same collision height');
            const hit=findMicroBlockHit(origin,new THREE.Vector3(0,-1,0),1);
            check(hit?.type===SNOW_LAYER_ID,'Thin snow can be mined at miniature scale');
            const ground=getBlock(x,h,z);mineMicroBlock(hit);check(getBlock(x,h,z)===ground,'Mining snow leaves supporting terrain intact');
            playerScale=1;updatePlayerScaleView();currentBlock=3;controls.isLocked=true;
            const px=x+2,pz=z,ph=getSurfaceHeight(px,pz);setGenBlock(px,ph+1,pz,SNOW_LAYER_ID);
            camera.position.set(px,ph+3,pz);camera.lookAt(px,ph+.55,pz);camera.updateMatrixWorld(true);
            document.dispatchEvent(new MouseEvent('mousedown',{button:2}));
            check(getBlock(px,ph+1,pz)===3,'A stone placed on snow replaces the thin layer instead of floating one block above it');
            const sx=x-2,sy=getSurfaceHeight(x-2,z);
            setGenBlock(sx,sy+1,z,SNOW_LAYER_ID);setBlock(sx,sy,z,0);
            check(getBlock(sx,sy+1,z)===0,'Removing a supporting block also removes its unsupported snow');
            controls.isLocked=false;
            window.renderSnow=()=>{
                playerScale=1;updatePlayerScaleView();camera.fov=65;camera.updateProjectionMatrix();
                camera.position.set(x+9,h+4,z+12);camera.lookAt(x,h+.3,z);
                for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)buildChunkMesh(Math.floor(x/16)+dx,Math.floor(z/16)+dz);
                scene.background.setHex(0xb9d8eb);scene.fog=new THREE.Fog(0xb9d8eb,30,60);renderer.render(scene,camera);
                const gl=renderer.getContext(),px=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,px);
                let white=0;for(let i=0;i<px.length;i+=4)if(px[i]>150&&Math.max(px[i],px[i+1],px[i+2])-Math.min(px[i],px[i+1],px[i+2])<12)white++;
                if(white<gl.drawingBufferWidth*gl.drawingBufferHeight*.05)throw Error('Snow must be visible in the actual screenshot, not just in world data');
            };renderSnow();
            return {snowChecks:checks.length,spot};
        }));
        await page.screenshot({path:'/private/tmp/mc-thin-snow.png'});
        await page.setViewportSize({width:390,height:844});
        await page.waitForFunction(()=>renderer.domElement.width===Math.floor(innerWidth*renderer.getPixelRatio()),null,{polling:100});
        await page.evaluate(()=>renderSnow());await page.screenshot({path:'/private/tmp/mc-thin-snow-mobile.png'});
        console.log(await page.evaluate(()=>{
            const check=(ok,name)=>{if(!ok)throw Error(name);};
            for(const terrain of ['plains','random']){
                worldMap.clear();restoreMicroEdits([]);heightCache.clear();selectedTerrain=terrain;seed=42;
                let p=null;
                for(let x=-100;x<100&&!p;x++)for(let z=-100;z<100&&!p;z++){
                    const h=getSurfaceHeight(x,z);
                    if(h<15)continue;
                    if(terrain==='plains'?Math.abs(hash(x*5.12,z*3.14))<.015:naturalTreeAnchor(x,z)&&biomeColumn(x,z).biome==='meadow'&&hash3(x,h,z,918)<.18)p={x,z,h};
                }
                check(p,'Tree candidate found '+terrain);
                // A cleared doorway is protected even when it is explicitly air.
                setGenBlock(p.x,p.h+1,p.z,0);setGenBlock(p.x,p.h+2,p.z,0);setGenBlock(p.x+1,p.h+1,p.z,6);
                for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)generateTrees(Math.floor(p.x/16)+dx,Math.floor(p.z/16)+dz);
                check(getBlock(p.x,p.h+1,p.z)===0&&getBlock(p.x,p.h+2,p.z)===0,'Door clearance survives overlapping tree generation '+terrain);
                check(getBlock(p.x+1,p.h+1,p.z)===6,'Existing glass is not overwritten by a tree '+terrain);
            }
            return 'PASS: both tree generators preserve entrances and existing construction.';
        }));
        assert.deepEqual(errors,[]);
        console.log('PASS: thin supported snow, transparent leaf cutouts, glass without x-ray walls, and protected doorways.');
    } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
