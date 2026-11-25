const WOOD_SWORD=241,STONE_SWORD=242,GOLD_SWORD=243,SAPPHIRE_SWORD=244;
const PILLAGER_EGG=245,WARDEN_EGG=246,HORSE_EGG=247;
const ADVENTURE_ITEMS={241:'Wooden Sword',242:'Stone Sword',243:'Golden Sword',244:'Sapphire Sword',245:'Pillager Egg',246:'Warden Egg',247:'Horse Egg'};
const SWORD_DAMAGE={33:4,241:2,242:3,243:3,244:5};
const ADVENTURE_EGGS=new Set([PILLAGER_EGG,WARDEN_EGG,HORSE_EGG]);
const WEAPON_IDS=new Set([33,34,35,54,55,56,57,58,WOOD_SWORD,STONE_SWORD,GOLD_SWORD,SAPPHIRE_SWORD]);
const weaponPixels=new Map(),weaponShapes=new Map();
const HAND_SWING_SECONDS=.34;
let handSwing=0,handCooldown=0,handSwingItem=0,handSwingAction='melee';
const handRest=[0,0,0,0,0,0,0],handReturn=[1,0,0,0,0,0,0];
// Time, grip translation (x/y/z), then wrist pitch/yaw/roll in camera space.
const HAND_SWING_POSES={
    sword:[handRest,[.18,0,.14,0,.06,0,0],[.46,0,-.3,0,-.35,0,0],[.64,0,-.32,0,-.4,0,0],handReturn],
    pickaxe:[handRest,[.17,0,.09,0,.05,0,0],[.43,0,-.22,0,-.3,0,0],[.62,0,-.26,0,-.34,0,0],handReturn],
    axe:[handRest,[.2,0,.14,0,.06,0,0],[.46,0,-.25,0,-.33,0,0],[.65,0,-.3,0,-.38,0,0],handReturn],
    mace:[handRest,[.22,0,.17,0,.06,0,0],[.47,0,-.28,0,-.34,0,0],[.66,0,-.31,0,-.38,0,0],handReturn],
    punch:[handRest,[.12,.02,-.015,.035,.12,-.04,-.08],[.42,-.19,.14,-.28,-.8,.12,.3],[.58,-.21,.1,-.24,-.7,.1,.28],handReturn],
    thrust:[handRest,[.18,.02,.04,.05,.1,0,-.05],[.43,-.15,.07,-.34,-1.2,.06,.16],[.6,-.16,.02,-.28,-1.1,.04,.18],handReturn],
    tap:[handRest,[.16,.02,.05,.02,.1,-.04,-.06],[.44,-.13,.02,-.16,-.5,.08,.25],[.62,-.16,-.04,-.1,-.4,.04,.3],handReturn],
    recoil:[handRest,[.18,-.015,.025,.09,.09,-.015,-.025],[.45,-.01,.015,.045,.05,0,-.01],handReturn],
    release:[handRest,[.15,0,.02,.06,.06,0,-.02],[.4,-.015,0,-.04,-.05,0,.015],handReturn]
};
const handPose=new Float64Array(6);

