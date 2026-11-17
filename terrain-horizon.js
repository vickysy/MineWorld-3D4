// Distant landscape only. Voxel collision, edits and nearby geometry remain authoritative.
const HORIZON_RADIUS=15, HORIZON_SIDE=2*HORIZON_RADIUS+1;
let horizon=null;
function horizonTrees(tiles){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=16;
    const c=canvas.getContext('2d');c.fillStyle='#6b5034';c.fillRect(7,7,2,9);
    c.fillStyle='#517139';for(const [x,y,w,b] of [[4,1,6,3],[2,3,11,5],[1,6,13,4],[4,9,8,2]])c.fillRect(x,y,w,b);
    c.fillStyle='#69874b';c.fillRect(4,2,5,3);c.fillRect(2,5,4,2);c.fillStyle='#405d32';c.fillRect(9,8,4,2);
    const tex=new THREE.CanvasTexture(canvas);tex.magFilter=THREE.NearestFilter;
    const g=new THREE.BufferGeometry(),p=[],uv=[];
    for(const [dx,dz] of [[.5,.5],[.5,-.5]]){
        for(const [x,y] of [[-1,0],[1,0],[1,1],[-1,0],[1,1],[-1,1]]){
            p.push(x*dx,y,x*dz);uv.push((x+1)/2,y);
        }
    }
    g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();
    const m=new THREE.InstancedMesh(g,new THREE.MeshLambertMaterial({map:tex,alphaTest:.35,side:THREE.DoubleSide}),tiles*4);
    m.frustumCulled=false;m.instanceMatrix.array.fill(0);m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(m);return m;
}
function horizonGrove(cx,cz){
    const trees=[];
    if(currentDimension!=='overworld'||['city','moon','desert'].includes(selectedTerrain))return trees;
    for(let j=0;j<4;j++){
        const a=cx*2+(j&1),b=cz*2+(j>>1);let x,z,leaf=0xffffff;
        if(selectedTerrain==='random'){
            x=a*8+1+Math.floor(hash(a+18,b)*6);z=b*8+1+Math.floor(hash(a,b+27)*6);
            const {height,biome}=biomeColumn(x,z);
            if(!['snow','meadow','autumn'].includes(biome)||!naturalTreeAnchor(x,z)||hash3(x,height,z,918)>(biome==='autumn'?.75:biome==='snow'?.30:.18))continue;
            if(biome==='autumn')leaf=[0xffb262,0xff866d,0xffdd70][Math.floor(hash(x+9,z)*3)];
        }else{
            let found=false;
            for(let n=0;n<64;n++){
                x=a*8+(n&7);z=b*8+(n>>3);
                if(hash(x*5.12,z*3.14)<(selectedTerrain==='jungle'?.05:.015)&&getSurfaceHeight(x,z)>11){found=true;break;}
            }
            if(!found)continue;
        }
        const y=getSurfaceHeight(x,z),base=worldMap.get([x,y+1,z].join(','));
        if(base!==undefined&&base!==4)continue;
        if(worldMap.has('trees_'+cx+','+cz)&&base!==4)continue;
        const m=new THREE.Matrix4().makeScale(5,5+Math.floor(hash(x,z)*3),5);m.setPosition(x,y+.5,z);
        trees.push({m,leaf});
    }
    return trees;
}
// Greedy rectangles use the very same integer columns as the playable terrain.
const FAR_COLORS=[0x527a36,0x398697,0xc4b47a,0x767771,0xe4e9e7,0x73372b,0xc7c598];
function farColumn(x,z){
    const ground=getSurfaceHeight(x,z);
    if(currentDimension==='end')return [ground,6];
    if(currentDimension==='nether')return [Math.max(6,ground),5];
    const water=selectedTerrain==='moon'?-Infinity:Math.max(SEA_LEVEL,worldFloodHeight??-Infinity);
    if(ground<water)return [water,1];
    const biome=selectedTerrain==='random'?biomeColumn(x,z).biome:'';
    return [ground,biome==='snow'?4:biome==='cliffs'||selectedTerrain==='moon'?3:selectedTerrain==='desert'||biome==='beach'||ground<=water+1?2:0];
}
function horizonSurface(x,z){
    const heights=new Int32Array(18*18),colors=new Uint8Array(256),used=new Uint8Array(256),runs=[];
    for(let dz=-1;dz<=16;dz++)for(let dx=-1;dx<=16;dx++){
        const [y,tint]=farColumn(x*16+dx,z*16+dz);heights[(dz+1)*18+dx+1]=y;
        if(dx>=0&&dx<16&&dz>=0&&dz<16)colors[dz*16+dx]=tint;
    }
    for(let dz=0;dz<16;dz++)for(let dx=0;dx<16;dx++){
        const i=dz*16+dx,k=(dz+1)*18+dx+1,y=heights[k],color=colors[i];
        if(used[i]||currentDimension==='end'&&y===END_VOID_Y)continue;
        const same=(a,b)=>!used[b*16+a]&&colors[b*16+a]===color&&heights[(b+1)*18+a+1]===y;
        let w=1,d=1;
        while(dx+w<16&&same(dx+w,dz))w++;
        outer:while(dz+d<16){for(let a=dx;a<dx+w;a++)if(!same(a,dz+d))break outer;d++;}
        let low=y-1;
        for(let b=0;b<d;b++){
            used.fill(1,(dz+b)*16+dx,(dz+b)*16+dx+w);
            low=Math.min(low,heights[k+b*18-1],heights[k+b*18+w]);
        }
        for(let a=0;a<w;a++)low=Math.min(low,heights[k-18+a],heights[k+d*18+a]);
        if(currentDimension==='end')low=endIslandBottom(y)-1;
        runs.push([dx,dz,w,d,y,low,color]);
    }
    return runs;
}
function initTerrainHorizon(){
    const mesh=new THREE.Group();scene.add(mesh);
    horizon={mesh,trees:horizonTrees(HORIZON_SIDE**2),material:new THREE.MeshLambertMaterial(),
        geometry:new THREE.BoxGeometry(1,1,1),matrix:new THREE.Matrix4(),empty:new THREE.Matrix4().makeScale(0,0,0),
        slots:new Array(HORIZON_SIDE**2),pages:new Map(),dirty:new Set(),queue:[],identity:'',cx:NaN,cz:NaN};
}
function horizonSlot(x,z){
    const mod=n=>(n%HORIZON_SIDE+HORIZON_SIDE)%HORIZON_SIDE;return mod(z)*HORIZON_SIDE+mod(x);
}
function horizonPageKey(x,z){return Math.floor(x/4)+','+Math.floor(z/4);}
function maskTerrainHorizon(cx,cz,detailed){
    if(!horizon)return;
    const h=horizon,slot=horizonSlot(cx,cz),tile=h.slots[slot];
    if(!tile||tile.x!==cx||tile.z!==cz||tile.masked===detailed)return;
    tile.masked=detailed;h.dirty.add(horizonPageKey(cx,cz));
    // Never draw the distant surface over a freshly built tunnel, even for one frame.
    if(detailed&&tile.batch){for(let j=tile.begin;j<tile.end;j++)tile.batch.setMatrixAt(j,h.empty);tile.batch.instanceMatrix.needsUpdate=true;tile.batch=null;}
    for(let j=0;j<4;j++){
        const t=detailed?null:tile.grove[j];h.trees.setMatrixAt(slot*4+j,t?t.m:h.empty);
        if(t)h.trees.setColorAt(slot*4+j,new THREE.Color(t.leaf));
    }
    h.trees.instanceMatrix.needsUpdate=true;if(h.trees.instanceColor)h.trees.instanceColor.needsUpdate=true;
}
function rebuildHorizonPage(key){
    const h=horizon,[px,pz]=key.split(',').map(Number),tiles=[];let count=0,min=Infinity,max=-Infinity,m=h.pages.get(key);
    for(let dz=0;dz<4;dz++)for(let dx=0;dx<4;dx++){
        const x=px*4+dx,z=pz*4+dz,t=h.slots[horizonSlot(x,z)];
        if(t&&t.x===x&&t.z===z&&!t.masked){tiles.push(t);count+=t.runs.length;}
    }
    if(m&&(!count||m.instanceMatrix.count<count)){h.mesh.remove(m);m.dispose();m.geometry.dispose();h.pages.delete(key);m=null;}
    if(!count)return;
    if(!m){
        m=new THREE.InstancedMesh(h.geometry.clone(),h.material,2**Math.ceil(Math.log2(Math.max(32,count))));
        m.position.set(px*64,0,pz*64);m.frustumCulled=true;m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        h.pages.set(key,m);h.mesh.add(m);
    }
    let index=0;
    for(const t of tiles){
        t.batch=m;t.begin=index;
        for(const [x,z,w,d,y,low,color] of t.runs){
            h.matrix.makeScale(w,y-low,d);h.matrix.setPosition((t.x-px*4)*16+x+(w-1)*.5,(y+low+1)*.5,(t.z-pz*4)*16+z+(d-1)*.5);
            m.setMatrixAt(index,h.matrix);m.setColorAt(index++,h.palette[color]);min=Math.min(min,low);max=Math.max(max,y+1);
        }
        t.end=index;
    }
    m.count=index;m.geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(31.5,(min+max)/2,31.5),Math.hypot(33,33,(max-min)/2));
    m.instanceMatrix.needsUpdate=m.instanceColor.needsUpdate=true;
}
function updateTerrainHorizon(cx,cz){
    if(!horizon)initTerrainHorizon();
    const h=horizon,identity=[currentDimension,selectedTerrain,seed,wildernessVersion,worldFloodHeight].join('/');
    if(h.identity!==identity){
        h.identity=identity;h.cx=NaN;h.slots.fill(null);h.dirty.clear();
        for(const m of h.pages.values()){h.mesh.remove(m);m.dispose();m.geometry.dispose();}h.pages.clear();
        h.trees.instanceMatrix.array.fill(0);h.trees.instanceMatrix.needsUpdate=true;h.palette=FAR_COLORS.map(c=>new THREE.Color(c));
    }
    if(cx!==h.cx||cz!==h.cz){
        h.cx=cx;h.cz=cz;h.queue.length=0;
        for(let dz=-HORIZON_RADIUS;dz<=HORIZON_RADIUS;dz++)for(let dx=-HORIZON_RADIUS;dx<=HORIZON_RADIUS;dx++){
            const x=cx+dx,z=cz+dz,i=horizonSlot(x,z),t=h.slots[i];
            if(t?.x===x&&t.z===z){maskTerrainHorizon(x,z,chunkMeshes.has(x+','+z));continue;}
            if(t)maskTerrainHorizon(t.x,t.z,true);
            h.queue.push({x,z,i,d:dx*dx+dz*dz});
        }
        h.queue.sort((a,b)=>b.d-a.d);
    }
    const until=performance.now()+1.5;
    while(h.queue.length){
        const {x,z,i}=h.queue.pop();h.slots[i]={x,z,i,runs:horizonSurface(x,z),grove:horizonGrove(x,z),masked:null};
        maskTerrainHorizon(x,z,chunkMeshes.has(x+','+z));if(performance.now()>=until)break;
    }
    for(const key of h.dirty){h.dirty.delete(key);rebuildHorizonPage(key);if(performance.now()>=until)break;}
}
