const CITY_LIFE_ITEMS={128:'Football',129:'School Sign',130:'Market Sign',131:'Football Sign'};
Object.assign(HOME_ITEMS,CITY_LIFE_ITEMS);Object.assign(EXTRA_HOME_ITEMS,CITY_LIFE_ITEMS);
const marketStalls=new Map();
const MARKET_DEALS=[
    [{pay:4,cost:2,item:120,count:1},{pay:4,cost:2,item:122,count:1},{pay:37,cost:1,item:123,count:2}],
    [{pay:36,cost:1,item:119,count:2},{pay:4,cost:3,item:111,count:1},{pay:37,cost:1,item:113,count:1}],
    [{pay:37,cost:2,item:114,count:1},{pay:37,cost:2,item:115,count:1},{pay:36,cost:2,item:116,count:1}],
    [{pay:4,cost:2,item:124,count:1},{pay:4,cost:2,item:121,count:1},{pay:4,cost:2,item:125,count:1}]
];

function cityLifeRecipes() {
    return [{ing:{5:4,51:1},out:128,count:1},...[[129,1],[130,2],[131,3]].map(([out,n])=>({ing:{4:2,60:n,5:1},out,count:1}))];
}

function buildCityLifeModel(group,id) {
    if(id===128) {
        addModelBox(group,0.46,0.46,0.46,0xf1f3ee,0,-0.25,0);
        for(const s of [-1,1]) {
            addModelBox(group,0.2,0.2,0.012,0x26343a,0,-0.25,s*0.236);
            addModelBox(group,0.012,0.2,0.2,0x26343a,s*0.236,-0.25,0);
            addModelBox(group,0.2,0.012,0.2,0x26343a,0,-0.25+s*0.236,0);
        }
    } else {
        addModelBox(group,0.98,0.54,0.08,0x304d58,0,0,0);
        const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;
        const ctx=canvas.getContext('2d');ctx.fillStyle='#304d58';ctx.fillRect(0,0,256,128);
        ctx.fillStyle='#f8f5e9';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 36px sans-serif';
        ctx.fillText(id===129?'SCHOOL':id===130?'MARKET':'FOOTBALL',128,64);
        const texture=new THREE.CanvasTexture(canvas),face=new THREE.Mesh(new THREE.PlaneGeometry(0.94,0.47),new THREE.MeshBasicMaterial({map:texture}));
        face.position.z=0.045;group.add(face);
    }
}

function kickFootball(record) {
    const dx=record.x-camera.position.x,dz=record.z-camera.position.z;
    const step=Math.abs(dx)>Math.abs(dz)?[Math.sign(dx)||1,0]:[0,Math.sign(dz)||1];
    let end=[record.x,record.y,record.z];
    for(let i=1;i<=4;i++) {
        const x=record.x+step[0]*i,z=record.z+step[1]*i;
        if(![0,42].includes(getBlock(x,record.y,z))||!isSolid(x,record.y-1,z))break;
        end=[x,record.y,z];
    }
    if(end[0]===record.x&&end[2]===record.z)return;
    setBlock(record.x,record.y,record.z,0);setBlock(...end,128);syncFurnitureMeshes();playSound('dig');
}

function cityDistrictKind(cx,cz) {
    const x=((cx%8)+8)%8,z=((cz%8)+8)%8;
    return x===7&&z===0?'market':x===0&&z===7?'school':x===1&&z===7?'football':null;
}

