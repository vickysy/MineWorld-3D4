// City residents, vehicles and additional household furnishings.
const EXTRA_HOME_ITEMS={82:'Table',83:'Sofa Section',84:'Wall Painting',85:'Toilet',86:'Washbasin',87:'Mirror',88:'Storage Cabinet',89:'Table Lamp',90:'Potted Plant',91:'Books',92:'Rug',93:'Large Television',94:'Monitor',95:'Computer Tower',96:'Android Desktop',97:'Pillow',98:'Railing'};
const CAR_MODELS={tai3:{name:'Ti 3',length:2.9,height:1.65,color:0xb2cbd4},tai7:{name:'Ti 7',length:3.3,height:1.8,color:0x7e9e8e},bao5:{name:'Bao 5',length:3.05,height:1.85,color:0xc5c8be},bao8:{name:'Bao 8',length:3.4,height:1.9,color:0x56897d}};
const CAR_ITEMS={100:'tai3',101:'tai7',102:'bao5',103:'bao8'};
const FURNITURE_PART_ID=99;
Object.assign(HOME_ITEMS,EXTRA_HOME_ITEMS);
const cityCars=new Map(), cityCarSpawns=new Set();
let drivingCar=null, carBraking=false, cityPopulationTimer=1, reflectionAvatar=null, reflecting=false;

function isNaturalHomeVoxel(c,type) {
    if(!HOME_ITEMS[type]&&type!==FRIDGE_TOP_ID&&type!==FURNITURE_PART_ID)return false;
    const root=microAncestor(c,1);
    if(microPlacements.get(microParentKey(c.x,c.y,c.z))?.has(microIndex(root.mx,root.my,root.mz)))return false;
    for(let level=2;level<=(c.level||1);level++)if(fineVoxelEdits.has(detailKey(microAncestor(c,level))))return false;
    return getBlock(c.x,c.y,c.z)===type;
}

function tinyHomeCollision(min,max) {
    // Furniture keeps its actual legs, shelves and walls instead of an invisible full cube.
    for(let x=Math.floor(min[0]+0.5);x<=Math.floor(max[0]+0.5);x++)
        for(let y=Math.floor(min[1]+0.5);y<=Math.floor(max[1]+0.5);y++)
            for(let z=Math.floor(min[2]+0.5);z<=Math.floor(max[2]+0.5);z++) {
                const t=getBlock(x,y,z);
                if(!HOME_ITEMS[t]&&t!==FRIDGE_TOP_ID&&t!==FURNITURE_PART_ID)continue;
                const r=furnitureRecord(x,y,z);
                if(r&&!furnitureMeshes.has(r.key))syncFurnitureMeshes();
            }
    const playerBox=new THREE.Box3(new THREE.Vector3(...min),new THREE.Vector3(...max)),box=new THREE.Box3();
    for(const model of furnitureMeshes.values()) {
        if(Math.abs(model.position.x-min[0])>4||Math.abs(model.position.y-min[1])>4||Math.abs(model.position.z-min[2])>4)continue;
        model.updateMatrixWorld(true);
        let hit=false;
        model.traverseVisible(part=>{
            if(hit||!part.isMesh||part.geometry.type!=='BoxGeometry'||part.material.depthWrite===false||part.name==='bowlWater')return;
            part.geometry.computeBoundingBox();box.copy(part.geometry.boundingBox).applyMatrix4(part.matrixWorld);
            if(box.intersectsBox(playerBox))hit=true;
        });
        if(hit)return true;
    }
    return false;
}

function extraHomeRecipes() {
    const list=[{ing:{4:3,36:1},out:82,count:1},{ing:{4:2,5:3},out:83,count:1},{ing:{4:1,5:1,37:1},out:84,count:1},
        {ing:{51:3,36:1},out:85,count:1},{ing:{51:2,36:1},out:86,count:1},{ing:{6:2,36:1},out:87,count:1},
        {ing:{4:4,36:1},out:88,count:1},{ing:{36:1,62:1},out:89,count:1},{ing:{2:1,5:2},out:90,count:1},
        {ing:{4:1,5:2},out:91,count:3},{ing:{5:3},out:92,count:2},
        {ing:{6:4,36:3,28:2},out:93,count:1},{ing:{6:2,36:2,28:1},out:94,count:1},
        {ing:{36:3,28:3,38:1},out:95,count:1},{ing:{36:2,6:2,28:2},out:96,count:1},
        {ing:{5:2},out:97,count:2},{ing:{36:2,6:1},out:98,count:4}];
    return list.concat(kitchenRecipes(),cityLifeRecipes(),surveillanceRecipes(),thermalRecipes());
}

