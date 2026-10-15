const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
    const browser = await chromium.launch({headless:true,
        ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
    try {
        const errors = [];
        if (!process.env.LIVE_ONLY) {
        const page = await browser.newPage({viewport:{width:1280,height:800}});
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => {if(m.type()==='info') console.log(m.text());});
        await page.addInitScript(() => {window.requestAnimationFrame=()=>0;});
        await page.goto(pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await page.waitForFunction(() => typeof getPlayerEnvironment === 'function');
        console.log(await page.evaluate(() => {
            const passed=[];
            const check=(value,name)=>{if(!value) throw new Error(name); passed.push(name);};
            const tick=(count=60)=>{for(let i=0;i<count;i++) updatePlayerMovement(1/60);};
            const key=(code,type='keydown',repeat=false,target=document)=>target.dispatchEvent(new KeyboardEvent(type,{code,repeat,bubbles:true,cancelable:true}));
            const tap=()=>{key('Space');key('Space','keyup');};
            selectedTerrain='moon'; currentDimension='overworld'; getSurfaceHeight=()=>-100;
            isGameStarted=true; controls.isLocked=true; gameMode='survival';
            const reset=(scale=1)=>{
                resetPlayerFlight();clearMech();worldMap.clear();restoreMicroEdits([]);
                playerScale=scale;camera.rotation.set(0,0,0);camera.updateMatrixWorld(true);
                playerTired=false;controls.isLocked=true;gameMode='survival';
            };
            const put=(x,y,z,type)=>{
                if(isTinyMode()) setMicroPlacement(microCellAt(x,y,z),type);
                else worldMap.set(`${Math.round(x)},${Math.round(y)},${Math.round(z)}`,type);
            };
            for(const scale of [1,0.05,0.005,0.0005,0.00005,0.000005,0.0000005]) {
                reset(scale);
                const base=isTinyMode()?0.5:0, s=playerScale;
                for(let x=-2;x<=2;x++) for(let z=-2;z<=2;z++) for(let y=0;y<5;y++) {
                    put(base+(x+0.5)*s,base+(y+0.5)*s,base+(z+0.5)*s,24);
                }
                camera.position.set(base+0.5*s,base+2.8*s,base+0.5*s);
                const start=camera.position.y;
                check(getPlayerEnvironment().waterFraction>0.99,`Water detects full body at scale ${s}`);
                tick();
                check(camera.position.y>start+0.5*s,`Water provides buoyancy at scale ${s}`);
                tick(600);
                const floating=camera.position.y;
                tick(120);
                check(Math.abs(camera.position.y-floating)<s*0.01,`Buoyancy settles at the surface at scale ${s}`);
                check(!getPlayerEnvironment().headInWater,`Floating restores air at scale ${s}`);
                camera.position.y=start;velocity.set(0,-100*s,0);holdingSpace=true;
                tick(10);
                check(camera.position.y>start+0.5*s,`Space swims up even after falling at scale ${s}`);

                reset(scale);
                for(let y=0;y<10;y++) put(base+0.5*s,base+(y+0.5)*s,base+0.5*s,7);
                camera.position.set(base+0.5*s,base+2*s,base+0.5*s);
                check(getPlayerEnvironment().onLadder,`Ladder is detected at scale ${s}`);
                holdingSpace=true;tick(30);
                check(camera.position.y>base+3.5*s,`Space climbs ladder at scale ${s}`);
                holdingSpace=false;const rest=camera.position.y;tick(30);
                check(Math.abs(camera.position.y-rest)<s*0.0001,`Ladder holds the player at scale ${s}`);
                moveBackward=true;tick(4);moveBackward=false;
                check(camera.position.y<rest-0.1*s,`Backward descends ladder at scale ${s}`);
                camera.position.x=base+2*s;
                check(!getPlayerEnvironment().onLadder,`Nearby empty cell does not act as ladder at scale ${s}`);

                reset(scale);gameMode='creative';camera.position.set(base+0.5*s,base+20*s,base+0.5*s);
                tap();tick(1);tap();
                check(creativeFlying && !holdingSpace,`Double Space enables hover at scale ${s}`);
                const hover=camera.position.y;tick(60);
                check(camera.position.y===hover,`Released controls hover without gravity at scale ${s}`);
                moveForward=true;const oldZ=camera.position.z;tick(60);moveForward=false;
                check(camera.position.z<oldZ-3*s && camera.position.y===hover,`Flying forward keeps height at scale ${s}`);
                key('Space');tick(30);key('Space','keyup');
                check(camera.position.y>hover+2.5*s,`Space ascends at scale ${s}`);
                const upper=camera.position.y;key('KeyB');tick(15);key('KeyB','keyup');
                check(camera.position.y<upper-1.2*s,`B descends at scale ${s}`);
                const stop=camera.position.y;tick(30);
                check(camera.position.y===stop,`Releasing B stops descent at scale ${s}`);
                lastSpaceTapAt=-Infinity;tap();tap();tick(10);
                check(!creativeFlying && camera.position.y<stop,`Double Space exits flight at scale ${s}`);
                console.info(`PASS: Buoyancy, swimming, climbing and flying at scale ${s}`);
            }

            reset(0.005);camera.position.set(0.5025,1.01,0.5025);
            worldMap.set('1,1,1',24);
            check(getPlayerEnvironment().waterFraction>0.99,'Tiny player also floats in ordinary full-sized water');
            worldMap.set('1,1,1',7);moveForward=true;const climb=camera.position.y;tick(5);
            check(camera.position.y>climb,'Forward climbs a full-sized ladder while tiny');

            reset();gameMode='creative';camera.position.set(0,5,0);
            tap();key('Space','keydown',true);key('Space','keyup');
            check(!creativeFlying,'Keyboard repeat cannot trigger double tap');
            lastSpaceTapAt=performance.now()-500;tap();
            check(!creativeFlying,'Separated taps do not enable flight');
            resetPlayerFlight();gameMode='survival';tap();tap();
            check(!creativeFlying,'Survival has no flight');
            gameMode='creative';resetPlayerFlight();controls.isLocked=false;tap();tap();
            check(!creativeFlying && !holdingSpace,'Menu key presses cannot trigger flight');
            controls.isLocked=true;const input=document.createElement('input');document.body.appendChild(input);
            key('Space','keydown',false,input);key('KeyB','keydown',false,input);
            check(!holdingSpace && !holdingDescend,'Typing in a field does not move the player');input.remove();
            tap();tap();key('KeyB');controls.dispatchEvent({type:'unlock'});
            check(creativeFlying && !holdingDescend && !holdingSpace && velocity.length()===0,'Pause clears stuck controls but preserves flight');
            setGameModeChoice('survival');
            check(!creativeFlying,'Switching to Survival cancels flight');

            reset();gameMode='creative';worldMap.set('0,0,0',3);camera.position.set(0,2.01,0);
            tap();tap();key('Space');tick(12);key('Space','keyup');
            check(creativeFlying && camera.position.y>2.5 && !checkScaledCollision(camera.position),'Instant double tap takes off from the legacy walking floor contact');

            for(const scale of [1,0.05,0.005]) {
                reset(scale);gameMode='creative';creativeFlying=true;
                const s=scale,base=isTinyMode()?0.5:0;
                for(let x=-3;x<=3;x++) for(let z=-3;z<=3;z++) {
                    put(base+(x+0.5)*s,base+0.5*s,base+(z+0.5)*s,3);
                    put(base+(x+0.5)*s,base+5.5*s,base+(z+0.5)*s,3);
                }
                camera.position.set(base+0.5*s,base+3.2*s,base+0.5*s);
                holdingSpace=true;tick(60);
                check(camera.position.y<base+5.5*s && !checkScaledCollision(camera.position),`Flight cannot cross ceiling at scale ${s}`);
                holdingSpace=false;holdingDescend=true;tick(90);
                check(!creativeFlying && camera.position.y>base+2*s,`B lands on solid floor at scale ${s}`);
                creativeFlying=true;camera.position.y=base+3.2*s;
                for(let y=1;y<6;y++) put(base+0.5*s,base+(y+0.5)*s,base-1.5*s,3);
                moveForward=true;tick(90);
                check(camera.position.z>base-1.5*s && !checkScaledCollision(camera.position),`Flying into a wall stops at scale ${s}`);
            }
            reset(0.005);gameMode='creative';creativeFlying=true;camera.position.set(0.5025,2,0.5025);
            const tinyWater=microCellAt(camera.position.x,camera.position.y,camera.position.z);
            setMicroPlacement(tinyWater,24);
            oxygen=10;controls.isLocked=false;gameMode='survival';prevTime=performance.now()-20;animate();
            check(oxygen<10,'Oxygen detects miniature water at the eyes');
            setFineVoxel(tinyWater,0);prevTime=performance.now()-20;animate();
            check(oxygen===20,'Oxygen refills in a dry miniature cell');
            resetPlayerFlight();gameMode='creative';creativeFlying=true;
            camera.position.set(0,24,6);playerScale=1;updatePlayerScaleView();
            return `${passed.length} movement checks passed.`;
        }));

        const downloadEvent=page.waitForEvent('download');
        await page.evaluate(()=>downloadSave());
        const download=await downloadEvent;
        const save=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
        assert.equal(save.creativeFlying,true);
        await page.evaluate(()=>resetPlayerFlight());
        await page.locator('#load-file').setInputFiles({name:'flying.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(save))});
        await page.waitForFunction(()=>creativeFlying);
        console.log('PASS: Save/load preserves creative flight without held keys.');
        await page.locator('#load-file').setInputFiles({name:'old-survival.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...save,gameMode:'survival'}))});
        await page.waitForFunction(()=>gameMode==='survival' && !creativeFlying);
        console.log('PASS: Loading Survival cannot restore creative flight.');
        assert.deepEqual(errors,[]);
        console.log('PASS: Movement regression checks completed without browser errors.');
        await page.close();
        }

        const live=await browser.newPage({viewport:{width:1280,height:800}});
        live.on('pageerror',e=>errors.push(e.message));
        await live.goto(pathToFileURL(path.resolve(__dirname,'../game3d.html')).href);
        await live.getByRole('button',{name:'Creative',exact:true}).click();
        await live.evaluate(()=>{window.testRandom=Math.random;Math.random=()=>0.5;});
        await live.getByRole('button',{name:'Start Game',exact:true}).click();
        await live.evaluate(()=>{
            Math.random=window.testRandom;controls.isLocked=true;
            const origin=camera.position.clone();
            for(let dx=0;dx<100;dx+=2) for(let dz=0;dz<100;dz+=2) {
                const x=Math.round(origin.x)+dx,z=Math.round(origin.z)+dz,h=getSurfaceHeight(x,z);
                if(h<=SEA_LEVEL) continue;
                let clear=true;
                for(let xx=x-1;xx<=x+1;xx++) for(let zz=z-5;zz<=z+1;zz++)
                    for(let yy=h+1;yy<=h+16;yy++) if(isSolid(xx,yy,zz)) clear=false;
                if(!clear) continue;
                camera.position.set(x,h+2.1,z);camera.rotation.set(0,0,0);camera.updateMatrixWorld(true);
                velocity.set(0,0,0);return;
            }
            throw new Error('No open takeoff point in the natural terrain');
        });
        await live.waitForFunction(()=>isGameStarted && chunkMeshes.size>=9 && velocity.y===0);
        await live.keyboard.press('Space');
        await live.keyboard.press('Space');
        await live.waitForFunction(()=>creativeFlying);
        const takeoff=await live.evaluate(()=>camera.position.y);
        await live.keyboard.down('Space');
        await live.waitForFunction(y=>camera.position.y>y+6,takeoff).catch(async error=>{
            console.log(await live.evaluate(()=>({position:camera.position.toArray(),velocity:velocity.toArray(),creativeFlying,holdingSpace,
                locked:controls.isLocked,collision:checkScaledCollision(camera.position),environment:getPlayerEnvironment()})));
            await live.screenshot({path:'/private/tmp/movement-flight-error.png'});throw error;
        });
        await live.keyboard.up('Space');
        const airborne=await live.evaluate(()=>camera.position.toArray());
        await live.keyboard.down('w');
        await live.waitForFunction(z=>camera.position.z<z-2,airborne[2]);
        await live.keyboard.up('w');
        assert.equal(await live.evaluate(()=>camera.position.y),airborne[1]);
        await live.keyboard.down('b');
        await live.waitForFunction(y=>camera.position.y<y-1,airborne[1]);
        await live.keyboard.up('b');
        await live.evaluate(()=>{camera.rotation.x=-0.3;});
        for(const viewport of [{width:1280,height:800},{width:390,height:844}]) {
            await live.setViewportSize(viewport);
            const colors=await live.evaluate(()=>{
                renderer.render(scene,camera);
                const gl=renderer.getContext(),p=new Uint8Array(4),colors=new Set();
                for(let x=0.1;x<0.95;x+=0.05) for(let y=0.1;y<0.95;y+=0.05) {
                    gl.readPixels(Math.floor(x*gl.drawingBufferWidth),Math.floor(y*gl.drawingBufferHeight),1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);
                    colors.add(Array.from(p).join(','));
                }
                return colors.size;
            });
            assert.ok(colors>12,'Flight renders real terrain rather than a blank canvas');
            await live.screenshot({path:`/private/tmp/movement-flight-${viewport.width}.png`});
        }
        assert.deepEqual(errors,[]);
        console.log('PASS: Live generated world responds to actual double-Space, W, Space and B keys; desktop/mobile screenshots and canvas verified.');
    } finally {
        await browser.close();
    }
})().catch(error=>{console.error(error);process.exitCode=1;});
