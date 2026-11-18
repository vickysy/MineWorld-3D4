const BAMBOO_SEED=187, BERRY_SPROUT=188, BERRY_YOUNG=189, BERRY_RIPE=190, BERRIES=191;
const CHERRY_SAPLING=192, APPLE_SAPLING=193, CHERRY_LEAVES=194, APPLE_RIPE=195, APPLE=196;
const TRAPDOOR=197, TRAPDOOR_OPEN=198, CHERRY_YOUNG=199, APPLE_YOUNG=200, CHERRIES=201, CHERRY_RIPE=202, APPLE_LEAVES=203;
const ECOLOGY_ITEMS={187:'Bamboo Seeds',188:'Berry Sprout',189:'Berry Bush',190:'Ripe Berry Bush',191:'Sweet Berries',192:'Cherry Sapling',193:'Apple Sapling',194:'Cherry Leaves',195:'Apple Leaves (Ripe)',196:'Apple',197:'Wooden Trapdoor',198:'Open Trapdoor',199:'Young Cherry Tree',200:'Young Apple Tree',201:'Cherries',202:'Cherry Leaves (Ripe)',203:'Apple Leaves'};
const ECOLOGY_COLORS={187:0xa7bc60,188:0x528544,189:0x408a46,190:0xb9374a,191:0xcf3653,192:0xf1a3c2,193:0x6b9f49,194:0xf2a9c9,195:0x528b3f,196:0xdb4938,197:0xa17a4d,198:0xa17a4d,199:0xe99cbd,200:0x6b9f49,201:0xb62e4c,202:0xf2a9c9,203:0x528b3f};
const WHEAT_SEEDS=204,WHEAT_YOUNG=205,WHEAT_GREEN=206,WHEAT_RIPE=207,WHEAT=208;
Object.assign(ECOLOGY_ITEMS,{204:'Wheat Seeds',205:'Wheat Shoots',206:'Green Wheat',207:'Ripe Wheat',208:'Wheat'});
Object.assign(ECOLOGY_COLORS,{204:0x97a54a,205:0x74ab43,206:0x98b244,207:0xe1b547,208:0xd7a63d});
Object.assign(NATURE_ITEMS,ECOLOGY_ITEMS);
for(const id of [194,195,202,203])LEAF_TYPES.add(id);
for(const id of [187,188,189,190,191,192,193,196,199,200,201,204,205,206,207,208])NATURE_PLANTS.add(id);
const GROWING_PLANTS=new Set([187,159,158,188,189,192,193,199,200,194,203,WHEAT_YOUNG,WHEAT_GREEN]);
const PLANTABLE=new Set([187,159,158,188,191,192,193,WHEAT_SEEDS]);
const EDIBLE_GARDEN=new Set([191,196,201]);
const plantGrowth=new Map(),villageRegions=new Map();
let ecologyTick=0,plantDiscoveryTick=0,workbenchFocus=null;

function ecologyTexture(id){
    const map=natureTexture(id,id===BERRY_RIPE?0x408a46:ECOLOGY_COLORS[id]);
    const ctx=map.image.getContext('2d');ctx.globalCompositeOperation='source-over';
    if([190,195,202].includes(id))for(const [x,y] of [[12,16],[44,36],[24,48]]){
        ctx.fillStyle=id===195?'#d94436':'#b72f4e';ctx.fillRect(x,y,8,8);ctx.fillStyle='#f4b2a7';ctx.fillRect(x,y,3,3);
    }
    if(isTrapdoor(id)){
        ctx.fillStyle='#67492f';for(const y of [0,16,32,48])ctx.fillRect(0,y,64,2);
        ctx.fillStyle='#c9bc99';ctx.fillRect(4,5,5,54);ctx.fillRect(55,5,5,54);
        ctx.fillStyle='#3c3834';ctx.fillRect(28,6,8,6);
    }
    outdoorTexture(id,map);
    map.needsUpdate=true;return map;
}

