const SNOW_LAYER_ID=186, SNOW_LAYER_HEIGHT=.1;
const LEAF_TYPES=new Set([5,155,156,157]);
const NATURE_ITEMS={154:'Snow Block',155:'Amber Leaves',156:'Crimson Leaves',157:'Golden Leaves',158:'Bamboo',159:'Bamboo Shoot',160:'Meadow Grass',161:'Fern',162:'Ribbon Seagrass',163:'Tall Seagrass',164:'Sea Fan',165:'Red Coral',166:'Blue Coral',167:'Pink Coral',168:'Yellow Coral',169:'Purple Coral',186:'Snow Layer'};
const BRICK_COLORS=[['White',0xe3e6e4],['Light Gray',0xaeb3b5],['Gray',0x646b70],['Black',0x303438],['Red',0xb44238],['Orange',0xd47d42],['Yellow',0xe0c461],['Lime',0x97ba54],['Green',0x467d53],['Cyan',0x398e9c],['Light Blue',0x79b9d3],['Blue',0x426fa2],['Purple',0x855e9d],['Magenta',0xb75f96],['Pink',0xdf9da9],['Brown',0x89634e]];
BRICK_COLORS.forEach(([name],i)=>NATURE_ITEMS[170+i]=name+' Brick');
const WATER_PLANTS=new Set([162,163,164,165,166,167,168,169]);
const NATURE_PLANTS=new Set([158,159,160,161,...WATER_PLANTS]);
const hiddenByBase=new Map([[1,132],[2,133],[3,134]]);
const NATURE_COLORS={};
const biomeCache=new Map(),cliffCache=new Map(),natureGeometries=new Map();
let biomeCacheSeed=null,wildernessVersion=2,gameDifficulty='normal',itchTimer=0,natureTick=0,natureTime=0;
let natureFish=[],caveVisits=new Set();

function isWaterType(id){return id===24||WATER_PLANTS.has(id);}
function hostileMobsEnabled(){return !isCreativeMode()&&gameDifficulty!=='peaceful';}
function setDifficulty(value){
    gameDifficulty=value==='peaceful'?'peaceful':'normal';
    const select=document.getElementById('difficulty-select');if(select)select.value=gameDifficulty;
}

function setWildernessVersion(version){
    wildernessVersion=version===1?1:2;
    biomeCacheSeed=null;biomeCache.clear();cliffCache.clear();heightCache.clear();
}

// Interpolated samples of the world's seeded hash keep adjacent regions continuous.
function landscapeNoise(x,z,salt=0){
    const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz;
    const u=fx*fx*(3-2*fx),v=fz*fz*(3-2*fz);
    const a=hash(ix+salt,iz-salt),b=hash(ix+1+salt,iz-salt);
    const c=hash(ix+salt,iz+1-salt),d=hash(ix+1+salt,iz+1-salt);
    return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;
}

function baseLandscapeHeight(x,z){
    const continent=landscapeNoise(x/110,z/110,101),ridge=landscapeNoise(x/58,z/58,211),detail=landscapeNoise(x/22,z/22,51);
    const coast=THREE.MathUtils.smoothstep(continent,.23,.42);
    return 2+continent*13+coast*(9+Math.max(0,ridge-.46)*64)+(detail-.5)*3;
}

function cliffRegion(x,z){
    const size=wildernessVersion===1?128:96;
    const cx=Math.floor(x/size),cz=Math.floor(z/size),key=cx+','+cz;
    if(cliffCache.has(key))return cliffCache.get(key);
    const offset=wildernessVersion===1?40:36;
    const ax=cx*size+offset+Math.floor(hash(cx+812,cz)*25),az=cz*size+offset+Math.floor(hash(cx,cz+921)*25);
    const [nx,nz]=[[1,0],[0,1],[-1,0],[0,-1]][Math.floor(hash(cx+31,cz+72)*4)];
    const floor=Math.ceil(Math.max(...[-7,-3,0].map(u=>baseLandscapeHeight(ax+nx*u,az+nz*u))))+1;
    const legacy=wildernessVersion===1;
    const region=floor>SEA_LEVEL+(legacy?5:3)&&hash(cx+87,cz-31)<(legacy?.75:.94)?{x:ax,z:az,nx,nz,floor,rise:(legacy?17:27)+hash(cx-82,cz+11)*(legacy?16:23)}:null;
    cliffCache.set(key,region);return region;
}

