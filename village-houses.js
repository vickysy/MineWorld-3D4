function cottageSite(x,z,natural=false){
    let low=Infinity,high=-Infinity;
    for(let dx=-5;dx<=5;dx++)for(let dz=-5;dz<=7;dz++){
        const h=getSurfaceHeight(x+dx,z+dz);
        if(h<=SEA_LEVEL+1||!isSolid(x+dx,h,z+dz)||!isSolid(x+dx,h-2,z+dz))return null;
        if(constructionTypeAt(x+dx,h,z+dz)!==null)return null;
        low=Math.min(low,h);high=Math.max(high,h);
        if(high-low>3)return null;
        if(natural){
            for(let y=h-1;y<=h+9;y++)if(worldMap.has(`${x+dx},${y},${z+dz}`))return null;
        }
    }
    return {x,z,y:high,low};
}

function buildCottage(x,y,z,variant=0){
    const dirty=new Set(),cells=new Map();
    const put=(dx,dy,dz,id)=>cells.set(`${x+dx},${y+dy},${z+dz}`,id);
    const wall=[51,59,170][variant%3],roof=[61,185,173][variant%3];
    // Solid foundations follow the ground; the small footprint never excavates a cliff.
    for(let dx=-5;dx<=5;dx++)for(let dz=-5;dz<=7;dz++){
        const h=getSurfaceHeight(x+dx,z+dz),inside=Math.abs(dx)<=4&&dz>=-4&&dz<=3||Math.abs(dx)<=2&&dz===4;
        if(inside){
            for(let yy=h;yy<y;yy++)put(dx,yy-y,dz,3);
            put(dx,0,dz,63);
        }
        for(let dy=1;dy<=9;dy++)put(dx,dy,dz,0);
    }
    for(let dx=-4;dx<=4;dx++)for(let dz=-4;dz<=3;dz++){
        const edge=Math.abs(dx)===4||dz===-4||dz===3;
        if(!edge)continue;
        const beam=Math.abs(dx)===4&&(dz===-4||dz===3)||dx===0&&dz===-4;
        for(let dy=1;dy<=4;dy++){
            const window=dy>=2&&dy<=3&&(Math.abs(dx)===4&&dz>=-2&&dz<=0||[3,-4].includes(dz)&&[2,3,-2,-3].includes(dx));
            put(dx,dy,dz,beam||dy===4?4:window?6:wall);
        }
    }
    // Stepped gables, overhanging eaves, a chimney, and a separate porch roof.
    for(let dx=-5;dx<=5;dx++){
        const top=5+Math.floor((5-Math.abs(dx))/2);
        for(let dz=-5;dz<=4;dz++)put(dx,top,dz,roof);
        if(Math.abs(dx)<=4)for(const dz of [-4,3])for(let dy=5;dy<top;dy++)put(dx,dy,dz,dx===0?4:wall);
    }
    for(let dy=4;dy<=9;dy++)put(-3,dy,-2,59);
    put(-3,9,-2,61);
    for(let dx=-2;dx<=2;dx++){
        put(dx,0,4,63);
        for(let dz=4;dz<=5;dz++)put(dx,4,dz,roof);
    }
    for(const dx of [-2,2])for(let dy=1;dy<=3;dy++)put(dx,dy,4,4);
    put(0,1,3,8);put(0,2,3,9);
    for(let dz=5;dz<=7;dz++)for(let dx=-1;dx<=1;dx++){
        const h=getSurfaceHeight(x+dx,z+dz),top=Math.max(h,y-(dz-4));
        for(let yy=h;yy<=top;yy++)put(dx,yy-y,dz,3);
    }
    put(-3,1,-3,14);put(-3,1,-2,15);
    put(3,1,-3,12);put(2,1,-3,13);
    put(2,1,0,82);put(2,2,0,89);put(1,1,0,79);
    put(-3,1,1,88);put(3,1,2,90);put(0,4,0,62);
    for(const [key,id] of cells){
        const [bx,by,bz]=key.split(',').map(Number);setGenBlock(bx,by,bz,id);
        const cx=Math.floor(bx/CHUNK_SIZE),cz=Math.floor(bz/CHUNK_SIZE);dirty.add(`${cx},${cz}`);
        if(((bx%16)+16)%16===0)dirty.add(`${cx-1},${cz}`);
        if(((bx%16)+16)%16===15)dirty.add(`${cx+1},${cz}`);
        if(((bz%16)+16)%16===0)dirty.add(`${cx},${cz-1}`);
        if(((bz%16)+16)%16===15)dirty.add(`${cx},${cz+1}`);
    }
    for(const key of dirty)if(chunkMeshes.has(key))rebuildQueue.add(key);
    return {x,y,z,variant,dirty};
}

function generateCottageChunk(cx,cz){
    const key=`house_${cx},${cz}`;if(worldMap.has(key))return;
    worldMap.set(key,true);
    if(selectedTerrain==='moon'||hash(cx*2,cz*2)>=.08)return;
    const site=cottageSite(cx*CHUNK_SIZE+7,cz*CHUNK_SIZE+7,true);if(!site)return;
    buildCottage(site.x,site.y,site.z,Math.floor(hash(cx+21,cz-16)*3));
    spawnVillagerAt(site.x,site.y+1,site.z);
}