function buildExtraFurniture(group,id,data) {
    const box=(w,h,d,c,x,y,z,name)=>addModelBox(group,w,h,d,c,x,y,z,name);
    const white=0xf1f3f2,metal=0xadb8bc,dark=0x253138,wood=0x946b48;
    if(id===14) {
        box(0.9,0.2,1.8,wood,0,-0.25,0);box(0.86,0.18,1.72,0x467ea1,0,-0.06,0);
        box(0.76,0.13,0.4,white,0,0.09,-0.56);box(0.94,0.64,0.09,wood,0,-0.07,-0.91);
    } else if(id===82) {
        box(0.98,0.1,0.94,wood,0,0.42,0);
        for(const x of [-0.38,0.38])for(const z of [-0.36,0.36])box(0.1,0.85,0.1,dark,x,-0.04,z);
    } else if(id===83) {
        box(0.92,0.35,0.84,0x497d79,0,-0.12,0);box(0.88,0.12,0.65,0x689a92,0,0.12,0.06);
        box(0.94,0.65,0.16,0x497d79,0,0.14,-0.37);
        group.userData.sofaArms=[];
        for(const x of [-0.43,0.43]) {group.userData.sofaArms.push(box(0.12,0.43,0.8,0x3c6966,x,0.1,0));box(0.09,0.15,0.09,dark,x,-0.42,0.3);}
        box(0.28,0.25,0.13,0xe1b35d,-0.19,0.34,-0.2);
    } else if(id===84) {
        box(0.96,0.76,0.08,wood,0,0,-0.43);box(0.82,0.62,0.015,0x79bdcf,0,0,-0.378);
        box(0.13,0.13,0.01,0xf8da71,0.24,0.16,-0.365);
        for(let i=0;i<7;i++)box(0.11,0.1+0.08*(i%3),0.015,i%2?0x4c8764:0x396958,-0.33+i*0.11,-0.19,-0.36);
        box(0.25,0.08,0.02,0xe6edeb,-0.16,0.15,-0.36);
    } else if(id===85) {
        box(0.36,0.35,0.44,white,0,-0.3,0.08);box(0.64,0.17,0.67,white,0,-0.06,0.07);
        box(0.38,0.02,0.39,0x8ac7d8,0,0.035,0.12,'bowlWater');
        group.userData.flushDrops=new THREE.Group();group.add(group.userData.flushDrops);
        for(let i=0;i<8;i++)addModelBox(group.userData.flushDrops,0.045,0.012,0.045,0xc2eaf4,0,0.05,0);
        group.userData.flushDrops.visible=false;
        for(const x of [-0.27,0.27])box(0.1,0.045,0.6,white,x,0.07,0.08);
        box(0.64,0.53,0.22,white,0,0.22,-0.31);box(0.14,0.02,0.08,metal,0.17,0.5,-0.31);
        const lid=box(0.56,0.04,0.57,white,0,0.12,0.06,'lid');lid.rotation.x=-1.35;lid.position.set(0,0.34,-0.17);
    } else if(id===86) {
        box(0.8,0.75,0.62,0xa6bbb8,0,-0.09,0);box(0.92,0.12,0.78,white,0,0.34,0);
        box(0.62,0.025,0.48,0x7c9ca7,0,0.405,0.06);
        for(const x of [-0.4,0.4])box(0.1,0.08,0.72,white,x,0.42,0);
        box(0.06,0.26,0.06,metal,0,0.54,-0.24);box(0.06,0.06,0.25,metal,0,0.64,-0.15);
        const stream=box(0.035,0.22,0.035,0x66bbec,0,0.5,-0.03,'stream');stream.visible=!!data.on;
        stream.material.transparent=true;stream.material.opacity=0.3;stream.material.depthWrite=false;
        box(0.1,0.008,0.1,metal,0,0.423,0.05);addWaterDroplets(group,'tap');
        box(0.18,0.035,0.04,dark,0,-0.05,0.33);
    } else if(id===87) {
        box(0.9,1,0.065,0xe2e7e8,0,0,-0.44);
        if(data.live && THREE.Reflector) {
            const mirror=new THREE.Reflector(new THREE.PlaneGeometry(0.82,0.92),{textureWidth:256,textureHeight:256,color:0x808080,clipBias:0.003});
            mirror.getRenderTarget().texture.format=THREE.RGBAFormat;
            mirror.position.z=-0.398;group.add(mirror);group.userData.mirror=mirror;
            const render=mirror.onBeforeRender;
            mirror.onBeforeRender=function(renderer,scene,view) {
                if(reflecting||surveillanceRendering)return;
                const near=camera.position.distanceTo(group.position)<=12;
                const resolution=near?(innerWidth<600?512:1024):256,target=mirror.getRenderTarget();
                if(target.width!==resolution)target.setSize(resolution,resolution);
                if(!near)return;
                reflecting=true;
                const held=heldItemGroup.visible;heldItemGroup.visible=false;
                if(!reflectionAvatar) {
                    reflectionAvatar=createRemotePlayer();scene.add(reflectionAvatar);
                }
                reflectionAvatar.scale.setScalar(playerScale);reflectionAvatar.position.copy(camera.position);reflectionAvatar.position.y-=0.75*playerScale;
                reflectionAvatar.rotation.y=camera.rotation.y;reflectionAvatar.visible=true;
                reflectionAvatar.children[0].rotation.x=camera.rotation.x;
                const step=controls.isLocked&&(moveForward||moveBackward||moveLeft||moveRight)?Math.sin(walkTime)*0.35:0;
                for(let i=2;i<6;i++)reflectionAvatar.children[i].rotation.x=step*(i===2||i===5?1:-1);
                reflectionAvatar.updateMatrixWorld(true);
                try {render.call(mirror,renderer,scene,view);} finally {reflectionAvatar.visible=false;heldItemGroup.visible=held;reflecting=false;}
            };
        } else box(0.82,0.92,0.01,0xd0e2e6,0,0,-0.398);
    } else if(id===88) {
        for(const x of [-0.445,0.445])box(0.06,1.95,0.82,wood,x,0.47,0);
        for(const y of [-0.475,0.45,1.415])box(0.89,0.06,0.82,wood,0,y,0);
        box(0.89,1.89,0.05,wood,0,0.47,-0.385);
        group.userData.cabinetDoors=[];
        for(const side of [-1,1]) {
            const door=new THREE.Group();door.position.set(side*0.45,0.49,0.435);group.add(door);
            addModelBox(door,0.46,1.77,0.04,0xc3a77c,-side*0.225,0,0);
            addModelBox(door,0.025,0.25,0.04,dark,-side*0.39,-0.02,0.035);
            group.userData.cabinetDoors.push(door);
        }
    } else if(id===89) {
        box(0.38,0.045,0.32,metal,0,-0.47,0);box(0.045,0.51,0.045,dark,0,-0.2,0);
        const shade=box(0.53,0.28,0.47,0xf4dba3,0,0.13,0,'shade');shade.material.emissive.setHex(data.on?0x9a6725:0);
        const light=new THREE.PointLight(0xffdb8f,data.on?1.2:0,7);light.position.set(0,0.1,0);group.add(light);group.userData.light=light;
    } else if(id===90) {
        box(0.37,0.32,0.37,0xc97762,0,-0.33,0);box(0.31,0.03,0.31,0x4e3b2d,0,-0.16,0);
        box(0.05,0.46,0.05,0x3e7644,0,0.05,0);
        for(const [x,y,z] of [[-0.17,0.09,0],[0.16,0.24,0],[0,0.35,0.1],[0,0.03,-0.14]])box(0.26,0.16,0.2,0x4e9953,x,y,z);
    } else if(id===91) {
        for(let i=0;i<5;i++) {box(0.13,0.46+(i%2)*0.09,0.4,[0x578cab,0xba5951,0xe3ba53,0x648a65,0x8d78a4][i],-0.29+i*0.145,-0.22,0);box(0.1,0.025,0.01,0xe6e4d9,-0.29+i*0.145,-0.12,0.21);}
    } else if(id===92) {
        box(0.99,0.025,0.99,0x357e88,0,-0.478,0);box(0.83,0.005,0.83,0xd5b16b,0,-0.463,0);box(0.68,0.005,0.68,0x386d74,0,-0.459,0);
    } else if(id===93 || id===94 || id===96) {
        const w=id===93?1.88:0.91,h=id===93?0.87:0.51,cx=id===93?0.5:0;
        box(w+0.07,h+0.07,0.1,id===96?0xc9dfd6:dark,cx,0,0);
        const canvas=document.createElement('canvas');canvas.width=256;canvas.height=144;
        const texture=new THREE.CanvasTexture(canvas);texture.magFilter=THREE.NearestFilter;
        const screen=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture}));screen.position.set(cx,0,0.056);group.add(screen);group.userData.screen={canvas,texture};
        box(0.1,0.2,0.08,metal,cx,-0.37,-0.02);box(id===93?1.3:0.45,0.04,0.34,dark,cx,-0.47,0);
    } else if(id===95) {
        buildGamingTower(group,data);
    } else if(id===97) {
        box(0.72,0.2,0.5,white,0,-0.37,0);box(0.62,0.04,0.42,0xf9f8ef,0,-0.25,0);
    } else if(id===98) {
        box(0.99,0.07,0.07,metal,0,0.43,0);box(0.99,0.05,0.05,metal,0,-0.05,0);
        for(const x of [-0.45,0,0.45])box(0.06,0.98,0.06,dark,x,-0.01,0);
    }
    if(KITCHEN_ITEMS[id])buildKitchenModel(group,id,data);
    if(CITY_LIFE_ITEMS[id])buildCityLifeModel(group,id,data);
    if(SURVEILLANCE_ITEMS[id])buildSurveillanceModel(group,id,data);
    if(CONNECTED_HOME_ITEMS[id])buildConnectedHome(group,id,data);
}