function cliffLocal(x,z){
    if(wildernessVersion>=2){
        // Evaluate neighboring anchors too: a landform cannot stop at a region boundary.
        let best=null,nearest=null,distance=Infinity;
        const cx=Math.floor(x/96),cz=Math.floor(z/96),ground=baseLandscapeHeight(x,z);
        for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
            const c=cliffRegion((cx+dx)*96,(cz+dz)*96);if(!c)continue;
            const px=x-c.x,pz=z-c.z,u=px*c.nx+pz*c.nz,v=-px*c.nz+pz*c.nx;
            if(u< -12||u>64||Math.abs(v)>46)continue;
            const edge=(landscapeNoise(v/17,c.x,731)-.5)*8;
            const side=1-THREE.MathUtils.smoothstep(Math.abs(v),13,46);
            const front=THREE.MathUtils.smoothstep(u,edge-2,edge+7),back=1-THREE.MathUtils.smoothstep(u,20,64);
            const crown=.75+landscapeNoise(u/23,v/19,903)*.32;
            const height=ground+c.rise*side*front*back*crown;
            const candidate={...c,u,v,height,edge},d=(u-12)**2+v*v;
            if(d<distance){distance=d;nearest=candidate;}
            if(front*side*back>0&&(!best||height>best.height))best=candidate;
        }
        return best||nearest;
    }
    const c=cliffRegion(x,z);if(!c)return null;
    const dx=x-c.x,dz=z-c.z,u=dx*c.nx+dz*c.nz,v=-dx*c.nz+dz*c.nx;
    if(u< -10||u>48||Math.abs(v)>34)return null;
    return {...c,u,v};
}

function biomeColumn(x,z){
    x=Math.round(x);z=Math.round(z);
    const identity=seed+':'+wildernessVersion;
    if(biomeCacheSeed!==identity){biomeCache.clear();cliffCache.clear();biomeCacheSeed=identity;}
    const key=x+','+z;if(biomeCache.has(key))return biomeCache.get(key);
    const climate=landscapeNoise(x/80,z/80,311),wet=landscapeNoise(x/70,z/70,421);
    let height=baseLandscapeHeight(x,z);const cliff=cliffLocal(x,z);
    if(cliff&&wildernessVersion>=2){
        height=Math.max(height,cliff.height);
        if(cliff.u>=-8&&cliff.u<cliff.edge-1&&Math.abs(cliff.v)<4)height=cliff.floor-1;
    }else if(cliff){
        const {u,v,floor,rise}=cliff,edge=(landscapeNoise(v/13,cliff.x,731)-.5)*5;
        const side=1-THREE.MathUtils.smoothstep(Math.abs(v),17,32);
        const front=THREE.MathUtils.smoothstep(u,edge-1,edge+2),back=1-THREE.MathUtils.smoothstep(u,16,46);
        height=Math.max(height,floor-1+rise*side*front*back);
        // Erosion leaves a walkable approach outside the mouth, not a vertical shaft.
        if(u>=-8&&u<edge-1&&Math.abs(v)<4)height=Math.min(height,floor-1);
    }
    height=Math.floor(height);
    const rocky=cliff&&cliff.u>0&&cliff.u<40&&Math.abs(cliff.v)<32&&height>cliff.floor+4;
    const biome=height<=SEA_LEVEL?'ocean':climate<.27||height>(wildernessVersion===1?45:64)?'snow':(wildernessVersion===1?cliff&&cliff.u>0&&cliff.u<32&&Math.abs(cliff.v)<24:rocky)?'cliffs':climate>.62&&wet>.44?'bamboo':climate<.56&&wet>.35?'autumn':'meadow';
    const row={height,biome,warm:climate>.43,cliff};
    if(biomeCache.size>70000)biomeCache.clear();biomeCache.set(key,row);return row;
}

