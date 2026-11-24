// Twin entrance towers, a hollow stepped pyramid, gallery and buried treasure vault.
function generateDesertTemple(site){
    const {x,y,z,rx,rz}=site,key=`ruin_${rx},${rz}`,radius=12;
    if(worldMap.has(key))return false;
    for(let a=-radius;a<=radius;a++)for(let b=-radius;b<=radius;b++){
        const h=getSurfaceHeight(x+a,z+b);
        for(let c=Math.min(h,y-10);c<=y+16;c++)if(worldMap.has(`${x+a},${c},${z+b}`)||constructionTypeAt(x+a,c,z+b)!==null||isCraterVoid(x+a,c,z+b))return false;
    }
    worldMap.set(key,true);
    const put=(a,b,c,id)=>setGenBlock(x+a,y+b,z+c,id),stone=SANDSTONE,orange=175;
    for(let a=-radius;a<=radius;a++)for(let b=-radius;b<=radius;b++){
        for(let c=Math.min(getSurfaceHeight(x+a,z+b),y-10);c<=y;c++)setGenBlock(x+a,c,z+b,stone);
        for(let c=1;c<=16;c++)put(a,c,b,0);
        if(Math.abs(a)===radius||Math.abs(b)===radius)for(let c=1;c<=3;c++)put(a,c,b,stone);
    }
    for(let c=4;c<=15;c++){
        const r=15-c;
        for(let a=-r;a<=r;a++)for(let b=-r;b<=r;b++)if(Math.abs(a)===r||Math.abs(b)===r)put(a,c,b,stone);
    }
    // A walkable gallery is supported by pillars, leaving the decorated hall open.
    for(let a=-8;a<=8;a++)for(let b=-8;b<=8;b++)if(Math.abs(a)>=6||Math.abs(b)>=6)put(a,4,b,stone);
    for(const a of [-6,6])for(const b of [-6,6])for(let c=1;c<=3;c++)put(a,c,b,stone);
    for(let a=-3;a<=3;a++)for(let b=-3;b<=3;b++)if(Math.abs(a)+Math.abs(b)<=3)put(a,0,b,a===0&&b===0?181:(Math.abs(a)+Math.abs(b))%2===0?stone:orange);
    for(let n=1;n<=4;n++)for(const a of [6,7]){
        const b=6-n;for(let c=1;c<=n;c++)put(a,c,b,stone);
        for(let c=n+1;c<=n+3;c++)put(a,c,b,0);
    }
    // The front is framed by two sandstone towers with orange geometric motifs.
    for(const sx of [-9,9]){
        for(let a=sx-2;a<=sx+2;a++)for(let b=8;b<=12;b++)for(let c=1;c<=10;c++){
            put(a,c,b,a===sx-2||a===sx+2||b===8||b===12||c===10?stone:0);
        }
        for(let c=1;c<=3;c++)put(sx,c,8,0);
        for(const [a,c] of [[-1,8],[0,8],[1,8],[-1,7],[1,7],[-1,6],[0,6],[1,6],[0,5],[-1,4],[0,4],[1,4],[0,3]])put(sx+a,c,12,orange);
        for(const a of [-2,2])for(const b of [8,12])put(sx+a,11,b,stone);
    }
    for(let a=-6;a<=6;a++)for(let b=9;b<=12;b++)put(a,4,b,stone);
    for(let a=-1;a<=1;a++)for(let b=8;b<=12;b++)for(let c=1;c<=3;c++)put(a,c,b,0);
    // The vault has solid walls and a sealed central shaft, plus a side stairway.
    for(let a=-5;a<=5;a++)for(let b=-5;b<=5;b++)for(let c=-8;c<=-3;c++)put(a,c,b,c===-8||c===-3||Math.abs(a)===5||Math.abs(b)===5?stone:0);
    for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)for(let c=-7;c<=-1;c++)put(a,c,b,0);
    for(let n=0;n<=8;n++)for(const a of [-8,-7]){
        const b=7-n;put(a,-n,b,stone);
        for(let c=-n+1;c<=-n+3;c++)put(a,c,b,0);
    }
    for(const a of [-6,-5])for(let c=-7;c<=-5;c++)put(a,c,-1,0);
    for(const [a,b,c] of [[-4,2,5],[4,2,5],[-4,-6,-4],[4,-6,4]])put(a,b,c,62);
    // A sand-filled rear alcove rewards exploration without replacing player builds.
    for(let a=-3;a<=3;a++)for(let b=-10;b<=-8;b++)for(let c=1;c<=3;c++)put(a,c,b,Math.abs(a)===3||b===-10?stone:c===1?23:0);
    for(let step=1;step<=10;step++)for(let a=-2;a<=2;a++){
        const b=12+step,h=getSurfaceHeight(x+a,z+b),top=y-step+1;if(h>=top)continue;
        let clear=true;for(let c=h;c<=top+2;c++)if(worldMap.has(`${x+a},${c},${z+b}`)||constructionTypeAt(x+a,c,z+b)!==null)clear=false;
        if(clear)for(let c=h;c<=top;c++)setGenBlock(x+a,c,z+b,stone);
    }
    const chests=[[0,1,-2],[7,5,-5],[-3,-7,0],[3,-7,0],[0,-7,-3],[0,-7,3]];
    chests.forEach(([a,b,c],index)=>{
        put(a,b,c,CHEST_ID);const record=furnitureRecord(x+a,y+b,z+c);record.data.chestSlots=Array(32).fill(null);
        ruinLoot(site).forEach((loot,i)=>record.data.chestSlots[i*3]={...loot,count:Math.min(64,loot.count+index)});
        if(index===4)record.data.chestSlots[15]={id:GOLD_SWORD,count:1};
    });
    for(let cx=Math.floor((x-radius)/16);cx<=Math.floor((x+radius)/16);cx++)for(let cz=Math.floor((z-radius)/16);cz<=Math.floor((z+22)/16);cz++)if(chunkMeshes.has(`${cx},${cz}`))rebuildQueue.add(`${cx},${cz}`);
    return true;
}
