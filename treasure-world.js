const CHEST_ID=222,GOLD_INGOT=223,SILVER_INGOT=224,IRON_INGOT=225,EMERALD=226;
const GOLD_BLOCK=227,SILVER_BLOCK=228,IRON_BLOCK=229,EMERALD_BLOCK=230,SAPPHIRE_BLOCK=231;
const GOLD_PYRAMID=232,SILVER_PYRAMID=233,SANDSTONE=234,SILVER_ORE=235,EMERALD_ORE=236;
const TREASURE_ITEMS={223:'Gold Ingot',224:'Silver Ingot',225:'Iron Ingot',226:'Emerald',227:'Gold Block',228:'Silver Block',229:'Iron Block',230:'Emerald Block',231:'Sapphire Block',232:'Gold Pyramid',233:'Silver Pyramid',234:'Sandstone',235:'Silver Ore',236:'Emerald Ore'};
const TREASURE_COLORS={223:0xe9bd41,224:0xd8dfe4,225:0xb8c1ca,226:0x36ae76,227:0xe9bd41,228:0xd8dfe4,229:0xaab6c1,230:0x26a06b,231:0x367bd3,232:0xe9bd41,233:0xd8dfe4,234:0xd4ba80,235:0x8e9399,236:0x8e9399};
Object.assign(NATURE_ITEMS,TREASURE_ITEMS);HOME_ITEMS[CHEST_ID]='Chest';
const TREASURE_COMPONENTS=new Set([GOLD_INGOT,SILVER_INGOT,IRON_INGOT,EMERALD]);
const SMELTING_RECIPES={36:IRON_INGOT,37:GOLD_INGOT,[SILVER_ORE]:SILVER_INGOT};
const TREASURE_SHAPED=new Set([GOLD_PYRAMID,SILVER_PYRAMID,...TREASURE_COMPONENTS]);
const treasureShapes=new Map(),chestPending=new Map();let chestRequestNumber=Date.now()*1000+Math.floor(Math.random()*1000);