function wildernessCave(x,y,z,h){
    if(y<5||y>h)return false;
    const c=biomeColumn(x,z).cliff;if(!c)return false;
    const {u,v,floor}=c,bend=u<5?0:Math.sin((u-5)*.13)*2.3;
    const dy=y-floor,mouth=u<4,width=(mouth?3.8:2.8)+(landscapeNoise(u/8,c.x,619)-.5)*.4;
    const roof=mouth?5:4,archWidth=width-Math.max(0,dy-1)*.75;
    const tunnel=u>=-7&&u<=28&&dy>=0&&dy<roof&&Math.abs(v-bend)<archWidth;
    const chamber=((u-27)/7)**2+((v-1)/6)**2+((y-floor-2)/3.2)**2<1;
    if(wildernessVersion>=2&&u>4&&h<floor+7)return false;
    return tunnel||chamber;
}

function findCliffsideSpawn(){
    biomeColumn(0,0);
    for(let attempt=0;attempt<80;attempt++){
        const c=cliffRegion(Math.floor(Math.random()*900-450),Math.floor(Math.random()*900-450));if(!c)continue;
        const x=c.x-16*c.nx+8*c.nz,z=c.z-16*c.nz-8*c.nx,h=getSurfaceHeight(x,z);
        if(h<=SEA_LEVEL+1||!isSolid(x,h,z)||isWaterType(getBlock(x,h+1,z)))continue;
        if(Math.max(...[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dz])=>Math.abs(h-getSurfaceHeight(x+dx,z+dz))))>1)continue;
        if(getSurfaceHeight(c.x+8*c.nx,c.z+8*c.nz)<h+14)continue;
        return {x,y:h+3,z,look:[c.x+8*c.nx,c.floor+7,c.z+8*c.nz]};
    }
    return null;
}

function wildernessBlock(x,y,z,h){
    if(wildernessCave(x,y,z,h))return 0;
    const col=biomeColumn(x,z),r=hash3(x,h,z,812);
    if(y>h){
        if(y<=SEA_LEVEL){
            const patch=landscapeNoise(x/12,z/12,817);
            if(y===h+1&&h<SEA_LEVEL-1&&r<.075&&patch>.35){
                if(col.warm&&r<.023)return 165+Math.floor(hash3(x,y,z,813)*5);
                return 162+Math.floor(hash3(x,y,z,815)*3);
            }
            return 24;
        }
        if(y===h+1&&h>SEA_LEVEL+1){
            if(col.biome==='snow')return SNOW_LAYER_ID;
            if(col.biome==='bamboo'&&r<.018)return 159;
            if(col.biome!=='snow'&&col.biome!=='cliffs'&&r<.035)return r<.024?160:161;
        }
        return 0;
    }
    if(y===h)return h<=SEA_LEVEL+1?23:col.biome==='cliffs'?3:1;
    if(col.cliff&&y>=col.cliff.floor&&y<h-1)return 3;
    if(y>h-3)return h<=SEA_LEVEL+1?23:2;
    return getOreBlock(x,y,z,h)||3;
}

