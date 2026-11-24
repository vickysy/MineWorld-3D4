const SURVIVAL_RULES={
    peaceful:{hungerSeconds:Infinity,damage:.7,regenSeconds:3,starvationFloor:1},
    easy:{hungerSeconds:480,damage:.65,regenSeconds:4,starvationFloor:4.5},
    normal:{hungerSeconds:360,damage:1,regenSeconds:5,starvationFloor:.5},
    hard:{hungerSeconds:240,damage:1.35,regenSeconds:6,starvationFloor:0}
};
let regenerationTimer=0,recoveryDelay=0,hurtFeedbackTimer=0,hurtViewTime=0,hurtViewSide=1;
let eatingState=null;
const fallState={peak:null,armed:false,scale:1,dimension:'overworld',lastPosition:null};
function resetFallTracking(armed=false){
    fallState.peak=null;fallState.armed=armed;fallState.scale=playerScale;fallState.dimension=currentDimension;fallState.lastPosition=null;
}
function resetSurvivalState(){
    resetFallTracking();cancelEating();regenerationTimer=recoveryDelay=hurtFeedbackTimer=hurtViewTime=0;
    foodProtectionTimer=0;resetFoodTimers();
}
function playerIsActive(){return isGameStarted&&controls.isLocked&&!isSleeping&&!isRespawning&&!worldLoading;}
function updateSurvival(delta){
    if(!playerIsActive())return;
    recoveryDelay=Math.max(0,recoveryDelay-delta);hurtFeedbackTimer=Math.max(0,hurtFeedbackTimer-delta);hurtViewTime=Math.max(0,hurtViewTime-delta);
    if(isCreativeMode()){
        const changed=health!==maxHealth||hunger!==maxHunger;health=maxHealth;hunger=maxHunger;foodProtectionTimer=0;resetFoodTimers();
        if(changed)updateHUD();return;
    }
    const rules=SURVIVAL_RULES[gameDifficulty];
    if(gameDifficulty==='peaceful'){if(hunger!==maxHunger){hunger=maxHunger;updateHUD();}}
    else if(foodProtectionTimer>0)foodProtectionTimer=Math.max(0,foodProtectionTimer-delta);
    else{
        // Walking is inexpensive. Sprinting costs a little more, never a whole meal in minutes.
        hungerTimer+=delta*(sprintKeys.size&&(moveForward||moveBackward||moveLeft||moveRight)?1.2:1);
        if(hungerTimer>=rules.hungerSeconds){hungerTimer-=rules.hungerSeconds;hunger=Math.max(0,hunger-1);updateHUD();}
    }
    if(hunger===0){
        starvationTimer+=delta;
        if(starvationTimer>=2400&&health>rules.starvationFloor){starvationTimer-=600;takeDamage(Math.min(.5,health-rules.starvationFloor),'starvation');}
    }else starvationTimer=0;
    if(hunger>=maxHunger-1&&health<maxHealth&&recoveryDelay===0){
        regenerationTimer+=delta;
        if(regenerationTimer>=rules.regenSeconds){regenerationTimer-=rules.regenSeconds;health=Math.min(maxHealth,health+.5);updateHUD();}
    }else regenerationTimer=0;
}
function showPlayerHurt(cause){
    recoveryDelay=6;regenerationTimer=0;
    if(hurtFeedbackTimer>0)return;
    hurtFeedbackTimer=.6;hurtViewTime=.42;hurtViewSide*=-1;
    playWorldRecording(cause==='fall'?'player_fall':'player_hurt',{gain:.25,rate:1,lowpass:4200,duration:.4});
}
function renderPlayerView(view){
    const original=view.quaternion.clone();
    if(hurtViewTime>0&&!menuReducedMotion.matches){
        const phase=1-hurtViewTime/.42;
        view.rotateZ(Math.sin(phase*Math.PI*2)*Math.pow(1-phase,2)*.075*hurtViewSide);
    }
    try{renderer.render(scene,view);}finally{view.quaternion.copy(original);view.updateMatrixWorld(true);}
}
function updateFallDamage(before,environment,groundedBefore){
    const scale=playerScale;
    if(isCreativeMode()||creativeFlying||ridingHorse||ridingMinecart||drivingCar||seatedAt||activeMech||isRespawning||environment.onLadder||environment.waterFraction>.05||environment.lavaFraction>.05||
        fallState.scale!==scale||fallState.dimension!==currentDimension||before.distanceTo(camera.position)>4*Math.max(scale,.01)||
        fallState.lastPosition&&before.distanceTo(fallState.lastPosition)>4*Math.max(scale,.01)){
        resetFallTracking();return;
    }
    const feet=camera.position.y-getPlayerHeight(),previousFeet=before.y-getPlayerHeight();
    const onGround=velocity.y<=0&&checkScaledCollision(camera.position.clone().add(new THREE.Vector3(0,-.004*Math.min(scale,1),0)));
    if(groundedBefore)fallState.armed=true;
    if(fallState.peak===null)fallState.peak=previousFeet;
    fallState.peak=Math.max(fallState.peak,feet,previousFeet);
    if(onGround){
        const distance=(fallState.peak-feet)/scale,landing=getPlayerEnvironment();
        if(fallState.armed&&distance>3.05&&landing.waterFraction<.05&&landing.lavaFraction<.05&&!landing.onLadder)takeDamage(Math.ceil(distance-3)*.5,'fall');
        fallState.peak=feet;fallState.armed=true;
    }
    fallState.lastPosition=camera.position.clone();
}
function startEating(id,button=2,automatic=false){
    if(eatingState||![39,40].includes(id)||!hasInventoryItem(id)||!isGameStarted||isRespawning)return false;
    cancelMining();handSwing=0;
    eatingState={id,button,automatic,elapsed:0,soundAt:0,slot:activeHotbarSlot,originalItem:currentBlock};
    if(automatic&&currentBlock!==id)updateHeldItem3D(id);
    document.getElementById('food-progress').hidden=false;
    return true;
}
function cancelEating(){
    if(eatingState?.automatic)updateHeldItem3D(currentBlock);
    eatingState=null;
    const el=document.getElementById('food-progress');if(el){el.hidden=true;el.querySelector('progress').value=0;}
}
function updateEating(delta){
    if(!eatingState)return;
    const state=eatingState;
    if(!playerIsActive()||!hasInventoryItem(state.id)||!state.automatic&&(currentBlock!==state.id||activeHotbarSlot!==state.slot)){cancelEating();return;}
    state.elapsed+=delta;
    document.getElementById('food-progress').querySelector('progress').value=Math.min(1,state.elapsed/1.6);
    if(state.elapsed>=state.soundAt){state.soundAt+=.28;playWorldRecording('dirt_break',{gain:.1,rate:1.15,duration:.12,lowpass:2600});}
    const reach=Math.min(1,state.elapsed/.2),chew=Math.sin(state.elapsed*24);
    if(currentBlock===state.id||state.automatic){
        heldItemGroup.position.set((.18+chew*.018)*playerScale,(-.35+reach*.24+Math.abs(chew)*.018)*playerScale,-.48*playerScale);
        heldItemGroup.rotation.set(-.6+chew*.05,.2,-.45);
    }
    if(state.elapsed<1.6)return;
    consumeInventoryItem(state.id);hunger=maxHunger;foodProtectionTimer=DAY_SECONDS;resetFoodTimers();
    // Food replenishes hunger; health comes back gradually, including while walking.
    updateHUD();updateHotbarUI();updateInventoryCounts();cancelEating();showToast(state.id===40?'Cooked meat eaten.':'Raw meat eaten.');
}
document.addEventListener('mouseup',event=>{if(eatingState&&!eatingState.automatic&&event.button===eatingState.button)cancelEating();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelEating();});