function ecologyGeometry(id){
    if(!ECOLOGY_ITEMS[id]&&!NATURE_PLANTS.has(id)&&id!==42&&id!==98)return null;
    if(natureGeometries.has(id))return natureGeometries.get(id);
    if(LEAF_TYPES.has(id))return null;
    const pieces=[];
    const box=(w,h,d,x,y,z)=>{const g=new THREE.BoxGeometry(w,h,d).toNonIndexed();g.translate(x,y,z);pieces.push(g);};
    if(outdoorGeometry(id,box,pieces)){}
    else if(id===98){
        box(.99,.07,.07,0,.43,0);box(.99,.05,.05,0,-.05,0);
        for(const x of [-.45,0,.45])box(.06,.98,.06,x,-.01,0);
    }
    else if(isTrapdoor(id))box(1,id===TRAPDOOR?.15:1,id===TRAPDOOR?1:.15,0,id===TRAPDOOR?-.425:0,id===TRAPDOOR?0:-.425);
    else if(id===BAMBOO_SEED||id===WHEAT_SEEDS){for(const x of [-.13,0,.13])box(.085,.06,.12,x,-.47,0);}
    else if(id>=WHEAT_YOUNG&&id<=WHEAT){
        const ripe=id>=WHEAT_RIPE,h=ripe?.78:id===WHEAT_GREEN?.49:.2;
        for(const [x,z] of [[-.29,-.16],[-.09,.24],[.22,.18],[.29,-.25],[.03,-.1]]){
            box(.045,h,.045,x,-.5+h/2,z);
            if(ripe)box(.10,.22,.09,x,-.59+h,z);
        }
    }
    else if([188,189,190].includes(id)){
        const size=id===188?.32:id===189?.55:.65;
        box(.08,size,.08,0,-.5+size/2,0);
        for(const [x,z] of [[-.16,0],[.14,.1],[0,-.13]])box(size*.65,size*.55,size*.6,x,-.5+size*.65,z);
        if(id===190)for(const [x,z] of [[-.22,.08],[.19,.19],[.06,-.22]])box(.11,.12,.11,x,-.13,z);
    }else if([192,193,199,200].includes(id)){
        const young=id>=199,h=young?.85:.4;
        box(.08,h,.08,0,-.5+h/2,0);
        for(const [x,z] of [[-.12,0],[.13,.06],[0,-.13]])box(young?.4:.22,.14,young?.4:.22,x,-.5+h*.8,z);
    }else if(EDIBLE_GARDEN.has(id))box(.25,.25,.25,0,-.3,0);
    else if(id===42||id===160||id===161){
        for(let i=0;i<7;i++){
            const h=.22+(i*7%11)*.022,x=(i*17%13)/20-.3,z=(i*11%13)/20-.3;
            const g=new THREE.PlaneGeometry(.10,h).toNonIndexed();g.rotateY(i*2.4);g.rotateZ((i%3-1)*.22);g.translate(x,-.5+h/2,z);pieces.push(g);
        }
    }else return null;
    const out=new THREE.BufferGeometry();
    for(const name of ['position','normal','uv']){const data=[];for(const g of pieces)data.push(...g.attributes[name].array);out.setAttribute(name,new THREE.Float32BufferAttribute(data,name==='uv'?2:3));}
    pieces.forEach(g=>g.dispose());natureGeometries.set(id,out);return out;
}