function growWildernessTrees(cx,cz){
    const key=`trees_${cx},${cz}`;if(worldMap.has(key))return;worldMap.set(key,true);
    // Evaluate overlapping crowns, but never overwrite a player's earlier edits.
    for(let x=cx*CHUNK_SIZE-2;x<(cx+1)*CHUNK_SIZE+2;x++)for(let z=cz*CHUNK_SIZE-2;z<(cz+1)*CHUNK_SIZE+2;z++){
        const {height:h,biome}=biomeColumn(x,z),r=hash3(x,h,z,918);
        if(h<=SEA_LEVEL+1||wildernessCave(x,h,z,h))continue;
        const put=(a,b,c,id)=>{if(!worldMap.has(`${a},${b},${c}`))setGenBlock(a,b,c,id);};
        if(biome==='bamboo'){
            const tall=4+Math.floor(hash(x,z)*4);
            if(r<.014&&landscapeNoise(x/10,z/10,229)>.48&&naturalTreeSiteClear(x,h,z,tall))for(let y=1;y<=tall;y++)put(x,h+y,z,158);
            continue;
        }
        if(!naturalTreeAnchor(x,z)||r>(biome==='autumn'?.75:biome==='snow'?.30:.18)||biome==='cliffs')continue;
        const tall=4+Math.floor(hash(x,z)*3),leaf=biome==='autumn'?155+Math.floor(hash(x+9,z)*3):5;
        if(!naturalTreeSiteClear(x,h,z,tall))continue;
        for(let y=1;y<=tall;y++)put(x,h+y,z,4);
        for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=tall-2;dy<=tall+1;dy++){
            if(Math.abs(dx)+Math.abs(dz)+Math.abs(dy-tall)>3)continue;
            put(x+dx,h+dy,z+dz,leaf);
            if(biome==='snow'&&(dy===tall+1||Math.abs(dx)+Math.abs(dz)+Math.abs(dy+1-tall)>3))put(x+dx,h+dy+1,z+dz,SNOW_LAYER_ID);
        }
    }
}

function naturalTreeSiteClear(x,y,z,tall){
    // Air recorded by a building is intentional clearance, including its entrance.
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=1;dy<=tall+2;dy++){
        const a=x+dx,b=y+dy,c=z+dz;
        if(worldMap.has(`${a},${b},${c}`)||constructionTypeAt(a,b,c)!==null)return false;
    }
    return true;
}

function removeUnsupportedSnow(x,y,z,type){
    if(isSolidType(type)||getBlock(x,y+1,z)!==SNOW_LAYER_ID)return;
    resetMicroBlock(x,y+1,z);
    worldMap.set(`${x},${y+1},${z}`,0);
    queueRoomBlockChange(x,y+1,z);
}

function naturalTreeAnchor(x,z){
    const cx=Math.floor(x/8),cz=Math.floor(z/8);
    const candidate=(a,b)=>({x:a*8+1+Math.floor(hash(a+18,b)*6),z:b*8+1+Math.floor(hash(a,b+27)*6),rank:hash(a-54,b+32)});
    const p=candidate(cx,cz);if(p.x!==x||p.z!==z)return false;
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
        if(!dx&&!dz)continue;const q=candidate(cx+dx,cz+dz);
        if(q.rank<p.rank&&Math.hypot(q.x-x,q.z-z)<5)return false;
    }
    return true;
}

function natureTexture(id,color,brick=false){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d');
    const c=new THREE.Color(color);
    for(let y=0;y<64;y+=4)for(let x=0;x<64;x+=4){
        const value=id===154||id===SNOW_LAYER_ID?.97+((x*7+y*11)%4)/100:.89+((x*7+y*11+id*13)%19)/100;
        ctx.fillStyle='#'+c.clone().multiplyScalar(value).getHexString();ctx.fillRect(x,y,4,4);
    }
    if(LEAF_TYPES.has(id)){
        // Use the original green-leaf cutout, recolored without filling its holes.
        ctx.globalCompositeOperation='destination-in';ctx.drawImage(matLeaves.map.image,0,0);
    }
    if(brick){ctx.fillStyle='#'+c.clone().multiplyScalar(.56).getHexString();
        for(let y=0;y<64;y+=16){ctx.fillRect(0,y,64,2);for(let x=(y/16%2)*16;x<64;x+=32)ctx.fillRect(x,y,2,16);}}
    const texture=new THREE.CanvasTexture(canvas);texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;return texture;
}

