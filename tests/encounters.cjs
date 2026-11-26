const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');

(async()=>{
    const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
    try{
        const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        await page.addInitScript(()=>{requestAnimationFrame=()=>0;});
        await page.goto(process.env.GAME_URL||pathToFileURL(path.resolve(__dirname,'../game3d.html')).href,{timeout:120000});
        await page.waitForFunction(()=>typeof updateAdventureMobs==='function'&&expansionReady,null,{polling:50});
        // Optional isolated harness while the main HTML is owned by another agent.
        if(process.env.ENCOUNTER_HARNESS==='1'){
            if(!await page.evaluate(()=>typeof updateZombieEncounter==='function'))await page.addScriptTag({path:path.resolve(__dirname,'../encounter-rules.js')});
            await page.evaluate(()=>{
                if(!updateEntities.toString().includes('updateZombieEncounter(')){
                    let source=updateEntities.toString(),start=source.indexOf('const friendly=isCompanion(z);'),end=source.indexOf('z.soundTimer -= delta;',start);
                    if(start<0||end<0)throw Error('Cannot locate zombie integration boundary');
                    source=source.slice(0,start)+'updateZombieEncounter(z,delta);\n'+source.slice(end);
                    start=source.indexOf('z.attackCooldown=Math.max');end=source.indexOf('if (Math.abs(z.vx)',start);
                    if(start<0||end<0)throw Error('Cannot locate old zombie damage blocks');
                    updateEntities=(0,eval)('('+source.slice(0,start)+source.slice(end)+')');
                }
                if(!damageMob.toString().includes('encounterDamageAllowed(')){
                    const original=damageMob;
                    damageMob=function(entity,amount,source='player'){
                        if(!encounterDamageAllowed(source))return false;
                        return original(entity,amount,source);
                    };
                }
            });
        }
        assert(await page.evaluate(()=>typeof updateZombieEncounter==='function'&&updateEntities.toString().includes('updateZombieEncounter(')&&damageMob.toString().includes('encounterDamageAllowed(')),'Main encounter script and zombie/damage hooks are integrated');
        await page.evaluate(()=>{
            window.ok=(value,label)=>{if(!value)throw Error(label);};
            window.resetEncounters=()=>{
                clearCombatState();clearExpansionWorld();
                for(const list of [villagers,animals,zombies,creepers,endermen,droppedItems,explosionParticles]){for(const m of list)disposeModModel(m.mesh);list.length=0;}
                for(const group of chunkMeshes.values())for(const mesh of Object.values(group))releaseChunkMesh(mesh);
                chunkMeshes.clear();rebuildQueue.clear();worldMap.clear();modifiedColumns.clear();columnMinY.clear();chunkMaxY.clear();chunkScanYRanges.clear();heightCache.clear();
                currentDimension='overworld';selectedTerrain='plains';getSurfaceHeight=()=>79;gameMode='survival';gameDifficulty='normal';
                isGameStarted=true;controls.isLocked=true;isSleeping=false;isRespawning=false;playerScale=1;health=maxHealth;activeMech=null;resetPlayerFlight();
                dayTime=Math.PI/2;camera.position.set(30,81.1,0);adventurePlayerLast.copy(camera.position);
                for(let x=-35;x<=35;x++)for(let z=-35;z<=35;z++)setGenBlock(x,79,z,1);
            };
            window.encounterZombie=(x=0,z=0,friendly=false)=>{
                const m=spawnMobFromEgg(69,x,80,z);if(!friendly){m.eggId=null;m.friendly=false;}m.onGround=true;m.soundTimer=100;return m;
            };
            window.encounterVillager=(x=0,z=0,y=80)=>{
                spawnVillagerAt(x,y,z);const m=villagers.at(-1);m.timer=100;m.onGround=true;return m;
            };
            window.stepEncounters=(seconds,fn=updateEntities,fps=60)=>{for(let i=0;i<Math.ceil(seconds*fps);i++)fn(1/fps);};
            window.fixedEncounterRandom=(value,fn)=>{const original=Math.random;Math.random=()=>value;try{return fn();}finally{Math.random=original;}};
            window.encounterWall=(x,type=3)=>{for(let y=80;y<=85;y++)for(let z=-30;z<=30;z++)setGenBlock(x,y,z,type);};
            resetEncounters();
        });
        console.log(await page.evaluate(()=>{
            resetEncounters();let z=encounterZombie(),v=encounterVillager(3);camera.position.set(10,81.1,0);
            ok(selectHostileTarget(z)===v,'Closer villager wins over player');
            camera.position.x=1;ok(selectHostileTarget(z)===camera,'Closer visible Survival player can be targeted');
            camera.position.x=10;const ally=encounterZombie(1.5,0,true);
            ok(selectHostileTarget(z)===ally,'Closer friendly egg companion can be targeted');
            ally.dying=true;ok(selectHostileTarget(z)===v,'Dying companion is released');
            encounterWall(2);ok(selectHostileTarget(z)===null,'Opaque wall hides villagers and player');
            const visible=encounterVillager(-4);ok(selectHostileTarget(z)===visible,'Choose visible target instead of closer occluded target');
            visible.dimension='nether';ok(selectHostileTarget(z)===null,'Other-dimension target is excluded');
            visible.dimension='overworld';scene.remove(visible.mesh);ok(selectHostileTarget(z)===null,'Removed target is excluded');
            resetEncounters();z=encounterZombie();v=encounterVillager(22);camera.position.set(60,81.1,0);
            ok(selectHostileTarget(z)===null,'No global player fallback beyond detection range');
            z.wanderTime=10;z.wanderMoving=true;z.wanderAngle=-Math.PI/2;
            stepEncounters(2,dt=>updateZombieEncounter(z,dt));
            ok(z.mesh.position.x<-.3&&z.encounterTarget===null,'Untargeted zombie actually wanders independently of distant player');
            camera.position.set(-6,81.1,0);ok(selectHostileTarget(z)===camera,'Nearby player is acquired');
            camera.position.set(60,81.1,0);ok(selectHostileTarget(z)===null,'Player is released immediately outside range');
            v.mesh.position.set(1,89,0);ok(selectHostileTarget(z)===null,'Large vertical separation is outside detection');
            resetEncounters();camera.position.set(12,81.1,0);encounterVillager(4,-1.2);encounterVillager(4,1.2);
            const enemies=Array.from({length:6},(_,i)=>encounterZombie(0,(i-2.5)*.5));
            for(let n=0;n<4;n++)for(const m of enemies)selectHostileTarget(m);
            ok(enemies.every(m=>m.encounterTarget!==camera),'Crowd weighting never favors farther player over closer residents');
            ok(new Set(enemies.map(m=>m.encounterTarget)).size===2,'Similarly close villagers share a crowd of attackers');
            return 'PASS: bounded near/far/vertical detection, LOS, live targets, companions, wandering and crowd distribution.';
        }));
        console.log(await page.evaluate(()=>{
            resetEncounters();let z=encounterZombie(),v=encounterVillager(1.1);camera.position.set(8,81.1,0);
            updateEntities(.02);ok(v.hp===3&&health===maxHealth,'Actual zombie update damages nearby villager, not farther player');
            stepEncounters(.3);ok(v.hp===3,'Zombie melee uses a cooldown');
            stepEncounters(.65);ok(v.hp===2,'Zombie melee resumes after cooldown');
            resetEncounters();z=encounterZombie();camera.position.set(1,81.1,0);updateEntities(.02);
            ok(health<maxHealth,'Actual nearby Survival player takes zombie melee damage');
            resetEncounters();gameMode='creative';z=encounterZombie();v=encounterVillager(1.1);camera.position.set(.5,81.1,0);updateEntities(.02);
            ok(health===maxHealth&&v.hp===3&&z.encounterTarget===v,'Creative protects player, not villagers');
            resetEncounters();z=encounterZombie();v=encounterVillager(1.1);gameDifficulty='peaceful';camera.position.set(.5,81.1,0);
            stepEncounters(1);ok(v.hp===4&&health===maxHealth&&z.encounterTarget===null,'Peaceful disables all hostile zombie targets and attacks');
            ok(!damageMob(v,1,'hostile')&&!damageMob(v,1,'companion')&&v.hp===4,'Damage hook also rejects hostile and companion damage in Peaceful');
            ok(damageMob(v,1)&&v.hp===3,'Peaceful does not change deliberate player damage');
            resetEncounters();gameMode='creative';z=encounterZombie(-2);v=encounterVillager(2);encounterWall(0);
            stepEncounters(4);ok(v.hp===4&&z.mesh.position.x<-.8,'Occluded zombie neither hits through nor crosses a wall');
            for(const down of [true,false]){
                resetEncounters();gameMode='creative';
                for(let x=-3;x<=2;x++)for(let depth=-4;depth<=4;depth++)setGenBlock(x,80,depth,3);
                z=encounterZombie(down?0:6);z.mesh.position.y=down?81:80;
                encounterVillager(down?7:0,0,down?80:81);stepEncounters(8,dt=>updateZombieEncounter(z,dt));
                ok(down?z.mesh.position.x>3&&Math.abs(z.mesh.position.y-80)<.01:z.mesh.position.x<2&&Math.abs(z.mesh.position.y-81)<.01,'Hostile travel crosses a one-block '+(down?'descent':'step'));
                ok(!mobBodyBlocked(z.mesh.position,1.95,.35),'Stepping hostile stays outside solid terrain');
            }
            resetEncounters();camera.position.set(0,81.1,10);const ally=encounterZombie(0,0,true),creeper=spawnMobFromEgg(68,-2,80,0);
            stepEncounters(2);ok(ally.mesh.position.z>2&&creeper.mesh.position.z>2&&health===maxHealth,'Original egg companions still follow without hurting owner');
            resetEncounters();camera.position.set(0,81.1,8);const friend=encounterZombie(0,0,true),enemy=encounterZombie(1.1);friend.hp=10;
            stepEncounters(.1);ok(enemy.hp<3&&friend.hp<10,'Original companion combat and hostile retaliation still work');
            return 'PASS: integrated zombie movement/melee/cooldown, walls, Creative/Peaceful and original companion eggs.';
        }));
        console.log(await page.evaluate(()=>{
            for(const [random,size] of [[0,3],[.5,4],[.999,5]]){
                resetEncounters();gameMode='creative';dayTime=Math.PI*1.5;
                ok(fixedEncounterRandom(random,()=>startVillageRaid({x:0,y:79,z:0,farm:false})),'Start Creative night raid');
                ok(adventureMobs.length===size,'Party size '+size);
                const party=adventureMobs[0].party,first=adventureMobs[0].mesh.position.clone();
                ok(adventureMobs.every(m=>m.party===party&&m.raid&&m.mesh.position.distanceTo(first)<7),'Same party, same approach side, compact formation');
                const before=adventureMobs.map(m=>m.mesh.position.clone()),centroid=before.reduce((a,p)=>a.add(p),new THREE.Vector3()).multiplyScalar(1/size);
                stepEncounters(5,updateAdventureMobs,30);
                ok(adventureMobs.length===size,'No per-frame spawning during travel');
                const after=adventureMobs.reduce((a,m)=>a.add(m.mesh.position),new THREE.Vector3()).multiplyScalar(1/size);
                ok(after.length()<centroid.length()&&before.every((p,i)=>p.distanceTo(adventureMobs[i].mesh.position)>4),'Every party member travels toward shared destination');
                ok(adventureMobs.every(a=>adventureMobs.every(b=>a===b||a.mesh.position.distanceTo(b.mesh.position)>.6)),'Travel formation does not collapse into one position');
                ok(!startVillageRaid({x:0,y:79,z:0,farm:false}),'Only one visit per village each night');
            }
            resetEncounters();gameMode='creative';dayTime=Math.PI*1.5;setGenBlock(-22,80,0,3);setGenBlock(-22,81,0,3);
            ok(fixedEncounterRandom(.5,()=>startVillageRaid({x:0,y:79,z:0,farm:false})),'Blocked leader spawn still permits a safe three-member party');
            ok(adventureMobs.length===3&&adventureMobs[0].partyOffset.every(v=>v===0),'First safe member leads to shared destination even when original leader slot is blocked');
            const originalHeight=getSurfaceHeight;getSurfaceHeight=(x,z)=>79+Math.round(z)*4;
            const beforeCliff=adventureMobs.length,cliffParty=fixedEncounterRandom(.5,()=>spawnPillagerParty([0,80,0]));getSurfaceHeight=originalHeight;
            ok(!cliffParty&&adventureMobs.length===beforeCliff,'Disjoint cliff elevations cannot create a scattered partial party');
            resetEncounters();gameMode='creative';dayTime=Math.PI*1.5;setGenBlock(6,80,-10,WHEAT_RIPE);setGenBlock(7,80,-10,WHEAT_RIPE);
            ok(fixedEncounterRandom(0,()=>startVillageRaid({x:0,y:79,z:0,farm:true})),'Start field raid');
            stepEncounters(55,updateAdventureMobs,30);
            ok(!adventureMobs.length&&droppedItems.some(m=>m.itemType===WHEAT&&m.count===2),'Party reaches crop, takes limited loot, returns together and leaves recovered loot');
            ok(getBlock(7,80,-10)===WHEAT_RIPE,'Party does not strip additional crops');
            ok(!startVillageRaid({x:0,y:79,z:0,farm:true}),'Departed party cannot repeat visit that night');
            dayTime=Math.PI/2;updateAdventureMobs(.01);ok(!startVillageRaid({x:0,y:79,z:0,farm:true}),'No day raid');
            dayTime=Math.PI*1.5;gameDifficulty='peaceful';ok(!startVillageRaid({x:0,y:79,z:0,farm:true}),'No Peaceful raid');
            gameDifficulty='normal';ok(startVillageRaid({x:0,y:79,z:0,farm:true}),'Next night can visit again');
            resetEncounters();gameMode='creative';
            fixedEncounterRandom(.5,()=>spawnPillagerParty([0,80,0]));
            fixedEncounterRandom(.5,()=>spawnPillagerParty([-25,80,-20]));
            ok(adventureMobs.length===8&&!spawnPillagerParty([30,80,30]),'Natural global cap is eight, never partial solitary spawns');
            clearAdventureMobs();
            for(let i=0;i<18;i++)spawnAdventureMob(PILLAGER_EGG,-30+(i%6)*3,80,-25+Math.floor(i/6)*3);
            ok(adventureMobs.length===18&&!spawnPillagerParty([0,80,0])&&adventureMobs.length===18,'Egg mobs count toward total cap; fewer than three free slots cannot spawn a party');
            resetEncounters();selectedTerrain='desert';camera.position.set(0,81.1,0);adventureSpawnTime=19;
            updateAdventureMobs(.9);ok(!adventureMobs.length,'Desert spawning waits for interval');
            fixedEncounterRandom(.5,()=>updateAdventureMobs(.11));
            ok(adventureMobs.length===4&&adventureMobs.every(m=>m.party&&!m.raid&&!m.eggId),'Ordinary desert encounter is a coherent party');
            const destination=adventureMobs[0].party.destination.slice();camera.position.set(150,81.1,150);updateAdventureMobs(.01);
            ok(adventureMobs[0].party.destination.join(',')===destination.join(',')&&adventureMobs.every(m=>!m.encounterTarget),'Party route does not globally track distant player');
            return 'PASS: 3/4/5 same-side parties, formation travel, crops/retreat, bounded counts, timed desert spawning and Creative raids.';
        }));
        console.log(await page.evaluate(()=>{
            for(const fps of [30,60,120])for(const [distance,y] of [[2,80],[8,80],[17,83]]){
                resetEncounters();gameMode='creative';const p=spawnAdventureMob(PILLAGER_EGG,0,80,0),v=encounterVillager(distance,0,y);camera.position.set(4,81.1,0);p.attackTimer=0;
                updateAdventureMobs(.01);ok(flyingArrows.length===1&&flyingArrows[0].target===v,'Pillager fires toward actual villager target');
                stepEncounters(1.5,updateFlyingArrows,fps);
                ok(v.hp===2&&health===maxHealth,'Villager arrow hit at '+distance+' blocks, '+fps+' fps; Creative player immune');
            }
            resetEncounters();let p=spawnAdventureMob(PILLAGER_EGG,0,80,0),v=encounterVillager(8);camera.position.set(15,81.1,0);p.attackTimer=0;updateAdventureMobs(.01);
            stepEncounters(1,updateFlyingArrows);ok(v.hp===2&&health===maxHealth,'Survival pillager chooses nearer villager and damages it');
            resetEncounters();p=spawnAdventureMob(PILLAGER_EGG,0,80,0);const ally=encounterZombie(8,0,true);camera.position.set(15,81.1,0);p.attackTimer=0;updateAdventureMobs(.01);
            stepEncounters(1,updateFlyingArrows);ok(ally.hp===1&&health===maxHealth,'Enemy arrow can hit a friendly egg companion');
            resetEncounters();p=spawnAdventureMob(PILLAGER_EGG,0,80,0);camera.position.set(8,81.1,0);p.attackTimer=0;updateAdventureMobs(.01);stepEncounters(1,updateFlyingArrows);
            ok(health<maxHealth,'Enemy arrow still hits Survival player');
            resetEncounters();p=spawnAdventureMob(PILLAGER_EGG,0,80,0);camera.position.set(8,81.1,0);p.attackTimer=0;updateAdventureMobs(.01);gameMode='creative';stepEncounters(1,updateFlyingArrows);
            ok(health===maxHealth,'Switching to Creative protects against arrows already in flight');
            resetEncounters();gameMode='creative';p=spawnAdventureMob(PILLAGER_EGG,0,80,0);v=encounterVillager(8);p.attackTimer=0;updateAdventureMobs(.01);gameDifficulty='peaceful';stepEncounters(1,updateFlyingArrows);
            ok(v.hp===4&&!firePillagerArrow(p,v),'Peaceful disables in-flight damage and new shots against villagers');
            resetEncounters();gameMode='creative';p=spawnAdventureMob(PILLAGER_EGG,0,80,0);v=encounterVillager(8);p.attackTimer=0;updateAdventureMobs(.01);encounterWall(4);updateFlyingArrows(.7);
            ok(v.hp===4&&flyingArrows[0]?.stuck?.[0]===4,'Inserted wall stops actual arrow, even on long frame');
            clearFlyingArrows();p.attackTimer=0;updateAdventureMobs(.01);ok(!flyingArrows.length,'Occluded villager cannot trigger firing');
            resetEncounters();gameMode='creative';p=spawnAdventureMob(PILLAGER_EGG,0,80,0);v=encounterVillager(10);ok(firePillagerArrow(p,v),'Explicit valid target launches arrow');
            const nearer=encounterVillager(5);stepEncounters(1,updateFlyingArrows);ok(nearer.hp===2&&v.hp===4,'Only first intercepted victim is hit');
            resetEncounters();const w=spawnAdventureMob(WARDEN_EGG,0,80,0);camera.position.set(0,81.1,10);adventurePlayerLast.copy(camera.position);updateAdventureMobs(.05);
            ok(w.heard===0&&w.vz===0,'Warden stays blind to silent player');camera.position.z-=.1;updateAdventureMobs(.05);ok(w.heard>0&&w.vz>0,'Warden still responds to footsteps');
            gameMode='creative';camera.position.set(0,81.1,1.6);w.attackTimer=0;updateAdventureMobs(.05);ok(health===maxHealth,'Warden Creative safety unchanged');
            gameMode='survival';gameDifficulty='peaceful';updateAdventureMobs(.05);ok(health===maxHealth,'Warden Peaceful safety unchanged');
            gameDifficulty='normal';w.attackTimer=0;updateAdventureMobs(.05);ok(health<maxHealth,'Warden close melee unchanged');
            return 'PASS: actual arrows at multiple ranges/elevations/FPS, villagers/companions/player, wall impact, mode changes and unchanged Warden rules.';
        }));
        await page.evaluate(()=>{
            resetEncounters();gameMode='creative';dayTime=Math.PI*1.5;
            fixedEncounterRandom(.5,()=>startVillageRaid({x:0,y:79,z:0,farm:false}));
            for(let x=-2;x<=1;x++)for(let z=-1;z<=1;z++)buildChunkMesh(x,z);
            window.encounterView=()=>{
                const center=adventureMobs.reduce((p,m)=>p.add(m.mesh.position),new THREE.Vector3()).multiplyScalar(1/adventureMobs.length);
                camera.position.copy(center).add(new THREE.Vector3(6,5,11));camera.lookAt(center.clone().add(new THREE.Vector3(0,.6,0)));camera.updateMatrixWorld(true);
            };
            scene.background=new THREE.Color(0xa3cddf);scene.fog=null;clouds.visible=false;heldItemGroup.visible=false;ambientLight.intensity=.7;dirLight.intensity=.8;
            blocker.style.display='none';inventoryUI.style.display='none';document.getElementById('toast-msg').style.display='none';
            window.encounterPixels=()=>{
                renderer.render(scene,camera);const gl=renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
                gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;
            };
        });
        for(const width of [1200,390]){
            await page.setViewportSize({width,height:width===1200?800:844});
            await page.waitForFunction(w=>renderer.domElement.clientWidth===w,width,{polling:50});
            console.log(await page.evaluate(()=>{
                encounterView();const before=encounterPixels(),colors=new Set();for(let i=0;i<before.length;i+=256)colors.add(before.slice(i,i+3).join(','));
                ok(colors.size>30,'Nonblank scene containing textured party models');
                for(const m of adventureMobs){const p=new THREE.Box3().setFromObject(m.mesh).getCenter(new THREE.Vector3()).project(camera);ok(Math.abs(p.x)<.95&&Math.abs(p.y)<.95,'Every party member is framed');}
                stepEncounters(.5,updateAdventureMobs);const after=encounterPixels();let changed=0;for(let i=0;i<before.length;i++)if(before[i]!==after[i])changed++;
                ok(changed>200,'Party visibly travels between rendered frames');return {width:innerWidth,colors:colors.size,changedPixels:changed};
            }));
            await page.screenshot({path:`/private/tmp/mc-encounters-${width}.png`});
        }
        assert.deepEqual(errors,[]);console.log('PASS: integrated local encounter behavior and desktop/mobile rendered travel; no browser errors.');
    }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