function registerPlant(x,y,z,id=getBlock(x,y,z)){
    const key=`${currentDimension}|${x},${y},${z}`;
    if(GROWING_PLANTS.has(id)&&!plantGrowth.has(key))plantGrowth.set(key,{id,age:0});
}
function ecologyBlockChanged(x,y,z,oldType,type){
    if(oldType!==type)plantGrowth.delete(`${currentDimension}|${x},${y},${z}`);
    registerPlant(x,y,z,type);
    if(!isSolidType(type)&&![158,159,187].includes(type)&&getBlock(x,y+1,z)===158){
        for(let dy=1;dy<=16&&getBlock(x,y+dy,z)===158;dy++)setBlockNoRebuild(x,y+dy,z,0,rebuildQueue);
    }
}
function saveEcology(){return Array.from(plantGrowth,([key,p])=>[key,{id:p.id,age:p.age}]);}
function restoreEcology(entries=[]){
    plantGrowth.clear();workbenchFocus=null;ecologyTick=plantDiscoveryTick=0;
    for(const [key,p] of Array.isArray(entries)?entries:[]){
        if(typeof key==='string'&&/^(overworld|nether)\|-?\d+,-?\d+,-?\d+$/.test(key)&&GROWING_PLANTS.has(p?.id)&&Number.isFinite(p.age))plantGrowth.set(key,{id:p.id,age:Math.max(0,Math.min(600,p.age))});
    }
}
function plantSpace(id){return id===0||id===42||id===160||id===161||id===SNOW_LAYER_ID;}
function plantSoil(id){return id===1||id===2||id===23;}
function growOrchardTree(x,y,z,cherry){
    const cells=new Map(),put=(a,b,c,id)=>cells.set(`${a},${b},${c}`,id);
    for(let dy=0;dy<4;dy++)put(x,y+dy,z,4);
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=2;dy<=4;dy++){
        if(!canopyCell(x,z,dx,dy-3,dz)||dx===0&&dz===0&&dy<4)continue;
        put(x+dx,y+dy,z+dz,cherry?CHERRY_LEAVES:APPLE_LEAVES);
    }
    for(const key of cells.keys()){
        const p=key.split(',').map(Number),id=getBlock(...p);
        if(key!==`${x},${y},${z}`&&!plantSpace(id))return false;
        if(cellOverlapsPlayer(...p))return false;
    }
    for(const [key,id] of cells)setBlockNoRebuild(...key.split(',').map(Number),id,rebuildQueue);
    return true;
}
function growPlant(x,y,z,p){
    const id=getBlock(x,y,z),delay=id===187?15:id===159?25:id===158?30:LEAF_TYPES.has(id)?100:45;
    if(id!==p.id)return false;
    if([RICE_SHOOTS,RICE_GREEN].includes(id)&&!riceWaterNearby(x,y,z))return true;
    if(!LEAF_TYPES.has(id)&&!plantSoil(getBlock(x,y-1,z))&&!(id===158&&getBlock(x,y-1,z)===158))return false;
    if(p.age<delay)return true;
    p.age=0;
    if(id===158){
        if(getBlock(x,y+1,z)===158)return false;
        let root=y;while(root>y-16&&getBlock(x,root-1,z)===158)root--;
        if(y-root<9+Math.floor(hash(x,z)*4)&&plantSpace(getBlock(x,y+1,z))&&!cellOverlapsPlayer(x,y+1,z)){
            setBlockNoRebuild(x,y+1,z,158,rebuildQueue);return false;
        }
        // A mature clump spreads slowly, with a local cap instead of filling every cell.
        let nearby=0;for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++)if([158,159,187].includes(getBlock(x+dx,root,z+dz)))nearby++;
        if(nearby<7)for(const [dx,dz] of [[1,1],[-2,0],[0,2],[2,-1]]){
            if(plantSoil(getBlock(x+dx,root-1,z+dz))&&plantSpace(getBlock(x+dx,root,z+dz))&&!worldMap.has(`${x+dx},${root},${z+dz}`)&&!cellOverlapsPlayer(x+dx,root,z+dz)){
                setBlockNoRebuild(x+dx,root,z+dz,159,rebuildQueue);break;
            }
        }
        return true;
    }
    if(id===199||id===200)return !growOrchardTree(x,y,z,id===199);
    const next={187:159,159:158,188:189,189:190,192:199,193:200,194:202,203:195,205:206,206:207,216:217,217:218}[id];
    if(next)setBlockNoRebuild(x,y,z,next,rebuildQueue);
    return false;
}
function updateEcology(delta){
    if(!isGameStarted||!controls.isLocked||!thermalAuthority()||currentDimension!=='overworld')return;
    ecologyTick+=Math.min(delta,1);plantDiscoveryTick+=Math.min(delta,1);
    if(plantDiscoveryTick>=4){
        plantDiscoveryTick=0;const x=Math.round(camera.position.x),z=Math.round(camera.position.z);
        for(let dx=-12;dx<=12;dx++)for(let dz=-12;dz<=12;dz++){
            const a=x+dx,c=z+dz;let b=getSurfaceHeight(a,c)+1;
            if(chunkMeshes.has(`${Math.floor(a/16)},${Math.floor(c/16)}`)){
                for(let i=0;i<16&&getBlock(a,b+1,c)===158;i++)b++;
                registerPlant(a,b,c);
            }
        }
    }
    if(ecologyTick<1)return;const elapsed=ecologyTick;ecologyTick=0;
    for(const [key,p] of [...plantGrowth]){
        const [dim,coords]=key.split('|');if(dim!==currentDimension)continue;
        const [x,y,z]=coords.split(',').map(Number);
        if(Math.hypot(x-camera.position.x,z-camera.position.z)>64||!chunkMeshes.has(`${Math.floor(x/16)},${Math.floor(z/16)}`))continue;
        p.age+=elapsed;
        if(!growPlant(x,y,z,p)&&plantGrowth.get(key)===p)plantGrowth.delete(key);
    }
}

