const KITCHEN_ITEMS={104:'Fire Hydrant',105:'Microwave',106:'Stove',107:'Cooking Pot',108:'Bowl',109:'Frying Pan',110:'Ladle',111:'Cup Rack',112:'Shower Glass',113:'Flower Vase',114:'Prime Figurine',115:'Buzz Figurine',116:'Model Car',117:'Doll',118:'Dining Table',119:'Plate',120:'Doughnut',121:'Crab Cake',122:'Ice Cream',123:'Layer Cake',124:'Pizza',125:'Fruit Bowl',126:'Large Sofa'};
const KITCHEN_FOOD={120:true,121:true,122:true,123:true,124:true,125:true};
const SHOWER_ID=135, SHOWER_DOOR_ID=136, BOOKSHELF_ID=137;
Object.assign(KITCHEN_ITEMS,{135:'Shower',136:'Glass Shower Door',137:'Bookshelf'});
Object.assign(EXTRA_HOME_ITEMS,KITCHEN_ITEMS);Object.assign(HOME_ITEMS,KITCHEN_ITEMS);

function kitchenRecipes() {
    const combinations=[];
    for(let iron=1;iron<=5;iron++)for(let wood=0;wood<=6-iron;wood++)combinations.push({51:2,6:1,36:iron,...(wood?{4:wood}:{})});
    let decor=0;
    const bathroomRecipes={135:{36:3,65:1},136:{6:4,36:1},137:{4:3,91:2}};
    return Object.keys(KITCHEN_ITEMS).map(id=>({ing:bathroomRecipes[id]||(KITCHEN_FOOD[id]?{40:1,5:Number(id)-119}:combinations[decor++]),out:Number(id),count:1}));
}

function kitchenParts(id) {
    if(id===93||id===126)return [[1,0,0]];
    if(id===118)return [[1,0,0],[0,0,1],[1,0,1]];
    return [];
}

