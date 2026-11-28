const PLAYER_SKIN_STORAGE='daniel-player-skin-v1';
const SKIN_PARTS={
    head:{label:'Head',size:[8,8,8],uv:[0,0],overlay:[32,0]},
    body:{label:'Body',size:[8,12,4],uv:[16,16],overlay:[16,32]},
    rightArm:{label:'Right Arm',size:[4,12,4],uv:[40,16],overlay:[40,32]},
    leftArm:{label:'Left Arm',size:[4,12,4],uv:[32,48],overlay:[48,48]},
    rightLeg:{label:'Right Leg',size:[4,12,4],uv:[0,16],overlay:[0,32]},
    leftLeg:{label:'Left Leg',size:[4,12,4],uv:[16,48],overlay:[0,48]}
};
let localPlayerSkin=null,localSkinPacket=null;
function skinCanvas(source){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
    if(source)canvas.getContext('2d').drawImage(source,0,0);return canvas;
}
function skinFaceRect(part,face,layer='base'){
    const p=SKIN_PARTS[part],[w,h,d]=p.size,[u,v]=layer==='overlay'?p.overlay:p.uv;
    return {right:[u,v+d,d,h],front:[u+d,v+d,w,h],left:[u+d+w,v+d,d,h],back:[u+2*d+w,v+d,w,h],top:[u+d,v,w,d],bottom:[u+d+w,v,w,d]}[face];
}
function defaultPlayerSkin(){
    const canvas=skinCanvas(),c=canvas.getContext('2d');
    for(const [part,p] of Object.entries(SKIN_PARTS))for(const face of ['right','front','left','back','top','bottom']){
        const [x,y,w,h]=skinFaceRect(part,face),head=part==='head',arm=part.endsWith('Arm'),leg=part.endsWith('Leg');
        for(let row=0;row<h;row++)for(let col=0;col<w;col++){
            let colors=head?['#d0a07e','#cb9a77']:leg?['#45536d','#414e67']:['#397d86','#438a92'];
            if(head&&(face==='top'||face==='back'||row<2&&face!=='bottom'))colors=['#49382b','#554232'];
            if(arm&&(face==='bottom'||row>=8&&face!=='top'))colors=['#d0a07e','#cb9a77'];
            if(leg&&(face==='bottom'||row>=10&&face!=='top'))colors=['#303737','#394040'];
            c.fillStyle=colors[(row*3+col*5)%7===0?1:0];c.fillRect(x+col,y+row,1,1);
        }
        if(head&&face==='front'){
            c.fillStyle='#f3efe4';c.fillRect(x+1,y+3,2,1);c.fillRect(x+5,y+3,2,1);
            c.fillStyle='#395b60';c.fillRect(x+2,y+3,1,1);c.fillRect(x+5,y+3,1,1);
            c.fillStyle='#a47155';c.fillRect(x+3,y+5,2,1);c.fillStyle='#80503e';c.fillRect(x+2,y+6,4,1);
        }
        if(part==='body'&&face==='front'){
            c.fillStyle='#284f58';c.fillRect(x+3,y,2,h);c.fillRect(x+1,y+5,2,2);c.fillStyle='#dec893';c.fillRect(x+6,y+5,1,1);
        }
    }return canvas;
}
function getLocalPlayerSkin(){
    if(!localPlayerSkin){
        localPlayerSkin=defaultPlayerSkin();
        try{const saved=decodeSkinPixels(localStorage.getItem(PLAYER_SKIN_STORAGE));if(saved)localPlayerSkin=saved;}catch{}
        localSkinPacket=encodeSkinPixels(localPlayerSkin);
    }return localPlayerSkin;
}
function encodeSkinPixels(canvas){
    const data=canvas.getContext('2d').getImageData(0,0,64,64).data;
    let binary='';for(let i=0;i<data.length;i++)binary+=String.fromCharCode(data[i]);return btoa(binary);
}
function decodeSkinPixels(text){
    if(typeof text!=='string'||text.length!==21848||!/^[A-Za-z0-9+/]+==$/.test(text))return null;
    let binary;try{binary=atob(text);}catch{return null;}if(binary.length!==16384)return null;
    const data=new Uint8ClampedArray(16384);for(let i=0;i<data.length;i++)data[i]=binary.charCodeAt(i);
    const canvas=skinCanvas();canvas.getContext('2d').putImageData(new ImageData(data,64,64),0,0);return canvas;
}
function flattenedPlayerSkin(source){
    const canvas=skinCanvas(),c=canvas.getContext('2d');
    c.fillStyle='#cb9a77';c.fillRect(0,0,64,64);c.drawImage(source,0,0);
    for(const part of Object.keys(SKIN_PARTS))for(const face of ['right','front','left','back','top','bottom']){
        const from=skinFaceRect(part,face,'overlay'),to=skinFaceRect(part,face);
        c.drawImage(source,...from,...to);
    }return canvas;
}
function playerSkinTexture(source){
    const map=new THREE.CanvasTexture(flattenedPlayerSkin(source));map.magFilter=THREE.NearestFilter;map.minFilter=THREE.NearestMipmapLinearFilter;return map;
}
function skinPartGeometry(part,w,h,d,heightSegments=1){
    const geometry=new THREE.BoxGeometry(w,h,d,1,heightSegments,1),uv=geometry.attributes.uv;
    ['left','right','top','bottom','back','front'].forEach((face,index)=>{
        const [x,y,width,height]=skinFaceRect(part,face);
        const group=geometry.groups[index],vertices=new Set();
        for(let i=group.start;i<group.start+group.count;i++)vertices.add(geometry.index.getX(i));
        for(const n of vertices)uv.setXY(n,(x+uv.getX(n)*width)/64,1-(y+(1-uv.getY(n))*height)/64);
    });return geometry;
}
function buildSkinAvatar(source=defaultPlayerSkin()){
    const group=new THREE.Group(),map=playerSkinTexture(source),material=new THREE.MeshLambertMaterial({map});
    group.userData.ownedTextures=[map];group.userData.skinTexture=map;
    const part=(name,w,h,d,parent,x,y,z)=>{
        const mesh=new THREE.Mesh(skinPartGeometry(name,w,h,d),material);mesh.position.set(x,y,z);mesh.name=name;mesh.userData.skinPart=name;parent.add(mesh);return mesh;
    };
    group.userData.head=part('head',.5,.5,.5,group,0,.6,0);
    group.userData.body=part('body',.5,.7,.29,group,0,0,0);
    for(const [name,x] of [['leftArm',.375],['rightArm',-.375],['leftLeg',.125],['rightLeg',-.125]]){
        const arm=name.endsWith('Arm'),joint=new THREE.Group();joint.name=name;joint.position.set(x,arm?.35:-.35,0);
        group.add(joint);group.userData[name]=joint;part(name,.25,arm?.7:.65,arm?.29:.27,joint,0,arm?-.35:-.325,0);
    }
    rememberOriginalMaterials(group);return group;
}
function applyAvatarSkin(model,source){
    const texture=model?.userData?.skinTexture;if(!texture)return;
    texture.image=flattenedPlayerSkin(source);texture.needsUpdate=true;
}
function buildFirstPersonRig(emptyHand=true){
    const group=new THREE.Group(),arm=new THREE.Group(),texture=playerSkinTexture(getLocalPlayerSkin());
    group.userData.modItem=true;group.userData.emptyHand=emptyHand;group.userData.gripArm=arm;group.userData.ownedTextures=[texture];
    const mesh=new THREE.Mesh(skinPartGeometry('rightArm',.2,.84,.22,3),new THREE.MeshLambertMaterial({map:texture}));
    mesh.userData.armBindPositions=mesh.geometry.attributes.position.array.slice();mesh.userData.armLength=.84;mesh.frustumCulled=false;
    // One continuous cuboid: the fist encloses the grip, sleeve and forearm cannot separate.
    mesh.rotation.z=Math.PI;mesh.position.y=-.355;mesh.userData.skinPart='rightArm';arm.add(mesh);arm.rotation.x=-.32;group.add(arm);return group;
}
const firstPersonArmMatrix=new THREE.Matrix4(),firstPersonArmBottom=new THREE.Vector3();
function anchorFirstPersonArm(){
    const rig=heldItemGroup.children[0],arm=rig?.userData.gripArm,mesh=arm?.children[0];
    if(!mesh?.userData.armBindPositions)return;
    heldItemGroup.updateMatrix();rig.updateMatrix();arm.updateMatrix();
    firstPersonArmMatrix.multiplyMatrices(heldItemGroup.matrix,rig.matrix).multiply(arm.matrix);
    const bottom=firstPersonArmBottom.set(0,-.775,0).applyMatrix4(firstPersonArmMatrix),m=firstPersonArmMatrix.elements;
    const edge=1.12*Math.tan(camera.fov*Math.PI/360),gap=bottom.y-edge*bottom.z,slope=-m[5]+edge*m[6];
    const length=.84+(gap>0&&slope<-.000001?Math.min(4,gap/-slope):0);
    if(Math.abs(length-mesh.userData.armLength)<.00001)return;
    // Extend only the sleeve vertices; fist size, skin pixels and the grip stay fixed.
    const position=mesh.geometry.attributes.position,base=mesh.userData.armBindPositions;
    for(let i=0;i<position.count;i++){
        const y=base[i*3+1];position.setY(i,y+Math.max(0,(y+.14)/.56)*(length-.84));
    }
    position.needsUpdate=true;mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();mesh.userData.armLength=length;
}
function savePlayerSkin(source){
    localPlayerSkin=skinCanvas(source);localSkinPacket=encodeSkinPixels(localPlayerSkin);
    let stored=true;try{localStorage.setItem(PLAYER_SKIN_STORAGE,localSkinPacket);}catch{stored=false;}
    if(localPlayerModel)applyAvatarSkin(localPlayerModel,localPlayerSkin);
    updateHeldItem3D(currentBlock);return stored;
}
function normalizedSkinImage(image){
    if(image.width!==64||![32,64].includes(image.height))throw new Error('Choose a 64 x 64 or 64 x 32 PNG skin.');
    const canvas=skinCanvas(),c=canvas.getContext('2d');c.drawImage(image,0,0);
    if(image.height===32){
        for(const [left,right] of [['leftArm','rightArm'],['leftLeg','rightLeg']])for(const face of ['right','front','left','back','top','bottom']){
            const sourceFace=face==='left'?'right':face==='right'?'left':face;
            const from=skinFaceRect(right,sourceFace),[x,y,w,h]=skinFaceRect(left,face);
            c.save();c.translate(x+w,y);c.scale(-1,1);c.drawImage(image,...from,0,0,w,h);c.restore();
        }
    }return canvas;
}
let skinPacketSequence=0;
function sendSkinPackets(conn,id,pixels){
    const stamp=++skinPacketSequence;
    // PeerJS JSON messages must remain below 16,300 bytes, including their envelope.
    return sendRoomPacket(conn,{type:'skin',id,stamp,part:0,pixels:pixels.slice(0,10924)})&&
        sendRoomPacket(conn,{type:'skin',id,stamp,part:1,pixels:pixels.slice(10924)});
}
function receiveRoomSkinPart(r,id,packet){
    if(typeof id!=='string'||!id.length||id.length>180||['__proto__','prototype','constructor'].includes(id)||id===r.peer.id||
        !Number.isSafeInteger(packet.stamp)||packet.stamp<1||![0,1].includes(packet.part)||typeof packet.pixels!=='string'||packet.pixels.length!==10924)return false;
    const pending=r.skinTransfers||(r.skinTransfers=new Map()),now=performance.now();
    for(const [key,value] of pending)if(now-value.time>5000)pending.delete(key);
    if(packet.part===0){
        if(pending.size>=8&&!pending.has(id))return false;
        pending.set(id,{stamp:packet.stamp,pixels:packet.pixels,time:now});return false;
    }
    const first=pending.get(id);if(!first||first.stamp!==packet.stamp)return false;
    pending.delete(id);return receiveRoomSkin(r,id,first.pixels+packet.pixels);
}
function sendLocalRoomSkin(r,entry){
    getLocalPlayerSkin();const now=performance.now();
    if(!r.peer?.id||entry.sentSkin===localSkinPacket||now-(entry.lastSkinSend??-2000)<1100)return;
    if(sendSkinPackets(entry.conn,r.peer.id,localSkinPacket)){entry.sentSkin=localSkinPacket;entry.lastSkinSend=now;}
}
function receiveRoomSkin(r,id,pixels){
    if(typeof id!=='string'||!id.length||id.length>180||['__proto__','prototype','constructor'].includes(id)||id===r.peer.id||r.skins.get(id)===pixels)return false;
    if(r.skins.size>=8&&!r.skins.has(id))return false;
    const canvas=decodeSkinPixels(pixels);if(!canvas)return false;
    r.skins.set(id,pixels);const model=remotePlayers[id];applyAvatarSkin(model,canvas);if(model)model.userData.skinPixels=pixels;return true;
}