function openExtraFurniture(record,content,button) {
    const data=record.data;
    if(record.id===128) {kickFootball(record);closeFurniturePanel();return;}
    if(KITCHEN_ITEMS[record.id])return openKitchenFurniture(record,content,button);
    if(record.id===TV_REMOTE_ID){remoteControls(content,button);return;}
    if(record.id===95) {
        button(data.on?'Power Off':'Power On',()=>{data.redstone=false;data.on=!data.on;homeChanged(record);openFurniturePanel(record);});
        button('Connect Monitor',()=>{
            const monitor=nearbyHome([94],record,4)[0];
            if(!monitor){showToast('Place a monitor within 4 blocks.');return;}
            monitor.data.tower=record.key;homeChanged(monitor);showToast('Monitor connected.');
        });
    } else if([94,96].includes(record.id)) {
        const input=document.createElement('textarea');input.rows=6;input.maxLength=2000;input.value=data.note||'';input.setAttribute('aria-label','Notes');input.oninput=()=>{data.note=input.value;data.on=true;};content.appendChild(input);
        button('Save',()=>{data.note=input.value;data.on=true;showToast('Notes saved.');});
    } else if(record.id===88||record.id===NIGHTSTAND_ID) {
        if(record.id===88)
        button(record.data.open?'Close Doors':'Open Doors',()=>{record.data.open=!record.data.open;queueRoomBlockChange(record.x,record.y,record.z);openFurniturePanel(record);});
        const select=document.createElement('select');select.setAttribute('aria-label','Stored item');
        for(const id of new Set(Object.values(getInventorySlotMapping()))) {const o=document.createElement('option');o.value=id;o.textContent=getBlockName(id);select.appendChild(o);}
        const count=document.createElement('p'),refresh=()=>{count.textContent=`Stored: ${data.storage?.[select.value]||0} / 64`;};select.onchange=refresh;refresh();content.append(select,count);
        button('Store',()=>{const id=Number(select.value);if((data.storage?.[id]||0)>=64||!hasInventoryItem(id))return;consumeInventoryItem(id);data.storage??={};data.storage[id]=(data.storage[id]||0)+1;refresh();updateInventoryCounts();homeChanged(record);});
        button('Take',()=>{const id=Number(select.value);if(!(data.storage?.[id]>0))return;data.storage[id]--;playerInventory[id]=(playerInventory[id]||0)+1;refresh();updateInventoryCounts();homeChanged(record);});
    } else if(record.id===85) {
        button('Use Toilet',()=>{
            sitInChair(record);if(seatedAt?.key!==record.key)return;
            data.using=3;closeFurniturePanel();showToast('Using toilet...');
        });
        if(seatedAt?.key===record.key)button('Stand Up',()=>{if(standFromChair())closeFurniturePanel();});
        button('Flush',()=>{data.flushing=1.6;playSound('swim');showToast('Flushed.');});
    } else if(record.id===86 || record.id===89) {
        const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=!!data.on;
        input.onchange=()=>{data.on=input.checked;data.redstone=false;homeChanged(record);openFurniturePanel(record);};label.append(input,document.createTextNode(record.id===86?' Tap':' Light'));content.appendChild(label);
        if(record.id===86)button('Fill Bucket',()=>fillHomeWaterBucket(data));
    } else if(record.id===91) {
        openBookEditor(record,content,button);
    } else {
        const name=document.createElement('p');name.textContent=HOME_ITEMS[record.id];content.appendChild(name);
    }
}