function buildKitchenModel(group,id,data) {
    const box=(w,h,d,c,x,y,z,name)=>addModelBox(group,w,h,d,c,x,y,z,name),white=0xf2f3ef,steel=0xb8c6c9,dark=0x283137;
    const bowl=(color,width=0.5,y=-0.35)=>{
        box(width,0.06,width,color,0,y-0.08,0);
        for(const s of [-1,1]){box(0.055,0.2,width,color,s*(width/2-0.02),y+0.02,0);box(width,0.2,0.055,color,0,y+0.02,s*(width/2-0.02));}
    };
    if(id===104) {
        box(0.26,0.7,0.26,0xc94538,0,-0.1,0);box(0.42,0.08,0.42,0x892b28,0,-0.45,0);box(0.36,0.12,0.36,0xd6503e,0,0.3,0);
        for(const x of [-0.23,0.23])box(0.2,0.17,0.17,0xbac3c5,x,0.04,0);
        box(0.12,0.1,0.12,steel,0,0.41,0);const stream=box(0.45,0.09,0.09,0x66bddd,0.49,0.04,0,'stream');stream.visible=!!data.on;
    } else if(id===105) {
        box(0.95,0.57,0.64,white,0,-0.19,0);box(0.69,0.4,0.025,dark,-0.09,-0.18,0.335);box(0.5,0.27,0.012,0x47606a,-0.13,-0.18,0.352);
        box(0.035,0.29,0.06,steel,0.24,-0.18,0.37);box(0.16,0.1,0.025,0x83b99b,0.37,-0.03,0.34);
        for(let y=0;y<3;y++)box(0.055,0.035,0.02,steel,0.37,-0.16-y*0.065,0.34);
    } else if(id===106) {
        box(0.94,0.9,0.89,steel,0,-0.03,0);box(0.7,0.48,0.025,dark,0,-0.1,0.46);box(0.65,0.045,0.08,white,0,0.22,0.5);
        group.userData.burners=[];
        for(const x of [-0.24,0.24])for(const z of [-0.23,0.23]) {const burner=box(0.26,0.025,0.25,dark,x,0.435,z);burner.material.emissive.setHex(data.cooking?0xc24d19:0);group.userData.burners.push(burner);}
        for(const x of [-0.3,-0.1,0.1,0.3])box(0.07,0.07,0.04,dark,x,0.34,0.48);
    } else if(id===107||id===108) {
        bowl(id===107?steel:white,id===107?0.58:0.48);
        if(id===107)for(const x of [-0.37,0.37])box(0.19,0.055,0.15,dark,x,-0.26,0);
    } else if(id===109) {
        bowl(dark,0.54,-0.4);box(0.1,0.06,0.38,dark,0,-0.37,0.42);
    } else if(id===110) {
        box(0.06,0.035,0.66,steel,0,-0.46,-0.08);box(0.22,0.06,0.23,steel,0,-0.43,0.32);box(0.14,0.012,0.14,0x728d96,0,-0.395,0.32);
    } else if(id===111) {
        box(0.85,0.06,0.45,0x9f7952,0,-0.45,0);box(0.06,0.55,0.06,steel,0,-0.16,0);box(0.75,0.035,0.05,steel,0,0.1,0);
        for(const x of [-0.28,0.28])for(const z of [-0.12,0.12]) {box(0.16,0.2,0.16,white,x,-0.05,z);box(0.09,0.025,0.09,0x728e9b,x,0.061,z);}
    } else if(id===112 || id===SHOWER_DOOR_ID) {
        const panel=new THREE.Group();group.add(panel);group.userData.glassPanel=panel;
        const glass=addModelBox(panel,0.96,1.88,0.035,0xc3e3e8,0,0.46,0);
        glass.material.transparent=true;glass.material.opacity=0.18;glass.material.depthWrite=false;
        group.userData.glassPosts=[-0.49,0.49].map(x=>box(0.025,1.98,0.055,steel,x,0.49,0));
        box(1,0.025,0.055,steel,0,1.47,0);box(1,0.025,0.055,steel,0,-0.49,0);
        if(id===SHOWER_DOOR_ID) {
            addModelBox(panel,0.035,0.32,0.055,steel,0.33,0.45,0.07);
            addModelBox(panel,0.035,0.32,0.055,steel,0.33,0.45,-0.07);
        }
    } else if(id===SHOWER_ID) {
        box(0.08,1.7,0.08,steel,0,0.36,-0.35);box(0.08,0.08,0.48,steel,0,1.18,-0.15);
        box(0.48,0.07,0.4,steel,0,1.1,0.04);box(0.4,0.025,0.32,dark,0,1.05,0.04);
        for(const x of [-0.15,0.15])box(0.09,0.09,0.12,x<0?0x7bbfd4:0xd87a71,x,0.1,-0.3);
        box(0.36,0.12,0.13,steel,0,0.1,-0.35);box(0.23,0.025,0.23,dark,0,-0.48,0.04);
        addWaterDroplets(group,'shower');
    } else if(id===BOOKSHELF_ID) {
        for(const x of [-0.46,0.46])box(0.08,1,0.85,0x9a7853,x,0,0);
        for(const y of [-0.46,0,0.46])box(0.92,0.08,0.85,0x9a7853,0,y,0);
        box(0.84,0.92,0.06,0x775638,0,0,-0.4);
        for(let row=0;row<2;row++)for(let i=0;i<6;i++) {
            const x=-0.35+i*0.14,y=-0.23+row*0.46;
            box(0.11,0.31-(i%2)*0.04,0.55,[0x568ca7,0xc45f55,0xd6b755,0x659479][i%4],x,y,0.06);
            box(0.07,0.022,0.01,white,x,y+0.05,0.34);
        }
    } else if(id===113) {
        box(0.32,0.36,0.32,0xacc9dc,0,-0.3,0);box(0.19,0.12,0.19,0xacc9dc,0,-0.06,0);
        for(const [x,y,z,c] of [[-0.16,0.32,0,0xe78da3],[0.1,0.46,0.04,0xebc55a],[0.17,0.23,-0.13,0xcda5df]]){box(0.025,y+0.08,0.025,0x4a8550,x/2,y/2-0.04,z/2);box(0.23,0.1,0.16,c,x,y,z);box(0.12,0.1,0.25,c,x,y,z);}
    } else if(id===114) {
        const figure=createMechModel(70);figure.scale.setScalar(0.21);figure.position.y=-0.47;group.add(figure);
        box(0.65,0.05,0.52,dark,0,-0.47,0);
    } else if(id===115||id===117) {
        const buzz=id===115,accent=buzz?0x79b643:0xe49b65;
        box(0.35,0.32,0.22,buzz?white:0x67a2bb,0,-0.02,0);box(0.32,0.12,0.24,accent,0,0.09,0);
        box(0.23,0.25,0.23,buzz?0x9275aa:0x715441,0,0.32,0);box(0.18,0.19,0.035,0xeac9b0,0,0.33,0.124);
        for(const x of [-0.06,0.06])box(0.025,0.025,0.018,dark,x,0.35,0.151);
        box(0.06,0.015,0.018,0x9c6654,0,0.27,0.151);
        for(const x of [-0.24,0.24]) {box(0.13,0.3,0.14,white,x,-0.03,0);box(0.14,0.09,0.15,accent,x,0.1,0);}
        for(const x of [-0.1,0.1]) {box(0.14,0.25,0.17,white,x,-0.3,0);box(0.17,0.08,0.23,accent,x,-0.44,0.02);}
        if(buzz) {
            box(0.9,0.11,0.05,white,0,0.05,-0.17);for(const x of [-0.43,0.43])box(0.12,0.12,0.06,0xbd5256,x,0.05,-0.18);
            const helmet=box(0.31,0.31,0.29,0xbadbe0,0,0.33,0.04);helmet.material.transparent=true;helmet.material.opacity=0.16;helmet.material.depthWrite=false;
            for(const [x,c] of [[-0.07,0x4b8cc4],[0,0xc54b43],[0.07,0xd7bf54]])box(0.035,0.035,0.025,c,x,0.02,0.13);
        }
    } else if(id===116) {
        const car=createCityCar(undefined,'bao5');car.scale.setScalar(0.23);car.position.y=-0.48;group.add(car);
    } else if(id===118) {
        box(1.98,0.12,1.98,0x9a7853,0.5,0.4,0.5);
        for(const x of [-0.35,1.35])for(const z of [-0.35,1.35])box(0.13,0.85,0.13,dark,x,-0.045,z);
    } else if(id===119) {
        box(0.73,0.04,0.73,white,0,-0.46,0);box(0.58,0.015,0.58,0xd0dde0,0,-0.43,0);
    } else if(KITCHEN_FOOD[id]) {
        if(id===120) {
            for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)if(x||z){box(0.18,0.16,0.18,0xc99553,x*0.16,-0.39,z*0.16);box(0.18,0.035,0.18,0xe99cae,x*0.16,-0.29,z*0.16);}
            for(const [x,z,c] of [[-.14,0,0xf5e9b4],[.16,.16,0x6fa6db],[0,-.16,0xd6dc5f]])box(0.06,0.015,0.025,c,x,-0.265,z);
        } else if(id===121) {
            box(0.52,0.16,0.4,0xd99254,0,-0.39,0);box(0.43,0.035,0.31,0xe9bb76,0,-0.29,0);
            for(const x of [-0.31,0.31]) {box(0.18,0.06,0.1,0xc46d45,x,-0.4,0.12);box(0.15,0.1,0.16,0xdb8150,x,-0.35,-0.18);}
            for(const x of [-0.13,0.13])box(0.04,0.04,0.04,dark,x,-0.25,0.18);
        } else if(id===122) {
            box(0.16,0.16,0.16,0xc79b60,0,-0.4,0);box(0.24,0.15,0.24,0xd8b47d,0,-0.25,0);box(0.35,0.23,0.35,0xf6e9ce,0,-0.08,0);box(0.27,0.17,0.27,0xe6a4bd,0,0.1,0);box(0.1,0.09,0.1,0xbb4e48,0,0.22,0);
        } else if(id===123) {
            box(0.58,0.36,0.58,0xe5c093,0,-0.3,0);box(0.6,0.06,0.6,white,0,-0.11,0);box(0.59,0.06,0.59,0xbb6e76,0,-0.3,0);
            for(const x of [-0.17,0.17])for(const z of [-0.17,0.17])box(0.1,0.08,0.1,0xd65c54,x,-0.04,z);
        } else if(id===124) {
            box(0.71,0.08,0.71,0xc78c48,0,-0.44,0);box(0.61,0.035,0.61,0xe8c561,0,-0.38,0);
            for(const [x,z] of [[-.15,-.15],[.17,-.1],[-.12,.17],[.18,.2]])box(0.12,0.025,0.12,0xbc5747,x,-0.35,z);
        } else {
            bowl(white,0.6,-0.36);for(const [x,z,c] of [[-.15,0,0xc65c4d],[.14,.1,0xe3bc47],[.07,-.13,0x8eb252]])box(0.22,0.22,0.22,c,x,-0.23,z);
        }
    } else if(id===126) {
        group.userData.sofaSections=[];
        for(let i=0;i<2;i++){const section=createFurnitureModel(83,data);section.position.x=i;group.add(section);group.userData.sofaSections.push(section);}
    }
    if(id===104)addWaterDroplets(group,'hydrant');
}