function treasureTexture(id){
    if(id===SANDSTONE)return pixelPattern('sandstone',['#ddc693','#e1cb9b','#d8c18c'],r=>{
        r(0,15,16,1,'#c8b07c');r(1,1,14,1,'#e8d5a8');r(2,7,5,1,'#d0b984');r(10,11,4,1,'#d0b984');
    });
    const canvas=document.createElement('canvas');canvas.width=canvas.height=32;
    const ctx=canvas.getContext('2d'),color=new THREE.Color(TREASURE_COLORS[id]);
    ctx.fillStyle='#'+color.getHexString();ctx.fillRect(0,0,32,32);
    ctx.fillStyle='#'+color.clone().multiplyScalar(.65).getHexString();ctx.fillRect(0,0,32,2);ctx.fillRect(0,0,2,32);ctx.fillRect(30,0,2,32);ctx.fillRect(0,30,32,2);
    ctx.fillStyle='#'+color.clone().lerp(new THREE.Color(0xffffff),.4).getHexString();ctx.fillRect(2,2,28,2);ctx.fillRect(2,4,2,24);
    ctx.fillStyle='#'+color.clone().multiplyScalar(.85).getHexString();ctx.fillRect(4,28,26,2);ctx.fillRect(28,4,2,24);
    if(id===SANDSTONE){for(const y of [10,21])ctx.fillRect(2,y,28,1);ctx.fillRect(16,2,1,8);ctx.fillRect(9,11,1,10);}
    if(id===SILVER_ORE||id===EMERALD_ORE){ctx.fillStyle=id===SILVER_ORE?'#dce4e9':'#3ac080';for(const [x,y] of [[5,9],[17,4],[22,20],[9,23]])ctx.fillRect(x,y,5,5);}
    const map=new THREE.CanvasTexture(canvas);map.magFilter=THREE.NearestFilter;return map;
}
function treasureGeometry(id){
    if(!TREASURE_SHAPED.has(id))return null;
    if(!treasureShapes.has(id)){
        const geo=TREASURE_COMPONENTS.has(id)?new THREE.BoxGeometry(.6,.24,.34):new THREE.ConeGeometry(Math.SQRT1_2,1,4);
        if(!TREASURE_COMPONENTS.has(id))geo.rotateY(Math.PI/4);
        treasureShapes.set(id,geo);
    }
    return treasureShapes.get(id);
}
function createChestModel(data={}){
    const model=new THREE.Group();model.userData.itemId=CHEST_ID;
    const box=(w,h,d,c,x,y,z,parent=model)=>addModelBox(parent,w,h,d,c,x,y,z);
    const width=data.joinSide?1:.98,bands=data.joinSide?[data.joinSide*-.39]:[-.39,.39];
    box(width,.64,.86,0x91623c,0,-.13,0);box(width-.03,.05,.76,0x332e27,0,.205,0);
    for(const x of bands){box(.07,.64,.88,0x353c43,x,-.13,0);box(.09,.1,.08,0xbbc4ca,x,-.33,.45);}
    for(const z of [-.44,.44])for(const y of [-.42,-.2,.05])box(.96,.018,.025,0x68462e,0,y,z);
    const lid=new THREE.Group();lid.position.set(0,.2,-.43);model.add(lid);
    box(width,.19,.88,0xb38751,0,.095,.43,lid);
    for(const x of bands)box(.07,.21,.9,0x353c43,x,.095,.43,lid);
    box(data.joinSide?.07:.14,.22,.05,0xe2c463,data.joinSide?data.joinSide*.465:0,0,.9,lid);lid.rotation.x=data.open?-.85:0;model.userData.chestLid=lid;
    return model;
}
function syncChestShape(record){
    const n=chestMembers(record).find(r=>r.key!==record.key);
    const yaw=n?(n.z!==record.z?Math.PI/2:0):record.data.yaw||0;
    const side=n?Math.sign((n.x-record.x)*Math.cos(yaw)-(n.z-record.z)*Math.sin(yaw)):0;
    const model=furnitureMeshes.get(record.key);
    if(model&&(model.userData.joinSide||0)!==side){disposeModModel(model);furnitureMeshes.delete(record.key);}
    return {...record.data,yaw,joinSide:side};
}
function setChestLids(record,open){for(const r of chestMembers(record)){const lid=furnitureMeshes.get(r.key)?.userData.chestLid;if(lid)lid.rotation.x=open?-.85:0;}}
function chestNeighbors(x,y,z){return [[-1,0],[1,0],[0,-1],[0,1]].map(([a,b])=>furnitureRecord(x+a,y,z+b)).filter(r=>r?.id===CHEST_ID);}
function chestMembers(record){
    if(!record||record.id!==CHEST_ID)return [];
    const neighbors=chestNeighbors(record.x,record.y,record.z);
    return (neighbors.length===1&&chestNeighbors(neighbors[0].x,record.y,neighbors[0].z).length===1?[record,neighbors[0]]:[record]).sort((a,b)=>a.x-b.x||a.z-b.z);
}
function canPlaceChest(x,y,z){
    const n=chestNeighbors(x,y,z);
    if(n.length>1||n.some(r=>chestNeighbors(r.x,r.y,r.z).length)){showToast('A large chest uses two chests. Leave a gap before the next pair.');return false;}
    return true;
}
function chestSlots(data){
    if(!Array.isArray(data.chestSlots))data.chestSlots=Array(32).fill(null);
    data.chestSlots=Array.from({length:32},(_,i)=>{
        const s=data.chestSlots[i];return s&&Number.isSafeInteger(s.id)&&getBlockName(s.id)&&Number.isInteger(s.count)&&s.count>0?{id:s.id,count:Math.min(64,s.count)}:null;
    });return data.chestSlots;
}
function chestChanged(record){queueRoomBlockChange(record.x,record.y,record.z);if(furnitureFocus)refreshChestPanel();}
function chestTransfer(record,index,action,id,count){
    if(!record||record.id!==CHEST_ID||!Number.isSafeInteger(id)||!Number.isInteger(index)||index<0||index>=32||!Number.isInteger(count)||count<1||count>64)return 0;
    const slots=chestSlots(record.data),slot=slots[index];let moved=0;
    if(action==='take'&&slot?.id===id){moved=Math.min(count,slot.count);slot.count-=moved;if(!slot.count)slots[index]=null;}
    if(action==='store'&&getBlockName(id)&&(!slot||slot.id===id)){
        moved=Math.min(count,64-(slot?.count||0));if(moved)slots[index]={id,count:(slot?.count||0)+moved};
    }
    if(moved)chestChanged(record);return moved;
}
function requestChestTransfer(record,index,action,id,count){
    if(!Number.isInteger(count)||count<1||count>64||!getBlockName(id))return;
    if(action==='store'&&!isCreativeMode())count=Math.min(count,playerInventory[id]||0);
    if(!count)return;
    if(multiplayerRoom?.role==='guest'){
        if(!multiplayerRoom.lockAuthenticated){showToast('Waiting for room identity verification.');return;}
        if(chestPending.size){showToast('Waiting for chest transfer. Rejoin the original room after a disconnect.');return;}
        const request=++chestRequestNumber,paid=action==='store'&&!isCreativeMode()?count:0;
        if(paid)playerInventory[id]-=paid;
        const packet={type:'chest-request',request,dimension:currentDimension,at:[record.x,record.y,record.z],index,action,id,count};
        chestPending.set(request,{id,count,paid,action,packet,seed,sentRoom:multiplayerRoom});
        for(const entry of multiplayerRoom.connections.values())sendRoomPacket(entry.conn,packet);
    }else{
        const moved=chestTransfer(record,index,action,id,count);
        if(action==='take')playerInventory[id]=(playerInventory[id]||0)+moved;
        else if(!isCreativeMode())playerInventory[id]-=moved;
    }
    updateHotbarUI();refreshChestPanel();
}
function receiveChestReply(p){
    const pending=chestPending.get(p.request);if(!pending)return;
    chestPending.delete(p.request);
    const moved=Number.isInteger(p.moved)?Math.max(0,Math.min(pending.count,p.moved)):0;
    if(pending.action==='take')playerInventory[pending.id]=(playerInventory[pending.id]||0)+moved;
    else if(pending.paid)playerInventory[pending.id]=(playerInventory[pending.id]||0)+pending.paid-moved;
    updateHotbarUI();refreshChestPanel();
}
function receiveChestRequest(r,entry,p){
    if(!Number.isSafeInteger(p.request)||!validMachineCell(p.at)||!entry.owner)return;
    entry.chestReplies??=new Map();if(entry.chestReplies.has(p.request)){sendRoomPacket(entry.conn,entry.chestReplies.get(p.request));return;}
    const record=p.dimension===currentDimension?furnitureRecord(...p.at):null;
    const receiptKey=entry.owner+':'+p.request,receipt=record?.id===CHEST_ID?record.data.chestReceipts?.[receiptKey]:undefined;
    if(Number.isInteger(receipt)){sendRoomPacket(entry.conn,{type:'chest-reply',request:p.request,moved:receipt});return;}
    const player=r.positions.get(entry.conn.peer);let moved=0;
    if(Number.isSafeInteger(p.request)&&p.dimension===currentDimension&&validMachineCell(p.at)&&player?.dimension===currentDimension&&
        Math.hypot(player.x-p.at[0],player.y-p.at[1],player.z-p.at[2])<=7&&canEditPasswordCircuit(...p.at,entry.owner)){
        if(getBlock(...p.at)!==CHEST_ID)generateRuinsNearChunk(Math.floor(p.at[0]/16),Math.floor(p.at[2]/16));
        moved=chestTransfer(furnitureRecord(...p.at),p.index,p.action,p.id,p.count);
    }
    const target=p.dimension===currentDimension?furnitureRecord(...p.at):null;
    if(target?.id===CHEST_ID){
        target.data.chestReceipts??={};target.data.chestReceipts[receiptKey]=moved;
        const keys=Object.keys(target.data.chestReceipts);if(keys.length>128)delete target.data.chestReceipts[keys[0]];
        queueRoomBlockChange(...p.at);
    }
    const reply={type:'chest-reply',request:p.request,moved};entry.chestReplies.set(p.request,reply);
    if(entry.chestReplies.size>128)entry.chestReplies.delete(entry.chestReplies.keys().next().value);
    sendRoomPacket(entry.conn,reply);
}
function closeChestTransfer(){
    if(chestPending.size)showToast('Chest transfer paused. Rejoin the same world to finish.');
}
function retryChestTransfers(r){
    if(r.role!=='guest'||!r.lockAuthenticated)return;
    for(const pending of chestPending.values())if(pending.seed===seed&&pending.sentRoom!==r){
        pending.sentRoom=r;for(const entry of r.connections.values())sendRoomPacket(entry.conn,pending.packet);
    }
}
function refreshChestPanel(){
    if(!furnitureFocus?.startsWith(currentDimension+'|'))return;
    const record=furnitureFocus&&furnitureRecord(...furnitureFocus.split('|')[1].split(',').map(Number));
    if(record?.id===CHEST_ID&&!document.getElementById('home-panel').hidden)renderChestPanel(record);
}
function renderChestPanel(record){
    const members=chestMembers(record),content=document.getElementById('home-content');content.replaceChildren();
    document.getElementById('home-title').textContent=members.length===2?'Large Chest - 64 slots':'Chest - 32 slots';
    const toolbar=document.createElement('div');toolbar.className='chest-toolbar';
    const select=document.createElement('select');select.id='chest-item';select.setAttribute('aria-label','Stored item');
    const available=isCreativeMode()?Object.values(getInventorySlotMapping()):Object.keys(playerInventory).map(Number).filter(id=>playerInventory[id]>0);
    for(const id of [...new Set(available)].filter(id=>getBlockName(id)).sort((a,b)=>getBlockName(a).localeCompare(getBlockName(b))))select.add(new Option(getBlockName(id),id));
    if(available.includes(currentBlock))select.value=String(currentBlock);
    const qty=document.createElement('input');qty.id='chest-amount';qty.type='number';qty.min=1;qty.max=64;qty.value=64;qty.setAttribute('aria-label','Transfer amount');
    const store=document.createElement('button');store.textContent='Store';store.disabled=chestPending.size>0||!available.length;
    store.onclick=()=>{
        const id=Number(select.value),count=Number(qty.value);if(!Number.isInteger(count)||count<1||count>64)return;
        for(const member of members){const slots=chestSlots(member.data);let index=slots.findIndex(s=>s?.id===id&&s.count<64);if(index<0)index=slots.findIndex(s=>!s);
            if(index>=0){requestChestTransfer(member,index,'store',id,count);return;}}
        showToast('Chest is full.');
    };toolbar.append(select,qty,store);content.append(toolbar);
    const grid=document.createElement('div');grid.className='chest-grid';content.append(grid);
    for(const member of members)chestSlots(member.data).forEach((slot,i)=>{
        const cell=document.createElement('button');cell.className='chest-cell';cell.disabled=!slot||chestPending.size>0;
        cell.setAttribute('aria-label',slot?`Take ${getBlockName(slot.id)} x${slot.count}`:'Empty chest slot');
        if(slot){appendItemIcon(cell,slot.id);const n=document.createElement('span');n.className='stack-count';n.textContent=slot.count;cell.append(n);cell.title=`${getBlockName(slot.id)} x${slot.count}`;
            cell.onclick=()=>requestChestTransfer(member,i,'take',slot.id,Number(qty.value));}
        grid.append(cell);
    });
}