function updateExtraFurniture(model,data,delta) {
    updateKitchenFurniture(model,data,delta);
    for(const fan of model.userData.pcFans||[]) {
        if(data.on)fan.rotation.z+=delta*9;
        fan.children.forEach(part=>{if(part.material.emissive)part.material.emissive.copy(data.on?part.material.color:new THREE.Color(0));});
    }
    if(model.userData.stream)model.userData.stream.visible=!!data.on;
    if(model.userData.light) {model.userData.light.intensity=data.on?1.2:0;model.userData.shade.material.emissive.setHex(data.on?0x9a6725:0);}
    if(data.using>0) {
        if(seatedAt?.key!==`${currentDimension}|${model.position.toArray().join(',')}`)data.using=0;
        else {data.using=Math.max(0,data.using-delta);if(!data.using){data.flushing=1.6;playSound('swim');showToast('Finished.');}}
    }
    if(data.flushing>0)data.flushing=Math.max(0,data.flushing-delta);
    if(model.userData.flushDrops) {
        model.userData.flushDrops.visible=data.flushing>0;
        model.userData.flushDrops.children.forEach((drop,i)=>{const a=data.flushing*10+i*Math.PI/4;drop.position.set(Math.cos(a)*0.12,0.05,0.12+Math.sin(a)*0.12);});
        model.userData.bowlWater.scale.setScalar(data.flushing?0.7+Math.sin(data.flushing*10)*0.1:1);
    }
}

