const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
    const browser=await chromium.launch({headless:true,
        ...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
    try {
        const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
        page.on('pageerror',e=>errors.push(e.message));
        await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
        await page.goto(pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await page.waitForFunction(()=>typeof fireHandCannon==='function');
        const checks=await page.evaluate(()=>{
            const passed=[],check=(ok,label)=>{if(!ok) throw new Error(label);passed.push(label);};
            const resetMobs=()=>{
                for(const mob of [...zombies,...creepers,...villagers,...animals]) scene.remove(mob.mesh);
                zombies=[];creepers=[];villagers=[];animals=[];clearCombatState();
            };
            const hostile=(id,x,z)=>{const m=spawnMobFromEgg(id,x,1,z);delete m.eggId;m.friendly=false;return m;};
            const aim=(x,y,z)=>{camera.lookAt(x,y,z);camera.updateMatrixWorld(true);};
            const step=(n=120)=>{for(let i=0;i<n;i++) updateEntities(1/60);};
            selectedTerrain='moon';currentDimension='overworld';getSurfaceHeight=()=>0;
            worldMap.clear();heightCache.clear();restoreMicroEdits([]);
            for(let x=-20;x<=20;x++) for(let z=-24;z<=20;z++) worldMap.set(`${x},0,${z}`,3);
            gameMode='survival';isGameStarted=true;isRespawning=false;isSleeping=false;controls.isLocked=true;
            camera.position.set(0,2.1,0);health=maxHealth;
            let ally=spawnMobFromEgg(69,0.6,1,0),creeper=spawnMobFromEgg(68,-0.6,1,0);
            step(240);
            check(health===maxHealth,'Summoned zombie never damages its nearby owner in Survival');
            check(creepers.includes(creeper) && creeper.fuseTimer===0 && explosionParticles.length===0,'Summoned creeper never ignites or explodes near the player');
            check(ally.mesh.children.some(m=>m.material && m.material.color.getHex()===0x46d9c2),'Companions have a visible turquoise band');
            camera.position.z=10;
            const oldZombieZ=ally.mesh.position.z,oldCreeperZ=creeper.mesh.position.z;
            step(120);
            check(ally.mesh.position.z>oldZombieZ+1 && creeper.mesh.position.z>oldCreeperZ+1,'Both companions follow the player');
            check(health===maxHealth,'Following companions still cause no player damage');
            const setIntervalBefore=window.setInterval;
            let wakeTick;
            window.setInterval=fn=>{wakeTick=fn;return 0;};
            sleepUntilMorning();window.setInterval=setIntervalBefore;
            for(let i=0;i<10;i++) wakeTick();
            check(zombies.includes(ally) && creepers.includes(creeper) && !isSleeping,'Sleeping preserves both companions');
            controls.isLocked=true;

            resetMobs();camera.position.set(0,2.1,8);
            ally=spawnMobFromEgg(69,0,1,0);ally.hp=10;
            const enemy=hostile(69,0,1.1);step(65);
            check(enemy.hp<3,'Companion zombie attacks a wild zombie');
            check(ally.hp<10,'Wild zombies can fight back against a companion');
            resetMobs();ally=spawnMobFromEgg(69,0,1,0);const hostileCreeper=hostile(68,0,1.1);
            step(10);check(hostileCreeper.hp<3,'Companion zombie attacks wild creepers too');

            resetMobs();camera.position.set(0,2.1,8);
            ally=spawnMobFromEgg(69,0,1,0);creeper=spawnMobFromEgg(68,0.8,1,0);
            spawnVillagerAt(-1,1,0);const peaceful=villagers[0];peaceful.timer=100;
            step(120);
            check(ally.hp===3 && creeper.hp===3 && peaceful.hp===4,'Companions do not attack each other or peaceful villagers on their own');
            ally.mesh.position.set(-1,1,0.9);damageMob(peaceful,1);step(1);
            check(peaceful.hp===2,'Companion assists against a villager the player deliberately attacks');
            resetMobs();camera.position.set(0,2.1,8);
            ally=spawnMobFromEgg(69,0,1,-0.65);const walled=hostile(69,0,0.65);
            for(let y=1;y<=3;y++) for(let x=-2;x<=2;x++) worldMap.set(`${x},${y},0`,3);
            step(180);
            check(walled.hp===3 && ally.hp===3,'A wall prevents companion and hostile melee damage');
            check(ally.mesh.position.z<-0.5,'Companion does not walk through the wall');
            for(let y=1;y<=3;y++) for(let x=-2;x<=2;x++) worldMap.delete(`${x},${y},0`);

            resetMobs();camera.position.set(0,2.1,0);const natural=hostile(69,0.7,0);health=maxHealth;step(10);
            check(health<maxHealth,'Natural zombies remain hostile to the player');
            resetMobs();camera.position.set(0,2.1,6);health=maxHealth;
            spawnVillagerAt(0,1,0);const villager=villagers[0];
            aim(0,2.05,0);selectSlot(26);
            document.dispatchEvent(new MouseEvent('mousedown',{button:2}));
            check(villager.hp===1 && villager.hurtTimer>0,'Actual gun right-click hits a villager head and triggers hurt feedback');
            check(document.getElementById('trade-ui').style.display==='none','Gun firing does not open villager trading');
            document.dispatchEvent(new MouseEvent('mousedown',{button:2}));
            check(villager.dying,'Repeated gun hits defeat the villager');

            resetMobs();spawnVillagerAt(0,1,0);const behind=villagers[0];aim(0,1.4,0);
            for(let y=1;y<=3;y++) worldMap.set(`0,${y},3`,3);
            shootRangedWeapon(35);
            check(behind.hp===4,'Gun hits the wall before a villager behind it');
            check([1,2,3].filter(y=>getBlock(0,y,3)===0).length===1,'Gun retains single-block breaking without penetrating on the same shot');
            for(let y=1;y<=3;y++) worldMap.delete(`0,${y},3`);
            spawnVillagerAt(0,1,3);const nearer=villagers[1];shootRangedWeapon(35);
            check(nearer.hp===1 && behind.hp===4,'Gun hits only the closest villager');
            aim(2,1.4,0);shootRangedWeapon(35);
            check(nearer.hp===1 && behind.hp===4,'Gun near misses do not use an oversized hit sphere');
            worldMap.set('1,2,6',3);
            check(!traceCombatRay(new THREE.Vector3(0.5,2,6),new THREE.Vector3(-1,0,0),2,false).block,
                'A shot moving away from a block face cannot hit the block behind it');worldMap.delete('1,2,6');
            resetMobs();ally=spawnMobFromEgg(69,0,1,0);creeper=spawnMobFromEgg(68,3,1,0);
            aim(0,1.4,0);shootRangedWeapon(35);aim(3,1.4,0);shootRangedWeapon(35);
            check(ally.hp===3 && creeper.hp===3,'Gun cannot accidentally damage companions');
            check(!damageMob(ally,100) && !damageMob(creeper,100),'Melee friendly fire is also disabled');

            resetMobs();gameMode='creative';camera.position.set(0,2.1,6);
            for(const id of [70,71]) {
                enterMech(id);updateMechView(1);selectSlot(id-12);
                spawnVillagerAt(0,1,-12);const target=villagers[villagers.length-1];target.hp=9;
                aim(0,1.5,-12);mechAttackTime=-Infinity;
                document.dispatchEvent(new MouseEvent('mousedown',{button:0}));
                check(cannonProjectiles.length===1 && target.hp===9,`Mech ${id} creates a flying cannon bolt before damage`);
                check(cannonProjectiles[0].mesh.material.color.getHex()===(id===70?0x63dfff:0xffcf40),`Mech ${id} has its own cannon color`);
                const start=cannonProjectiles[0].mesh.position.clone();
                updateCombatEffects(0.05);
                check(cannonProjectiles[0].mesh.position.distanceTo(start)>1,`Mech ${id} projectile visibly moves`);
                check(!fireHandCannon(),`Mech ${id} cannon has a firing cooldown`);
                for(let i=0;i<30;i++) updateCombatEffects(0.05);
                check(target.hp===6 && !cannonProjectiles.length,`Mech ${id} bolt damages its target exactly once`);
                const cannon=mechVisual.userData.cannon;
                check(cannon.visible && mechVisual.userData.muzzle,'Robot model has an actual arm-mounted barrel and muzzle');
                transformMech();for(let i=0;i<20;i++) updateMechView(0.05);
                mechAttackTime=-Infinity;
                check(!fireHandCannon() && !cannon.visible,'Vehicle form cannot fire a hidden robot cannon');
                transformMech();for(let i=0;i<20;i++) updateMechView(0.05);
                scene.remove(target.mesh);villagers.splice(villagers.indexOf(target),1);
            }
            resetMobs();spawnVillagerAt(0,1,-8);const shielded=villagers[0];
            aim(0,1.4,-8);
            for(let x=-2;x<=2;x++) for(let y=1;y<=4;y++) worldMap.set(`${x},${y},0`,3);
            mechAttackTime=-Infinity;fireHandCannon();for(let i=0;i<20;i++) updateCombatEffects(0.08);
            check(shielded.hp===4 && getBlock(0,2,0)===3,'Fast cannon projectile cannot tunnel through or destroy a wall');
            for(let x=-2;x<=2;x++) for(let y=1;y<=4;y++) worldMap.delete(`${x},${y},0`);
            resetMobs();aim(0,4,-30);mechAttackTime=-Infinity;
            document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyF'}));
            check(cannonProjectiles.length===1,'F fires the cannon through the keyboard handler');
            const paused=cannonProjectiles[0].mesh.position.clone();controls.isLocked=false;updateCombatEffects(0.1);
            check(cannonProjectiles[0].mesh.position.equals(paused),'Cannon flight pauses with the game');controls.isLocked=true;
            for(let i=0;i<30;i++) updateCombatEffects(0.1);
            check(!cannonProjectiles.length && !combatEffects.length,'Missed shots and transient effects expire cleanly');
            ally=spawnMobFromEgg(69,0,1,-6);aim(0,1.4,-6);mechAttackTime=-Infinity;fireHandCannon();
            for(let i=0;i<20;i++) updateCombatEffects(0.05);
            check(ally.hp===3 && !cannonProjectiles.length,'Hand cannon stops on a companion without friendly-fire damage');
            scene.remove(ally.mesh);zombies.splice(zombies.indexOf(ally),1);
            mechAttackTime=-Infinity;fireHandCannon();clearCombatState();
            check(!cannonProjectiles.length && !combatEffects.length && !companionOrder,'Reset clears combat state and effects');

            spawnMobFromEgg(69,-3,1,0);spawnMobFromEgg(68,3,1,0);
            controls.isLocked=false;document.getElementById('blocker').style.display='none';
            for(let x=-1;x<=0;x++) for(let z=-1;z<=0;z++) buildChunkMesh(x,z);
            scene.fog=null;scene.background.setHex(0x91c8e3);ambientLight.intensity=0.55;dirLight.intensity=0.7;
            aim(0,1.5,-12);updateMechView(0);controls.isLocked=true;mechAttackTime=-Infinity;fireHandCannon();updateCombatEffects(0.3);
            renderer.render(scene,updateMechView(0));
            return passed;
        });
        console.log(JSON.stringify(checks,null,2));
        await page.screenshot({path:'/private/tmp/companions-cannon-desktop.png'});
        for(const width of [1280,390]) {
            await page.setViewportSize({width,height:width===390?844:800});
            const pixels=await page.evaluate(()=>{
                camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();mechCamera.aspect=camera.aspect;mechCamera.updateProjectionMatrix();
                renderer.setSize(innerWidth,innerHeight);renderer.render(scene,updateMechView(0));
                const gl=renderer.getContext(),p=new Uint8Array(4),colors=new Set();
                const bolt=cannonProjectiles[0].mesh.position.clone().project(mechCamera);
                gl.readPixels(Math.round((bolt.x+1)*0.5*gl.drawingBufferWidth),Math.round((bolt.y+1)*0.5*gl.drawingBufferHeight),1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);
                if(p[0]<240 || p[1]<185 || p[1]>220 || p[2]>90) throw new Error(`Cannon bolt is hidden: ${Array.from(p)} at ${innerWidth}px`);
                for(let x=.2;x<.8;x+=.05) for(let y=.2;y<.8;y+=.05) {
                    gl.readPixels(Math.floor(x*gl.drawingBufferWidth),Math.floor(y*gl.drawingBufferHeight),1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);colors.add(p.join(','));
                }
                return colors.size;
            });
            assert.ok(pixels>8,'Cannon gameplay canvas is nonblank');
        }
        await page.screenshot({path:'/private/tmp/companions-cannon-mobile.png'});
        const downloadEvent=page.waitForEvent('download');await page.evaluate(()=>downloadSave());const download=await downloadEvent;
        const save=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
        await page.locator('#load-file').setInputFiles({name:'companions.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(save))});
        await page.waitForFunction(()=>zombies.length===1 && creepers.length===1);
        assert.ok(await page.evaluate(()=>isCompanion(zombies[0]) && isCompanion(creepers[0]) && !cannonProjectiles.length));
        assert.deepEqual(errors,[]);
        console.log('PASS: Legacy egg saves restore companions; cannon effects render on desktop/mobile without browser errors.');
    } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