function generateCityDistrict(cx,cz) {
    const kind=cityDistrictKind(cx,cz);if(!kind)return false;
    const sx=cx*CHUNK_SIZE,sz=cz*CHUNK_SIZE;
    const put=(x,y,z,id)=>setGenBlock(sx+x,y,sz+z,id);
    for(let x=0;x<16;x++)for(let z=0;z<16;z++) {
        put(x,16,z,x<3||z<3?(x===1&&z%4===0||z===1&&x%4===0?51:61):63);
        for(let y=17;y<=26;y++)put(x,y,z,0);
    }
    if(kind==='market') {
        put(8,19,3,130);
        for(let i=0;i<4;i++) {
            const x=5+(i%2)*5,z=5+Math.floor(i/2)*6;
            for(let dx=0;dx<3;dx++) {
                put(x+dx,17,z+2,82);
                for(let dz=0;dz<4;dz++)put(x+dx,20,z+dz,(dx+i)%2?51:60);
            }
            for(const dx of [0,2])for(let y=17;y<20;y++)put(x+dx,y,z,4);
            for(const [j,id] of (i===0?[120,122,123]:i===1?[119,111,113]:i===2?[114,115,116]:[124,121,125]).entries())if(j!==1)put(x+j,18,z+2,id);
            const id=`${cx},${cz}:${i}`;
            if(!marketStalls.has(id))marketStalls.set(id,{id,x:sx+x+1,y:17,z:sz+z+1,kind:i,stock:[16,16,16]});
        }
    } else if(kind==='school') {
        for(let x=5;x<=14;x++)for(let z=4;z<=14;z++)for(let y=17;y<=24;y++) {
            const edge=x===5||x===14||z===4||z===14;
            put(x,y,z,y===20||y===24?63:edge?((y%4===2||y%4===3)&&x>5&&x<14?6:51):0);
        }
        put(8,17,4,8);put(8,18,4,9);put(8,19,3,129);
        for(const floor of [0,1]) {
            const y=17+floor*4;
            for(let x=7;x<=11;x++)if(floor!==0||x!==8)put(x,y+1,4,60);
            put(8,y,6,82);put(8,y+1,6,77);put(12,y,6,88);put(12,y+1,6,80);
            for(const x of [7,10])for(const z of [9,12]) {
                put(x,y,z,82);put(x,y+1,z,91);put(x,y,z+1,79);put(x,y+1,z+1,80);
                furnitureData.set(`overworld|${sx+x},${y},${sz+z+1}`,{id:79,yaw:Math.PI});
            }
        }
        for(let y=17;y<=25;y++)put(13,y,13,7);
        put(13,24,13,7);put(9,25,9,62);
        put(8,19,15,129);
    } else {
        for(let x=4;x<=14;x++)for(let z=4;z<=14;z++) {
            const line=x===4||x===14||z===4||z===14||z===9;
            put(x,16,z,line?51:1);
        }
        for(const z of [4,14]) {
            for(const x of [8,11])for(let y=17;y<=19;y++)put(x,y,z,51);
            for(let x=8;x<=11;x++)put(x,19,z,51);
            for(let x=8;x<=11;x++)for(let y=17;y<=18;y++)put(x,y,z+(z===4?-1:1),98);
        }
        put(9,17,9,128);put(5,19,3,131);
        for(let z=6;z<=12;z+=2)put(3,17,z,83);
    }
    const sign=kind==='market'?[8,19,3,130]:kind==='school'?[8,19,3,129]:[5,19,3,131];
    furnitureData.set(`overworld|${sx+sign[0]},${sign[1]},${sz+sign[2]}`,{id:sign[3],yaw:Math.PI});
    return true;
}

function updateCityLife() {
    if(currentDimension!=='overworld'||selectedTerrain!=='city')return;
    for(let i=villagers.length-1;i>=0;i--)if(villagers[i].merchantId&&villagers[i].mesh.position.distanceTo(camera.position)>96) {disposeModModel(villagers[i].mesh);villagers.splice(i,1);}
    let count=villagers.filter(v=>v.merchantId&&!v.dying).length;
    for(const stall of marketStalls.values()) {
        if(count>=8)break;
        if(Math.hypot(stall.x-camera.position.x,stall.z-camera.position.z)>64||villagers.some(v=>v.merchantId===stall.id))continue;
        if(!isAnimalSpawnSafe(stall.x,stall.y,stall.z))continue;
        spawnVillagerAt(stall.x,stall.y,stall.z);
        const v=villagers[villagers.length-1];v.merchantId=stall.id;v.mesh.rotation.y=0;count++;
    }
}