function openKitchenFurniture(record,content,button) {
    const data=record.data,id=record.id;
    if(id===105||id===106) {
        const status=document.createElement('p');status.id='cooking-status';status.textContent=data.cooking?'Cooking...':`Cooked Meat: ${data.cooked||0}`;content.appendChild(status);
        button('Cook',()=>{if(data.cooking||data.cooked>=64||!consumeInventoryItem(39))return;data.cooking=3;updateInventoryCounts();openFurniturePanel(record);});
        button('Take',()=>{if(!(data.cooked>0))return;data.cooked--;playerInventory[40]=(playerInventory[40]||0)+1;updateInventoryCounts();closeFurniturePanel(false);showCookedMeatPrompt();});
    } else if(KITCHEN_FOOD[id] || id===119&&data.foodItem) {
        button('Eat',()=>{
            if(id===119){delete data.foodItem;closeFurniturePanel(false);}else{closeFurniturePanel(false);setBlock(record.x,record.y,record.z,0);}
            health=maxHealth;hunger=maxHunger;resetFoodTimers();updateHUD();showToast('Health and hunger restored.');controls.lock();
        });
        if(id===119)button('Take',()=>{const food=data.foodItem;if(!food)return;delete data.foodItem;playerInventory[food]=(playerInventory[food]||0)+1;updateInventoryCounts();closeFurniturePanel();});
    } else if(id===SHOWER_DOOR_ID) {
        button(data.open?'Close':'Open',()=>{if(toggleShowerDoors(record))openFurniturePanel(record);});
    } else if(id===BOOKSHELF_ID) {
        openBookEditor(record,content,button);
    } else if(id===104 || id===SHOWER_ID) {
        const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=!!data.on;input.onchange=()=>data.on=input.checked;label.append(input,document.createTextNode(' Water'));content.appendChild(label);
        if(id===104)button('Fill Bucket',()=>fillHomeWaterBucket(data));
    } else {const p=document.createElement('p');p.textContent=HOME_ITEMS[id];content.appendChild(p);}
}

