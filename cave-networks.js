const caveNetworkRegions=new Map(),caveNetworkColumns=new Map();
let caveNetworkIdentity='';
const CAVE_NEIGHBORS=[[0,0],[1,0],[-1,0],[0,1],[0,-1]];
function naturalCavesEnabled(){return wildernessVersion>=5&&currentDimension==='overworld'&&!['moon','city'].includes(selectedTerrain);}
function clearCaveNetworks(){caveNetworkRegions.clear();caveNetworkColumns.clear();caveNetworkIdentity='';}
function checkCaveNetworkIdentity(){
    const identity=seed+':'+selectedTerrain+':'+wildernessVersion;
    if(identity!==caveNetworkIdentity){clearCaveNetworks();caveNetworkIdentity=identity;}
}
function cacheCaveColumn(key,value){
    if(caveNetworkColumns.size>=70000){let count=10000;for(const old of caveNetworkColumns.keys()){caveNetworkColumns.delete(old);if(--count===0)break;}}
    caveNetworkColumns.set(key,value);return value;
}
function naturalCaveRegion(cx,cz){
    checkCaveNetworkIdentity();
    const key=cx+','+cz;if(caveNetworkRegions.has(key))return caveNetworkRegions.get(key);
    if(caveNetworkRegions.size>=1024)caveNetworkRegions.delete(caveNetworkRegions.keys().next().value);
    const cliff=selectedTerrain==='random'?cliffRegion(cx*96,cz*96):null;
    if(selectedTerrain==='random'&&!cliff){caveNetworkRegions.set(key,null);return null;}
    const r=hash(cx+1221,cz-183),sign=r<.5?-1:1;
    const x=cliff?.x??cx*96+40,z=cliff?.z??cz*96+40;
    const [nx,nz]=cliff?[cliff.nx,cliff.nz]:[[1,0],[0,1],[-1,0],[0,-1]][Math.floor(r*4)];
    const y=cliff?cliff.floor+2:Math.min(...CAVE_NEIGHBORS.map(([dx,dz])=>getSurfaceHeight(x+dx*24,z+dz*24)))-9;
    const node=(u,v,dy)=>({x:x+nx*u-nz*v,y:y+dy,z:z+nz*u+nx*v});
    const points=[node(-7,0,0),node(10,0,-1),node(26,sign*3,-7),node(43,0,-17),node(64,sign*4,-27),
        node(32,sign*18,-11),node(50,sign*22,-21),node(40,-sign*19,-14),node(24,-sign*26,-20)];
    for(let i=2;i<points.length;i++){
        points[i].x+=(hash(cx+i*13,cz-711)-.5)*5;points[i].z+=(hash(cx+751,cz+i*11)-.5)*5;
        points[i].y+=(hash(cx+i*7,cz+981)-.5)*3;
    }
    const edges=[[0,1],[1,2],[2,3],[3,4],[2,5],[5,6],[6,4],[2,7],[7,3],[7,8]];
    const tubes=edges.map(([a,b],i)=>({a:points[a],b:points[b],rx:i===0?3.7:2.6+hash(cx+i,cz+289)*.7,ry:i===0?2.3:2.5}));
    const rooms=[{p:points[2],rx:6,rz:5,ry:3.4},{p:points[3],rx:8+r*2,rz:8,ry:5.2},
        {p:points[6],rx:6,rz:6,ry:4},{p:points[8],rx:5,rz:5,ry:3.5},{p:points[4],rx:5,rz:6,ry:3.5}];
    const region={x,y,z,nx,nz,mouth:!!cliff,points,tubes,rooms};
    caveNetworkRegions.set(key,region);return region;
}
function mergeCaveRanges(ranges){
    ranges.sort((a,b)=>a[0]-b[0]);const result=[];
    for(const range of ranges){const last=result[result.length-1];if(last&&range[0]<=last[1]+1)last[1]=Math.max(last[1],range[1]);else result.push(range.slice());}
    return result;
}
function naturalCaveColumn(x,z,h=getSurfaceHeight(x,z)){
    if(!naturalCavesEnabled())return [];
    checkCaveNetworkIdentity();const key=x+','+z;
    if(caveNetworkColumns.has(key))return caveNetworkColumns.get(key);
    if(selectedTerrain==='random'&&biomeColumn(x,z).village)return cacheCaveColumn(key,[]);
    const ranges=[],cx=Math.floor(x/96),cz=Math.floor(z/96);
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
        const region=naturalCaveRegion(cx+dx,cz+dz);if(!region)continue;
        const px=x-region.x,pz=z-region.z,u=px*region.nx+pz*region.nz,v=-px*region.nz+pz*region.nx;
        if(u< -12||u>72||Math.abs(v)>34)continue;
        // Only the cliff mouth may break the surface. Elsewhere leave a solid roof, including under water.
        const roof=region.mouth&&u>=-11&&u<=9&&Math.abs(v)<=4&&h>SEA_LEVEL+2?h:h-4;
        const add=(center,radius)=>{const low=Math.max(-60,Math.ceil(center-radius)),high=Math.min(roof,Math.floor(center+radius));if(low<=high)ranges.push([low,high]);};
        for(const tube of region.tubes){
            const vx=tube.b.x-tube.a.x,vz=tube.b.z-tube.a.z;
            const t=THREE.MathUtils.clamp(((x-tube.a.x)*vx+(z-tube.a.z)*vz)/(vx*vx+vz*vz),0,1);
            const distance=((x-tube.a.x-vx*t)**2+(z-tube.a.z-vz*t)**2)/(tube.rx*tube.rx);
            if(distance<1)add(THREE.MathUtils.lerp(tube.a.y,tube.b.y,t),tube.ry*Math.sqrt(1-distance));
        }
        for(const room of region.rooms){const distance=((x-room.p.x)/room.rx)**2+((z-room.p.z)/room.rz)**2;if(distance<1)add(room.p.y,room.ry*Math.sqrt(1-distance));}
    }
    return cacheCaveColumn(key,mergeCaveRanges(ranges));
}
function naturalCaveAt(x,y,z,h){
    if(y>h||y< -60)return false;
    for(const [low,high] of naturalCaveColumn(x,z,h)){if(y<low)return false;if(y<=high)return true;}return false;
}
function naturalCaveScanRanges(x,z){
    const ranges=[];
    // Include the adjacent solid columns: cave walls must render even if this column contains no air.
    for(const [dx,dz] of CAVE_NEIGHBORS)for(const [low,high] of naturalCaveColumn(x+dx,z+dz))ranges.push([low-1,high+1]);
    return mergeCaveRanges(ranges);
}