function natureGeometry(id){
    if(!NATURE_PLANTS.has(id)&&id!==SNOW_LAYER_ID)return null;
    if(natureGeometries.has(id))return natureGeometries.get(id);
    if(id===SNOW_LAYER_ID){
        const geo=new THREE.BoxGeometry(1,SNOW_LAYER_HEIGHT,1);geo.translate(0,-.5+SNOW_LAYER_HEIGHT/2,0);
        natureGeometries.set(id,geo);return geo;
    }
    const positions=[],normals=[],uvs=[];
    const box=(w,h,d,x,y,z)=>{
        const geo=new THREE.BoxGeometry(w,h,d).toNonIndexed();geo.translate(x,y,z);
        positions.push(...geo.attributes.position.array);normals.push(...geo.attributes.normal.array);uvs.push(...geo.attributes.uv.array);geo.dispose();
    };
    if(id===158){box(.18,1,.18,0,0,0);for(const y of [-.4,.05,.44]){box(.24,.055,.24,0,y,0);box(.5,.035,.12,.2,y+.05,0);}}
    else if(id===159){box(.32,.25,.32,0,-.375,0);box(.23,.2,.23,0,-.15,0);box(.12,.18,.12,0,.04,0);}
    else if(id>=165){for(const [x,z,h] of [[-.23,-.12,.4],[.05,.1,.7],[.27,-.15,.52]]){box(.14,h,.14,x,-.5+h/2,z);box(.28,.1,.12,x,-.51+h,z);}}
    else {for(const [x,z,k] of [[-.13,.06,.75],[.11,-.12,1],[.04,.16,.55]]){const h=(id===163?.8:.48)*k;box(.055,h,.065,x,-.5+h/2,z);if(id===161||id===164)box(.19,.04,.07,x,-.3+h/3,z);}}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    natureGeometries.set(id,geo);return geo;
}

function hiddenCraft(counts){
    const entries=Object.entries(counts).map(([id,n])=>[Number(id),n]);
    if(entries.length!==2||entries.some(([,n])=>n!==1))return null;
    const template=entries.find(([id])=>HIDDEN_BLOCKS[id]),base=entries.find(([id])=>!HIDDEN_BLOCKS[id]);
    return template&&base&&hiddenByBase.has(base[0])?{id:hiddenByBase.get(base[0]),count:1}:null;
}

function waterSurfaceMesh(cells){
    const faces=[],matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3(),position=new THREE.Vector3();
    const face=(x,y,z,rx,ry,w,h)=>{position.set(x,y,z);rotation.setFromEuler(new THREE.Euler(rx,ry,0));scale.set(w,h,1);faces.push(matrix.compose(position,rotation,scale).clone());};
    for(const {x,y,z} of cells){
        const amount=waterAmount(x,y,z),bottom=y-.5,top=bottom+amount/8;
        if(amount<8||!isWaterType(getBlock(x,y+1,z)))face(x,top,z,-Math.PI/2,0,1,1);
        for(const [dx,dz,yaw] of [[1,0,Math.PI/2],[-1,0,-Math.PI/2],[0,1,0],[0,-1,Math.PI]]){
            const neighbor=waterAmount(x+dx,y,z+dz),low=bottom+neighbor/8;
            if(low<top&&!isSolid(x+dx,y,z+dz))face(x+dx*.5,(low+top)/2,z+dz*.5,0,yaw,1,top-low);
        }
        if(!isSolid(x,y-1,z)&&!waterAmount(x,y-1,z))face(x,bottom,z,Math.PI/2,0,1,1);
    }
    const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),matWater,faces.length);
    faces.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.userData.blockIndices=new Map();mesh.instanceMatrix.needsUpdate=true;return mesh;
}

