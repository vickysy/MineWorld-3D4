// Run with node tests/celestial-sky.cjs. Optional PLAYWRIGHT_MODULE, CHROME_PATH,
// GAME_URL and SKY_SCREENSHOT_DIR follow the existing standalone browser tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
    const output = process.env.SKY_SCREENSHOT_DIR || path.join(os.tmpdir(), 'mc-celestial-sky');
    fs.mkdirSync(output, {recursive: true});
    const browser = await chromium.launch({headless: true, ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {})});
    try {
        for (const [label, width, height, mobile] of [['desktop', 1280, 800, false], ['mobile', 390, 844, true]]) {
            const context = await browser.newContext({viewport: {width, height}, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1});
            const page = await context.newPage(), errors = [], requests = [];
            page.on('pageerror', error => errors.push(error.message));
            page.on('console', message => {
                if (message.type() === 'error' && /THREE|WebGL|shader/i.test(message.text())) errors.push(message.text());
            });
            await page.addInitScript(() => {window.requestAnimationFrame = () => 0;});
            await page.goto(process.env.GAME_URL || pathToFileURL(path.resolve(__dirname, '../game3d.html')).href);
            await page.waitForFunction(() => typeof scene !== 'undefined' && typeof materials !== 'undefined', null, {polling: 100});
            page.on('request', request => {if (/^https?:/.test(request.url())) requests.push(request.url());});
            if (!await page.evaluate(() => typeof initCelestialSky === 'function')) {
                await page.addScriptTag({path: path.resolve(__dirname, '../celestial-sky.js')});
            }
            const setup = await page.evaluate(() => {
                const check = (value, message) => {if (!value) throw Error(message);};
                check(THREE.REVISION === '128', 'Exercise the actual bundled Three r128');
                const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
                const gpu = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
                clearCelestialSky();
                for (const child of scene.children) child.visible = child.isLight || child === camera;
                for (const child of document.body.children) if (child !== renderer.domElement && !['SCRIPT', 'STYLE'].includes(child.tagName)) child.style.display = 'none';
                heldItemGroup.visible = false;
                controls.isLocked = false;
                gameMode = 'creative';
                dirLight.color.setHex(0xffffff);
                dirLight.position.set(20, 50, 20);
                dirLight.intensity = 0.8;
                scene.background = new THREE.Color(0x87ceeb);
                scene.fog = new THREE.Fog(0x87ceeb, 172, 240);
                camera.fov = 90;
                camera.near = 0.1;
                camera.far = 320;
                camera.aspect = innerWidth / innerHeight;
                camera.position.set(0, 4, 0);
                camera.updateProjectionMatrix();
                renderer.setPixelRatio(devicePixelRatio);
                renderer.setSize(innerWidth, innerHeight);
                const sky = initCelestialSky({scene, camera, dirLight});
                const fixture = new THREE.Group(), box = new THREE.BoxGeometry(1, 1, 1), matrix = new THREE.Matrix4();
                fixture.name = 'celestial-test-landscape';
                // Real game block materials, with a clear valley along the east/west path.
                const cells = [];
                for (let x = -100; x <= 100; x += 4) for (let z = -76; z <= 76; z += 4) {
                    const y = Math.max(0, Math.floor((Math.abs(z) - 20) * 0.27 + Math.sin(x * 0.07) * 2));
                    cells.push([x, y, z]);
                }
                const terrain = new THREE.InstancedMesh(box, materials[1], cells.length);
                cells.forEach(([x, y, z], i) => {matrix.makeScale(4, y + 2, 4);matrix.setPosition(x, (y - 2) / 2, z);terrain.setMatrixAt(i, matrix);});
                terrain.instanceMatrix.needsUpdate = true;
                fixture.add(terrain);
                for (const side of [-1, 1]) for (const z of [-17, 19]) {
                    const trunk = new THREE.Mesh(new THREE.BoxGeometry(1, 5, 1), materials[4]);
                    trunk.position.set(side * 35, 2.5, z);
                    const leaves = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 5), materials[5]);
                    leaves.position.set(side * 35, 6, z);
                    fixture.add(trunk, leaves);
                }
                scene.add(fixture);
                function update(time, extra = {}) {
                    return updateCelestialSky({dayTime: time, currentDimension: 'overworld', selectedTerrain: 'plains', inWater: false, inLava: false, ...extra});
                }
                function aim(direction) {
                    camera.lookAt(camera.position.clone().add(direction));
                    camera.updateMatrixWorld(true);
                }
                function capture(view = camera) {
                    renderer.render(scene, view);
                    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
                    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                    check(gl.getError() === gl.NO_ERROR, 'No WebGL error during pixel readback');
                    return pixels;
                }
                function difference(view = camera) {
                    const full = capture(view), sun = sky.sun.visible, moon = sky.moon.visible;
                    sky.sun.visible = sky.moon.visible = false;
                    const empty = capture(view);
                    sky.sun.visible = sun;
                    sky.moon.visible = moon;
                    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
                    let count = 0, total = 0, left = w, right = -1, bottom = h, top = -1;
                    for (let i = 0; i < full.length; i += 4) {
                        const delta = Math.abs(full[i] - empty[i]) + Math.abs(full[i + 1] - empty[i + 1]) + Math.abs(full[i + 2] - empty[i + 2]);
                        total += delta;
                        if (delta <= 12) continue;
                        const x = i / 4 % w, y = Math.floor(i / 4 / w);
                        count++;left = Math.min(left, x);right = Math.max(right, x);bottom = Math.min(bottom, y);top = Math.max(top, y);
                    }
                    capture(view);
                    return {count, total, left, right, bottom, top, width: Math.max(0, right - left + 1), height: Math.max(0, top - bottom + 1)};
                }
                function blocker(distance, size = 20, material = new THREE.MeshBasicMaterial({color: 0x345b38, fog: false})) {
                    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
                    mesh.position.copy(camera.position).addScaledVector(sky.sun.userData.direction, distance);
                    mesh.lookAt(camera.position);scene.add(mesh);return mesh;
                }
                function remove(mesh) {scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}
                const source = animate.toString(), start = source.indexOf('if (inLava) {'), end = source.indexOf('if (!inLava && !inWater) updateCraterVisibility();');
                check(start >= 0 && end > start, 'Locate existing environment branches without editing HTML');
                const environment = new Function('inWater', 'inLava', 'isDay', 'sunHeight', 'delta', source.slice(start, end));
                window.skyTest = {sky, fixture, gl, check, update, aim, capture, difference, blocker, remove, environment};
                return {gpu, revision: THREE.REVISION, drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight]};
            });
            console.log(`${label}: ${JSON.stringify(setup)}`);

            console.log(await page.evaluate(() => {
                const {sky, check, update} = skyTest;
                const clock = () => JSON.stringify([dayTime, DAY_SECONDS, HALF_DAY_SECONDS, DAY_TIME_SPEED, isSleeping, previousIsDay, dayWasSlept, playerTired, foodProtectionTimer, hungerTimer]);
                const before = clock(), earth = earthMesh, count = scene.children.length;
                check(initCelestialSky({scene, camera, dirLight}) === sky && scene.children.length === count, 'Repeated init is idempotent');
                check(Math.abs(DAY_TIME_SPEED * 600 - Math.PI) < 1e-12 && DAY_SECONDS === 1200 && HALF_DAY_SECONDS === 600, 'Ten minute days and nights are untouched');
                for (const [time, x, y] of [[0, 1, 0], [Math.PI / 2, 0, 1], [Math.PI, -1, 0], [3 * Math.PI / 2, 0, -1]]) {
                    update(time);
                    check(Math.abs(sky.sun.userData.direction.x - x) < 1e-12 && Math.abs(sky.sun.userData.direction.y - y) < 1e-12, 'Fixed east-rise / west-set orbit');
                    check(sky.sun.userData.direction.dot(sky.moon.userData.direction) < -0.99999, 'Moon is opposite the sun');
                }
                update(0.35);const reference = sky.sun.userData.direction.clone(), tint = scene.fog.color.clone();
                for (const time of [0.35 + 2 * Math.PI * 10000, 0.35 - 2 * Math.PI]) {
                    update(time);check(reference.distanceTo(sky.sun.userData.direction) < 1e-10, 'Saved / negative / multi-day phase is deterministic');
                    check(['r', 'g', 'b'].every(c => Math.abs(tint[c] - scene.fog.color[c]) < 1e-8), 'Palette repeats with world time');
                }
                for (const boundary of [0, Math.PI, Math.PI * 2]) {
                    update(boundary - 0.00001);const a = scene.background.clone(), intensity = dirLight.intensity;
                    update(boundary + 0.00001);
                    check(Math.max(Math.abs(a.r - scene.background.r), Math.abs(a.g - scene.background.g), Math.abs(a.b - scene.background.b)) < 0.001 && Math.abs(intensity - dirLight.intensity) < 0.001, 'No dawn/dusk color or brightness jump');
                }
                update(0);check(scene.fog.color.r > scene.fog.color.b + 0.3, 'Warm dawn fog');
                update(Math.PI / 2);check(scene.fog.color.b > scene.fog.color.r, 'Blue daylight fog');
                check(scene.fog.near === 172 && scene.fog.far === 240, 'Fog distances preserved');
                check(before === clock() && earthMesh === earth, 'Updates do not touch gameplay clocks, fatigue, hunger or Earth');
                for (const mode of ['survival', 'creative']) {
                    gameMode = mode;update(0.1);
                    check(gameMode === mode && sky.group.visible, 'Sky leaves ' + mode + ' gameplay unchanged');
                }
                gameMode = 'creative';
                for (const body of [sky.sun, sky.moon]) {
                    check(body.material.map.image.width === 16 && body.material.map.image.height === 16, 'Only small owned canvas textures');
                    check(body.material.map.magFilter === THREE.NearestFilter && !body.material.map.generateMipmaps, 'Crisp pixel textures');
                    check(body.material.depthTest && !body.material.depthWrite && !body.material.fog, 'Celestial bodies never overwrite landscape depth or disappear in distant fog');
                }
                check(!sky.sky.material.depthWrite && sky.sky.renderOrder < 0, 'Atmosphere is a background, not an opaque world blocker');
                return 'PASS: phase, palette continuity, clock invariants, idempotent init and texture/depth configuration';
            }));

            for (const [stage, phase] of [['sunrise', 0.07], ['noon', Math.PI / 2], ['sunset', Math.PI - 0.07], ['night', Math.PI + 0.65]]) {
                const stats = await page.evaluate(({phase, stage}) => {
                    const {sky, fixture, update, aim, difference, check, gl} = skyTest;
                    fixture.visible = true;
                    camera.position.set(0, 4, 0);
                    update(phase);
                    aim(stage === 'noon' ? new THREE.Vector3(0.5, 1, 0) : new THREE.Vector3(stage === 'sunset' ? -1 : 1, stage === 'night' ? 0.28 : 0.10, 0));
                    const result = difference();
                    check(result.count > 200, stage + ' has actual visible celestial pixels: ' + JSON.stringify(result));
                    check(result.width < gl.drawingBufferWidth * 0.20 && result.height < gl.drawingBufferHeight * 0.15, 'No giant decorative celestial body');
                    check(stage === 'night' ? sky.moon.visible && !sky.sun.visible : sky.sun.visible && (stage === 'sunrise' || stage === 'sunset' || !sky.moon.visible), 'Correct day/night body');
                    const colors = new Set(), pixels = skyTest.capture();
                    for (let i = 0; i < pixels.length; i += 256) colors.add(pixels[i] + ',' + pixels[i + 1] + ',' + pixels[i + 2]);
                    check(colors.size > 20, 'Nonblank atmospheric scene');
                    return {...result, colors: colors.size, fog: scene.fog.color.getHexString()};
                }, {phase, stage});
                await page.screenshot({path: path.join(output, `${label}-${stage}.png`)});
                console.log(`PASS: ${label} ${stage}: ${JSON.stringify(stats)}`);
            }

            console.log(await page.evaluate(() => {
                const {sky, fixture, update, aim, difference, check, blocker, remove, capture} = skyTest;
                fixture.visible = false;
                camera.position.set(0, 4, 0);
                aim(new THREE.Vector3(1, 0, 0));
                const rise = [-0.08, 0, 0.08].map(time => {update(time);return difference().count;});
                check(rise[0] === 0 && rise[1] > 100 && rise[2] > rise[1] * 1.7, 'Sun visibly crosses the eastern horizon: ' + rise);
                aim(new THREE.Vector3(-1, 0, 0));
                const set = [Math.PI - 0.08, Math.PI, Math.PI + 0.08].map(time => {update(time);return difference().count;});
                check(set[2] === 0 && set[1] > 100 && set[0] > set[1] * 1.7, 'Sun visibly sets below the western horizon: ' + set);
                update(0.2);aim(sky.sun.userData.direction);
                const open = difference();
                for (const distance of [12, 310]) {
                    const wall = blocker(distance, distance * 0.3);
                    check(difference().count === 0, 'Landscape at ' + distance + ' blocks occludes the sun, including behind its physical plane');
                    const withSky = capture();sky.group.visible = false;const withoutSky = capture();sky.group.visible = true;
                    const i = 4 * (Math.floor(skyTest.gl.drawingBufferHeight / 2) * skyTest.gl.drawingBufferWidth + Math.floor(skyTest.gl.drawingBufferWidth / 2));
                    check(withSky.slice(i, i + 4).every((v, n) => v === withoutSky[i + n]), 'Sky does not recolor or obscure foreground geometry');
                    remove(wall);
                }
                const cloud = blocker(25, 10, new THREE.MeshBasicMaterial({color: 0xffffff, fog: false, transparent: true, opacity: 0.85, depthWrite: false}));
                const throughCloud = difference();
                check(throughCloud.count > 0 && throughCloud.total < open.total * 0.20 && throughCloud.total > open.total * 0.10, 'Transparent clouds blend over the sun in the correct order');
                remove(cloud);
                const canvas = document.createElement('canvas');canvas.width = canvas.height = 2;
                const ctx = canvas.getContext('2d');ctx.fillStyle = '#345b38';ctx.fillRect(0, 0, 1, 2);
                const texture = new THREE.CanvasTexture(canvas);texture.magFilter = texture.minFilter = THREE.NearestFilter;
                const cutout = blocker(25, 10, new THREE.MeshBasicMaterial({map: texture, alphaTest: 0.5, fog: false}));
                const partial = difference();
                check(partial.count > open.count * 0.4 && partial.count < open.count * 0.6, 'Alpha-tested foliage hides only opaque texels');
                remove(cutout);texture.dispose();
                aim(sky.sun.userData.direction.clone().negate());check(difference().count === 0, 'No screen-locked sun when looking away');
                update(Math.PI / 2);aim(new THREE.Vector3(0, 1, 0));
                const roof = blocker(10, 20);check(difference().count === 0, 'An underground roof hides the noon sun');remove(roof);
                update(3 * Math.PI / 2);check(difference().count > 200, 'Midnight moon is visible when looking up');
                const nightRoof = blocker(-10, 20);nightRoof.lookAt(camera.position);
                check(difference().count === 0, 'An underground roof also hides the moon');remove(nightRoof);
                return 'PASS: GPU horizon emergence, setting, near/far terrain occlusion, foreground depth, clouds, cutouts, looking away and underground visibility';
            }));

            console.log(await page.evaluate(() => {
                const {sky, update, aim, difference, check} = skyTest;
                update(0.25);aim(sky.sun.userData.direction);
                let previous = Infinity;
                for (const fov of [75, 90, 105]) {
                    camera.fov = fov;
                    for (const [near, far] of [[0.003, 30], [0.1, 80], [2, 320]]) {
                        camera.near = near;camera.far = far;camera.updateProjectionMatrix();
                        const result = difference();
                        check(result.count > 200, 'Visible across FOV / near / far: ' + [fov, near, far]);
                        check(sky.sun.position.distanceTo(camera.position) < far * 0.91 && sky.sky.scale.x < far, 'Geometry remains inside the active far distance');
                    }
                    const result = difference();check(result.width < previous, 'FOV naturally changes the apparent size');previous = result.width;
                }
                camera.fov = 90;camera.near = 0.1;camera.far = 320;camera.updateProjectionMatrix();
                const before = difference();
                camera.position.set(100000, 10000, -100000);aim(sky.sun.userData.direction);
                const moved = difference();
                check(Math.abs(before.count - moved.count) < before.count * 0.03 && Math.abs(before.left - moved.left) <= 1, 'Teleporting cannot move or resize the sun on screen');
                const view = camera.clone();view.position.set(-6000, 80, 4000);view.far = 30;view.near = 0.03;view.updateProjectionMatrix();
                view.lookAt(view.position.clone().add(sky.sun.userData.direction));view.updateMatrixWorld(true);
                const alternate = difference(view);
                check(alternate.count > 200 && sky.sun.position.distanceTo(view.position) < 28, 'Alternate camera gets its own centered, unclipped sky without another update');
                difference();check(sky.sun.position.distanceTo(camera.position) > 280, 'Main camera is recentered after alternate-camera rendering');
                camera.position.set(0, 4, 0);
                return 'PASS: GPU FOV 75/90/105, dynamic near/far, teleports, alternate cameras and return to main view';
            }));

            for (const condition of ['horizon-half', 'wall-occluded', 'cloud-covered', 'underwater', 'moon-terrain']) {
                const stats = await page.evaluate(condition => {
                    const {sky, fixture, update, environment, aim, blocker, difference, check} = skyTest;
                    currentDimension = 'overworld';selectedTerrain = condition === 'moon-terrain' ? 'moon' : 'plains';
                    const water = condition === 'underwater', phase = condition === 'horizon-half' ? 0 : 0.08;
                    camera.position.set(0, 4, 0);
                    environment(water, false, true, Math.sin(phase), 0);
                    update(phase, {selectedTerrain, inWater: water});
                    fixture.visible = condition !== 'moon-terrain';clouds.visible = false;
                    aim(condition === 'moon-terrain' ? MOON_EARTH_DIRECTION : new THREE.Vector3(1, 0.10, 0));
                    if (condition === 'wall-occluded' || condition === 'cloud-covered') {
                        const material = condition === 'wall-occluded' ? new THREE.MeshBasicMaterial({color: 0x60764f, fog: false}) : cloudMat.clone();
                        material.fog = false;
                        skyTest.occluder = blocker(25, 8, material);
                    }
                    const result = difference();
                    check(['wall-occluded', 'underwater', 'moon-terrain'].includes(condition) ? result.count === 0 : result.count > 100, 'Visibility screenshot has the expected body pixels: ' + condition);
                    return result;
                }, condition);
                await page.screenshot({path: path.join(output, `${label}-${condition}.png`)});
                await page.evaluate(() => {if (skyTest.occluder) {skyTest.remove(skyTest.occluder);skyTest.occluder = null;}});
                console.log(`PASS: ${label} ${condition}: ${stats.count} body pixels`);
            }

            const generated = await page.evaluate(() => {
                const {sky, fixture, update, environment, aim, difference, check} = skyTest;
                currentDimension = 'overworld';selectedTerrain = 'mountains';seed = 42;heightCache.clear();
                camera.position.set(0, getSurfaceHeight(0, 0) + 2.1, 0);
                environment(false, false, true, 0, 0);
                fixture.visible = false;clouds.visible = false;
                updateTerrainHorizon(0, 0);
                while (horizon.queue.length || horizon.dirty.size) updateTerrainHorizon(0, 0);
                horizon.mesh.visible = horizon.trees.visible = true;
                update(0);aim(new THREE.Vector3(1, 0.10, 0));
                const hidden = difference();
                check(hidden.count === 0, 'The actual generated mountain ridge blocks the rising sun');
                update(0.75);aim(new THREE.Vector3(1, 0.3, 0));
                const emerged = difference();
                check(emerged.count > 200, 'The sun emerges above the actual generated mountain ridge');
                return {hidden: hidden.count, emerged: emerged.count, batches: horizon.pages.size};
            });
            await page.screenshot({path: path.join(output, `${label}-generated-mountains.png`)});
            await page.evaluate(() => {horizon.mesh.visible = horizon.trees.visible = false;});
            console.log(`PASS: ${label} generated terrain: ${JSON.stringify(generated)}`);

            console.log(await page.evaluate(() => {
                const {sky, update, difference, check, environment} = skyTest;
                const earth = earthMesh;
                for (const [dimension, terrain, inWater, inLava] of [['overworld', 'plains', true, false], ['overworld', 'plains', false, true], ['nether', 'plains', false, false], ['end', 'plains', false, false], ['overworld', 'moon', false, false]]) {
                    update(0.07);currentDimension = dimension;selectedTerrain = terrain;
                    environment(inWater, inLava, true, 0.07, 0);
                    const before = JSON.stringify([scene.background.getHex(), scene.fog.color.getHex(), scene.fog.near, scene.fog.far, dirLight.intensity, clouds.visible, earth.visible]);
                    check(!update(0.07, {currentDimension: dimension, selectedTerrain: terrain, inWater, inLava}) && !sky.group.visible, 'Hide sky in ' + [dimension, terrain, inWater, inLava]);
                    const after = JSON.stringify([scene.background.getHex(), scene.fog.color.getHex(), scene.fog.near, scene.fog.far, dirLight.intensity, clouds.visible, earth.visible]);
                    check(before === after && earthMesh === earth, 'Existing environment, Earth, fog and intensity remain authoritative');
                    check(dirLight.color.getHex() === 0xffffff && dirLight.position.equals(new THREE.Vector3(20, 50, 20)), 'Restore normal light color/direction on leaving Overworld sky');
                    check(difference().count === 0, 'No celestial pixels in excluded environments');
                    if (terrain === 'moon') check(earth.visible, 'Original blocky Earth remains visible on Moon terrain');
                }
                update(0.1);check(!update(0.1, {submerged: true}), 'Explicit submerged flag supported');
                check(!update(NaN), 'Invalid phase hides sky without poisoning scene colors');
                currentDimension = 'overworld';selectedTerrain = 'plains';environment(false, false, true, 1, 0);
                check(update(Math.PI / 2), 'Return to Overworld restores sky immediately');
                const fog = scene.fog;scene.fog = null;update(0);scene.fog = fog;
                const oldInterval = window.setInterval, oldClear = window.clearInterval;
                let tick;
                window.setInterval = callback => {tick = callback;return -1;};window.clearInterval = () => {};
                try {
                    dayTime = 3 * Math.PI / 2;isSleeping = false;
                    check(isNightTime(), 'Game recognizes night');sleepUntilMorning();
                    check(isSleeping, 'Real sleep starts');update(dayTime);check(isSleeping && dayTime === 3 * Math.PI / 2, 'Sky cannot advance a sleeping clock');
                    for (let i = 0; i < 10; i++) tick();
                    check(!isSleeping && dayTime === Math.PI / 2 && !isNightTime() && dayWasSlept && !playerTired, 'Real ten-tick sleep still resets to morning');
                    update(dayTime);check(sky.sun.visible && !sky.moon.visible, 'Sleep jump immediately updates visible body');
                } finally {window.setInterval = oldInterval;window.clearInterval = oldClear;}
                const resources = new Set([sky.sky.geometry, sky.sky.material, sky.sun.geometry, sky.sun.material, sky.sun.material.map, sky.moon.material, sky.moon.material.map]);
                const disposed = new Map();for (const resource of resources) resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) || 0) + 1));
                clearCelestialSky();clearCelestialSky();
                check(!scene.children.includes(sky.group) && resources.size === disposed.size && [...disposed.values()].every(n => n === 1), 'Clear detaches and disposes every owned GPU resource exactly once');
                check(!updateCelestialSky({dayTime: 0}), 'Update after clear is a harmless no-op');
                const next = initCelestialSky({scene, camera, dirLight});updateCelestialSky({dayTime: 0});
                renderer.render(scene, camera);check(next !== sky && next.group.parent === scene, 'Reinitialization works after clear');clearCelestialSky();
                return 'PASS: actual environment branches, no water/lava/dimension regressions, unchanged Earth, actual sleep-to-morning, disposal and reinitialization';
            }));
            assert.deepEqual(errors, [], `${label}: no page or shader errors`);
            assert.deepEqual(requests, [], `${label}: no external runtime requests after module injection`);
            await context.close();
        }
        console.log(`PASS: all celestial-sky checks. Screenshots: ${output}`);
    } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode = 1;});