function isTrapdoor(id){return id===TRAPDOOR||id===TRAPDOOR_OPEN;}
function trapHasVolume(box){return ['x','y','z'].every(a=>box.max[a]-box.min[a]>1e-10);}
function trapIntersects(box,min,max){return trapHasVolume(box)&&['x','y','z'].every((a,i)=>box.min[a]<max[i]&&box.max[a]>min[i]);}
function trapBounds(x,y,z,id,size=1){
    return new THREE.Box3(new THREE.Vector3(x,y,z),new THREE.Vector3(x+size,y+size*(id===TRAPDOOR?.15:1),z+size*(id===TRAPDOOR_OPEN?.15:1)));
}
function pointInTrap(x,y,z,bx,by,bz,id){return trapBounds(bx-.5,by-.5,bz-.5,id).containsPoint(new THREE.Vector3(x,y,z));}
function trapMicroBounds(c,id){
    let root={x:c.x,y:c.y,z:c.z,mx:0,my:0,mz:0,level:0},size=1;
    const coarse=microAncestor(c,1),key=microParentKey(c.x,c.y,c.z);
    if(microPlacements.get(key)?.has(microIndex(coarse.mx,coarse.my,coarse.mz))){root=coarse;size=.05;}
    for(let level=2;level<=(c.level||1);level++){const a=microAncestor(c,level);if(fineVoxelEdits.has(detailKey(a))){root=a;size=1/microDivisions(level);}}
    const box=trapBounds(root.x-.5+root.mx*size,root.y-.5+root.my*size,root.z-.5+root.mz*size,id,size),s=microCellSize(c);
    return box.intersect(new THREE.Box3(new THREE.Vector3(c.x-.5+c.mx*s,c.y-.5+c.my*s,c.z-.5+c.mz*s),new THREE.Vector3(c.x-.5+(c.mx+1)*s,c.y-.5+(c.my+1)*s,c.z-.5+(c.mz+1)*s)));
}
function cellOverlapsPlayer(x,y,z){return boxOverlapsPlayers(new THREE.Box3(new THREE.Vector3(x-.5,y-.5,z-.5),new THREE.Vector3(x+.5,y+.5,z+.5)));}
function boxOverlapsPlayers(box){
    const hit=(x,y,z,s)=>box.intersectsBox(new THREE.Box3(new THREE.Vector3(x-.3*s,y-1.6*s,z-.3*s),new THREE.Vector3(x+.3*s,y+.2*s,z+.3*s)));
    if(hit(camera.position.x,camera.position.y,camera.position.z,playerScale))return true;
    for(const p of multiplayerRoom?.positions?.values()||[])if(p.dimension===currentDimension&&hit(p.x,p.y,p.z,p.scale||1))return true;
    return false;
}
function toggleTrapdoor(x,y,z){
    const id=getBlock(x,y,z);if(!isTrapdoor(id))return false;
    const next=id===TRAPDOOR?TRAPDOOR_OPEN:TRAPDOOR;
    if(boxOverlapsPlayers(trapBounds(x-.5,y-.5,z-.5,next))){showToast('The hatch is blocked.');return true;}
    setBlock(x,y,z,next);playSound('door');return true;
}
function harvestPlant(x,y,z){
    const id=getBlock(x,y,z),choice={190:[189,191,3],195:[203,196,1],202:[194,201,2],207:[WHEAT_YOUNG,WHEAT,2],218:[RICE_SHOOTS,RICE,2]}[id];
    if(!choice)return null;
    if(setBlock(x,y,z,choice[0])===false)return null;
    return {id:choice[1],count:choice[2]};
}
function grantHarvest(reward){if(!reward)return;playerInventory[reward.id]=(playerInventory[reward.id]||0)+reward.count;updateInventoryCounts();updateHotbarUI();playSound('pickup');}
function requestEcologyAction(action,at){
    const r=multiplayerRoom;if(!r?.worldReady||r.role!=='guest')return false;
    for(const entry of r.connections.values())sendRoomPacket(entry.conn,{type:'ecology-request',action,at,dimension:currentDimension});return true;
}
function handleEcologyClick(e){
    if(e.button===0&&EDIBLE_GARDEN.has(currentBlock)){if(consumeInventoryItem(currentBlock)){restoreHunger(2);updateInventoryCounts();playSound('eat');}return true;}
    if(e.button!==2||currentBlock===35&&!e.shiftKey)return false;
    const hit=isTinyMode()?findMicroBlockHit(camera.position,camera.getWorldDirection(new THREE.Vector3())):expansionRay();
    if(!hit)return false;
    if(!isTinyMode()&&(e.shiftKey||!isTrapdoor(hit.type))&&isTrapdoor(getBlock(hit.x,hit.y-1,hit.z))&&
        (e.shiftKey||(!HOME_ITEMS[hit.type]&&!MACHINE_ITEMS[hit.type]&&![12,13,30,31,32].includes(hit.type)))){
        const at=[hit.x,hit.y-1,hit.z];
        if(!requestEcologyAction('trapdoor',at))toggleTrapdoor(...at);
        return true;
    }
    if(hit.type===12&&!e.shiftKey){openWorkbench(hit);return true;}
    if(isTrapdoor(hit.type)&&!e.shiftKey){
        if(isTinyMode()&&!isTrapdoor(getBlock(hit.x,hit.y,hit.z))){
            const next=hit.type===TRAPDOOR?TRAPDOOR_OPEN:TRAPDOOR,box=trapMicroBounds(hit,next);
            if(!boxOverlapsPlayers(box)){setMicroPlacement(hit,next);markMicroNeighborhood(hit.x,hit.y,hit.z);updateMicroVoxelOverlay();playSound('door');}
        }else if(!requestEcologyAction('trapdoor',[hit.x,hit.y,hit.z]))toggleTrapdoor(hit.x,hit.y,hit.z);
        return true;
    }
    if([190,195,202,WHEAT_RIPE,RICE_RIPE].includes(hit.type)&&!e.shiftKey){
        if(!requestEcologyAction('harvest',[hit.x,hit.y,hit.z]))grantHarvest(harvestPlant(hit.x,hit.y,hit.z));return true;
    }
    if(!PLANTABLE.has(currentBlock))return false;
    if(isTinyMode()){showToast('Plant full-size seedlings at normal size.');return true;}
    const at=plantSpace(hit.type)||[188,189,190].includes(hit.type)?[hit.x,hit.y,hit.z]:hit.previous;
    if(!at||!plantSpace(getBlock(...at))||!plantSoil(getBlock(at[0],at[1]-1,at[2]))||currentDimension!=='overworld'){showToast('Plant on grass, dirt or sand.');return true;}
    if(currentBlock===WHEAT_SEEDS&&![1,2].includes(getBlock(at[0],at[1]-1,at[2]))){showToast('Plant wheat in dirt or grass.');return true;}
    if(currentBlock===RICE_SEEDS&&(![1,2].includes(getBlock(at[0],at[1]-1,at[2]))||!riceWaterNearby(...at))){showToast('Plant rice in soil beside water.');return true;}
    if(consumeInventoryItem(currentBlock)){setBlock(...at,currentBlock===191?188:currentBlock===WHEAT_SEEDS?WHEAT_YOUNG:currentBlock===RICE_SEEDS?RICE_SHOOTS:currentBlock);updateInventoryCounts();playSound('place');}
    return true;
}

