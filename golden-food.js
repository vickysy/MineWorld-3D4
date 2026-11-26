const GOLDEN_APPLE=252,FOOD_EAT_SECONDS=1.6;
const ANIMATED_FOOD=new Set([39,40,APPLE,GOLDEN_APPLE]);
// Local balance for the normal apple; no enchanted-apple resistance or fire immunity.
const GOLDEN_FOOD_LIMITS={regeneration:5,regenerationInterval:1.25,absorption:2,absorptionSeconds:120};
const goldenFoodEffects={regeneration:0,regenerationElapsed:0,absorption:0,absorptionSeconds:0};
const foodPatterns=new Map(),foodShapes=new Map(),foodCrumbs=[];
let goldenFoodInitialized=false,foodCrumbRoot=null,foodCrumbGeometry=null,foodCrumbMaterial=null,goldenFoodHUDKey='';

function isAnimatedFood(id){return ANIMATED_FOOD.has(id);}
function resetGoldenFoodEffects(){
    Object.assign(goldenFoodEffects,{regeneration:0,regenerationElapsed:0,absorption:0,absorptionSeconds:0});
    updateGoldenFoodHUD();
}
function saveGoldenFoodEffects(){return {...goldenFoodEffects};}
function restoreGoldenFoodEffects(data){
    const bounded=(value,max)=>Number.isFinite(value)?Math.max(0,Math.min(max,value)):0;
    goldenFoodEffects.regeneration=bounded(data?.regeneration,GOLDEN_FOOD_LIMITS.regeneration);
    goldenFoodEffects.regenerationElapsed=goldenFoodEffects.regeneration?bounded(data?.regenerationElapsed,GOLDEN_FOOD_LIMITS.regenerationInterval-.000001):0;
    goldenFoodEffects.absorptionSeconds=bounded(data?.absorptionSeconds,GOLDEN_FOOD_LIMITS.absorptionSeconds);
    goldenFoodEffects.absorption=goldenFoodEffects.absorptionSeconds?bounded(data?.absorption,GOLDEN_FOOD_LIMITS.absorption):0;
    if(isCreativeMode())resetGoldenFoodEffects();else updateGoldenFoodHUD();
}
function consumeAnimatedFood(id){
    if(!isAnimatedFood(id)||!consumeInventoryItem(id))return false;
    if(id===GOLDEN_APPLE){
        // Normal apple effects; each health/hunger unit is one existing HUD icon.
        // Recipe and effect types: https://www.minecraft.net/en-us/article/golden-apple
        hunger=Math.min(maxHunger,hunger+2);resetFoodTimers();
        if(!isCreativeMode())Object.assign(goldenFoodEffects,{
            regeneration:GOLDEN_FOOD_LIMITS.regeneration,regenerationElapsed:0,
            absorption:GOLDEN_FOOD_LIMITS.absorption,absorptionSeconds:GOLDEN_FOOD_LIMITS.absorptionSeconds
        });
    }else{
        // Preserve the existing meat and garden-apple full-day hunger protection.
        hunger=maxHunger;foodProtectionTimer=DAY_SECONDS;resetFoodTimers();
    }
    updateHUD();updateGoldenFoodHUD();return true;
}
function updateGoldenFoodEffects(delta){
    if(!playerIsActive()||!Number.isFinite(delta)||delta<=0)return;
    if(isCreativeMode()){resetGoldenFoodEffects();return;}
    const effects=goldenFoodEffects,elapsed=Math.min(delta,effects.regeneration);
    effects.regeneration=Math.max(0,effects.regeneration-delta);
    effects.regenerationElapsed+=elapsed;
    const previous=health;
    while(effects.regenerationElapsed+1e-9>=GOLDEN_FOOD_LIMITS.regenerationInterval){
        effects.regenerationElapsed=Math.max(0,effects.regenerationElapsed-GOLDEN_FOOD_LIMITS.regenerationInterval);
        health=Math.min(maxHealth,health+.5);
    }
    if(!effects.regeneration)effects.regenerationElapsed=0;
    effects.absorptionSeconds=Math.max(0,effects.absorptionSeconds-delta);
    if(!effects.absorptionSeconds)effects.absorption=0;
    if(health!==previous)updateHUD();
    updateGoldenFoodHUD();
}
function absorbGoldenFoodDamage(amount){
    if(!Number.isFinite(amount)||amount<=0)return 0;
    if(isCreativeMode()||!playerIsActive())return amount;
    const absorbed=goldenFoodEffects.absorptionSeconds>0?Math.min(amount,goldenFoodEffects.absorption):0;
    goldenFoodEffects.absorption=Math.max(0,goldenFoodEffects.absorption-absorbed);
    if(absorbed)updateGoldenFoodHUD();
    return amount-absorbed;
}
function updateGoldenFoodHUD(){
    const hud=document.getElementById('hud-container');if(!hud)return;
    let row=document.getElementById('golden-food-status');
    if(!row){
        row=document.createElement('div');row.id='golden-food-status';row.hidden=true;
        row.style.cssText='order:0;max-width:calc(100vw - 20px);min-height:18px;margin-bottom:4px;font:600 12px/18px sans-serif;text-align:center;text-shadow:1px 1px 2px #000;color:#ffe175;';
        hud.append(row);
    }
    const e=goldenFoodEffects,absorption=e.absorptionSeconds>0&&e.absorption>0?`\u2665 ${Math.ceil(e.absorption*2)/2}  ${Math.ceil(e.absorptionSeconds)}s`:'',
        regeneration=e.regeneration>0?`Regeneration ${Math.ceil(e.regeneration)}s`:'';
    const key=isCreativeMode()?'':[absorption,regeneration].filter(Boolean).join(' | ');
    if(key===goldenFoodHUDKey&&row.textContent===key)return;
    goldenFoodHUDKey=key;row.textContent=key;row.hidden=!key;
    row.setAttribute('aria-label',key?'Golden Apple: '+key.replace('\u2665','Absorption hearts'):'');
}