function createCityCar(color,model='tai3') {
    const spec=CAR_MODELS[model]||CAR_MODELS.tai3;
    color=color??spec.color;
    const group=new THREE.Group(),box=(w,h,d,c,x,y,z)=>addModelBox(group,w,h,d,c,x,y,z);
    const l=spec.length,h=spec.height,front=l/2,back=-l/2,roof=model==='tai3'?0x27383b:color;
    box(1.5,0.57,l,color,0,0.64,0);box(1.43,0.18,l+0.05,0x263036,0,0.36,0);
    box(1.38,0.09,l*0.67,roof,0,h,-0.2);box(1.42,0.1,l*0.31,color,0,0.95,l*0.34);
    const glass=new THREE.MeshLambertMaterial({color:0x91bac3,transparent:true,opacity:0.32,depthWrite:false});
    for(const z of [l*0.29,-l*0.4]) {const p=box(1.26,h-0.94,0.025,0x99b9c5,0,(h+0.94)/2,z);p.material.dispose();p.material=glass.clone();}
    for(const x of [-0.68,0.68]) {
        const p=box(0.025,h-0.95,l*0.65,0x99b9c5,x,(h+0.95)/2,-0.2);p.material.dispose();p.material=glass.clone();
        for(const z of [-l*0.42,-0.15,l*0.3])box(0.085,h-0.9,0.08,0x263238,x,(h+0.9)/2,z);
        box(0.11,0.06,0.05,0xc9d3d4,x*1.12,0.86,-0.04);
        box(0.16,0.14,0.19,color,x*1.2,1.13,l*0.27);
        box(0.06,0.075,l*0.57,0x253337,x*0.88,h+0.08,-0.22);
    }
    glass.dispose();
    box(1.15,0.28,0.15,0x1d2c31,0,0.74,front+0.015);
    if(model==='tai7') {for(const y of [0.77,0.9])box(1.27,0.045,0.04,0xe6fcfd,0,y,front+0.1);}
    else for(const x of [-0.49,0.49]) {
        const wide=model==='bao8'?0.34:0.27;
        box(wide,0.19,0.06,0xf3f7d9,x,0.85,front+0.085);
        box(wide-0.07,0.075,0.065,0x27383b,x,0.85,front+0.09);
    }
    if(model==='bao8')for(const x of [-0.28,-0.14,0,0.14,0.28])box(0.035,0.23,0.04,0xc2cfd0,x,0.75,front+0.11);
    for(const x of [-0.5,0.5])box(0.14,0.27,0.06,0xd54d42,x,0.8,back-0.08);
    if(model==='bao5'||model==='bao8') {box(0.68,0.68,0.25,0x253035,0,1.04,back-0.16);box(0.43,0.43,0.03,color,0,1.04,back-0.3);}
    else box(0.64,0.46,0.23,color,0,1.04,back-0.12);
    for(const x of [-0.33,0.33]) {box(0.44,0.2,0.46,0x374851,x,0.96,0);box(0.44,0.47,0.12,0x374851,x,1.2,-0.25);}
    box(1.12,0.15,0.26,0x2c3d44,0,1.05,l*0.22);box(0.4,0.23,0.03,0x478a9d,0,1.22,l*0.21);
    box(0.27,0.035,0.07,0x151f22,-0.33,1.16,l*0.16);
    group.userData.wheels=[];
    for(const x of [-0.78,0.78])for(const z of [-l*0.31,l*0.31]) {
        box(0.18,0.49,0.76,0x283236,x,0.49,z);
        const wheel=new THREE.Mesh(new THREE.CylinderGeometry(0.34,0.34,0.19,12),new THREE.MeshLambertMaterial({color:0x181e22}));wheel.rotation.z=Math.PI/2;wheel.position.set(x*1.06,0.34,z);group.add(wheel);
        const hub=box(0.22,0.21,0.21,0xc4cbd1,x*1.08,0.34,z);group.userData.wheels.push(hub);
    }
    group.userData.model=model;
    return group;
}

function spawnCityCar(id,x,y,z,yaw=0,color,model='tai3') {
    if(cityCars.has(id))return cityCars.get(id);
    color=color??CAR_MODELS[model].color;
    const mesh=createCityCar(color,model);mesh.position.set(x,y,z);mesh.rotation.y=yaw;scene.add(mesh);
    const car={id,mesh,speed:0,color,model};cityCars.set(id,car);return car;
}

function carSpaceClear(car,position,yaw=car.mesh.rotation.y) {
    const c=Math.cos(yaw),s=Math.sin(yaw);
    const spec=CAR_MODELS[car.model||'tai3'];
    for(const x of [-0.88,0,0.88])for(const z of [-spec.length/2-0.2,0,spec.length/2+0.1]) {
        const bx=Math.round(position.x+x*c+z*s),bz=Math.round(position.z-x*s+z*c),by=Math.round(position.y+0.3);
        if(!isSolid(bx,Math.round(position.y-0.1),bz) || [24,LAVA_ID].includes(getBlock(bx,by,bz)))return false;
        for(const h of [0.3,0.9,spec.height])if(isSolid(bx,Math.round(position.y+h),bz))return false;
    }
    for(const other of cityCars.values())if(other!==car && position.distanceTo(other.mesh.position)<3)return false;
    for(const mob of [...villagers,...zombies,...creepers,...animals,...endermen])if(!mob.dying && Math.abs(mob.mesh.position.y-position.y)<2 && Math.hypot(mob.mesh.position.x-position.x,mob.mesh.position.z-position.z)<1.5)return false;
    return true;
}