function hasWorkbench(){
    if(isCreativeMode())return true;
    return workbenchFocus&&getBlock(...workbenchFocus)===12&&camera.position.distanceTo(new THREE.Vector3(...workbenchFocus))<=6;
}
function recipeNeedsWorkbench(recipe){return ![12,7,16,59,65,187,WHEAT_SEEDS,RICE_SEEDS].includes(recipe.out);}
function setWorkbench(at=null){
    workbenchFocus=at;
    const full=hasWorkbench();
    if(!full)for(let i=4;i<9;i++)if(craftingGrid[i]){if(!isCreativeMode())playerInventory[craftingGrid[i]]=(playerInventory[craftingGrid[i]]||0)+1;craftingGrid[i]=0;}
    document.getElementById('craft-grid').style.gridTemplateColumns=`repeat(${full?3:2}, 1fr)`;
    for(let i=0;i<9;i++)document.getElementById('craft-'+i).style.display=full||i<4?'flex':'none';
    inventoryUI.querySelector('h2').textContent=at?'Crafting Table':'Inventory & Crafting';checkRecipes();updateCraftingUI();updateInventoryCounts();
}
function openWorkbench(hit){
    setWorkbench([hit.x,hit.y,hit.z]);controls.unlock();isInventoryOpen=true;blocker.style.display='flex';
    document.getElementById('start-menu').style.display='none';document.getElementById('pause-menu').style.display='none';inventoryUI.style.display='block';
}
function initEcology(){
    recipes.push({ing:{4:6},out:TRAPDOOR,count:2},{ing:{158:1},out:187,count:3},{ing:{[WHEAT]:1},out:WHEAT_SEEDS,count:2});
    for(const id of [42,160,161]){materials[id]=new THREE.MeshLambertMaterial({color:id===161?0x4e8244:0x6c9b48,side:THREE.DoubleSide});natureGeometries.delete(id);}
    setWorkbench(null);
}

