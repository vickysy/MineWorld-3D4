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
function initTerrainHorizon(){
    const tiles=HORIZON_SIDE**2, vertices=tiles*9;
    const geometry=new THREE.BufferGeometry();
    for(const attr of ['position','color'])geometry.setAttribute(attr,new THREE.BufferAttribute(new Float32Array(vertices*3),3).setUsage(THREE.DynamicDrawUsage));
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(tiles*24),1).setUsage(THREE.DynamicDrawUsage));
    const normals=new Float32Array(vertices*3);for(let i=1;i<normals.length;i+=3)normals[i]=1;
    geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
    const grain=new Uint8Array(16*16*4),uv=new Float32Array(vertices*2);
    for(let i=0;i<256;i++){const v=224+((i*37^(i>>3)*83)%32);grain.set([v,v,v,255],4*i);}
    const tex=new THREE.DataTexture(grain,16,16,THREE.RGBAFormat);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
    tex.magFilter=THREE.NearestFilter;tex.minFilter=THREE.LinearMipMapLinearFilter;tex.generateMipmaps=true;tex.needsUpdate=true;
    for(let i=0;i<vertices;i++){uv[i*2]=(i%3)*2;uv[i*2+1]=(Math.floor(i/3)%3)*2;}
    geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    const mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({vertexColors:true,map:tex}));
    mesh.frustumCulled=false;scene.add(mesh);
    horizon={mesh,trees:horizonTrees(tiles),empty:new THREE.Matrix4().makeScale(0,0,0),geometry,slots:new Array(tiles),queue:[],edges:new Set(),seams:new Map(),
        seamMaterial:new THREE.MeshLambertMaterial({color:0x66814b,side:THREE.DoubleSide}),identity:'',cx:NaN,cz:NaN};
}
function horizonSlot(x,z){
    const mod=n=>(n%HORIZON_SIDE+HORIZON_SIDE)%HORIZON_SIDE;
    return mod(z)*HORIZON_SIDE+mod(x);
}
function maskTerrainHorizon(cx,cz,detailed){
    if(!horizon)return;
    const slot=horizonSlot(cx,cz),tile=horizon.slots[slot];
    if(!tile||tile.x!==cx||tile.z!==cz||tile.masked===detailed)return;
    tile.masked=detailed;const a=horizon.geometry.index.array;
    const base=slot*9;let i=slot*24;
    for(const j of [0,1,3,4])for(const v of [j,j+3,j+1,j+1,j+3,j+4])a[i++]=detailed?0:base+v;
    horizon.geometry.index.needsUpdate=true;
    for(let j=0;j<4;j++){
        const t=detailed?null:tile.grove?.[j];
        horizon.trees.setMatrixAt(slot*4+j,t?t.m:horizon.empty);
        if(t)horizon.trees.setColorAt(slot*4+j,new THREE.Color(t.leaf));
    }
    horizon.trees.instanceMatrix.needsUpdate=true;if(horizon.trees.instanceColor)horizon.trees.instanceColor.needsUpdate=true;
    for(const [dx,dz] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]])horizon.edges.add(horizonSlot(cx+dx,cz+dz));
}
function updateHorizonSeam(i){
    const h=horizon,t=h.slots[i],old=h.seams.get(i),p=[];
    if(old){scene.remove(old);old.geometry.dispose();h.seams.delete(i);}
    if(!t||t.masked)return;
    const pos=h.geometry.attributes.position;
    for(const [dx,dz,start,stride] of [[-1,0,0,3],[1,0,2,3],[0,-1,0,1],[0,1,6,1]]){
        if(!chunkMeshes.has((t.x+dx)+','+(t.z+dz)))continue;
        const ox=t.x*16+(dx>0?16:0),oz=t.z*16+(dz>0?16:0);
        for(let n=0;n<16;n++){
            const a=ox+(dz?n:0),b=oz+(dx?n:0),endX=a+(dz?1:0),endZ=b+(dx?1:0);
            let y=getSurfaceHeight(a+(dx<0?-1:0),b+(dz<0?-1:0));
            if(currentDimension==='overworld'&&selectedTerrain!=='moon')y=Math.max(y,SEA_LEVEL,worldFloodHeight??-Infinity);
            const j=i*9+start+Math.floor(n/8)*stride;
            const low=pos.getY(j),step=(pos.getY(j+stride)-low)/8,y0=low+step*(n%8),y1=y0+step;
            const A=[a-.5,y+.5,b-.5],B=[endX-.5,y+.5,endZ-.5],C=[a-.5,y0,b-.5],D=[endX-.5,y1,endZ-.5];
            p.push(...A,...B,...C,...C,...B,...D);
        }
    }
    if(!p.length)return;
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.computeVertexNormals();
    const m=new THREE.Mesh(g,h.seamMaterial);scene.add(m);h.seams.set(i,m);
}
function updateTerrainHorizon(cx,cz){
    if(!horizon)initTerrainHorizon();
    const h=horizon,identity=[currentDimension,selectedTerrain,seed,wildernessVersion,worldFloodHeight].join('/');
    if(h.identity!==identity){
        h.identity=identity;h.cx=NaN;h.slots.fill(null);h.geometry.index.array.fill(0);h.geometry.index.needsUpdate=true;
        for(const m of h.seams.values()){scene.remove(m);m.geometry.dispose();}h.seams.clear();h.edges.clear();
        h.trees.instanceMatrix.array.fill(0);h.trees.instanceMatrix.needsUpdate=true;
    }
    if(cx!==h.cx||cz!==h.cz){
        h.cx=cx;h.cz=cz;h.queue.length=0;
        for(let dz=-HORIZON_RADIUS;dz<=HORIZON_RADIUS;dz++)for(let dx=-HORIZON_RADIUS;dx<=HORIZON_RADIUS;dx++){
            const x=cx+dx,z=cz+dz,i=horizonSlot(x,z),tile=h.slots[i];
            if(tile?.x===x&&tile.z===z){maskTerrainHorizon(x,z,chunkMeshes.has(x+','+z));continue;}
            if(tile)maskTerrainHorizon(tile.x,tile.z,true);
            h.queue.push({x,z,i,d:dx*dx+dz*dz});
        }
        h.queue.sort((a,b)=>b.d-a.d);
    }
    const until=performance.now()+1.4,pos=h.geometry.attributes.position,col=h.geometry.attributes.color;
    let writes=0;
    while(h.queue.length&&(!writes||performance.now()<until)){
        const {x,z,i}=h.queue.pop();h.slots[i]={x,z,masked:null,grove:horizonGrove(x,z)};
        for(let dz=0;dz<=2;dz++)for(let dx=0;dx<=2;dx++){
            const px=x*16+dx*8,pz=z*16+dz*8,ground=getSurfaceHeight(px,pz);
            const wet=currentDimension==='overworld'&&selectedTerrain!=='moon'&&ground<Math.max(SEA_LEVEL,worldFloodHeight??-Infinity);
            const biome=selectedTerrain==='random'&&currentDimension==='overworld'?biomeColumn(px,pz).biome:'';
            const tint=currentDimension==='nether'?[.38,.15,.13]:wet?[.21,.54,.64]:biome==='snow'?[.92,.96,.98]:biome==='cliffs'||selectedTerrain==='moon'?[.45,.46,.45]:selectedTerrain==='desert'||biome==='beach'?[.82,.76,.52]:[.34,.54,.21];
            const v=i*9+dz*3+dx,s=.94+.06*hash(px,pz);
            pos.setXYZ(v,px-.5,(wet?Math.max(SEA_LEVEL,worldFloodHeight??-Infinity):ground)+.45,pz-.5);
            col.setXYZ(v,tint[0]*s,tint[1]*s,tint[2]*s);
        }
        const norm=h.geometry.attributes.normal,first=i*9;
        for(let k=0;k<9;k++){
            const a=k%3,b=Math.floor(k/3),v=first+k;
            const slopeX=(pos.getY(a===2?v:v+1)-pos.getY(a===0?v:v-1))/(a===1?16:8);
            const slopeZ=(pos.getY(b===2?v:v+3)-pos.getY(b===0?v:v-3))/(b===1?16:8);
            const n=Math.hypot(slopeX,1,slopeZ);norm.setXYZ(v,-slopeX/n,1/n,-slopeZ/n);
        }
        maskTerrainHorizon(x,z,chunkMeshes.has(x+','+z));writes++;
    }
    if(writes){pos.needsUpdate=col.needsUpdate=h.geometry.attributes.normal.needsUpdate=true;}
    for(const i of h.edges){h.edges.delete(i);updateHorizonSeam(i);if(performance.now()>until)break;}
}