function playerHitsCityCar(pos) {
    if(currentDimension!=='overworld'||drivingCar)return false;
    const radius=getPlayerRadius(),feet=pos.y-getPlayerHeight();
    for(const car of cityCars.values()) {
        const p=car.mesh.position,spec=CAR_MODELS[car.model],angle=-car.mesh.rotation.y;
        if(feet>=p.y+spec.height+0.08||pos.y+0.2*playerScale<=p.y)continue;
        const dx=pos.x-p.x,dz=pos.z-p.z,x=dx*Math.cos(angle)+dz*Math.sin(angle),z=-dx*Math.sin(angle)+dz*Math.cos(angle);
        if(Math.abs(x)<0.87+radius && Math.abs(z)<spec.length/2+0.2+radius)return true;
    }
    return false;
}

function tryEnterCityCar() {
    if(currentDimension!=='overworld'||activeMech||seatedAt||ridingMinecart||playerScale!==1)return false;
    const dir=new THREE.Vector3();camera.getWorldDirection(dir);
    for(const car of cityCars.values()) {
        const point=car.mesh.position.clone().add(new THREE.Vector3(0,0.8,0)),v=point.clone().sub(camera.position);
        if(v.length()>3.8||dir.dot(v.normalize())<0.78||!hasClearLineBetween(camera.position,point))continue;
        drivingCar=car;carBraking=false;car.returnPosition=camera.position.clone();car.speed=0;resetPlayerFlight();clearMovementInput();heldItemGroup.visible=false;
        camera.position.copy(car.mesh.position).add(new THREE.Vector3(0,1.42,0));camera.rotation.set(0,car.mesh.rotation.y+Math.PI,0);
        document.getElementById('car-hud').hidden=false;showToast(CAR_MODELS[car.model].name);return true;
    }
    return false;
}

function leaveCityCar() {
    if(!drivingCar)return true;
    const car=drivingCar,yaw=car.mesh.rotation.y;
    const end=CAR_MODELS[car.model].length/2+0.7;
    for(const [dx,dz] of [[-1.22,0],[1.22,0],[0,-end],[0,end]]) {
        const p=car.mesh.position.clone().add(new THREE.Vector3(Math.cos(yaw)*dx+Math.sin(yaw)*dz,getPlayerHeight(),-Math.sin(yaw)*dx+Math.cos(yaw)*dz));
        if(checkCollision(p))continue;
        if(!isSolid(Math.round(p.x),Math.round(car.mesh.position.y-0.1),Math.round(p.z)))continue;
        camera.position.copy(p);drivingCar=null;carBraking=false;car.speed=0;heldItemGroup.visible=true;clearMovementInput();document.getElementById('car-hud').hidden=true;return true;
    }
    showToast('Both doors are blocked. Move the car first.');return false;
}

function updateDrivingCar(delta) {
    const car=drivingCar;if(!car)return;
    if(carBraking){car.speed=0;return;}
    const acceleration=(moveForward?1:0)-(moveBackward?1:0);
    car.speed=THREE.MathUtils.clamp(car.speed+acceleration*4.5*delta,-2.5,6);if(!acceleration)car.speed*=Math.exp(-5*delta);
    const desired=((moveLeft?1:0)-(moveRight?1:0))*0.8;
    car.steer=(car.steer||0)+(desired-(car.steer||0))*(1-Math.exp(-8*delta));
    const turn=car.steer*delta*Math.min(1,Math.abs(car.speed)/2)*Math.sign(car.speed);
    const yaw=car.mesh.rotation.y+turn;
    if(carSpaceClear(car,car.mesh.position,yaw)) {car.mesh.rotation.y=yaw;camera.rotation.y+=turn;}
    const steps=Math.max(1,Math.ceil(Math.abs(car.speed*delta)/0.15));
    for(let i=0;i<steps;i++) {
        const next=car.mesh.position.clone().add(new THREE.Vector3(Math.sin(car.mesh.rotation.y),0,Math.cos(car.mesh.rotation.y)).multiplyScalar(car.speed*delta/steps));
        if(!carSpaceClear(car,next)){car.speed=0;break;}car.mesh.position.copy(next);
    }
    for(const wheel of car.mesh.userData.wheels)wheel.rotation.x+=car.speed*delta*3;
    camera.position.copy(car.mesh.position).add(new THREE.Vector3(0,1.42,0));velocity.set(0,0,0);
    document.getElementById('car-speed').textContent=`${Math.round(Math.abs(car.speed)*3.6)} km/h`;
}