function foodPattern(id){
    if(foodPatterns.has(id))return foodPatterns.get(id);
    const apple=id===APPLE||id===GOLDEN_APPLE,golden=id===GOLDEN_APPLE;
    const palette=apple?{o:golden?'#865515':'#752c22',m:golden?'#e8b62f':'#d94a38',l:golden?'#ffe778':'#ff9a69',d:golden?'#c18420':'#ad3029',s:'#69502b',g:golden?'#d0bd42':'#628b38'}:
        {o:id===39?'#723233':'#513526',m:id===39?'#c95c53':'#985c36',l:id===39?'#f4b7a1':'#ce9153',d:id===39?'#983b3b':'#74432b',s:'#f4dfbe',g:'#f4dfbe'};
    const rows=apple?[
        '................','........s.......','.......ss.gg....','.......sggg.....',
        '...oooo.so.ooo..','..ommmoodoommmo.','.omllmmmmmmmmmo.','.omlmmmmmmmmmmmo',
        '.ommmmmmmmmmmmmo','.ommmmmmmmmmmmdo','.ommmmmmmmmmmddo','..ommmmmmmmmddo.',
        '..ommmmmmmmdddo.','...ommmdddmddo..','....oodoooodo...','................'
    ]:[
        '................','......oooo......','....oommmmoo....','...omllllmmmo...',
        '..omllmmmmmmo...','..omlmmmmmmmmo..','.ommmmmmmmdmmo..','.ommmmmmmdmmmo..',
        '.ommmmmddmmmo...','..ommmddmmmo....','...oommmmoo.....','.....oooooso....',
        '.........osso...','..........osso..','..........osso..','...........oo...'
    ];
    const grid=rows.map(row=>[...row.toLowerCase()].map(pixel=>palette[pixel]||null));
    const canvas=document.createElement('canvas');canvas.width=canvas.height=16;const ctx=canvas.getContext('2d');
    grid.forEach((row,y)=>row.forEach((color,x)=>{if(color){ctx.fillStyle=color;ctx.fillRect(x,y,1,1);}}));
    const result={grid,canvas};foodPatterns.set(id,result);return result;
}
function foodGeometry(id){
    if(foodShapes.has(id))return foodShapes.get(id);
    const positions=[],normals=[],colors=[];
    foodPattern(id).grid.forEach((row,y)=>row.forEach((color,x)=>{
        if(!color)return;
        const box=new THREE.BoxGeometry(.06,.06,.09).toNonIndexed();box.translate((x-7.5)*.06,(7.5-y)*.06,0);
        positions.push(...box.attributes.position.array);normals.push(...box.attributes.normal.array);
        const c=new THREE.Color(color);for(let i=0;i<box.attributes.position.count;i++)colors.push(c.r,c.g,c.b);box.dispose();
    }));
    const shape=new THREE.BufferGeometry();shape.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    shape.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));shape.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    shape.computeBoundingSphere();foodShapes.set(id,shape);return shape;
}
function buildHeldFood(id){
    const group=buildFirstPersonRig(false),food=new THREE.Mesh(foodGeometry(id).clone(),new THREE.MeshLambertMaterial({vertexColors:true}));
    group.userData.foodId=id;food.scale.setScalar(.53);food.position.set(0,.15,-.025);food.rotation.y=-.15;
    group.add(food);return group;
}
function animateHeldFood(state){
    const viewScale=Math.min(1,Math.max(.3,camera.aspect/1.1)),reach=Math.min(1,state.elapsed/.2);
    const chew=menuReducedMotion.matches?0:Math.sin(state.elapsed*24),x=Math.min(.4,camera.aspect*.4)-(1-viewScale)*.23;
    heldItemGroup.scale.setScalar(playerScale*viewScale);
    heldItemGroup.position.set((x*(1-reach)+(.10+chew*.012)*reach*viewScale)*playerScale,
        (-.4+reach*.23+Math.abs(chew)*.012)*playerScale,(-.8+reach*.25)*playerScale);
    heldItemGroup.rotation.set(-.25+chew*.035,.12,-.3);
}
function emitEatingCrumbs(id){
    if(menuReducedMotion.matches)return;
    if(!foodCrumbRoot){
        foodCrumbRoot=new THREE.Group();foodCrumbRoot.name='food-crumbs';camera.add(foodCrumbRoot);
        foodCrumbGeometry=new THREE.BoxGeometry(.018,.018,.018);foodCrumbMaterial=new THREE.MeshLambertMaterial({color:0xffffff});
    }
    foodCrumbMaterial.color.set(id===GOLDEN_APPLE?0xeac34c:id===APPLE?0xe8593f:id===39?0xc7796b:0xae7045);
    foodCrumbRoot.scale.setScalar(playerScale*Math.min(1,Math.max(.3,camera.aspect/1.1)));
    for(let i=0;i<3&&foodCrumbs.length<18;i++){
        const mesh=new THREE.Mesh(foodCrumbGeometry,foodCrumbMaterial);mesh.position.set(.02+Math.random()*.1,-.13+Math.random()*.03,-.43);
        foodCrumbRoot.add(mesh);foodCrumbs.push({mesh,age:0,vx:(Math.random()-.5)*.32,vy:.05+Math.random()*.1});
    }
}
function updateEatingCrumbs(delta){
    if(!Number.isFinite(delta)||delta<=0)return;
    for(let i=foodCrumbs.length-1;i>=0;i--){
        const c=foodCrumbs[i];c.age+=delta;c.vy-=delta*.9;c.mesh.position.x+=c.vx*delta;c.mesh.position.y+=c.vy*delta;
        c.mesh.rotation.z+=delta*4;c.mesh.scale.setScalar(Math.max(0,1-c.age/.45));
        if(c.age>=.45){foodCrumbRoot.remove(c.mesh);foodCrumbs.splice(i,1);}
    }
}
function clearEatingCrumbs(){
    foodCrumbs.length=0;
    if(foodCrumbRoot){foodCrumbRoot.clear();foodCrumbRoot.parent?.remove(foodCrumbRoot);foodCrumbRoot=null;foodCrumbGeometry.dispose();foodCrumbMaterial.dispose();foodCrumbGeometry=foodCrumbMaterial=null;}
}
function initGoldenFood(){
    if(goldenFoodInitialized)return;goldenFoodInitialized=true;
    NATURE_ITEMS[GOLDEN_APPLE]='Golden Apple';
    Object.assign(COMMAND_ITEMS,{golden_apple:GOLDEN_APPLE,'golden apple':GOLDEN_APPLE,'\u91d1\u82f9\u679c':GOLDEN_APPLE});
    recipes.push({ing:{[GOLD_INGOT]:8,[APPLE]:1},out:GOLDEN_APPLE,count:1});
    const slot=document.createElement('button');slot.className='slot';slot.id='inv-'+(GOLDEN_APPLE-12);slot.textContent='Golden Apple';
    slot.onclick=()=>selectSlot(GOLDEN_APPLE-12);document.getElementById('tab-build').append(slot);
    // The catalog creates Food after item initialization; garden IDs also permit harvest packets.
    queueMicrotask(()=>{const food=document.getElementById('tab-food');if(food){food.append(slot);filterCatalog();}});
    for(const id of ANIMATED_FOOD){
        const canvas=foodPattern(id).canvas,url=canvas.toDataURL();itemIcons.set(id,url);
        const cell=document.getElementById('inv-'+Object.keys(getInventorySlotMapping()).find(key=>getInventorySlotMapping()[key]===id));
        if(cell){cell.querySelector('img')?.remove();const image=document.createElement('img');image.alt='';image.src=url;cell.prepend(image);}
        if(id===GOLDEN_APPLE){const map=new THREE.CanvasTexture(canvas);map.minFilter=map.magFilter=THREE.NearestFilter;materials[id]=new THREE.MeshLambertMaterial({map,transparent:true,alphaTest:.5});}
    }
    updateGoldenFoodHUD();
}