function updateKitchenFurniture(model,data,delta) {
    if(!model)return;
    if(data.cooking>0){data.cooking=Math.max(0,data.cooking-delta);if(data.cooking===0){data.cooked=(data.cooked||0)+1;showToast('Cooking complete.');}}
    for(const burner of model.userData.burners||[])burner.material.emissive.setHex(data.cooking?0xc24d19:0);
    if(furnitureFocus && furnitureData.get(furnitureFocus)===data) {
        const status=document.getElementById('cooking-status');
        if(status)status.textContent=data.cooking?`Cooking... ${Math.ceil(data.cooking)} s`:`Cooked Meat: ${data.cooked||0}`;
    }
    if(model.userData.itemId===119 && model.userData.foodId!==data.foodItem) {
        if(model.userData.foodMesh){const old=model.userData.foodMesh;model.remove(old);disposeModModel(old);}
        model.userData.foodId=data.foodItem;model.userData.foodMesh=null;
        if(KITCHEN_FOOD[data.foodItem]) {const food=createFurnitureModel(data.foodItem,{});food.scale.setScalar(0.7);food.position.y=-0.08;model.add(food);model.userData.foodMesh=food;}
    }
    if(model.userData.itemId===83||model.userData.itemId===126)updateSofaConnections(model,data);
}

function fillHomeWaterBucket(data) {
    if(!data.on){showToast('Turn on the water first.');return false;}
    if(!consumeInventoryItem(BUCKET_ID))return false;
    playerInventory[WATER_BUCKET_ID]=(playerInventory[WATER_BUCKET_ID]||0)+1;updateInventoryCounts();showToast('Water bucket filled.');return true;
}

function addWaterDroplets(model,kind) {
    const water=new THREE.Group();water.visible=false;model.add(water);model.userData.waterDrops=water;water.userData.kind=kind;
    const count=kind==='shower'?24:kind==='hydrant'?18:10;
    for(let i=0;i<count;i++) {
        const drop=addModelBox(water,0.024,kind==='shower'?0.065:0.025,0.024,0x9ad9ef,0,0,0);
        drop.material.transparent=true;drop.material.opacity=0.6;drop.material.depthWrite=false;
    }
}

