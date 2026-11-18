const VILLAGE_HOMES=[[-24,-24],[24,-24],[-24,0],[24,0],[-24,24],[24,24]];
function villageRoad(dx,dz){
    return Math.abs(dx)<=1&&Math.abs(dz)<=46||[-15,9,33].some(row=>Math.abs(dz-row)<=1&&Math.abs(dx)<=39);
}
function largeCottageBlock(dx,dy,dz,index){
    if(Math.abs(dx)>7||dz< -6||dz>8)return null;
    const wall=[51,59,170][index%3],roof=[61,185,173][index%3],front=5;
    if(dy===0)return Math.abs(dx)<=6&&dz>=-5&&dz<=front||Math.abs(dx)<=1&&dz>front?63:null;
    if(dy<0)return 3;
    if(dz>front)return Math.abs(dx)<=1?0:null;
    const roofY=6+Math.floor((7-Math.abs(dx))/2);
    if(dy===roofY)return roof;
    const edge=Math.abs(dx)===6||dz===-5||dz===front;
    if(dy<roofY&&dy>=6)return edge?wall:0;
    if(dy<=5&&edge){
        if(dx===0&&dz===front&&dy<=2)return dy===1?8:9;
        const corner=Math.abs(dx)===6&&(dz===-5||dz===front);
        if(corner||dy===5)return 4;
        return dy>=2&&dy<=3&&(Math.abs(dx)===6&&Math.abs(dz)<=2||Math.abs(dx)>=2&&Math.abs(dx)<=4)?6:wall;
    }
    if(Math.abs(dx)<6&&Math.abs(dz)<5){
        if(dx===-4&&dy===1&&[1,2].includes(dz))return dz===1?14:15;
        if(dx===4&&dy===1&&dz===-3)return 12;
        if(dx===3&&dy===1&&dz===-3)return 13;
        if(dx===4&&dy===1&&dz===1)return 82;
        if(dx===4&&dy===2&&dz===1)return 89;
        if(dx===3&&dy===1&&dz===1)return 79;
        if(dx===0&&dy===5&&dz===0)return 62;
    }
    return 0;
}
function villageLandmarkBlock(dx,dy,dz){
    // A walled water basin with a roof; the tower has a ladder through each floor.
    const wx=dx-9,wz=dz+35;
    if(Math.abs(wx)<=3&&Math.abs(wz)<=3){
        const edge=Math.max(Math.abs(wx),Math.abs(wz));
        if(dy<0)return 3;
        if(dy===0)return edge===0?24:3;
        if(dy===1)return edge===1?3:0;
        if(dy>=2&&dy<=4)return Math.abs(wx)===2&&Math.abs(wz)===2?4:0;
        if(dy===5)return 4;
        return 0;
    }
    const tx=dx+10,tz=dz-39;
    if(Math.abs(tx)<=3&&Math.abs(tz)<=3){
        const edge=Math.max(Math.abs(tx),Math.abs(tz));
        if(dy<=0)return 3;
        if(tx===0&&tz===-2&&dy<=13)return 7;
        if(dy===12)return 63;
        if(dy===14)return edge===3&&(Math.abs(tx)===3&&Math.abs(tz)===3||(tx+tz)%2===0)?3:0;
        if(dy===13)return edge===3?98:0;
        if(dy>0&&dy<12&&edge===3){
            if(tx===0&&tz===-3&&dy<=2)return 0;
            return (Math.abs(tx)===3&&Math.abs(tz)===3)||dy%4===0?3:dy%4===2?6:4;
        }
        return 0;
    }
    return null;
}
function generateLargeVillageChunk(cx,cz,c){
    if(Math.hypot(cx*16+8-c.x,cz*16+8-c.z)>68)return false;
    const dirty=new Set();
    const put=(x,y,z,id)=>{
        if(worldMap.has([x,y,z].join(',')))return;
        setGenBlock(x,y,z,id);markBlockChunks(x,z,dirty);
    };
    for(let x=cx*16;x<(cx+1)*16;x++)for(let z=cz*16;z<(cz+1)*16;z++){
        const dx=x-c.x,dz=z-c.z,h=getSurfaceHeight(x,z),home=VILLAGE_HOMES.findIndex(([a,b])=>Math.abs(dx-a)<=7&&dz-b>=-6&&dz-b<=8);
        const landmark=villageLandmarkBlock(dx,0,dz);
        if(home>=0||landmark!==null){
            for(let dy=Math.min(0,h-c.y);dy<=15;dy++){
                const id=home>=0?largeCottageBlock(dx-VILLAGE_HOMES[home][0],dy,dz-VILLAGE_HOMES[home][1],home):villageLandmarkBlock(dx,dy,dz);
                if(id!==null)put(x,c.y+dy,z,id);
            }
            continue;
        }
        const wheat=dx>=6&&dx<=18&&dz>=-10&&dz<=2,rice=dx>=-18&&dx<=-6&&dz>=14&&dz<=25;
        if(wheat||rice){
            const channel=Math.abs(dx)%4===0;put(x,h,z,channel?24:2);
            if(!channel){
                const id=rice?(hash(x,z)<.6?RICE_RIPE:RICE_GREEN):(hash(x,z)<.6?WHEAT_RIPE:WHEAT_GREEN);
                put(x,h+1,z,id);registerPlant(x,h+1,z);
            }
        }else if(villageRoad(dx,dz)){
            put(x,h,z,23);for(let dy=1;dy<=3;dy++)put(x,h+dy,z,0);
        }else if(hash(x,z)<.36&&[[1,0],[-1,0],[0,1],[0,-1]].some(([a,b])=>villageRoad(dx+a,dz+b))){
            put(x,h+1,z,hash(z,x)<.5?FLOWER_RED:FLOWER_BLUE);
        }
    }
    for(const key of dirty)if(chunkMeshes.has(key))rebuildQueue.add(key);
    return true;
}
function populateVillagePaths(){
    if(!isGameStarted||currentDimension!=='overworld'||selectedTerrain!=='random'||wildernessVersion<4)return;
    const c=villageRegion(camera.position.x,camera.position.z);
    if(!c||Math.hypot(camera.position.x-c.x,camera.position.z-c.z)>70)return;
    const routes=[
        [[0,-40],[0,-15],[24,-15],[0,-15],[0,9],[-24,9],[0,9]],
        [[-24,-15],[0,-15],[0,33],[24,33],[0,33],[0,-15]],
        [[24,9],[0,9],[0,33],[-24,33],[0,33],[0,9]],
        [[0,43],[0,33],[35,33],[0,33],[0,-15]],
        [[0,-15],[-35,-15],[0,-15],[0,9],[35,9],[0,9]],
        [[-24,33],[0,33],[0,9],[-35,9],[0,9],[0,33]]
    ];
    for(let i=0;i<routes.length;i++){
        const key=seed+':'+c.x+','+c.z+':'+i,p=routes[i][0],x=c.x+p[0],z=c.z+p[1];
        if(villageResidentKeys.has(key)||villagers.length>=48||!chunkMeshes.has(Math.floor(x/16)+','+Math.floor(z/16))||getBlock(x,c.y,z)!==23)continue;
        spawnVillagerAt(x,c.y+1,z);Object.assign(villagers.at(-1),{villageKey:key,villageRoute:routes[i].map(([a,b])=>[c.x+a,c.z+b]),routeIndex:1});
        villageResidentKeys.add(key);
    }
}
function guideVillageResident(v){
    if(!v.villageRoute)return;
    const target=v.villageRoute[v.routeIndex%v.villageRoute.length],p=v.mesh.position,dx=target[0]-p.x,dz=target[1]-p.z,d=Math.hypot(dx,dz);
    v.timer=10;
    if(d<.25){v.routeIndex=(v.routeIndex+1)%v.villageRoute.length;v.vx=v.vz=0;return;}
    v.vx=dx/d*.85;v.vz=dz/d*.85;
}
