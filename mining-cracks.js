const miningCrackMaterials=[];
function miningCrackMaterial(stage){
    if(miningCrackMaterials[stage])return miningCrackMaterials[stage];
    // An original pixel fracture graph: reveal connected branches, never a filled mask.
    const paths=[
        [[8,8],[7,7],[7,5],[5,4],[5,2],[3,1],[1,1]],
        [[8,8],[9,7],[10,7],[11,5],[12,5],[13,3],[14,1]],
        [[8,8],[9,9],[9,11],[11,12],[12,14],[14,14]],
        [[8,8],[7,9],[5,9],[4,11],[2,11],[1,13]],
        [[7,5],[9,4],[10,2],[10,1]],
        [[5,9],[4,7],[2,6],[1,6]],
        [[9,11],[7,12],[7,14],[5,14],[4,15]],
        [[11,5],[12,7],[14,8],[15,8]],
        [[11,12],[13,11],[15,12]],
        [[5,4],[3,4],[2,3]],
        [[4,11],[5,13],[4,14]]
    ];
    const cells=new Map();
    for(const path of paths)for(let i=1;i<path.length;i++){
        const [x,y]=path[i-1],[a,b]=path[i],steps=Math.max(Math.abs(a-x),Math.abs(b-y));
        for(let j=0;j<=steps;j++){const p=[Math.round(x+(a-x)*j/steps),Math.round(y+(b-y)*j/steps)];cells.set(p.join(','),p);}
    }
    const visited=new Set(['8,8']),ordered=[[8,8]];
    for(let i=0;i<ordered.length;i++){
        const [x,y]=ordered[i];
        for(const [dx,dy] of [[-1,-1],[1,1],[1,-1],[-1,1],[0,-1],[0,1],[-1,0],[1,0]]){
            const key=[x+dx,y+dy].join(',');if(cells.has(key)&&!visited.has(key)){visited.add(key);ordered.push(cells.get(key));}
        }
    }
    const canvas=document.createElement('canvas');canvas.width=canvas.height=16;const ctx=canvas.getContext('2d');
    const count=Math.min(ordered.length,2+Math.round((ordered.length-2)*stage/9));
    ctx.fillStyle='rgba(116,116,116,0.25)';for(const [x,y] of ordered.slice(0,count))ctx.fillRect(x+1,y+1,1,1);
    ctx.fillStyle='rgba(57,57,57,0.78)';for(const [x,y] of ordered.slice(0,count))ctx.fillRect(x,y,1,1);
    const map=new THREE.CanvasTexture(canvas);map.magFilter=map.minFilter=THREE.NearestFilter;map.generateMipmaps=false;
    return miningCrackMaterials[stage]=new THREE.MeshBasicMaterial({map,transparent:true,depthTest:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
}
function createBlockCrackOverlay(pos,progress){
    const stage=Math.min(9,Math.max(0,Math.floor(progress*10)));
    const geometry=new THREE.BoxGeometry(1.004,1.004,1.004),mesh=new THREE.Mesh(geometry,miningCrackMaterial(stage));
    mesh.position.copy(pos);mesh.userData.disposeList=[geometry];mesh.userData.stage=stage;return mesh;
}