function updateWaterDroplets(model,data,delta) {
    const water=model.userData.waterDrops;if(!water)return;
    water.visible=!!data.on;if(!data.on)return;
    water.userData.time=(water.userData.time||0)+delta;
    water.children.forEach((drop,i)=>{
        const t=(water.userData.time*1.7+i/water.children.length)%1;
        if(water.userData.kind==='shower')drop.position.set(((i%4)-1.5)*0.09,1.03-t*1.5,Math.floor(i%12/4)*0.1-0.06);
        else if(water.userData.kind==='hydrant')drop.position.set(0.33+t*0.85,0.04-0.48*t*t,Math.sin(i*2.4)*t*0.1);
        else drop.position.set(Math.sin(i*2.4)*t*0.025,0.6-t*0.19,-0.03+Math.cos(i*2.4)*t*0.025);
    });
}

function isPassableHomeCell(x,y,z,type=getBlock(x,y,z)) {
    if(type===SHOWER_ID || type===FRIDGE_TOP_ID&&getBlock(x,y-1,z)===SHOWER_ID)return true;
    if(type===FRIDGE_TOP_ID && getBlock(x,y-1,z)===SHOWER_DOOR_ID)y--;
    else if(type!==SHOWER_DOOR_ID)return false;
    return !!furnitureData.get(`${currentDimension}|${x},${y},${z}`)?.open;
}

function showerNeighbors(record,doorsOnly=false) {
    const yaw=record.data.yaw||0,dx=Math.round(Math.cos(yaw)),dz=-Math.round(Math.sin(yaw));
    return [-1,1].map(side=>furnitureRecord(record.x+dx*side,record.y,record.z+dz*side))
        .map(r=>r && (doorsOnly?r.id===SHOWER_DOOR_ID:[112,SHOWER_DOOR_ID].includes(r.id)) && Math.cos((r.data.yaw||0)-yaw)>0.99?r:null);
}

function toggleShowerDoors(record) {
    const connected=new Map([[record.key,record]]),queue=[record];
    while(queue.length && connected.size<64)for(const r of showerNeighbors(queue.shift(),true))if(r&&!connected.has(r.key)){connected.set(r.key,r);queue.push(r);}
    const open=!record.data.open;
    if(!open)for(const r of connected.values()) {
        const touches=(p,radius,low,high)=>Math.abs(p.x-r.x)<0.5+radius&&Math.abs(p.z-r.z)<0.5+radius&&high>r.y-0.5&&low<r.y+1.5;
        const occupied=touches(camera.position,getPlayerRadius(),camera.position.y-getPlayerHeight(),camera.position.y+0.2*playerScale)||
            [...villagers,...zombies,...creepers,...animals,...endermen].some(m=>!m.dying&&touches(m.mesh.position,0.35,m.mesh.position.y-0.8,m.mesh.position.y+1));
        if(occupied){showToast('Doorway is occupied.');return false;}
    }
    for(const r of connected.values())r.data.open=open;
    playSound('door');return true;
}

function updateShowerGlass(model,data,delta) {
    const record={x:model.position.x,y:model.position.y,z:model.position.z,data};
    const neighbors=showerNeighbors(record);
    model.userData.glassPosts.forEach((post,i)=>post.visible=!neighbors[i]);
    if(model.userData.itemId!==SHOWER_DOOR_ID)return;
    const side=neighbors[0]?.id===SHOWER_DOOR_ID?1:-1;
    const panel=model.userData.glassPanel;
    // Rotate around the outer edge so adjoining doors open away from their shared center.
    const target=data.open?-side*Math.PI/2:0;
    panel.rotation.y+=Math.sign(target-panel.rotation.y)*Math.min(Math.abs(target-panel.rotation.y),delta*5);
    panel.position.set(side*0.48*(1-Math.cos(panel.rotation.y)),0,side*0.48*Math.sin(panel.rotation.y));
}

function openBookEditor(record,content,button) {
    const input=document.createElement('textarea');input.rows=8;input.maxLength=2000;input.value=record.data.note||'';input.setAttribute('aria-label','Book text');content.appendChild(input);
    button('Save',()=>{record.data.note=input.value;showToast('Book saved.');});
}