function initWilderness(){
    materials[127]??=new THREE.MeshLambertMaterial({map:materials[3].map,color:0x9f5051});
    const colors=[0xffffff,0xc98032,0xb34448,0xe1bf4c,0x71a345,0xa7974d,0x78a94c,0x427f4a,0x508f63,0x39826b,0x687fa2,0xd2584e,0x528bc0,0xd8839e,0xe4ba52,0x9a66b6];
    for(const [text,name] of Object.entries(NATURE_ITEMS)){
        const id=Number(text),color=id===SNOW_LAYER_ID?0xffffff:id>=170?BRICK_COLORS[id-170][1]:colors[id-154];
        NATURE_COLORS[id]=color;
        materials[id]=new THREE.MeshLambertMaterial({map:natureTexture(id,color,id>=170&&id<=185),...(LEAF_TYPES.has(id)?{alphaTest:.5}:{})});
        const slot=document.createElement('button');slot.className='slot nature-slot';slot.id=`inv-${id-12}`;slot.textContent=name;slot.onclick=()=>selectSlot(id-12);
        const swatch=document.createElement('img');swatch.alt='';swatch.src=materials[id].map.image.toDataURL();slot.prepend(swatch);document.getElementById('tab-build').append(slot);
    }
    const bases=[4,5,6,23,36,37,38,44,51,59,60,61,62,63,64,127,154,155,156,157,...BRICK_COLORS.map((_,i)=>170+i)];
    for(const base of bases){const id=256+base;hiddenByBase.set(base,id);HIDDEN_BLOCKS[id]={name:'Hidden '+getBlockName(base),base};}
    TERRAIN_NAMES.random='Random World';
    for(const id of ['terrain-select','pause-terrain-select']){const option=new Option('Random World','random');document.getElementById(id).prepend(option);}
    setTerrainChoice('random');
    const label=document.createElement('label');label.className='difficulty-choice';label.textContent='Difficulty ';
    const select=document.createElement('select');select.id='difficulty-select';select.append(new Option('Normal','normal'),new Option('Peaceful','peaceful'));select.onchange=()=>setDifficulty(select.value);label.append(select);document.getElementById('mode-select').parentElement.append(label);
    const style=document.createElement('style');style.textContent='.difficulty-choice{display:block;margin:10px 0;font-size:16px}.difficulty-choice select{padding:10px;background:#333;color:white;border:2px solid #739d8a;border-radius:4px;max-width:100%}.nature-slot{flex-direction:column;box-sizing:border-box;width:100px!important;height:104px!important;gap:4px;padding:5px;font-size:13px!important}.nature-slot img{width:44px;height:44px;image-rendering:pixelated}#blocker{overflow-y:auto}#start-menu{max-height:100dvh;overflow-y:auto}';document.head.append(style);
    style.textContent+='@media(max-width:600px){#start-menu{box-sizing:border-box;padding:24px 12px}#start-menu>div:first-child{margin-bottom:22px!important}#start-menu h1{font-size:32px!important;letter-spacing:0!important;overflow-wrap:anywhere}#start-menu h2{font-size:22px!important}#start-menu>div:nth-child(2){flex-wrap:wrap;gap:14px!important}#start-menu button,#start-menu select{max-width:100%}#start-menu>div:nth-child(2)>button{height:70px!important;font-size:20px!important}}';
    matWater.color.setHex(0x7abac5);matWater.opacity=.5;matWater.side=THREE.DoubleSide;
}

function clearWilderness(){
    for(const fish of natureFish)disposeModModel(fish.mesh);natureFish=[];caveVisits.clear();biomeCache.clear();cliffCache.clear();itchTimer=0;natureTick=0;
}

function fishModel(index){
    const group=new THREE.Group(),color=[0xe5aa58,0x71bcc3,0xd58577][index%3];
    addModelBox(group,.42,.23,.12,color,0,0,0);
    const tail=addModelBox(group,.16,.26,.055,color,-.27,0,0);group.userData.tail=tail;
    addModelBox(group,.12,.055,.13,0xf2e5c4,.1,.06,0);
    for(const z of [-.069,.069])addModelBox(group,.035,.04,.015,0x202a30,.17,.03,z);
    return group;
}

