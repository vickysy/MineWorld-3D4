// A three-floor sandstone ruin. All floors connect through two-wide stair runs.
function generateDesertTemple(site){
    const {x,y,z,rx,rz}=site,key=`ruin_${rx},${rz}`,radius=12;
    if(worldMap.has(key))return false;worldMap.set(key,true);
    for(let a=-radius;a<=radius;a++)for(let b=-radius;b<=radius;b++){
        const h=getSurfaceHeight(x+a,z+b);
        for(let c=Math.min(h,y);c<=y+17;c++)if(worldMap.has(`${x+a},${c},${z+b}`)||constructionTypeAt(x+a,c,z+b)!==null||isCraterVoid(x+a,c,z+b))return false;
    }
    const put=(a,b,c,id)=>setGenBlock(x+a,y+b,z+c,id),stone=SANDSTONE,orange=175;
    for(let a=-radius;a<=radius;a++)for(let b=-radius;b<=radius;b++){
        for(let c=getSurfaceHeight(x+a,z+b);c<=y;c++)setGenBlock(x+a,c,z+b,stone);
        for(let c=1;c<=17;c++)put(a,c,b,0);
    }
    for(let level=0;level<3;level++){
        const floor=level*5,r=12-level*2;
        for(let a=-r;a<=r;a++)for(let b=-r;b<=r;b++){
            put(a,floor,b,stone);
            if(Math.abs(a)===r||Math.abs(b)===r)for(let c=1;c<=5;c++)put(a,floor+c,b,c===4?orange:stone);
        }
        for(const a of [-r,r])for(const b of [-6,0,6])for(let c=2;c<=3;c++)put(a,floor+c,b,0);
        for(const a of [-4,4])for(const b of [-4,4])for(let c=1;c<=4;c++)put(a,floor+c,b,c===1||c===4?orange:stone);
        for(let a=-2;a<=2;a++)for(let b=-2;b<=2;b++)if(Math.abs(a)+Math.abs(b)<=2)put(a,floor,b,Math.abs(a)+Math.abs(b)===0?181:orange);
        // Side chambers have doorways, not solid partitions across the main hall.
        for(let b=-r+1;b<=-5;b++)for(let c=1;c<=3;c++)put(0,floor+c,b,stone);
        for(const a of [-r+2,r-2])put(a,floor+2,-r+2,62);
    }
    for(let a=-8;a<=8;a++)for(let b=-8;b<=8;b++)put(a,15,b,stone);
    for(let a=-8;a<=8;a++)for(let b=-8;b<=8;b++)if((Math.abs(a)===8||Math.abs(b)===8)&&(a+b)%2===0)put(a,16,b,stone);
    for(let a=-1;a<=1;a++)for(let b=9;b<=12;b++)for(let c=1;c<=3;c++)put(a,c,b,0);
    for(const level of [0,1]){
        const floor=level*5,sx=level===0?6:-6;
        for(let n=1;n<=5;n++)for(let a=sx;a<=sx+1;a++){
            const b=6-n;for(let c=1;c<=n;c++)put(a,floor+c,b,stone);
            for(let c=n+1;c<=n+3;c++)put(a,floor+c,b,0);
        }
    }
    for(const sx of [-9,9]){
        for(let a=sx-2;a<=sx+2;a++)for(let b=9;b<=12;b++)for(let c=1;c<=10;c++){
            if(a===sx-2||a===sx+2||b===9||b===12||c===10)put(a,c,b,c===8?orange:stone);
        }
        for(let c=1;c<=3;c++)put(sx,c,9,0);
        for(const [a,c] of [[0,4],[-1,5],[0,5],[1,5],[0,6]])put(sx+a,c,12,orange);
    }
    for(let step=1;step<=10;step++)for(let a=-2;a<=2;a++){
        const b=12+step,h=getSurfaceHeight(x+a,z+b),top=y-step+1;if(h>=top)continue;
        let clear=true;for(let c=h;c<=top+2;c++)if(worldMap.has(`${x+a},${c},${z+b}`)||constructionTypeAt(x+a,c,z+b)!==null)clear=false;
        if(clear)for(let c=h;c<=top;c++)setGenBlock(x+a,c,z+b,stone);
    }
    for(const [index,[a,b,c]] of [[0,[0,1,-2]],[1,[3,6,-6]],[2,[-3,11,-6]]]){
        put(a,b,c,CHEST_ID);const record=furnitureRecord(x+a,y+b,z+c);record.data.chestSlots=Array(32).fill(null);
        ruinLoot(site).forEach((loot,i)=>record.data.chestSlots[i*3]={...loot,count:Math.min(64,loot.count+index)});
        if(index===2)record.data.chestSlots[15]={id:GOLD_SWORD,count:1};
    }
    for(let cx=Math.floor((x-radius)/16);cx<=Math.floor((x+radius)/16);cx++)for(let cz=Math.floor((z-radius)/16);cz<=Math.floor((z+22)/16);cz++)if(chunkMeshes.has(`${cx},${cz}`))rebuildQueue.add(`${cx},${cz}`);
    return true;
}
