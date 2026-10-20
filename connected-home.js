const XL_SOFA_ID=149,TV_REMOTE_ID=150,NIGHTSTAND_ID=151,DESK_ID=152,MOUSE_ID=153;
const CONNECTED_HOME_ITEMS={149:'Extra Large Sofa',150:'TV Remote',151:'Bedside Cabinet',152:'Study Desk',153:'Computer Mouse'};
Object.assign(HOME_ITEMS,CONNECTED_HOME_ITEMS);Object.assign(EXTRA_HOME_ITEMS,CONNECTED_HOME_ITEMS);
const HOME_POWER_ITEMS=[76,77,89,93,94,95,96];

function initConnectedHome() {
    Object.assign(COMMAND_ITEMS,{'超大沙发':149,'特大沙发':149,'遥控器':150,'床头柜':151,'书桌':152,'鼠标':153,'绿植':90,'游戏主机':95});
}
function connectedHomeRecipes() {return [{ing:{83:4},out:149,count:1},{ing:{28:1,36:1},out:150,count:1},{ing:{4:4,36:2},out:151,count:1},
    {ing:{82:2,4:1},out:152,count:1},{ing:{28:1,36:2},out:153,count:1}];}

function nearbyHome(ids,position=camera.position,radius=12) {
    return [...furnitureData].filter(([key,d])=>key.startsWith(currentDimension+'|')&&ids.includes(d.id)).map(([key,data])=>{
        const [x,y,z]=key.split('|')[1].split(',').map(Number);return {key,id:data.id,x,y,z,data,distance:Math.hypot(x-position.x,y-position.y,z-position.z)};
    }).filter(r=>r.distance<=radius&&getBlock(r.x,r.y,r.z)===r.id).sort((a,b)=>a.distance-b.distance);
}
function homeChanged(record) {queueRoomBlockChange(record.x,record.y,record.z);}

function openRemotePanel() {
    if(!hasInventoryItem(TV_REMOTE_ID)){showToast('No TV remote.');return;}
    openFurniturePanel({key:'held-tv-remote',id:TV_REMOTE_ID,data:{}});
}
function remoteControls(content,button) {
    const televisions=nearbyHome([76,93]);
    if(!televisions.length){const p=document.createElement('p');p.textContent='No television within 12 blocks.';content.append(p);return;}
    const select=document.createElement('select');select.setAttribute('aria-label','Television');
    televisions.forEach((r,i)=>{const o=document.createElement('option');o.value=i;o.textContent=`${HOME_ITEMS[r.id]} (${r.x}, ${r.y}, ${r.z})`;select.append(o);});content.append(select);
    const target=()=>{const r=televisions[Number(select.value)];return furnitureRecord(r.x,r.y,r.z);};
    button('Power',()=>{const r=target();if(!r||![76,93].includes(r.id))return;r.data.redstone=false;r.data.on=!r.data.on;homeChanged(r);playSound('click');});
    button('Next Channel',()=>{const r=target();if(!r||![76,93].includes(r.id))return;r.data.redstone=false;r.data.on=true;r.data.channel=((r.data.channel||0)+1)%2;delete r.data.consoleScore;homeChanged(r);});
}

function addHomePowerControl(record,content) {
    if(!HOME_POWER_ITEMS.includes(record.id))return;
    const label=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.checked=!!record.data.redstone;
    box.onchange=()=>{record.data.redstone=box.checked;homeChanged(record);};
    label.append(box,document.createTextNode(' Redstone control'));content.append(label);
}
function updateConnectedPower() {
    if(!thermalAuthority())return;
    for(const [key,data] of furnitureData) {
        if(!data.redstone||!HOME_POWER_ITEMS.includes(data.id)||!key.startsWith(currentDimension+'|'))continue;
        const [x,y,z]=key.split('|')[1].split(',').map(Number);
        if(!nearThermalPlayer(x,y,z)||getBlock(x,y,z)!==data.id)continue;
        const on=machinePowered(x,y,z);
        if(data.on!==on){data.on=on;queueRoomBlockChange(x,y,z);}
    }
    for(const r of nearbyHome([94],camera.position,64))if(r.data.tower) {
        const tower=furnitureData.get(r.data.tower),at=r.data.tower.split('|')[1]?.split(',').map(Number);
        const on=!!(tower?.on&&at&&getBlock(...at)===95&&Math.hypot(r.x-at[0],r.y-at[1],r.z-at[2])<=4);
        if(r.data.on!==on){r.data.on=on;homeChanged(r);}
    }
}
function connectConsoleScreen(record,score) {
    const tv=nearbyHome([76,93],record,8)[0];if(!tv)return;
    tv.data.on=true;tv.data.consoleScore=score;homeChanged(tv);
}