function updateWilderness(delta){
    if(!isGameStarted)return;natureTime+=delta;itchTimer=Math.max(0,itchTimer-delta);
    if(currentDimension!=='overworld'){if(natureFish.length)clearWilderness();return;}
    if(controls.isLocked&&!isCreativeMode()&&itchTimer===0){
        const p=camera.position,foot=p.y-getPlayerHeight(),r=getPlayerRadius()+.14;
        outer:for(let x=Math.round(p.x-r);x<=Math.round(p.x+r);x++)for(let z=Math.round(p.z-r);z<=Math.round(p.z+r);z++){
            if(getBlock(x,Math.floor(foot+.5),z)===159){itchTimer=3;showToast('Itchy bamboo shoots!');break outer;}
        }
    }
    for(let i=natureFish.length-1;i>=0;i--){
        const f=natureFish[i],p=f.mesh.position;
        if(p.distanceTo(camera.position)>48||!isWaterType(getBlock(Math.round(p.x),Math.round(p.y),Math.round(p.z)))){disposeModModel(f.mesh);natureFish.splice(i,1);continue;}
        const next=p.clone().add(new THREE.Vector3(Math.cos(f.angle),Math.sin(natureTime+f.phase)*.13,Math.sin(f.angle)).multiplyScalar(delta*.65));
        if(isWaterType(getBlock(Math.round(next.x+.3*Math.cos(f.angle)),Math.round(next.y),Math.round(next.z+.3*Math.sin(f.angle)))))p.copy(next);else f.angle+=1.7;
        f.mesh.rotation.y=-f.angle;f.mesh.userData.tail.rotation.y=Math.sin(natureTime*9+f.phase)*.4;
    }
    natureTick+=delta;if(natureTick<1)return;natureTick=0;
    if(selectedTerrain!=='random')return;
    const px=Math.round(camera.position.x),pz=Math.round(camera.position.z);
    for(let i=0;i<40&&natureFish.length<18;i++){
        const x=px+Math.floor(Math.random()*48)-24,z=pz+Math.floor(Math.random()*48)-24,h=getSurfaceHeight(x,z),y=h+1.6;
        if(y>SEA_LEVEL-1||!isWaterType(getBlock(x,Math.round(y),z))||natureFish.some(f=>Math.hypot(f.mesh.position.x-x,f.mesh.position.z-z)<3))continue;
        const mesh=fishModel(i);mesh.position.set(x,y,z);scene.add(mesh);natureFish.push({mesh,angle:hash(x,z)*Math.PI*2,phase:i});
    }
    // Cave residents stay below ground in daylight, unlike surface night spawns.
    if(!thermalAuthority()||zombies.length>=12)return;
    for(let i=0;i<16;i++){
        const x=px+Math.floor(Math.random()*32)-16,z=pz+Math.floor(Math.random()*32)-16,h=getSurfaceHeight(x,z);
        const region=biomeColumn(x,z).cliff;if(!region)continue;
        for(let y=region.floor;y<Math.min(h-2,region.floor+5);y++)if(wildernessCave(x,y,z,h)&&getBlock(x,y,z)===0&&getBlock(x,y+1,z)===0&&isSolid(x,y-1,z)){
            const key=Math.floor(x/32)+','+Math.floor(z/32);if(caveVisits.has(key))break;
            caveVisits.add(key);const mesh=createZombieModel();mesh.position.set(x,y,z);scene.add(mesh);
            zombies.push({mesh,kind:'zombie',caveResident:true,vx:0,vy:0,vz:0,onGround:true,soundTimer:8,hp:3,hurtTimer:0,dying:false,deathTimer:0,walkTime:0});return;
        }
    }
}

function remoteAppearance(p){return {held:Number.isSafeInteger(p.held)&&materials[p.held]?p.held:0,mech:p.mech&&MECH_TYPES[p.mech.id]&&['robot','vehicle'].includes(p.mech.form)?{id:p.mech.id,form:p.mech.form}:null};}
function localRoomAppearance(){return {held:currentBlock,mech:activeMech?{id:activeMech.id,form:activeMech.form}:null};}

