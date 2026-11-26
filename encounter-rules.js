// Main integration: load before adventure-mobs.js. In the zombie loop replace
// targeting, walking/gravity and both damage blocks with updateZombieEncounter(z,delta).
// Keep damage-state removal, sounds and animation. After damageMob's initial guard:
// if(!encounterDamageAllowed(source))return false;
function encounterDamageAllowed(source){
    return gameDifficulty!=='peaceful'||!['hostile','companion'].includes(source);
}
function encounterTargetAlive(target){
    if(target===camera)return hostileMobsEnabled()&&!isRespawning;
    return !!target&&!target.dying&&target.hp!==0&&target.mesh?.parent===scene&&
        (!target.dimension||target.dimension===currentDimension);
}
function encounterVictims(){
    return [...new Set([...villagers,...[...zombies,...creepers,...endermen,...animals].filter(isCompanion)])];
}
function encounterTargetPosition(target){
    if(target===camera)return camera.position.clone().add(new THREE.Vector3(0,-getPlayerHeight()*.35,0));
    const height=target.mesh.userData.mobHeight||(target.kind==='enderman'?2.9:1.95);
    return target.mesh.position.clone().add(new THREE.Vector3(0,height*.55-.5,0));
}
function encounterTargetVisible(mob,target,{range=18,originHeight=.9,maxHeight=6}={}){
    if(gameDifficulty==='peaceful'||!encounterTargetAlive(target)||target===mob)return false;
    const p=mob.mesh.position,point=encounterTargetPosition(target),origin=p.clone();origin.y+=originHeight;
    return Math.abs(point.y-origin.y)<=maxHeight&&p.distanceToSquared(point)<=range*range&&hasClearLineBetween(origin,point);
}
function encounterHostiles(){
    return [...zombies.filter(m=>!isCompanion(m)),...adventureMobs.filter(m=>m.kind==='pillager')];
}
function selectHostileTarget(mob,options={}){
    const previous=mob.encounterTarget;mob.encounterTarget=null;
    if(gameDifficulty==='peaceful'||mob.dying)return null;
    const targets=encounterVictims();if(hostileMobsEnabled())targets.push(camera);
    const visible=targets.filter(t=>encounterTargetVisible(mob,t,options)).map(target=>({target,distance:mob.mesh.position.distanceTo(encounterTargetPosition(target))}));
    const nearestOther=Math.min(Infinity,...visible.filter(t=>t.target!==camera).map(t=>t.distance));
    const hostiles=encounterHostiles();let best=null,bestScore=Infinity;
    for(const {target,distance} of visible){
        // Nearby residents never lose to a farther player because of crowd weighting.
        if(target===camera&&nearestOther<distance)continue;
        let crowd=0;
        for(const other of hostiles)if(other!==mob&&encounterTargetAlive(other)&&other.encounterTarget===target&&other.mesh.position.distanceToSquared(mob.mesh.position)<144)crowd++;
        const score=distance+Math.min(2.1,crowd*.7)-(target===previous?0.25:0);
        if(score<bestScore){best=target;bestScore=score;}
    }
    mob.encounterTarget=best;
    if(previous&&!best){mob.wanderHome=mob.mesh.position.clone();mob.wanderTime=0;}
    return best;
}
function steerEncounterMob(mob,dx,dz,speed,height=1.95,radius=.35){
    mob.vx=mob.vz=0;const length=Math.hypot(dx,dz);if(length<.01||!speed)return;
    let x=dx/length,z=dz/length;const p=mob.mesh.position;
    for(const other of encounterHostiles()){
        if(other===mob||other.dying||other.mesh.parent!==scene)continue;
        const ox=p.x-other.mesh.position.x,oz=p.z-other.mesh.position.z,d=Math.hypot(ox,oz);
        if(d>.01&&d<1.15&&Math.abs(p.y-other.mesh.position.y)<1.5){const push=(1.15-d)*.7;x+=ox/d*push;z+=oz/d*push;}
    }
    const angle=Math.atan2(x,z);
    for(const offset of [0,.6,-.6,1.2,-1.2]){
        const a=angle+offset,next=p.clone().add(new THREE.Vector3(Math.sin(a)*.65,0,Math.cos(a)*.65));
        const nx=Math.round(next.x),ny=Math.round(next.y-1),nz=Math.round(next.z),floor=getBlock(nx,ny,nz);
        if(isWaterType(floor)||floor===LAVA_ID)continue;
        if(!isSolid(nx,ny,nz)){
            const below=getBlock(nx,ny-1,nz);
            if(!isSolid(nx,ny-1,nz)||isWaterType(below)||below===LAVA_ID)continue;
        }
        if(mobBodyBlocked(next,height,radius)){
            next.y+=1;if(!mob.onGround||mobBodyBlocked(next,height,radius))continue;
        }
        mob.vx=Math.sin(a)*speed;mob.vz=Math.cos(a)*speed;return;
    }
}
function wanderEncounterMob(mob,delta,speed=.32){
    const p=mob.mesh.position;
    if(!mob.wanderHome||mob.wanderHome.distanceToSquared(p)>144)mob.wanderHome=p.clone();
    mob.wanderTime=Math.max(0,(mob.wanderTime||0)-delta);
    if(!mob.wanderTime){
        mob.wanderTime=1.8+Math.random()*2.5;
        mob.wanderAngle=Math.random()*Math.PI*2;mob.wanderMoving=Math.random()>.3;
    }
    let dx=Math.sin(mob.wanderAngle),dz=Math.cos(mob.wanderAngle);
    if(p.distanceToSquared(mob.wanderHome)>36){dx=mob.wanderHome.x-p.x;dz=mob.wanderHome.z-p.z;}
    steerEncounterMob(mob,dx,dz,mob.wanderMoving?speed:0);
}
function updateZombieEncounter(z,delta){
    const friendly=isCompanion(z),fighting=gameDifficulty!=='peaceful';
    const target=friendly?(fighting?findCompanionEnemy(z):null):selectHostileTarget(z);
    z.attackCooldown=Math.max(0,(z.attackCooldown||0)-delta);z.vx=z.vz=0;
    if(friendly){
        const destination=target?target.mesh.position:camera.position,dx=destination.x-z.mesh.position.x,dz=destination.z-z.mesh.position.z,d=Math.hypot(dx,dz);
        if(d>(target?0.85:2.6)){z.vx=dx/d*1.6;z.vz=dz/d*1.6;}
    }else if(target){
        const point=encounterTargetPosition(target),dx=point.x-z.mesh.position.x,dz=point.z-z.mesh.position.z;
        if(Math.hypot(dx,dz)>.85)steerEncounterMob(z,dx,dz,.55);
    }else if(fighting)wanderEncounterMob(z,delta);
    moveWalkingMob(z,delta,1.95,.35);
    if(!fighting||!target||z.attackCooldown||!encounterTargetVisible(z,target,{range:1.5,maxHeight:1.5}))return;
    if(target===camera)takeDamage(1);else damageMob(target,1,friendly?'companion':'hostile');
    z.attackCooldown=.9;
}
