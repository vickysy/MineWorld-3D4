const LADDER_THICKNESS=.25,LADDER_SIDES=[[0,-1],[1,0],[0,1],[-1,0]];
let thinLadderGeometry=null;
function ladderFacing(x,y,z,cell=null){
    for(let i=0;i<LADDER_SIDES.length;i++){
        const [dx,dz]=LADDER_SIDES[i],type=cell?ladderRawMicroType(offsetMicroCell(cell,dx,0,dz)):getBlock(x+dx,y,z+dz);
        if(isSolidType(type)&&type!==SNOW_LAYER_ID&&!isTrapdoor(type))return i;
    }
    return 0;
}
function ladderRawMicroType(c){
    const coarse=microAncestor(c,1),parent=microParentKey(c.x,c.y,c.z),index=microIndex(coarse.mx,coarse.my,coarse.mz);
    let type=microPlacements.get(parent)?.get(index)??(microEdits.get(parent)?.has(index)?0:getBlock(c.x,c.y,c.z));
    for(let level=2;level<=(c.level||1);level++)type=fineVoxelEdits.get(detailKey(microAncestor(c,level)))??type;
    return type;
}
function ladderBounds(x,y,z,face,size=1){
    const min=new THREE.Vector3(x,y,z),max=min.clone().addScalar(size);
    if(face===0)max.z=z+size*LADDER_THICKNESS;
    else if(face===1)min.x=x+size*(1-LADDER_THICKNESS);
    else if(face===2)min.z=z+size*(1-LADDER_THICKNESS);
    else max.x=x+size*LADDER_THICKNESS;
    return new THREE.Box3(min,max);
}
function ladderMicroBounds(c){
    let root={x:c.x,y:c.y,z:c.z,mx:0,my:0,mz:0,level:0},size=1;
    const coarse=microAncestor(c,1),parent=microParentKey(c.x,c.y,c.z);
    if(microPlacements.get(parent)?.has(microIndex(coarse.mx,coarse.my,coarse.mz))){root=coarse;size=microCellSize(root);}
    for(let level=2;level<=(c.level||1);level++){const a=microAncestor(c,level);if(fineVoxelEdits.has(detailKey(a))){root=a;size=microCellSize(a);}}
    const face=ladderFacing(root.x,root.y,root.z,root.level?root:null),s=microCellSize(c);
    return ladderBounds(root.x-.5+root.mx*size,root.y-.5+root.my*size,root.z-.5+root.mz*size,face,size).intersect(
        new THREE.Box3(new THREE.Vector3(c.x-.5+c.mx*s,c.y-.5+c.my*s,c.z-.5+c.mz*s),new THREE.Vector3(c.x-.5+(c.mx+1)*s,c.y-.5+(c.my+1)*s,c.z-.5+(c.mz+1)*s)));
}
function ladderGeometry(){
    if(thinLadderGeometry)return thinLadderGeometry;
    const positions=[],normals=[],uvs=[];
    const part=(left,top,width,height,depth)=>{
        const geo=new THREE.BoxGeometry(width/64,height/64,depth).toNonIndexed();geo.translate((left+width/2)/64-.5,.5-(top+height/2)/64,-.5+depth/2);
        const uv=geo.attributes.uv;
        for(let i=0;i<uv.count;i++)uv.setXY(i,(left+.1+uv.getX(i)*(width-.2))/64,1-(top+.1+(1-uv.getY(i))*(height-.2))/64);
        positions.push(...geo.attributes.position.array);normals.push(...geo.attributes.normal.array);uvs.push(...uv.array);geo.dispose();
    };
    part(4,0,8,64,LADDER_THICKNESS);part(52,0,8,64,LADDER_THICKNESS);
    for(let y=10;y<64;y+=15)part(12,y,40,6,LADDER_THICKNESS);
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    thinLadderGeometry=geo;return geo;
}