function offerHeldFood(id) {
    if(!hasInventoryItem(id)){showToast('No food left.');return;}
    furnitureFocus=null;const panel=document.getElementById('home-panel');panel.hidden=false;
    document.getElementById('home-title').textContent=getBlockName(id);
    if(controls.isLocked)controls.unlock();blocker.style.display='none';
    const content=document.getElementById('home-content');content.replaceChildren();
    const eat=document.createElement('button');eat.textContent='Eat';content.appendChild(eat);
    eat.onclick=()=>{if(!consumeInventoryItem(id))return;eat.disabled=true;health=maxHealth;hunger=maxHunger;resetFoodTimers();updateHUD();updateInventoryCounts();closeFurniturePanel();};
}

function updateSofaConnections(model,data) {
    const yaw=model.rotation.y,dir=[Math.round(Math.cos(yaw)),0,-Math.round(Math.sin(yaw))];
    const sections=model.userData.sofaSections||[model],width=sections.length;
    const connected=offset=>{
        const p=model.position.clone().add(new THREE.Vector3(...dir).multiplyScalar(offset)),r=furnitureRecord(Math.round(p.x),Math.round(p.y),Math.round(p.z));
        return r && [83,126].includes(r.id) && Math.cos((r.data.yaw||0)-(data.yaw||0))>0.99;
    };
    sections.forEach((section,i)=>{section.userData.sofaArms[0].visible=i===0&&!connected(-1);section.userData.sofaArms[1].visible=i===width-1&&!connected(width);});
}

function placeFoodOnPlate(hit,id) {
    const record=furnitureRecord(hit.x,hit.y,hit.z);
    if(record?.id!==119||!KITCHEN_FOOD[id])return false;
    if(record.data.foodItem){showToast('The plate already has food.');return true;}
    if(consumeInventoryItem(id)){record.data.foodItem=id;updateInventoryCounts();updateKitchenFurniture(furnitureMeshes.get(record.key),record.data,0);}
    return true;
}

function initKitchenHome() {
    Object.assign(COMMAND_ITEMS,{'淋浴':SHOWER_ID,'喷头':SHOWER_ID,'花洒':SHOWER_ID,'浴室玻璃门':SHOWER_DOOR_ID,'淋浴门':SHOWER_DOOR_ID,'玻璃门':SHOWER_DOOR_ID,'书架':BOOKSHELF_ID,'书本方块':BOOKSHELF_ID,'书本':91});
    Object.assign(COMMAND_ITEMS,{'消防栓':104,'微波炉':105,'灶台':106,'锅':107,'碗':108,'平底锅':109,'勺子':110,'瓢':110,'杯架':111,'浴室玻璃墙':112,'玻璃墙':112,'花瓶':113,'擎天柱摆件':114,'巴斯光年':115,'汽车摆件':116,'玩偶':117,'饭桌':118,'餐桌':118,'盘子':119,'甜甜圈':120,'螃蟹蛋糕':121,'冰淇淋':122,'蛋糕':123,'披萨':124,'水果':125,'大沙发':126,'特大沙发':126});
    const controls=document.createElement('div');controls.className='home-row';controls.style.cssText='flex-basis:100%;margin:0';
    const category=document.createElement('select');category.setAttribute('aria-label','Home category');category.style.maxWidth='130px';
    for(const name of ['All','Living','Kitchen','Bathroom','Decor','Cars']) {const o=document.createElement('option');o.textContent=name;category.appendChild(o);}
    const search=document.createElement('input');search.type='search';search.placeholder='Search Home';search.setAttribute('aria-label','Search Home');search.style.cssText='min-width:100px;flex:1;width:100px;padding:8px';
    const groupFor=id=>CAR_ITEMS[id]?'Cars':[73,105,106,107,108,109,110,111,118,119,120,121,122,123,124,125].includes(id)?'Kitchen':[85,86,87,112,SHOWER_ID,SHOWER_DOOR_ID].includes(id)?'Bathroom':[84,90,91,104,113,114,115,116,117,BOOKSHELF_ID].includes(id)?'Decor':'Living';
    const filter=()=>{for(const el of document.querySelectorAll('#tab-home > .slot')) {const id=el.id==='home-bed'?14:Number(el.id.replace('inv-',''))+12;el.style.display=(category.value==='All'||groupFor(id)===category.value)&&getBlockName(id).toLowerCase().includes(search.value.toLowerCase())?'flex':'none';}};
    category.onchange=filter;search.oninput=filter;controls.append(category,search);document.getElementById('tab-home').prepend(controls);
}