// The same pixel silhouette supplies the inventory image and the extruded model.
function weaponPattern(id){
    if(weaponPixels.has(id))return weaponPixels.get(id);
    const grid=Array.from({length:16},()=>Array(16).fill(null));
    const dot=(x,y,c)=>{if(x>=0&&x<16&&y>=0&&y<16)grid[y][x]=c;};
    const rect=(x,y,w,h,c)=>{for(let a=x;a<x+w;a++)for(let b=y;b<y+h;b++)dot(a,b,c);};
    const line=(x,y,dx,dy,n,c)=>{for(let i=0;i<n;i++)dot(x+dx*i,y+dy*i,c);};
    const brown='#986b3b',dark='#43342c',edge='#495760';
    if(SWORD_DAMAGE[id]){
        const blade=id===WOOD_SWORD?'#b2854f':id===STONE_SWORD?'#929b9b':id===GOLD_SWORD?'#f0c850':id===SAPPHIRE_SWORD?'#47c8db':'#d8e3e5';
        for(let i=0;i<5;i++){rect(2+i,13-i,2,2,dark);dot(3+i,13-i,brown);}
        line(4,8,1,1,5,dark);line(4,7,1,1,5,blade);dot(3,8,dark);dot(8,13,dark);
        for(let i=0;i<8;i++)rect(6+i,7-i,3,3,edge);
        for(let i=0;i<8;i++)rect(7+i,7-i,2,2,blade);
        for(let i=0;i<8;i++)dot(7+i,7-i,'#f4eee0');
        dot(14,0,blade);dot(15,0,edge);
    }else if(id===55){
        for(const [x,y] of [[7,1],[9,2],[10,3],[11,4],[12,5],[12,6],[12,7],[12,8],[11,9],[10,10],[9,11],[7,12]]){rect(x,y,2,2,dark);dot(x,y,brown);}
        line(7,2,0,1,11,'#ded6bc');line(2,7,1,0,12,brown);dot(14,7,'#d7e5eb');dot(13,6,'#d7e5eb');dot(13,8,'#d7e5eb');rect(2,6,2,3,'#dad5be');
    }else if(id===56){
        rect(6,2,3,13,dark);rect(7,2,1,12,brown);rect(1,5,14,3,dark);rect(2,5,12,1,brown);
        line(2,7,1,1,5,'#ddd5c3');line(8,11,1,-1,5,'#ddd5c3');rect(6,7,4,3,'#8f9b9e');line(8,0,0,1,10,'#c5c9c0');dot(7,1,'#c5c9c0');dot(9,1,'#c5c9c0');
    }else if(id===34||id===54){
        for(let i=0;i<10;i++){rect(2+i,12-i,2,2,dark);dot(3+i,12-i,brown);}
        if(id===34){rect(5,1,7,3,edge);rect(11,3,3,6,edge);rect(5,1,6,1,'#c4ced0');rect(12,3,1,5,'#9cabad');}
        else{rect(6,1,7,4,edge);rect(4,3,7,4,edge);rect(4,3,2,4,'#d5dede');rect(6,2,6,2,'#b6c2c3');}
    }else if(id===57){
        rect(7,6,2,10,'#367f83');rect(3,4,10,3,'#3a9c9f');for(const x of [3,7,11]){rect(x,0,2,6,'#64d1ce');dot(x,0,'#e2f2e6');}
    }else if(id===58){rect(7,5,2,10,brown);rect(3,1,10,6,'#536879');rect(4,1,8,2,'#b6c9d1');rect(4,4,8,2,'#7792a4');}
    else{rect(1,5,13,4,'#414b52');rect(2,5,11,1,'#9eacaf');rect(3,8,3,6,brown);rect(8,8,3,4,'#657780');rect(12,4,3,2,'#303c43');rect(6,3,3,2,'#729198');}
    const canvas=document.createElement('canvas');canvas.width=canvas.height=16;const c=canvas.getContext('2d');
    for(let y=0;y<16;y++)for(let x=0;x<16;x++)if(grid[y][x]){c.fillStyle=grid[y][x];c.fillRect(x,y,1,1);}
    const result={grid,canvas};weaponPixels.set(id,result);return result;
}
function weaponGeometry(id){
    if(weaponShapes.has(id))return weaponShapes.get(id);
    const {grid}=weaponPattern(id),positions=[],normals=[],colors=[];
    for(let y=0;y<16;y++)for(let x=0;x<16;x++)if(grid[y][x]){
        const box=new THREE.BoxGeometry(.065,.065,.065).toNonIndexed();box.translate((x-7.5)*.065,(7.5-y)*.065,0);
        positions.push(...box.attributes.position.array);normals.push(...box.attributes.normal.array);
        const color=new THREE.Color(grid[y][x]);for(let n=0;n<box.attributes.position.count;n++)colors.push(color.r,color.g,color.b);box.dispose();
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeBoundingSphere();weaponShapes.set(id,geo);return geo;
}
function buildWeaponModel(id){
    const mesh=new THREE.Mesh(weaponGeometry(id).clone(),new THREE.MeshLambertMaterial({vertexColors:true}));mesh.userData.modItem=true;mesh.userData.weaponId=id;return mesh;
}
function buildGrippedWeapon(id){
    const mesh=buildWeaponModel(id);
    const diagonal=!!SWORD_DAMAGE[id]||id===34||id===54;
    const grip=diagonal?[3,13]:id===35?[4,11]:id===55?[10,10]:id===57||id===58?[7.5,14]:[7.5,12];
    const size=id===35?.52:SWORD_DAMAGE[id]?.62:.68;
    mesh.scale.setScalar(size);mesh.rotation.set(0,SWORD_DAMAGE[id]?Math.PI/4:0,diagonal?Math.PI/4:0);
    // Place the handle at the animation origin, not the middle of the blade.
    mesh.position.set((grip[0]-7.5)*.065,(7.5-grip[1])*.065,0)
        .multiplyScalar(-size).applyEuler(mesh.rotation);
    return mesh;
}
function buildFirstPersonWeapon(id){
    const group=buildFirstPersonRig(false),weapon=buildGrippedWeapon(id);
    group.userData.weaponId=id;group.userData.weapon=weapon;group.add(weapon);return group;
}
function buildFirstPersonHand(){
    return buildFirstPersonRig();
}
function handSwingProfile(id,action){
    if(action==='use')return id===57?'thrust':id===35||id===56?'recoil':'release';
    if(id===0)return 'punch';
    if(SWORD_DAMAGE[id])return 'sword';
    return id===34?'pickaxe':id===54?'axe':id===58?'mace':id===57?'thrust':'tap';
}
function sampleHandPose(profile,progress,out=handPose){
    const frames=HAND_SWING_POSES[profile],t=Math.max(0,Math.min(1,progress));
    let index=1;while(index<frames.length-1&&t>frames[index][0])index++;
    const a=frames[index-1],b=frames[index],u=(t-a[0])/(b[0]-a[0]),ease=u*u*(3-2*u);
    for(let i=0;i<6;i++)out[i]=a[i+1]+(b[i+1]-a[i+1])*ease;
    return out;
}
function applyHandPose(pose){
    const viewScale=Math.min(1,Math.max(.3,camera.aspect/1.1));
    const x=Math.min(.4,camera.aspect*.4)-(1-viewScale)*.23;
    const id=heldItemGroup.userData.itemId,vertical=!!SWORD_DAMAGE[id]||[34,54,58].includes(id);
    const z=vertical?-1.05:-.8;
    // Keep the forearm entering from below the viewport even when portrait framing scales it down.
    const handY=vertical?-.26-(1-viewScale)*.52:-.4;
    heldItemGroup.scale.setScalar(playerScale*viewScale);
    heldItemGroup.position.set((x+pose[0]*viewScale)*playerScale,
        (handY+pose[1]*viewScale)*playerScale,(z+pose[2]*viewScale)*playerScale);
    // Align the vertical swing plane with the eye so perspective does not turn it into a diagonal slash.
    heldItemGroup.rotation.order=vertical?'YXZ':'XYZ';
    heldItemGroup.rotation.set(pose[3],pose[4]+(vertical?Math.atan2(-x,-z):0),pose[5]);
    const arm=heldItemGroup.children[0]?.userData.gripArm;
    if(arm)arm.rotation.x=-pose[3]-(vertical?.08:.32);
}
function resetHandAnimation(){handSwing=0;handPose.fill(0);applyHandPose(handPose);}
function startHandAnimation(action='melee'){handSwing=HAND_SWING_SECONDS;handSwingItem=currentBlock;handSwingAction=action;}
function beginHandSwing(){
    if(handCooldown>0)return false;
    handCooldown=HAND_SWING_SECONDS;startHandAnimation();return true;
}
function updateHandSwing(delta){
    if(!controls.isLocked||isSleeping||worldLoading){resetHandAnimation();return;}
    if(handSwingItem!==currentBlock)resetHandAnimation();
    const previousCooldown=handCooldown;
    handCooldown=Math.max(0,handCooldown-delta);handSwing=Math.max(0,handSwing-delta);
    if(miningState&&handCooldown===0){
        beginHandSwing();
        const remainder=Math.max(0,delta-previousCooldown)%HAND_SWING_SECONDS;
        handSwing-=remainder;handCooldown-=remainder;
    }
    const t=handSwing?1-handSwing/HAND_SWING_SECONDS:0;
    applyHandPose(sampleHandPose(handSwingProfile(handSwingItem,handSwingAction),t));
}
function initAdventureItems(){
    for(const [text,name] of Object.entries(ADVENTURE_ITEMS)){
        const id=Number(text);NATURE_ITEMS[id]=name;
        const slot=document.createElement('button');slot.className='slot';slot.id='inv-'+(id-12);slot.textContent=name;slot.onclick=()=>selectSlot(id-12);
        document.getElementById(ADVENTURE_EGGS.has(id)?'tab-mods':'tab-weapon').append(slot);
        if(ADVENTURE_EGGS.has(id))materials[id]=new THREE.MeshLambertMaterial({color:id===WARDEN_EGG?0x244f59:id===PILLAGER_EGG?0x9a9994:0x956842});
    }
    TOOL_ITEMS.push(WOOD_SWORD,STONE_SWORD,GOLD_SWORD,SAPPHIRE_SWORD);
    recipes.push({ing:{[OAK_PLANKS_ID]:2,4:1},out:WOOD_SWORD,count:1},{ing:{3:2,4:1},out:STONE_SWORD,count:1},{ing:{[GOLD_INGOT]:2,4:1},out:GOLD_SWORD,count:1},{ing:{38:2,4:1},out:SAPPHIRE_SWORD,count:1});
    Object.assign(COMMAND_ITEMS,{'木剑':WOOD_SWORD,'石剑':STONE_SWORD,'金剑':GOLD_SWORD,'蓝宝石剑':SAPPHIRE_SWORD,'掠夺者':PILLAGER_EGG,'掠夺者刷怪蛋':PILLAGER_EGG,'监守者':WARDEN_EGG,'坚守者':WARDEN_EGG,'监守者刷怪蛋':WARDEN_EGG,'马':HORSE_EGG,'马刷怪蛋':HORSE_EGG});
    for(const id of WEAPON_IDS){
        const {canvas}=weaponPattern(id),map=new THREE.CanvasTexture(canvas);map.magFilter=map.minFilter=THREE.NearestFilter;
        materials[id]=new THREE.MeshLambertMaterial({map,transparent:true,alphaTest:.5});
        const slot=document.getElementById('inv-'+Object.keys(getInventorySlotMapping()).find(k=>getInventorySlotMapping()[k]===id));
        if(slot){slot.querySelector('img')?.remove();const img=document.createElement('img');img.alt='';img.src=canvas.toDataURL();slot.prepend(img);itemIcons.set(id,img.src);}
    }
    for(const id of ADVENTURE_EGGS){const canvas=document.createElement('canvas');canvas.width=canvas.height=16;const c=canvas.getContext('2d');c.fillStyle='#'+materials[id].color.getHexString();c.fillRect(4,4,8,9);c.fillRect(6,2,4,13);c.fillStyle=id===WARDEN_EGG?'#70b9b5':'#494644';c.fillRect(5,6,3,3);c.fillRect(9,10,2,2);const img=document.createElement('img');img.alt='';img.src=canvas.toDataURL();document.getElementById('inv-'+(id-12)).prepend(img);}
}
