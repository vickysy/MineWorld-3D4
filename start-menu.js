let menuPanorama=null,worldLoading=false;
const menuReducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
function buildMenuPanorama(){
    const world=new THREE.Scene();world.background=new THREE.Color(0xaad2df);world.fog=new THREE.Fog(0xaad2df,110,230);
    const view=new THREE.PerspectiveCamera(60,1,.1,300);
    world.add(new THREE.HemisphereLight(0xffffff,0x6f8073,.85));
    const sun=new THREE.DirectionalLight(0xfff3dc,.85);sun.position.set(-35,70,30);world.add(sun);
    const matrix=new THREE.Matrix4();
    const height=(x,z)=>{
        if(z>17&&x>18&&x<38)return 0;
        const a=41-Math.abs(x+14)*.82-Math.abs(z+36)*.76;
        const b=32-Math.abs(x-23)*.92-Math.abs(z+25)*.72;
        const c=24-Math.abs(x+37)*.85-Math.abs(z+12)*.82;
        const ridge=Math.sin(x*.18+z*.1)*1.5+Math.sin(z*.27)*.8;
        return Math.max(0,Math.floor(Math.max(a,b,c,1+Math.sin(x*.11)*1.2)+ridge));
    };
    // Exposed voxel faces use the game's textures, rather than stretched column boxes.
    const batches=Array.from({length:4},()=>({position:[],normal:[],uv:[]}));
    const face=(batch,points,normal)=>{
        const uv=normal[1]?[[0,0],[1,0],[1,1],[0,1]]:[[0,0],[0,1],[1,1],[1,0]];
        for(const index of [0,1,2,0,2,3]){batch.position.push(...points[index]);batch.normal.push(...normal);batch.uv.push(...uv[index]);}
    };
    for(let x=-100;x<100;x++)for(let z=-100;z<70;z++){
        const y=height(x,z),snow=y>8||z>8&&Math.sin(x*.33+z*.2)>.4;
        face(batches[snow?0:1],[[x,y,z],[x,y,z+1],[x+1,y,z+1],[x+1,y,z]],[0,1,0]);
        for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
            const low=height(x+dx,z+dz);
            for(let sy=low;sy<y;sy++){
                const batch=batches[y>19&&sy>=y-1?0:y>8?2:sy===y-1?3:2];
                const points=dx===1?[[x+1,sy,z],[x+1,sy+1,z],[x+1,sy+1,z+1],[x+1,sy,z+1]]:
                    dx===-1?[[x,sy,z+1],[x,sy+1,z+1],[x,sy+1,z],[x,sy,z]]:
                    dz===1?[[x+1,sy,z+1],[x+1,sy+1,z+1],[x,sy+1,z+1],[x,sy,z+1]]:
                    [[x,sy,z],[x,sy+1,z],[x+1,sy+1,z],[x+1,sy,z]];
                face(batch,points,[dx,0,dz]);
            }
        }
    }
    const maps=[pixelPattern('menu-snow',['#f8faf7','#eff3f0','#f4f7f4']),classicBlockTexture('grass_top'),classicBlockTexture('stone'),classicBlockTexture('grass_side')];
    batches.forEach((batch,i)=>{
        const geo=new THREE.BufferGeometry();for(const [name,size] of [['position',3],['normal',3],['uv',2]])geo.setAttribute(name,new THREE.Float32BufferAttribute(batch[name],size));
        const map=maps[i];map.minFilter=THREE.NearestMipmapLinearFilter;
        world.add(new THREE.Mesh(geo,new THREE.MeshLambertMaterial({map,side:THREE.DoubleSide})));
    });
    const addInstances=(data,material,name)=>{
        const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material,data.length);mesh.name=name;
        data.forEach(([x,y,z,w,h,d,color],i)=>{matrix.makeScale(w,h,d);matrix.setPosition(x,y,z);mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,new THREE.Color(color));});
        mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;mesh.frustumCulled=false;world.add(mesh);return mesh;
    };
    const trunks=[],leaves=[],treeSnow=[];
    for(const [x,z] of [[-32,5],[-23,13],[30,2],[35,-10],[10,-7],[48,10],[-9,-13],[-45,-5],[19,10],[43,8]]){
        const y=height(x,z),h=4+Math.floor(hash(x,z)*3);
        for(let dy=0;dy<h;dy++)trunks.push([x,y+dy+.5,z,1,1,1,0xffffff]);
        for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=h-2;dy<=h+1;dy++){
            if(!canopyCell(x,z,dx,dy-h,dz)||dx===0&&dz===0&&dy<h)continue;
            leaves.push([x+dx,y+dy+.5,z+dz,1,1,1,0xffffff]);
            if(!canopyCell(x,z,dx,dy+1-h,dz))treeSnow.push([x+dx,y+dy+1+SNOW_LAYER_HEIGHT/2,z+dz,1,SNOW_LAYER_HEIGHT,1,0xffffff]);
        }
    }
    addInstances(trunks,materials[4],'menu-tree-trunks');addInstances(leaves,materials[5],'menu-tree-leaves');
    addInstances(treeSnow,materials[SNOW_LAYER_ID],'menu-tree-snow');
    const livestock=[];
    for(const [type,x,z,yaw] of [['pig',28,23,2.4],['sheep',32,20,.4],['sheep',21,18,.9],['pig',35,22,-1.3]]){
        const mesh=buildLivestock(type);mesh.position.set(x,height(x,z)+.6,z);mesh.rotation.y=yaw;world.add(mesh);livestock.push(mesh);
    }
    const flakes=new Float32Array(700*3);
    for(let i=0;i<flakes.length;i+=3){flakes[i]=Math.random()*140-70;flakes[i+1]=Math.random()*65;flakes[i+2]=Math.random()*130-70;}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(flakes,3));
    const snow=new THREE.Points(geometry,new THREE.PointsMaterial({color:0xffffff,size:.11,transparent:true,opacity:.9,depthWrite:false}));world.add(snow);
    return {world,view,flakes,snow,livestock,time:0,height};
}
function renderStartPanorama(delta){
    if(!menuPanorama||document.hidden)return;
    const p=menuPanorama;if(!menuReducedMotion.matches)p.time+=Math.min(delta,.05);
    const aspect=innerWidth/innerHeight;
    if(p.view.aspect!==aspect){p.view.aspect=aspect;p.view.updateProjectionMatrix();}
    // The camera stays at eye level. Only its viewing direction turns slowly.
    const x=29,z=32,y=p.height(x,z)+2.2;
    const yaw=-.32+Math.sin(p.time*.023)*.25;
    p.view.position.set(x,y,z);
    p.view.lookAt(x+Math.sin(yaw)*70,y+6,z-Math.cos(yaw)*70);
    if(!menuReducedMotion.matches){
        for(let i=0;i<p.flakes.length;i+=3){p.flakes[i]+=.25*delta;p.flakes[i+1]-=2.3*delta;if(p.flakes[i+1]<0)p.flakes[i+1]=65;if(p.flakes[i]>70)p.flakes[i]=-70;}
        p.snow.geometry.attributes.position.needsUpdate=true;
        p.livestock.forEach((mesh,i)=>{mesh.userData.head.rotation.y=Math.sin(p.time*.35+i)*.18;});
    }
    renderer.render(p.world,p.view);
}
function setLoadingProgress(value,stage){
    document.getElementById('loading-progress').value=value;
    document.getElementById('loading-percent').textContent=Math.round(value)+'%';
    document.getElementById('loading-stage').textContent=stage;
}
function nextLoadingStep(){return new Promise(resolve=>setTimeout(resolve,30));}
async function beginQuickPlay(){
    if(worldLoading)return;
    worldLoading=true;cancelEating();
    const overlay=document.getElementById('world-loading'),button=document.getElementById('start-game-button');
    overlay.hidden=false;overlay.setAttribute('aria-busy','true');button.disabled=true;setLoadingProgress(5,'Preparing world');
    // Lock in the original click gesture, before yielding to terrain generation.
    window.initAudio();controls.lock();
    try{
        await nextLoadingStep();
        window.startNewGame(true,terrainChoice,true);
        setLoadingProgress(15,'Finding safe ground');await nextLoadingStep();
        const cx=Math.floor(camera.position.x/CHUNK_SIZE),cz=Math.floor(camera.position.z/CHUNK_SIZE),chunks=[];
        for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)chunks.push([cx+x,cz+z]);
        chunks.sort((a,b)=>Math.hypot(a[0]-cx,a[1]-cz)-Math.hypot(b[0]-cx,b[1]-cz));
        for(let i=0;i<chunks.length;i++){
            buildChunkIfMissing(...chunks[i]);setLoadingProgress(20+70*(i+1)/chunks.length,'Building terrain');await nextLoadingStep();
        }
        updateChunks(camera.position);resetSurvivalState();setLoadingProgress(100,'Ready');await nextLoadingStep();
        overlay.hidden=true;overlay.setAttribute('aria-busy','false');document.body.classList.remove('menu-open');
        if(!controls.isLocked){blocker.style.display='flex';document.getElementById('start-menu').style.display='none';document.getElementById('pause-menu').style.display='block';}
    }catch(error){
        console.error('World loading failed',error);isGameStarted=false;controls.unlock();
        document.getElementById('loading-stage').textContent='Could not load the world';document.getElementById('loading-retry').hidden=false;
        overlay.setAttribute('aria-busy','false');
    }finally{worldLoading=false;button.disabled=false;}
}
function initStartMenu(){
    document.body.classList.add('menu-open');menuPanorama=buildMenuPanorama();renderStartPanorama(0);
    setGameModeChoice(gameMode);setLoadingProgress(100,'Ready');
    setTimeout(()=>{document.getElementById('world-loading').hidden=true;document.getElementById('world-loading').setAttribute('aria-busy','false');},180);
}