function populateCityStreets() {
    if(selectedTerrain!=='city'||currentDimension!=='overworld')return;
    for(let i=villagers.length-1;i>=0;i--)if(villagers[i].cityResident&&villagers[i].mesh.position.distanceTo(camera.position)>90){disposeModModel(villagers[i].mesh);villagers.splice(i,1);}
    if(villagers.filter(v=>!v.dying).length>=12)return;
    const cx=Math.floor(camera.position.x/CHUNK_SIZE),cz=Math.floor(camera.position.z/CHUNK_SIZE);
    for(const [dx,dz] of [[0,0],[0,1],[1,0],[-1,0],[0,-1],[1,1],[-1,-1]]) {
        const x=(cx+dx)*CHUNK_SIZE+3,z=(cz+dz)*CHUNK_SIZE+8;
        if(!worldMap.has(`city_${cx+dx},${cz+dz}`)||!isAnimalSpawnSafe(x,17,z)||villagers.some(v=>Math.hypot(v.mesh.position.x-x,v.mesh.position.z-z)<6))continue;
        if([...cityCars.values()].some(c=>Math.hypot(c.mesh.position.x-x,c.mesh.position.z-z)<2))continue;
        spawnVillagerAt(x,17,z);villagers[villagers.length-1].cityResident=true;
        if(villagers.length>=12)break;
    }
}

function updateHomeCity(delta) {
    for(const car of cityCars.values())car.mesh.visible=currentDimension==='overworld'&&car.mesh.position.distanceTo(camera.position)<100;
    cityPopulationTimer+=delta;if(cityPopulationTimer<1||!isGameStarted)return;cityPopulationTimer=0;
    updateCityLife();
    populateCityStreets();
    if(currentDimension!=='overworld'||selectedTerrain!=='city')return;
    const cx=Math.floor(camera.position.x/CHUNK_SIZE),cz=Math.floor(camera.position.z/CHUNK_SIZE);
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++) {
        const key=`${cx+dx},${cz+dz}`;if(!worldMap.has('city_'+key)||cityCarSpawns.has(key)||cityCars.size>=24)continue;
        const x=(cx+dx)*CHUNK_SIZE+1,z=(cz+dz)*CHUNK_SIZE+9;
        if(!isAnimalSpawnSafe(x,17,z))continue;
        cityCarSpawns.add(key);const model=Object.keys(CAR_MODELS)[Math.floor(hash(cx+dx,cz+dz)*4)];spawnCityCar(key,x,16.5,z,0,undefined,model);
    }
}

function saveHomeCity() {
    return {markets:Array.from(marketStalls),spawns:Array.from(cityCarSpawns),cars:Array.from(cityCars.values(),c=>({id:c.id,p:c.mesh.position.toArray(),yaw:c.mesh.rotation.y,color:c.color,model:c.model})),
        residents:villagers.filter(v=>v.cityResident&&!v.dying).map(v=>({p:v.mesh.position.toArray(),hp:v.hp}))};
}

function clearHomeCity() {
    marketStalls.clear();
    drivingCar=null;carBraking=false;for(const car of cityCars.values())disposeModModel(car.mesh);cityCars.clear();cityCarSpawns.clear();
    if(reflectionAvatar){disposeModModel(reflectionAvatar);reflectionAvatar=null;}
    const hud=document.getElementById('car-hud');if(hud)hud.hidden=true;cityPopulationTimer=1;
}

function restoreHomeCity(data={}) {
    for(const [key,value] of data.markets||[]) marketStalls.set(key,value);
    for(const key of data.spawns||[])cityCarSpawns.add(key);
    for(const c of (data.cars||[]).slice(0,24))if(c.p?.length===3&&c.p.every(Number.isFinite))spawnCityCar(c.id,...c.p,c.yaw,c.color,CAR_MODELS[c.model]?c.model:'tai3');
    if(currentDimension==='overworld') for(const v of (data.residents||[]).slice(0,12))if(v.p?.length===3&&v.p.every(Number.isFinite)){spawnVillagerAt(...v.p);Object.assign(villagers[villagers.length-1],{cityResident:true,hp:v.hp||4});}
}

function initHomeCity() {
    Object.assign(COMMAND_ITEMS,{'床':14,'桌子':82,'桌':82,'沙发':83,'壁画':84,'马桶':85,'洗手池':86,'洗脸盆':86,'镜子':87,'柜子':88,'台灯':89,'灯':89,'盆栽':90,'摆件':90,'书籍':91,'书':91,'地毯':92,'大电视':93,'显示屏':94,'显示器':94,'主机':95,'安卓电脑':96,'枕头':97,'栏杆':98,'钛3':100,'太三':100,'钛7':101,'太七':101,'豹5':102,'豹五':102,'豹8':103,'豹八':103,'车子':100});
    const hud=document.createElement('div');hud.id='car-hud';hud.hidden=true;hud.style.cssText='position:fixed;left:12px;bottom:165px;z-index:12;color:white;background:#202728;padding:10px;border-radius:4px';
    hud.innerHTML='<span id="car-speed">0 km/h</span> <button id="exit-car">Exit Car</button>';document.body.appendChild(hud);document.getElementById('exit-car').onclick=leaveCityCar;
    document.addEventListener('keyup',e=>{if(e.code==='Space')carBraking=false;});
    window.addEventListener('blur',()=>{carBraking=false;if(drivingCar)drivingCar.speed=0;});
    controls.addEventListener('unlock',()=>{carBraking=false;if(drivingCar)drivingCar.speed=0;});
    initKitchenHome();
    initCityLife();
}