function ruinCandidate(rx,rz){
    let x=rx*96+24+Math.floor(hash(rx+581,rz-19)*36),z=rz*96+24+Math.floor(hash(rx-94,rz+722)*36),kind;
    if(currentDimension==='end'){
        if(hash(rx+31,rz+9)>.68&&(rx||rz))return null;
        x=rx*96+(!rx&&!rz?19:Math.floor(hash(rx+11,rz)*18)-9);z=rz*96+(!rx&&!rz?0:Math.floor(hash(rx,rz+47)*18)-9);kind='end';
    }else if(currentDimension==='nether'){if(hash(rx+31,rz+9)>.7)return null;kind='nether';}
    else if(selectedTerrain==='desert')kind='desert';else return null;
    const heights=[],radius=kind==='desert'?12:6;for(let dx=-radius;dx<=radius;dx++)for(let dz=-radius;dz<=radius;dz++)heights.push(getSurfaceHeight(x+dx,z+dz));
    if(Math.min(...heights)===END_VOID_Y||Math.max(...heights)-Math.min(...heights)>10)return null;
    const y=Math.max(kind==='desert'?SEA_LEVEL+1:kind==='nether'?7:-Infinity,...heights);
    return {x,y,z,kind,rx,rz};
}
function ruinLoot(site){
    const base=site.kind==='end'?[[EMERALD,5],[38,7],[GOLD_INGOT,9],[33,1]]:site.kind==='nether'?[[IRON_INGOT,8],[GOLD_INGOT,7],[28,12],[34,1]]:[[SILVER_INGOT,9],[GOLD_INGOT,4],[EMERALD,3],[STRING_ITEM,5]];
    return base.map(([id,n],i)=>({id,count:Math.min(64,n+Math.floor(hash(site.x+i,site.z-891)*3))}));
}
function generateRuin(site){
    if(site.kind==='desert')return generateDesertTemple(site);
    const {x,y,z,kind,rx,rz}=site,key=`ruin_${rx},${rz}`;if(worldMap.has(key))return false;
    worldMap.set(key,true);
    for(let dx=-6;dx<=6;dx++)for(let dz=-6;dz<=6;dz++){
        const h=getSurfaceHeight(x+dx,z+dz);
        for(let dy=Math.min(h,y);dy<=y+9;dy++)if(worldMap.has(`${x+dx},${dy},${z+dz}`)||constructionTypeAt(x+dx,dy,z+dz)!==null||isCraterVoid(x+dx,dy,z+dz))return false;
    }
    const stone=kind==='end'?END_STONE_ID:kind==='desert'?SANDSTONE:BLACKSTONE_ID;
    const put=(a,b,c,id)=>setGenBlock(x+a,y+b,z+c,id);
    for(let dx=-6;dx<=6;dx++)for(let dz=-6;dz<=6;dz++){
        const h=getSurfaceHeight(x+dx,z+dz);
        for(let dy=h;dy<=y;dy++)setGenBlock(x+dx,dy,z+dz,stone);
        for(let dy=1;dy<=9;dy++)put(dx,dy,dz,0);
    }
    if(kind==='desert'){
        for(let dy=1;dy<=6;dy++){const r=7-dy;for(let a=-r;a<=r;a++)for(let b=-r;b<=r;b++)if(Math.abs(a)===r||Math.abs(b)===r)put(a,dy,b,stone);}
        put(0,7,0,GOLD_PYRAMID);
        for(let a=-1;a<=1;a++)for(let b=0;b<=6;b++)for(let dy=1;dy<=3;dy++)put(a,dy,b,0);
        for(const a of [-4,4]){for(let dy=1;dy<=4;dy++)put(a,dy,5,stone);put(a,5,5,185);}
    }else{
        for(const a of [-5,5])for(const b of [-5,0,5]){
            const h=3+Math.floor(hash(x+a,z+b)*5);for(let dy=1;dy<=h;dy++)put(a,dy,b,stone);put(a,h,b,kind==='end'?SANDSTONE:127);
        }
        for(let a=-5;a<=5;a++)for(let b=-5;b<=5;b++){
            if((Math.abs(a)===5||b===-5)&&hash(x+a,z+b)<.75)for(let dy=1;dy<=2;dy++)put(a,dy,b,stone);
            if(kind==='nether'&&(a<=-1||b<=-2)&&hash(x+a,z+b)>.12)put(a,4,b,stone);
        }
        if(kind==='nether')for(let i=0;i<4;i++)for(let a=2;a<=3;a++)for(let dy=1;dy<=i+1;dy++)put(a,dy,3-i,stone);
        if(kind==='end'){
            for(const a of [-5,5])for(let dy=1;dy<=7;dy++)put(a,dy,-5,stone);
            for(let a=-5;a<=5;a++)if(a<0||a>1)put(a,7,-5,stone);
            for(const a of [-3,3]){put(a,1,-3,stone);put(a,2,-3,SILVER_PYRAMID);}
        }
    }
    for(let step=1;step<=8;step++){
        const dz=6+step,top=y-step;
        for(let dx=-1;dx<=1;dx++){
            const h=getSurfaceHeight(x+dx,z+dz);if(h>=top||h===END_VOID_Y)continue;
            let clear=true;for(let dy=h;dy<=top+2;dy++)if(worldMap.has(`${x+dx},${dy},${z+dz}`)||constructionTypeAt(x+dx,dy,z+dz)!==null)clear=false;
            if(clear)for(let dy=h;dy<=top;dy++)setGenBlock(x+dx,dy,z+dz,stone);
        }
    }
    put(0,1,-2,CHEST_ID);const record=furnitureRecord(x,y+1,z-2);record.data.chestSlots=Array(32).fill(null);
    ruinLoot(site).forEach((s,i)=>record.data.chestSlots[i*3]=s);
    put(-2,1,-3,62);put(2,1,-3,62);
    for(let cx=Math.floor((x-6)/16);cx<=Math.floor((x+6)/16);cx++)for(let cz=Math.floor((z-6)/16);cz<=Math.floor((z+14)/16);cz++)if(chunkMeshes.has(`${cx},${cz}`))rebuildQueue.add(`${cx},${cz}`);
    return true;
}
function generateRuinsNearChunk(cx,cz){
    const rx=Math.floor(cx*16/96),rz=Math.floor(cz*16/96);
    for(let a=rx-1;a<=rx+1;a++)for(let b=rz-1;b<=rz+1;b++){
        if(worldMap.has(`ruin_${a},${b}`))continue;
        const site=ruinCandidate(a,b),r=site?.kind==='desert'?12:6;if(site&&site.x+r>=cx*16&&site.x-r<cx*16+16&&site.z+r>=cz*16&&site.z-r<cz*16+16)generateRuin(site);
    }
}
function initTreasureWorld(){
    recipes.push({ing:{4:8},out:CHEST_ID,count:1},{ing:{4:2,3:3},out:34,count:1});
    recipes.push({ing:{[IRON_INGOT]:3,4:1},out:33,count:1},{ing:{[IRON_INGOT]:3,4:2},out:34,count:1},
        {ing:{[IRON_INGOT]:4,28:2,4:1},out:35,count:1},{ing:{[IRON_INGOT]:2,28:1,6:1},out:41,count:1},
        {ing:{23:4},out:SANDSTONE,count:4},{ing:{[GOLD_BLOCK]:2},out:GOLD_PYRAMID,count:2},{ing:{[SILVER_BLOCK]:2},out:SILVER_PYRAMID,count:2});
    for(const [ingot,block] of [[GOLD_INGOT,GOLD_BLOCK],[SILVER_INGOT,SILVER_BLOCK],[IRON_INGOT,IRON_BLOCK],[EMERALD,EMERALD_BLOCK],[38,SAPPHIRE_BLOCK]]){
        recipes.push({ing:{[ingot]:9},out:block,count:1},{ing:{[block]:1},out:ingot,count:9});
    }
    Object.assign(COMMAND_ITEMS,{'箱子':CHEST_ID,'宝箱':CHEST_ID,'金块':GOLD_BLOCK,'银块':SILVER_BLOCK,'铁块':IRON_BLOCK,'金锭':GOLD_INGOT,'银锭':SILVER_INGOT,'铁锭':IRON_INGOT,'铁矿':36,'铁矿石':36,'金矿石':37,'银矿石':SILVER_ORE,'镐子':34,'绿宝石':EMERALD,'绿宝石块':EMERALD_BLOCK,'蓝宝石块':SAPPHIRE_BLOCK,'金锥':GOLD_PYRAMID,'银锥':SILVER_PYRAMID});
    const preview=new THREE.WebGLRenderer({alpha:true,antialias:true});preview.setSize(96,96);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.01,10);camera.position.set(1.8,1.4,2.6);camera.lookAt(0,0,0);
    scene.add(new THREE.AmbientLight(0xffffff,.7));const light=new THREE.DirectionalLight(0xffffff,.8);light.position.set(-2,4,3);scene.add(light);
    const cube=new THREE.BoxGeometry(1,1,1);
    for(const id of Object.keys(TREASURE_ITEMS).map(Number)){
        const mesh=new THREE.Mesh(treasureGeometry(id)||cube,materials[id]);scene.add(mesh);preview.render(scene,camera);
        document.querySelector(`#inv-${id-12} img`).src=preview.domElement.toDataURL();scene.remove(mesh);
    }
    cube.dispose();preview.dispose();
}
function furnaceInReach(at){return Array.isArray(at)&&at.length===3&&getBlock(...at)===13&&camera.position.distanceTo(new THREE.Vector3(...at))<=6;}
function furnaceHasHeat(at){return [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].some(d=>getBlock(at[0]+d[0],at[1]+d[1],at[2]+d[2])===16);}
function nearbyFurnace(){
    const p=camera.position;let best=null,distance=36;
    for(let x=Math.round(p.x)-5;x<=Math.round(p.x)+5;x++)for(let y=Math.round(p.y)-5;y<=Math.round(p.y)+4;y++)for(let z=Math.round(p.z)-5;z<=Math.round(p.z)+5;z++){
        const d=(x-p.x)**2+(y-p.y)**2+(z-p.z)**2;if(d<=distance&&getBlock(x,y,z)===13){best=[x,y,z];distance=d;}
    }return best;
}
function smeltOreAt(at,ore,quantity=1){
    const ingot=SMELTING_RECIPES[ore];
    if(!ingot||!furnaceInReach(at)||!furnaceHasHeat(at)||!Number.isSafeInteger(quantity)||quantity<1)return 0;
    const count=Math.min(64,quantity,isCreativeMode()?64:playerInventory[ore]||0);if(!count||!consumeInventoryItem(ore,count))return 0;
    playerInventory[ingot]=(playerInventory[ingot]||0)+count;updateHotbarUI();updateInventoryCounts();playSound('stone');showToast(getBlockName(ingot)+' +'+count);return count;
}
function addFurnaceTorch(at){
    if(!furnaceInReach(at)||!hasInventoryItem(16))return false;
    for(const d of [[0,1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]){
        const p=at.map((v,i)=>v+d[i]);if(getBlock(...p)!==0||!isSolid(p[0],p[1]-1,p[2]))continue;
        const radius=getPlayerRadius();if(Math.abs(p[0]-camera.position.x)<.5+radius&&Math.abs(p[2]-camera.position.z)<.5+radius&&p[1]+.5>camera.position.y-getPlayerHeight()&&p[1]-.5<camera.position.y+.15*playerScale)continue;
        if(setBlock(...p,16)===false)return false;consumeInventoryItem(16);updateHotbarUI();updateInventoryCounts();return true;
    }return false;
}
function appendSmeltingRecipe(parent,ore){
    const row=document.createElement('div');row.className='recipe-row';const name=document.createElement('span');
    name.textContent=getBlockName(ore)+' x1 -> '+getBlockName(SMELTING_RECIPES[ore])+' x1';row.append(name);
    const open=document.createElement('button'),at=nearbyFurnace();open.textContent='Furnace';open.disabled=!at;open.title=at?'Open Furnace':'Furnace required nearby';open.onclick=()=>openFurnacePanel(at);row.append(open);parent.append(row);
    const heat=document.createElement('div');heat.className='recipe-row';heat.textContent='Furnace + Torch';parent.append(heat);
}
function openFurnacePanel(at){
    if(!furnaceInReach(at))return;
    stopSurveillance();furnitureFocus=null;isInventoryOpen=false;inventoryUI.style.display='none';
    const dimension=currentDimension,valid=()=>currentDimension===dimension&&furnaceInReach(at),content=document.getElementById('home-content');content.replaceChildren();
    document.getElementById('home-panel').hidden=false;document.getElementById('home-title').textContent='Furnace';
    if(controls.isLocked)controls.unlock();blocker.style.display='none';
    const button=(label,callback,parent,disabled=false)=>{const b=document.createElement('button');b.textContent=label;b.disabled=disabled;b.onclick=()=>{if(!valid()){closeFurniturePanel(false);showToast('Furnace is no longer available.');return;}callback();openFurnacePanel(at);};parent.append(b);return b;};
    const fuel=document.createElement('div');fuel.className='furnace-fuel';content.append(fuel);
    const status=document.createElement('strong');status.textContent=furnaceHasHeat(at)?'Heat: Ready':'Heat: Torch Required';fuel.append(status);
    button('Add Torch',()=>{if(!addFurnaceTorch(at))showToast('No free space for a torch.');},fuel,furnaceHasHeat(at)||!hasInventoryItem(16));
    const craft=document.createElement('div');craft.className='furnace-fuel';content.append(craft);
    const recipe=document.createElement('span');recipe.textContent='Wood x3 -> Torch x10';craft.append(recipe);
    button('Craft Torches',()=>{if(!consumeInventoryItem(4,3))return;playerInventory[16]=(playerInventory[16]||0)+10;updateHotbarUI();updateInventoryCounts();},craft,!isCreativeMode()&&(playerInventory[4]||0)<3);
    for(const [text,ingot] of Object.entries(SMELTING_RECIPES)){
        const ore=Number(text),count=isCreativeMode()?64:playerInventory[ore]||0,row=document.createElement('div');row.className='furnace-recipe';content.append(row);
        const summary=document.createElement('div');summary.className='furnace-materials';row.append(summary);
        for(const [id,n] of [[ore,count],[ingot,playerInventory[ingot]||0]]){
            if(summary.childNodes.length)summary.append(document.createTextNode(' -> '));
            const item=document.createElement('span');appendItemIcon(item,id);item.append(document.createTextNode(getBlockName(id)+' x'+n));summary.append(item);
        }
        const actions=document.createElement('div');actions.className='furnace-actions';row.append(actions);
        button('Smelt 1',()=>smeltOreAt(at,ore),actions,!count||!furnaceHasHeat(at)).setAttribute('aria-label','Smelt one '+getBlockName(ingot));
        button('Smelt All',()=>smeltOreAt(at,ore,count),actions,!count||!furnaceHasHeat(at)).setAttribute('aria-label','Smelt all '+getBlockName(ingot));
    }
}
function handleTreasureClick(e){
    if(e.button!==2)return false;
    const hit=expansionRay();if(!hit)return false;
    if(hit.type===CHEST_ID&&currentBlock===CHEST_ID){if(hit.previous)placeFurniture(CHEST_ID,...hit.previous);return true;}
    if(hit.type===13&&!e.shiftKey&&!isTinyMode()&&currentBlock!==13&&currentBlock!==39){
        const at=[hit.x,hit.y,hit.z];
        if(SMELTING_RECIPES[currentBlock]&&furnaceHasHeat(at)&&hasInventoryItem(currentBlock))smeltOreAt(at,currentBlock);
        else openFurnacePanel(at);
        return true;
    }
    if(TREASURE_COMPONENTS.has(currentBlock)&&!HOME_ITEMS[hit.type]&&hit.type!==12){showToast('Use this material for crafting.');return true;}
    return false;
}
