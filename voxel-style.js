const SPIKE_TRAP_ID=237,OAK_PLANKS_ID=238,STONE_BRICKS_ID=239,QUARTZ_BLOCK_ID=240;
const CRAFT_STYLE_ITEMS={238:'Oak Planks',239:'Stone Bricks',240:'Quartz Block'};
const CRAFT_STYLE_COLORS={238:0xba965d,239:0x92968f,240:0xeeeae2};
Object.assign(NATURE_ITEMS,CRAFT_STYLE_ITEMS);HOME_ITEMS[SPIKE_TRAP_ID]='Spike Trap';
const voxelSkinCache=new Map();
function pixelPattern(key,colors,draw){
    if(voxelSkinCache.has(key))return voxelSkinCache.get(key);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=16;const c=canvas.getContext('2d');
    let state=Array.from(key).reduce((n,ch)=>Math.imul(n,31)+ch.charCodeAt(0),17)>>>0;
    const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    for(let y=0;y<16;y++)for(let x=0;x<16;x++){c.fillStyle=colors[Math.floor(rand()*colors.length)];c.fillRect(x,y,1,1);}
    const rect=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};if(draw)draw(rect,rand);
    const texture=new THREE.CanvasTexture(canvas);texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;voxelSkinCache.set(key,texture);return texture;
}
function classicBlockTexture(type){
    const dirt=['#806047','#89664b','#75573f','#967257'];
    if(type==='dirt')return pixelPattern(type,dirt,(r)=>{for(const [x,y] of [[2,4],[11,1],[6,12],[13,9]])r(x,y,2,1,'#8b8881');});
    if(type==='grass_top')return pixelPattern(type,['#699449','#729b4e','#648e43','#7aa153']);
    if(type==='grass_side')return pixelPattern(type,dirt,(r,rand)=>{r(0,0,16,2,'#689146');for(let x=0;x<16;x++)r(x,1,1,1+Math.floor(rand()*3),['#699449','#7aa153','#648e43'][x%3]);});
    if(type==='stone')return pixelPattern(type,['#888b85','#8e918b','#94978f','#858882'],(r)=>{for(const [x,y,w] of [[1,3,4],[8,7,5],[3,12,6]]){r(x,y,w,1,'#7b7f79');r(x+1,y+1,w-1,1,'#9b9e96');}});
    if(type==='wood_side')return pixelPattern(type,['#726040','#796647','#806b48'],(r,rand)=>{for(let x=1;x<16;x+=3)for(let y=0;y<16;y+=5){r(x,y,1,3+Math.floor(rand()*3),'#574a34');r(x+1,y+1,1,3,'#8a7550');}});
    if(type==='wood_top')return pixelPattern(type,['#b79761','#c1a06a'],(r)=>{for(const d of [1,4,7]){r(d,d,16-2*d,1,'#907442');r(d,15-d,16-2*d,1,'#907442');r(d,d,1,16-2*d,'#907442');r(15-d,d,1,16-2*d,'#907442');}});
    if(type===OAK_PLANKS_ID)return pixelPattern('planks',['#bc995f','#b59259','#c2a06b'],(r)=>{for(let y=3;y<16;y+=4){r(0,y,16,1,'#8d7146');r((y===7?11:5),y-3,1,3,'#94774a');}r(7,1,5,1,'#cfad75');r(1,9,6,1,'#a3814c');});
    if(type===STONE_BRICKS_ID)return pixelPattern('stone-bricks',['#8e938d','#979b94','#92968f'],(r)=>{for(let y=7;y<16;y+=8){r(0,y,16,1,'#626860');r(y===7?8:3,y-7,1,7,'#626860');r(0,y-6,16,1,'#a6aaa2');}});
    if(type===QUARTZ_BLOCK_ID)return pixelPattern('quartz',['#efede7','#ebe8e0','#f1efe8'],(r)=>{r(0,15,16,1,'#d6d3ca');r(15,0,1,16,'#dfdcd3');r(1,1,14,1,'#faf9f2');});
    return null;
}
function skinMaterial(key,colors,draw){
    const map=pixelPattern(key,colors,draw);
    // Keep close-up pixels crisp, but filter minified skins while mobs move.
    map.minFilter=THREE.NearestMipmapLinearFilter;
    return new THREE.MeshLambertMaterial({map});
}
function skinnedPart(parent,w,h,d,material,x,y,z,name){
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);parent.add(mesh);
    if(name){mesh.name=name;parent.userData[name]=mesh;}return mesh;
}
function jointLeg(root,x,y,z,width,length,material,name,hoof=0x39372f){
    const joint=new THREE.Group();joint.position.set(x,y,z);joint.name=name;root.add(joint);root.userData[name]=joint;
    skinnedPart(joint,width,length-.12,width,material.clone(),0,-(length-.12)/2,0);
    addModelBox(joint,width,.12,width,hoof,0,-length+.06,0);return joint;
}
function faceMaterial(kind){
    const villager=kind==='villager',pig=kind==='pig',sheep=kind==='sheep';
    return skinMaterial(kind+'-face',villager?['#bd9169','#c59a73']:pig?['#eeb0ae','#e4a09f']:sheep?['#bcac99','#c4b6a3']:['#593e2e','#634633'],r=>{
        if(villager){r(2,5,12,1,'#4b3528');r(3,7,3,2,'#f3f0d9');r(10,7,3,2,'#f3f0d9');r(4,7,1,2,'#487f54');r(10,7,1,2,'#487f54');r(6,13,4,1,'#6a4c3d');}
        else {r(2,5,4,3,'#f5f3e9');r(10,5,4,3,'#f5f3e9');r(4,5,2,3,'#282b27');r(10,5,2,3,'#282b27');if(sheep){r(5,10,6,3,'#ba8d85');r(7,12,2,2,'#62524c');}}
    });
}
function buildLivestock(type){
    const group=new THREE.Group(),horse=type==='horse',pig=type==='pig',sheep=type==='sheep';
    const skin=skinMaterial(type+'-body',horse?['#9b6842','#9f6c45','#95623d']:pig?['#eaa6a2','#edadaa','#e5a09d']:sheep?['#e9e8dd','#e2e2d7','#f1f0e5']:['#594132','#604738','#533b2c'],(r)=>{
        if(!pig&&!horse&&!sheep)for(const [x,y,w,h] of [[0,0,5,4],[2,4,4,3],[9,7,6,5],[7,11,5,5],[12,0,4,3]])r(x,y,w,h,'#e6e2d6');
        if(sheep)for(const [x,y] of [[2,3],[8,7],[12,1],[3,12]]){r(x,y,3,1,'#d4d5ca');r(x+2,y,1,3,'#d4d5ca');}
        if(pig){r(2,4,3,2,'#dc9592');r(10,11,3,2,'#f4b6b0');}
    });
    const legLength=horse?.73:pig?.34:.47,bodyY=-.5+legLength+.28,bodyH=sheep?.7:horse?.72:pig?.53:.65,bodyW=sheep?.85:horse?.72:pig?.7:.78,bodyD=horse?1.35:1.12;
    skinnedPart(group,bodyW,bodyH,bodyD,skin,0,bodyY,0,'body');
    const headY=horse?1.04:bodyY+.14,headZ=horse?.64:.72;
    const head=new THREE.Group();head.position.set(0,headY,headZ);group.add(head);group.userData.head=head;
    if(horse){
        skinnedPart(group,.34,.75,.43,skin.clone(),0,.76,.52);skinnedPart(head,.38,.43,.62,skin.clone(),0,0,0);
        addModelBox(head,.39,.2,.28,0xb38a64,0,-.12,.35);
        for(const side of [-1,1]){addModelBox(head,.07,.19,.11,0x815636,side*.12,.3,-.18);addModelBox(head,.012,.085,.09,0x161c1b,side*.195,.04,.12);addModelBox(head,.015,.035,.035,0xf5efe2,side*.204,.06,.1);}
        addModelBox(group,.12,.7,.12,0x332b24,0,.8,.35);addModelBox(head,.12,.1,.42,0x332b24,0,.24,-.08);
        addModelBox(group,.14,.64,.16,0x332b24,0,bodyY-.17,-.74).rotation.x=-.23;
    }else{
        const h=sheep?.39:.43,side=skin.clone(),face=faceMaterial(type);
        skinnedPart(head,.48,h,.43,[side,side,side,side,face,side],0,0,0);
        if(sheep){skinnedPart(head,.53,.16,.46,skin.clone(),0,.23,-.03);}
        else{
            const snout=new THREE.MeshLambertMaterial({map:pixelPattern(type+'-muzzle',pig?['#dc8f93']:['#b79f87'],r=>{r(3,6,3,4,'#795b55');r(10,6,3,4,'#795b55');})});
            skinnedPart(head,.31,pig?.19:.18,.15,snout,0,-.09,.28);
        }
        for(const side of [-1,1]){
            addModelBox(head,.17,.1,.16,pig?0xd98d90:sheep?0xc8b9a0:0x735744,side*.29,.08,-.02);
            if(!pig&&!sheep)addModelBox(head,.095,.19,.1,0xd0c8b4,side*.24,.27,-.07);
        }
        if(!pig&&!sheep)addModelBox(group,.29,.15,.34,0xc8948a,0,bodyY-bodyH/2-.03,-.18);
        addModelBox(group,.09,pig?.12:.25,.09,pig?0xd48e90:sheep?0xe9e8dd:0x7a6756,0,bodyY-.06,-bodyD/2-.04);
    }
    const legMat=skinMaterial(type+'-legs',pig?['#dc9694','#e5a09d']:sheep?['#b2a38f','#bbaa94']:horse?['#825536','#8b5c3c']:['#72614f','#806d57']);
    for(const [name,x,z] of [['leftLeg',-.25,.37],['rightLeg',.25,.37],['backLeftLeg',-.25,-.37],['backRightLeg',.25,-.37]])jointLeg(group,x,-.5+legLength,z,horse?.18:.19,legLength,legMat,name,pig?0x9b7470:0x403d35);
    group.userData.mobHeight=horse?1.95:sheep?1.25:pig?1.04:1.3;group.userData.mobRadius=horse?.76:.65;
    rememberOriginalMaterials(group);return group;
}
function buildCreeper(){
    const group=new THREE.Group(),colors=['#528c38','#70a74b','#80b75b','#417830'];
    const speckles=r=>{for(const [x,y,color] of [[0,0,'#a2c87a'],[6,2,'#aacb82'],[12,0,'#355e27'],[0,8,'#bad499'],[10,10,'#386a29'],[4,14,'#91b767']])r(x,y,2,2,color);};
    const skin=skinMaterial('creeper-hide',colors,speckles),face=skinMaterial('creeper-face',colors,r=>{
        // Coarse, square facial pixels; the expression belongs on the front only.
        speckles(r);r(2,4,4,4,'#10180d');r(10,4,4,4,'#10180d');r(6,8,4,2,'#152010');
        r(4,10,8,4,'#10180d');r(4,14,2,2,'#10180d');r(10,14,2,2,'#10180d');
    });
    skinnedPart(group,.56,.56,.56,[skin,skin,skin,skin,face,skin],0,.92,0,'head');
    skinnedPart(group,.42,.76,.3,skin,0,.26,0,'body');
    for(const [name,x,z] of [['leftLeg',-.19,.2],['rightLeg',.19,.2],['backLeftLeg',-.19,-.2],['backRightLeg',.19,-.2]])jointLeg(group,x,-.1,z,.25,.4,skin,name,0x41652f);
    rememberOriginalMaterials(group);return group;
}
function buildZombie(){
    const group=new THREE.Group(),greens=['#4a6637','#506d3d','#456033'];
    const skin=skinMaterial('zombie-skin',greens,r=>{r(2,2,4,2,'#5d7546');r(10,10,4,4,'#3c552d');});
    const face=skinMaterial('zombie-face',greens,r=>{
        r(0,0,16,2,'#3d542e');r(0,2,4,4,'#415a30');r(12,0,4,4,'#394e2b');
        r(2,6,4,2,'#172513');r(10,6,4,2,'#172513');r(6,8,4,4,'#40582e');
        r(4,12,8,4,'#334b27');r(6,12,4,2,'#263d21');r(2,10,2,2,'#5b7545');
    });
    const shirt=skinMaterial('zombie-shirt',['#329997','#389f9c','#2e8d8e'],r=>{r(6,0,4,2,'#587f3c');r(2,13,2,3,'#467f72');r(11,14,3,2,'#608a43');});
    const pants=skinMaterial('zombie-pants',['#504b83','#56518b','#4a467a'],r=>{r(2,10,3,2,'#666094');r(11,6,2,4,'#403b65');});
    skinnedPart(group,.5,.5,.5,[skin,skin,skin,skin,face,skin],0,1.2,0,'head');
    skinnedPart(group,.52,.7,.28,shirt,0,.6,0,'body');
    for(const [name,x] of [['leftArm',-.39],['rightArm',.39]]){
        const joint=new THREE.Group();joint.position.set(x,.9,0);joint.rotation.x=-Math.PI/2;group.add(joint);group.userData[name]=joint;
        skinnedPart(joint,.24,.24,.24,shirt.clone(),0,-.12,0);skinnedPart(joint,.24,.48,.24,skin.clone(),0,-.48,0);
    }
    jointLeg(group,-.135,.25,0,.24,.75,pants,'leftLeg',0x414453);jointLeg(group,.135,.25,0,.24,.75,pants,'rightLeg',0x414453);
    rememberOriginalMaterials(group);return group;
}
function buildVillager(){
    const group=new THREE.Group(),robe=skinMaterial('villager-robe',['#775746','#7c5d4b','#725341'],r=>{r(0,12,16,2,'#554233');r(7,1,2,10,'#9c7d5c');});
    skinnedPart(group,.62,.98,.38,robe,0,.43,0,'body');
    const face=faceMaterial('villager'),skin=skinMaterial('villager-skin',['#bf956f','#c69c76']);
    const head=skinnedPart(group,.53,.58,.5,[skin,skin,skin,skin,face,skin],0,1.18,0,'head');
    addModelBox(head,.14,.29,.19,0xb48964,0,-.09,.32,'nose');
    const arms=new THREE.Group();arms.position.set(0,.6,.29);group.add(arms);
    addModelBox(arms,.7,.2,.23,0x765443,0,0,0);addModelBox(arms,.25,.14,.04,0xbd9169,0,-.015,.13);
    group.userData.leftArm=arms;group.userData.rightArm=arms;
    const legs=skinMaterial('villager-shoes',['#514436','#5c4b3b']);jointLeg(group,-.16,.1,0,.23,.6,legs,'leftLeg');jointLeg(group,.16,.1,0,.23,.6,legs,'rightLeg');
    rememberOriginalMaterials(group);return group;
}
function buildPlayerAvatar(){
    return buildSkinAvatar();
}
function buildSpikeTrap(){
    const group=new THREE.Group();addModelBox(group,.98,.12,.98,0x596064,0,-.44,0);
    for(const x of [-.3,0,.3])for(const z of [-.3,0,.3]){
        const cone=new THREE.Mesh(new THREE.ConeGeometry(.14,.88,4),new THREE.MeshLambertMaterial({color:0xb6c3c8}));cone.position.set(x,.06,z);cone.rotation.y=Math.PI/4;group.add(cone);
    }return group;
}
function initVoxelStyle(){
    recipes.push({ing:{4:4},out:OAK_PLANKS_ID,count:16},{ing:{3:4},out:STONE_BRICKS_ID,count:4},{ing:{51:4},out:QUARTZ_BLOCK_ID,count:4},{ing:{[IRON_INGOT]:2,3:1},out:SPIKE_TRAP_ID,count:2});
    Object.assign(COMMAND_ITEMS,{'尖刺':SPIKE_TRAP_ID,'尖刺陷阱':SPIKE_TRAP_ID,'木板':OAK_PLANKS_ID,'橡木板':OAK_PLANKS_ID,'石砖':STONE_BRICKS_ID,'石英块':QUARTZ_BLOCK_ID});
}