function placeCityCarItem(id) {
    if(isTinyMode()||activeMech){showToast('Return to normal size to place a car.');return false;}
    if(cityCars.size>=24){showToast('Vehicle limit reached: 24.');return false;}
    const hit=expansionRay();if(!hit?.previous)return false;
    const [x,y,z]=hit.previous,model=CAR_ITEMS[id],spec=CAR_MODELS[model];
    const position=new THREE.Vector3(x,y-0.5,z),yaw=Math.round(camera.rotation.y/(Math.PI/2))*(Math.PI/2);
    const probe={model,mesh:{position,rotation:{y:yaw}}};
    if(Math.hypot(camera.position.x-x,camera.position.z-z)<2 || !carSpaceClear(probe,position,yaw)){showToast('Park on a clear, level road.');return false;}
    if(!consumeInventoryItem(id)){showToast('No cars left.');return false;}
    spawnCityCar(`placed-${Date.now()}-${cityCars.size}`,x,y-0.5,z,yaw,spec.color,model);updateInventoryCounts();return true;
}

function generateCityLake(cx,cz) {
    const mx=((cx%8)+8)%8,mz=((cz%8)+8)%8;
    if(![2,3].includes(mx)||![0,1].includes(mz))return false;
    const sx=cx*CHUNK_SIZE,sz=cz*CHUNK_SIZE;
    for(let x=0;x<CHUNK_SIZE;x++)for(let z=0;z<CHUNK_SIZE;z++) {
        const lx=(mx-2)*CHUNK_SIZE+x,lz=mz*CHUNK_SIZE+z;
        const shore=lx===0||lx===31||lz===0||lz===31,bridge=lz>=16&&lz<=18;
        setGenBlock(sx+x,12,sz+z,23);
        for(let y=13;y<=15;y++)setGenBlock(sx+x,y,sz+z,shore?23:bridge&&lx%8===0?3:24);
        setGenBlock(sx+x,16,sz+z,shore?63:bridge?(lz===17&&lx%4===0?51:61):0);
        for(let y=17;y<=19;y++)setGenBlock(sx+x,y,sz+z,0);
        if((lz===15||lz===19)&&lx>0&&lx<31) {setGenBlock(sx+x,16,sz+z,63);setGenBlock(sx+x,17,sz+z,98);}
    }
    return true;
}

function furnishCityBuilding(bx,base,bz,floors,wall) {
    const style=Math.floor(hash(bx+77,bz-33)*4);
    // Keep the stairs and the rear ladder clear in every building variant.
    if(style===0) {
        for(let x=2;x<=7;x++)setGenBlock(bx+x,base+3,bz-1,x%2?60:51);
        for(let x=2;x<=7;x++)if(x!==5)setGenBlock(bx+x,base+1,bz,6);
    } else if(style===1) {
        for(let f=1;f<floors;f++)for(const x of [2,7])setGenBlock(bx+x,base+f*4+1,bz-1,98);
        for(let x=1;x<=8;x++)setGenBlock(bx+x,base+floors*4+1,bz,98);
    } else if(style===2) {
        for(let y=base+1;y<base+floors*4;y++)for(const x of [0,4,9])setGenBlock(bx+x,y,bz,wall===51?60:51);
    }
    for(let y=base+1;y<=base+3;y++)setGenBlock(bx-2,y,bz-1,98);
    setGenBlock(bx-2,base+4,bz-1,62);
    setGenBlock(bx-1,base+1,bz-1,104);
    if(hash(bx-1,bz+4)>0.3 && (bx!==5||bz!==5))return;
    for(const [x,y,z,t] of [[6,1,4,82],[6,2,4,89],[7,1,6,83],[8,2,7,84],[6,1,7,90],[6,5,4,14],[7,5,4,15],[8,5,6,88],[8,6,6,80]])setGenBlock(bx+x,base+y,bz+z,t);
    for(const [x,y,z,t] of [[2,1,7,82],[2,2,7,105],[3,1,7,106],[3,2,7,107],[4,1,7,73],[4,2,7,80],[1,5,6,85],[2,5,6,86],[2,6,6,87],[3,5,7,112],[3,6,7,80]])setGenBlock(bx+x,base+y,bz+z,t);
}