function bambooSiteClear(x,y,z,tall){
    for(let dy=1;dy<=tall;dy++)if(worldMap.has(`${x},${y+dy},${z}`)||constructionTypeAt(x,y+dy,z)!==null||![0,159,160,161].includes(getBlock(x,y+dy,z)))return false;
    return !villageAt(x,z);
}

function villageRegion(x,z){
    const rx=Math.floor(x/192),rz=Math.floor(z/192),key=`${seed}:${rx},${rz}`;
    if(villageRegions.has(key))return villageRegions.get(key);
    const a=rx*192+87,c=rz*192+87,y=Math.floor(baseLandscapeHeight(a,c));
    const climate=landscapeNoise(a/80,c/80,311);
    const region=y>SEA_LEVEL+4&&climate>.28&&climate<.8&&hash(rx+146,rz-92)<.65?{x:a,z:c,y}:null;
    if(villageRegions.size>3000)villageRegions.clear();villageRegions.set(key,region);return region;
}
function villageAt(x,z){
    const c=villageRegion(x,z);if(!c)return null;
    const d=Math.hypot(x-c.x,z-c.z),inner=wildernessVersion>=4?54:34,outer=wildernessVersion>=4?80:62;
    return d<outer?{...c,blend:1-THREE.MathUtils.smoothstep(d,inner,outer)}:null;
}
function generateVillageChunk(cx,cz){
    if(selectedTerrain!=='random'||wildernessVersion<3)return false;
    const c=villageRegion(cx*16+8,cz*16+8);if(!c)return false;
    if(wildernessVersion>=4)return generateLargeVillageChunk(cx,cz,c);
    if(Math.hypot(cx*16+8-c.x,cz*16+8-c.z)>48)return false;
    for(const dx of [-16,16])for(const dz of [-16,16]){
        const x=c.x+dx,z=c.z+dz;if(Math.floor(x/16)!==cx||Math.floor(z/16)!==cz)continue;
        const site=cottageSite(x,z,true);if(site){buildCottage(x,site.y,z,dx<0?0:1);spawnVillagerAt(x,site.y+1,z);}
    }
    for(let x=cx*16;x<(cx+1)*16;x++)for(let z=cz*16;z<(cz+1)*16;z++){
        const dx=x-c.x,dz=z-c.z;
        if(dx>=4&&dx<=12&&dz>=-4&&dz<=3){
            const y=getSurfaceHeight(x,z);
            if(worldMap.has(x+','+y+','+z)||worldMap.has(x+','+(y+1)+','+z))continue;
            if(dx===8)setGenBlock(x,y,z,24);
            else{
                const id=hash(x,z)<.55?WHEAT_RIPE:WHEAT_GREEN;
                setGenBlock(x,y,z,2);setGenBlock(x,y+1,z,id);registerPlant(x,y+1,z,id);
            }
            continue;
        }
        const road=Math.abs(dx)<=1&&Math.abs(dz)<=32||Math.abs(dx)<=24&&(Math.abs(dz+8)<=1||Math.abs(dz-24)<=1)||Math.abs(Math.abs(dx)-16)<=1&&(dz>=-12&&dz<=-8||dz>=20&&dz<=24);
        if(!road)continue;const y=getSurfaceHeight(x,z);
        if(worldMap.has(`${x},${y},${z}`))continue;
        setGenBlock(x,y,z,3);for(let dy=1;dy<=3;dy++)if(!worldMap.has(`${x},${y+dy},${z}`))setGenBlock(x,y+dy,z,0);
    }
    return true;
}
function findVariedSpawn(){
    const theme=['snow','village','beach'][Math.abs(Math.floor(seed))%3];
    for(let i=0;i<2000;i++){
        const x=Math.floor(hash(i+171,seed)*1800-900),z=Math.floor(hash(seed,i+217)*1800-900),col=biomeColumn(x,z);
        if(theme==='village'){
            const v=villageRegion(x,z);if(v&&isSolid(v.x,v.y,v.z))return {x:v.x,y:v.y+3,z:v.z,look:[v.x+16,v.y+3,v.z+16]};
        }else if(col.biome===theme&&col.height>SEA_LEVEL&&isSolid(x,col.height,z)&&!isWaterType(getBlock(x,col.height+1,z)))return {x,y:col.height+3,z,look:[x+8,col.height+2,z+8]};
    }
    return null;
}