function updateRemoteAppearance(model,p){
    const {held,mech}=remoteAppearance(p),id=mech?.id||0;
    if(model.userData.mechId!==id){
        if(model.userData.mech){const old=model.userData.mech;model.remove(old);disposeModModel(old);}
        model.userData.mechId=id;model.userData.mech=id?createMechModel(id):null;
        if(id)model.add(model.userData.mech);
        for(const child of model.children)child.visible=child===model.userData.mech||!id;
    }
    const avatar=model.userData.mech;
    if(avatar){
        // The outer group is eye-relative and scaled; mech geometry is already world-sized.
        avatar.scale.setScalar(1/p.scale);avatar.position.y=-.85;
        avatar.rotation.y=Math.PI;const t=mech.form==='vehicle'?1:0;
        for(const part of avatar.userData.parts){part.mesh.position.lerpVectors(part.robot,part.vehicle,t);part.mesh.scale.set(1,1,1).lerp(part.scale,t);if(part.hiddenRobot)part.mesh.scale.setScalar(t||.001);part.mesh.rotation.set(part.rotation.x*t,part.rotation.y*t,part.rotation.z*t);}
        avatar.userData.cannon.visible=!t;
    }
    if(model.userData.heldId!==held){
        const old=model.userData.held;if(old){old.parent.remove(old);disposeModModel(old);}
        model.userData.heldId=held;model.userData.held=null;
        if(held){
            let item;
            if(HOME_ITEMS[held])item=createFurnitureModel(held,{});
            else if(held>=67&&held<=71)item=createModItemModel(held);
            else {
                const source=materials[held],m=Array.isArray(source)?source.map(v=>v.clone()):source.clone();
                item=new THREE.Mesh((natureGeometry(held)||boxGeo).clone(),m);
            }
            item.scale.setScalar(.32);item.position.set(0,-.55,-.18);model.children[3].add(item);model.userData.held=item;
        }
    }
    model.userData.form=mech?.form||'human';
}

let nextZombieVoice=0,zombieVoiceBuffers=null,zombieVoiceLoading=null;
function loadZombieVoices(){
    if(!audioCtx)return Promise.resolve(null);
    if(!zombieVoiceLoading)zombieVoiceLoading=Promise.all(ZOMBIE_VOICE_DATA.map(data=>audioCtx.decodeAudioData(Uint8Array.from(atob(data),c=>c.charCodeAt(0)).buffer))).then(buffers=>zombieVoiceBuffers=buffers).catch(()=>{zombieVoiceLoading=null;return null;});
    return zombieVoiceLoading;
}
function playZombieVoice(type,now){
    if(!zombieVoiceBuffers){loadZombieVoices();return;}
    if(now<nextZombieVoice)return;
    const voice=audioCtx.createBufferSource();voice.buffer=zombieVoiceBuffers[Math.floor(Math.random()*zombieVoiceBuffers.length)];voice.playbackRate.value=.94+Math.random()*.08;
    const duration=Math.min(type==='zombie_hurt'?.65:2.3,voice.buffer.duration/voice.playbackRate.value),gain=audioCtx.createGain();
    const distance=Math.min(12,...zombies.filter(z=>!z.dying).map(z=>z.mesh.position.distanceTo(camera.position)));
    const volume=(type==='zombie'?.12:.16)*Math.max(.15,1-distance/16);
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(volume,now+.08);gain.gain.setValueAtTime(volume,now+Math.max(.08,duration-.2));gain.gain.linearRampToValueAtTime(0,now+duration);
    voice.connect(gain).connect(audioCtx.destination);voice.start(now);voice.stop(now+duration);nextZombieVoice=now+duration+.4;
    voice.onended=()=>{voice.disconnect();gain.disconnect();};
}
