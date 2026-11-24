// Mob coordinates use feet at y - 0.5. Test full volumes, including ceilings.
function mobBodyBlocked(pos,height=1.8,radius=.35){
    const lo=new THREE.Vector3(pos.x-radius,pos.y-.5+1e-5,pos.z-radius),hi=new THREE.Vector3(pos.x+radius,pos.y-.5+height,pos.z+radius);
    for(let x=Math.floor(lo.x+.5);x<=Math.floor(hi.x+.5-1e-5);x++)for(let y=Math.floor(lo.y+.5);y<=Math.floor(hi.y+.5-1e-5);y++)for(let z=Math.floor(lo.z+.5);z<=Math.floor(hi.z+.5-1e-5);z++){
        if(!isSolid(x,y,z))continue;const id=getBlock(x,y,z);
        const box=isTrapdoor(id)?trapBounds(x-.5,y-.5,z-.5,id):id===SNOW_LAYER_ID?new THREE.Box3(new THREE.Vector3(x-.5,y-.5,z-.5),new THREE.Vector3(x+.5,y-.5+SNOW_LAYER_HEIGHT,z+.5)):null;
        if(!box||lo.x<box.max.x&&hi.x>box.min.x&&lo.y<box.max.y&&hi.y>box.min.y&&lo.z<box.max.z&&hi.z>box.min.z)return true;
    }return false;
}
function moveMobAxis(entity,axis,distance,height,radius){
    const p=entity.mesh.position,steps=Math.max(1,Math.ceil(Math.abs(distance)/.12)),step=distance/steps;
    for(let i=0;i<steps;i++){
        const old=p[axis];p[axis]+=step;
        if(mobBodyBlocked(p,height,radius)){
            p[axis]=old;let lo=0,hi=1;
            for(let j=0;j<10;j++){const mid=(lo+hi)/2;p[axis]=old+step*mid;if(mobBodyBlocked(p,height,radius))hi=mid;else lo=mid;}
            p[axis]=old+step*lo;return false;
        }
    }return true;
}
function moveWalkingMob(entity,delta,height=1.95,radius=.35){
    let moving=false;const p=entity.mesh.position;
    // Substeps prevent large frame gaps and steps from tunneling through walls.
    const count=Math.max(1,Math.ceil(delta/.025)),dt=delta/count;
    for(let i=0;i<count;i++){
        for(const [axis,speed] of [['x',entity.vx],['z',entity.vz]]){
            if(!speed)continue;const before=p.clone();
            if(moveMobAxis(entity,axis,speed*dt,height,radius)){moving=true;continue;}
            if(entity.onGround){
                const blocked=p.clone();p.copy(before);
                if(moveMobAxis(entity,'y',1,height,radius)&&moveMobAxis(entity,axis,speed*dt,height,radius)){
                    moveMobAxis(entity,'y',-1,height,radius);moving=true;
                }else p.copy(blocked);
            }
        }
        entity.vy=Math.max(-35,(entity.vy||0)-25*dt);const down=entity.vy<0;
        entity.onGround=false;
        if(!moveMobAxis(entity,'y',entity.vy*dt,height,radius)){entity.vy=0;entity.onGround=down;}
    }
    return moving;
}
function updateSpikeDamage(entity,delta){
    if(entity.dying)return;entity.spikeCooldown=Math.max(0,(entity.spikeCooldown||0)-delta);if(entity.spikeCooldown)return;
    const p=entity.mesh.position;
    for(let x=Math.floor(p.x+.08);x<=Math.floor(p.x+.92);x++)for(let z=Math.floor(p.z+.08);z<=Math.floor(p.z+.92);z++)for(let y=Math.floor(p.y-.01);y<=Math.floor(p.y+1.5);y++){
        if(getBlock(x,y,z)===SPIKE_TRAP_ID){damageMob(entity,2,'spikes');entity.spikeCooldown=.45;return;}
    }
}
const flyingArrows=[];let arrowCooldown=0;
function createFlyingArrow(item){
    const group=new THREE.Group();
    addModelBox(group,.045,.045,.7,0xa08554,0,0,-.35);
    addModelBox(group,.13,.025,.23,0xe7e2d5,0,0,-.68);addModelBox(group,.025,.13,.23,0xe7e2d5,0,0,-.68);
    const tip=new THREE.Mesh(new THREE.ConeGeometry(.065,.18,4),new THREE.MeshLambertMaterial({color:0x9eaab0}));tip.rotation.x=Math.PI/2;tip.position.z=-.01;group.add(tip);
    group.userData.item=item;return group;
}
function fireArrow(item){
    if(!hasInventoryItem(item)||arrowCooldown>0)return false;
    arrowCooldown=item===CROSSBOW_ID?.55:.34;
    const direction=camera.getWorldDirection(new THREE.Vector3()),mesh=createFlyingArrow(item);mesh.position.copy(camera.position);mesh.scale.setScalar(Math.max(.05,playerScale));scene.add(mesh);
    flyingArrows.push({mesh,velocity:direction.multiplyScalar(item===CROSSBOW_ID?32:25),life:8,damage:item===CROSSBOW_ID?3:2,stuck:null,dimension:currentDimension});
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),direction.clone().normalize());
    playWorldRecording('wood',{gain:.12,rate:1.8,duration:.15});cancelMining();
    while(flyingArrows.length>48){disposeModModel(flyingArrows[0].mesh);flyingArrows.shift();}return true;
}
function updateFlyingArrows(delta){
    if(!isGameStarted||!controls.isLocked||isSleeping)return;arrowCooldown=Math.max(0,arrowCooldown-delta);
    for(let i=flyingArrows.length-1;i>=0;i--){
        const a=flyingArrows[i];a.life-=delta;
        if(a.dimension!==currentDimension||a.life<=0){disposeModModel(a.mesh);flyingArrows.splice(i,1);continue;}
        if(a.stuck){if(!isSolid(...a.stuck)){a.stuck=null;a.velocity.set(0,-1,0);a.life=4;}else continue;}
        const steps=Math.max(1,Math.ceil(delta/.02)),dt=delta/steps;
        for(let j=0;j<steps;j++){
            a.velocity.y-=9*dt;const distance=a.velocity.length()*dt,dir=a.velocity.clone().normalize();
            a.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),dir);
            const hit=traceCombatRay(a.mesh.position,dir,distance,!a.enemy);
            if(a.enemy&&hostileMobsEnabled()){
                const p=camera.position,r=getPlayerRadius(),box=new THREE.Box3(new THREE.Vector3(p.x-r,p.y-getPlayerHeight(),p.z-r),new THREE.Vector3(p.x+r,p.y+.15*playerScale,p.z+r));
                const point=new THREE.Ray(a.mesh.position,dir).intersectBox(box,new THREE.Vector3());
                if(point&&point.distanceTo(a.mesh.position)<=hit.distance){takeDamage(a.damage);a.life=0;break;}
            }
            a.mesh.position.copy(hit.point);
            if(hit.entity){damageMob(hit.entity,a.damage);a.life=0;break;}
            if(hit.block){a.stuck=[hit.block.x,hit.block.y,hit.block.z];a.mesh.position.addScaledVector(dir,.035);a.velocity.set(0,0,0);a.life=25;playBlockSound('hit',hit.block.type,hit.point);break;}
        }
    }
}
function clearFlyingArrows(){for(const a of flyingArrows)disposeModModel(a.mesh);flyingArrows.length=0;arrowCooldown=0;}
