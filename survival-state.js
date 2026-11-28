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
    foodProtectionTimer=0;resetFoodTimers();resetGoldenFoodEffects();
}
function playerIsActive(){return isGameStarted&&controls.isLocked&&!isSleeping&&!isRespawning&&!worldLoading;}
function updateSurvival(delta){
    if(!playerIsActive()||!Number.isFinite(delta)||delta<=0)return;
    recoveryDelay=Math.max(0,recoveryDelay-delta);hurtFeedbackTimer=Math.max(0,hurtFeedbackTimer-delta);hurtViewTime=Math.max(0,hurtViewTime-delta);
    if(isCreativeMode()){
        const changed=health!==maxHealth||hunger!==maxHunger;health=maxHealth;hunger=maxHunger;foodProtectionTimer=0;resetFoodTimers();
        resetGoldenFoodEffects();if(changed)updateHUD();return;
    }
    updateGoldenFoodEffects(delta);
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
    if(hunger>0&&health>0&&health<maxHealth&&recoveryDelay===0){
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
    const overlay=view===camera&&heldItemGroup.visible&&!photoMode&&!isThirdPerson;
    const crumbs=foodCrumbRoot,crumbsVisible=crumbs?.visible;
    const mask=view.layers.mask,background=scene.background,fog=scene.fog,autoClear=renderer.autoClear,autoReset=renderer.info.autoReset;
    const lights=[ambientLight,dirLight,heldTorchLight],lightMasks=lights.map(light=>light.layers.mask);
    try{
        if(overlay){heldItemGroup.visible=false;if(crumbs)crumbs.visible=false;}
        renderer.render(scene,view);
        if(overlay){
            heldItemGroup.visible=true;if(crumbs)crumbs.visible=crumbsVisible;
            heldItemGroup.traverse(part=>part.layers.enable(31));if(crumbs)crumbs.traverse(part=>part.layers.enable(31));
            for(const light of lights)light.layers.enable(31);
            // The viewmodel has its own depth pass, so a nearby wall cannot cut off the wrist.
            view.layers.set(31);scene.background=null;scene.fog=null;renderer.autoClear=false;renderer.info.autoReset=false;
            renderer.clearDepth();renderer.render(scene,view);
        }
    }finally{
        if(overlay)heldItemGroup.visible=true;if(crumbs)crumbs.visible=crumbsVisible;
        view.layers.mask=mask;scene.background=background;scene.fog=fog;renderer.autoClear=autoClear;renderer.info.autoReset=autoReset;
        lights.forEach((light,i)=>light.layers.mask=lightMasks[i]);view.quaternion.copy(original);view.updateMatrixWorld(true);
    }
}
function updateFallDamage(before,environment,groundedBefore){
    const scale=playerScale;
    if(isCreativeMode()||creativeFlying||ridingHorse||ridingMinecart||drivingCar||seatedAt||activeMech||isRespawning||environment.onLadder||environment.waterFraction>.05||environment.lavaFraction>.05||
        fallState.scale!==scale||fallState.dimension!==currentDimension||
        fallState.lastPosition&&before.distanceTo(fallState.lastPosition)>4*Math.max(scale,.01)){
        resetFallTracking();return;
    }
    const feet=camera.position.y-getPlayerHeight(),previousFeet=before.y-getPlayerHeight();
    const onGround=velocity.y<=0&&checkScaledCollision(camera.position.clone().add(new THREE.Vector3(0,-.004*Math.min(scale,1),0)));
    // Starting in midair (or leaving a ladder) is still a fall. Teleports rebase above, not the whole descent.
    fallState.armed=true;
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
    if(eatingState||!isAnimatedFood(id)||!hasInventoryItem(id)||!isGameStarted||isRespawning||isSleeping||worldLoading||
        !automatic&&(!controls.isLocked||!(button===2||button===0&&[39,40].includes(id))||currentBlock!==id))return false;
    cancelMining();handSwing=0;
    eatingState={id,button,automatic,elapsed:0,soundAt:0,slot:activeHotbarSlot,originalItem:currentBlock};
    if(automatic&&currentBlock!==id)updateHeldItem3D(id);
    document.getElementById('food-progress').hidden=false;
    return true;
}
function cancelEating(){
    const state=eatingState;
    eatingState=null;
    if(state?.automatic)updateHeldItem3D(currentBlock);
    if(state)resetHandAnimation();
    clearEatingCrumbs();
    const el=document.getElementById('food-progress');if(el){el.hidden=true;el.querySelector('progress').value=0;}
}
function updateEating(delta){
    if(!eatingState)return;
    const state=eatingState;
    if(!playerIsActive()||!hasInventoryItem(state.id)||activeHotbarSlot!==state.slot||currentBlock!==state.originalItem){cancelEating();return;}
    if(!Number.isFinite(delta)||delta<=0)return;
    state.elapsed+=delta;
    document.getElementById('food-progress').querySelector('progress').value=Math.min(1,state.elapsed/FOOD_EAT_SECONDS);
    if(state.elapsed>=state.soundAt){
        state.soundAt=state.elapsed+.28;
        playWorldRecording('dirt_break',{gain:.075,rate:.95,duration:.09,lowpass:1800});emitEatingCrumbs(state.id);
    }
    animateHeldFood(state);
    if(state.elapsed+1e-9<FOOD_EAT_SECONDS)return;
    const eaten=consumeAnimatedFood(state.id);
    cancelEating();updateHotbarUI();
    if(eaten)showToast(getBlockName(state.id)+' eaten.');
}
document.addEventListener('mouseup',event=>{if(eatingState&&!eatingState.automatic&&event.button===eatingState.button)cancelEating();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelEating();});
document.addEventListener('pointercancel',cancelEating);
document.addEventListener('wheel',()=>{if(eatingState)cancelEating();},{passive:true});
document.addEventListener('keydown',event=>{if(eatingState&&(/^Digit[1-9]$/.test(event.code)&&Number(event.code.slice(-1))-1!==eatingState.slot||['Escape','KeyE'].includes(event.code)))cancelEating();});
window.addEventListener('blur',cancelEating);