function buildConnectedHome(group,id,data) {
    const box=(w,h,d,c,x,y,z)=>addModelBox(group,w,h,d,c,x,y,z),wood=0xb4906c,dark=0x242b2e,white=0xeeeeeb;
    if(id===XL_SOFA_ID) {
        group.userData.sofaSections=[];
        for(let i=0;i<4;i++){const s=createFurnitureModel(83,data);s.position.x=i;group.add(s);group.userData.sofaSections.push(s);}
    } else if(id===TV_REMOTE_ID) {
        box(0.24,0.07,0.65,dark,0,-0.45,0);box(0.045,0.012,0.045,0xe45548,-0.065,-0.408,-0.24);
        for(let x=-1;x<=1;x++)for(let z=0;z<5;z++)box(0.045,0.012,0.045,z===1?0x84b4a2:0xd0d4d2,x*0.065,-0.408,-0.14+z*0.08);
    } else if(id===NIGHTSTAND_ID) {
        box(0.92,0.09,0.88,wood,0,0.4,0);box(0.84,0.73,0.78,wood,0,-0.01,0);
        for(const y of [-0.19,0.15]){box(0.73,0.29,0.035,white,0,y,0.41);box(0.23,0.03,0.045,dark,0,y+0.04,0.44);}
        for(const x of [-0.32,0.32])for(const z of [-0.28,0.28])box(0.08,0.15,0.08,dark,x,-0.43,z);
    } else if(id===DESK_ID) {
        box(1.98,0.1,1.96,wood,0.5,0.43,0.5);
        for(const x of [-0.4,1.4])for(const z of [-0.36,1.36])box(0.08,0.86,0.08,dark,x,-0.05,z);
        box(0.5,0.43,0.76,white,1.16,0.15,0);
        for(const y of [0.05,0.27]){box(0.44,0.18,0.03,0xd4d9d8,1.16,y,0.395);box(0.2,0.025,0.04,dark,1.16,y,0.42);}
        box(1.83,0.08,0.08,dark,0.5,-0.25,-0.36);
    } else if(id===MOUSE_ID) {
        box(0.55,0.015,0.68,0x365365,0,-0.485,0);
        box(0.23,0.07,0.36,dark,0,-0.44,0);box(0.21,0.045,0.24,white,0,-0.39,-0.04);
        box(0.018,0.014,0.14,dark,0,-0.36,-0.085);box(0.035,0.035,0.065,0x6dbfc0,0,-0.355,-0.035);
    }
}

function buildGamingTower(group,data) {
    const box=(w,h,d,c,x,y,z)=>addModelBox(group,w,h,d,c,x,y,z),dark=0x20262b,steel=0xaebcc5;
    box(0.6,0.06,0.86,dark,0,-0.45,0);box(0.6,0.05,0.86,dark,0,0.45,0);
    box(0.035,0.86,0.85,dark,-0.28,0,0);box(0.58,0.86,0.04,dark,0,0,-0.41);
    for(const x of [-0.28,0.28])box(0.04,0.88,0.04,steel,x,0,0.41);
    const glass=box(0.02,0.81,0.77,0xb1d3dd,0.295,0,0);glass.material.transparent=true;glass.material.opacity=0.2;glass.material.depthWrite=false;
    box(0.43,0.6,0.035,0x31483d,0,0.08,-0.32);
    box(0.43,0.13,0.39,0x455563,0,-0.09,-0.02);box(0.43,0.2,0.72,dark,0,-0.32,0);
    for(const x of [-0.11,0.01,0.13])box(0.04,0.27,0.045,0x6ab8be,x,0.22,-0.26);
    group.userData.pcFans=[];
    for(const y of [-0.27,0,0.27]) {
        const fan=new THREE.Group();fan.position.set(0,y,0.4);group.add(fan);group.userData.pcFans.push(fan);
        for(let i=0;i<8;i++) {
            const a=i*Math.PI/4,c=[0x59c6e3,0xdc70b7,0x6ad5ac][Math.round((y+0.27)/0.27)];
            const p=addModelBox(fan,0.055,0.055,0.025,c,Math.sin(a)*0.108,Math.cos(a)*0.108,0.01);p.material.emissive.setHex(data.on?c:0);
        }
        for(let i=0;i<4;i++){const a=i*Math.PI/2,p=addModelBox(fan,0.035,0.14,0.025,0x718088,Math.sin(a)*0.037,Math.cos(a)*0.037,0);p.rotation.z=-a;}
        addModelBox(fan,0.055,0.055,0.035,dark,0,0,0.025);
    }
    box(0.045,0.018,0.045,0x8cdae0,0.19,0.49,0.29);
    for(const x of [-0.08,0.02])box(0.045,0.012,0.08,dark,x,0.484,0.27);
    for(const x of [-0.22,0.22])for(const z of [-0.3,0.3])box(0.08,0.04,0.1,dark,x,-0.49,z);
}