function tryTradeWithMerchant() {
    if(currentDimension!=='overworld')return false;
    const direction=new THREE.Vector3();camera.getWorldDirection(direction);
    const candidates=villagers.filter(v=>v.merchantId&&!v.dying).sort((a,b)=>a.mesh.position.distanceToSquared(camera.position)-b.mesh.position.distanceToSquared(camera.position));
    for(const merchant of candidates) {
        const point=merchant.mesh.position.clone().add(new THREE.Vector3(0,0.8,0)),toward=point.clone().sub(camera.position);
        if(toward.length()>5||direction.dot(toward.normalize())<0.965||!hasClearLineBetween(camera.position,point))continue;
        openMarketTrade(merchant);return true;
    }
    return false;
}

function openMarketTrade(merchant) {
    const stall=marketStalls.get(merchant.merchantId);if(!stall||merchant.dying)return;
    furnitureFocus=`market:${stall.id}`;
    document.getElementById('home-panel').hidden=false;
    document.getElementById('home-title').textContent=['Bakery Stall','Homeware Stall','Toy Stall','Food Stall'][stall.kind];
    if(controls.isLocked)controls.unlock();blocker.style.display='none';
    const content=document.getElementById('home-content');content.replaceChildren();
    MARKET_DEALS[stall.kind].forEach((deal,index)=>{
        const row=document.createElement('div');row.className='home-row';
        const label=document.createElement('span');label.textContent=`${getBlockName(deal.item)} x${deal.count} | ${getBlockName(deal.pay)} x${deal.cost} | Stock: ${stall.stock[index]}`;
        const buy=document.createElement('button');buy.textContent='Trade';buy.disabled=stall.stock[index]<=0||!isCreativeMode()&&(playerInventory[deal.pay]||0)<deal.cost;
        buy.onclick=()=>{
            if(merchant.dying||!villagers.includes(merchant)||stall.stock[index]<=0||!consumeInventoryItem(deal.pay,deal.cost))return;
            stall.stock[index]--;playerInventory[deal.item]=(playerInventory[deal.item]||0)+deal.count;updateInventoryCounts();playSound('pickup');openMarketTrade(merchant);
        };
        row.append(label,buy);content.appendChild(row);
    });
}

function populateNetherEndermen() {
    if(currentDimension!=='nether')return;
    for(let i=0;i<48&&endermen.filter(m=>!m.friendly).length<3;i++) {
        const angle=i*2.399963,x=Math.round(camera.position.x+Math.cos(angle)*(10+i%12)),z=Math.round(camera.position.z+Math.sin(angle)*(10+i%12));
        const y=getSurfaceHeight(x,z)+1;
        if(safeEndermanSpot(x,y,z)&&endermen.every(m=>Math.hypot(m.mesh.position.x-x,m.mesh.position.z-z)>3))spawnEnderman(x,y,z);
    }
}

function visitCityLandmark(kind) {
    if(selectedTerrain!=='city'||currentDimension!=='overworld') {showToast('Choose City terrain first.');return false;}
    const [cx,cz,x,z]=kind==='market'?[-1,0,-7,9]:kind==='school'?[0,-1,8,-13]:[1,-1,22,-7];
    generateCityChunk(cx,cz);
    const pos=new THREE.Vector3(x,16.5+getPlayerHeight(),z);
    if(checkCollision(pos)){showToast('The entrance is blocked.');return false;}
    if(!leaveCityCar()||!standFromChair())return false;
    closeCommandPanel(false);camera.position.copy(pos);camera.lookAt(x,pos.y,z+4);velocity.set(0,0,0);updateChunks(camera.position);syncFurnitureMeshes();updateCityLife();controls.lock();return true;
}

function initCityLife() {
    materials[127]??=new THREE.MeshLambertMaterial({map:materials[3].map,color:0x9f5051});
    const slot=document.createElement('button');slot.className='slot';slot.id='inv-115';slot.textContent='Netherrack';slot.onclick=()=>selectSlot(115);document.getElementById('tab-build').appendChild(slot);
    Object.assign(COMMAND_ITEMS,{'地狱岩':127,'足球':128,'学校标牌':129,'市场标牌':130});
}
