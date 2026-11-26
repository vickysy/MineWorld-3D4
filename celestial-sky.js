// Three r128 classic script. The caller owns the clock and environment branches.
// initCelestialSky({scene, camera, dirLight}); updateCelestialSky({dayTime,
// currentDimension, selectedTerrain, inWater, inLava}); clearCelestialSky();
// Call update AFTER the game's background/fog/light assignments, even when hidden.
let celestialSky = null;

function initCelestialSky({scene: world, camera: view, dirLight: light = null}) {
    if (celestialSky && celestialSky.scene === world && celestialSky.camera === view && celestialSky.light === light) return celestialSky;
    clearCelestialSky();
    const group = new THREE.Group();
    group.name = 'celestial-sky';
    group.visible = false;
    const s = {
        scene: world, camera: view, light, group, eye: new THREE.Vector3(),
        direction: new THREE.Vector3(1, 0, 0), origin: new THREE.Vector3(),
        basis: new THREE.Matrix4(), right: new THREE.Vector3(0, 0, 1),
        up: new THREE.Vector3(), normal: new THREE.Vector3(),
        lightColor: light ? light.color.clone() : null,
        lightPosition: light ? light.position.clone() : null,
        lightIntensity: light ? light.intensity : 0,
        lighting: false,
        nightTop: new THREE.Color(0x050510), nightHorizon: new THREE.Color(0x121b30),
        dayTop: new THREE.Color(0x5eace5), dayHorizon: new THREE.Color(0xb8d9ec),
        warmTop: new THREE.Color(0x7a91ba), warmHorizon: new THREE.Color(0xf2a573),
        warmLight: new THREE.Color(0xffbd83), whiteLight: new THREE.Color(0xffffff),
        moonLight: new THREE.Color(0xbac9e5)
    };
    const atmosphere = new THREE.ShaderMaterial({
        uniforms: {zenith: {value: new THREE.Color()}, horizon: {value: new THREE.Color()}},
        vertexShader: `
            varying vec3 skyDirection;
            void main() {
                skyDirection = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                gl_Position.z = gl_Position.w;
            }
        `,
        fragmentShader: `
            uniform vec3 zenith;
            uniform vec3 horizon;
            varying vec3 skyDirection;
            void main() {
                float height = max(normalize(skyDirection).y, 0.0);
                gl_FragColor = vec4(mix(horizon, zenith, smoothstep(0.0, 0.65, height)), 1.0);
                #include <encodings_fragment>
            }
        `,
        side: THREE.BackSide, depthTest: true, depthWrite: false, fog: false, toneMapped: false
    });
    s.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), atmosphere);
    s.sky.name = 'celestial-atmosphere';
    s.sky.renderOrder = -10000;
    s.sky.frustumCulled = false;
    // Per-render positioning also covers the mech, surveillance and reflection cameras.
    s.sky.onBeforeRender = (_renderer, _scene, camera) => {
        camera.getWorldPosition(s.eye);
        s.sky.position.copy(s.eye);
        s.sky.scale.setScalar(camera.far * 0.95);
        s.sky.updateMatrixWorld(true);
    };
    group.add(s.sky);

    const plane = new THREE.PlaneGeometry(1, 1);
    function body(name, angularSize) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 16;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = name === 'sun' ? '#ffdc85' : '#8995ab';
        ctx.fillRect(1, 1, 14, 14);
        ctx.fillStyle = name === 'sun' ? '#ffedb0' : '#d2d9e3';
        ctx.fillRect(2, 2, 12, 12);
        ctx.fillStyle = name === 'sun' ? '#fff8db' : '#edf0f3';
        ctx.fillRect(3, 3, 10, 10);
        ctx.fillStyle = name === 'sun' ? '#fff1bf' : '#a4afc1';
        for (const [x, y, w, h] of [[4, 4, 3, 2], [9, 8, 3, 3], [5, 10, 2, 2]]) ctx.fillRect(x, y, w, h);
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        const eyeY = {value: 0};
        const material = new THREE.MeshBasicMaterial({
            map: texture, transparent: true, alphaTest: 0.5,
            depthTest: true, depthWrite: false, fog: false, toneMapped: false
        });
        material.onBeforeCompile = shader => {
            shader.uniforms.celestialEyeY = eyeY;
            shader.vertexShader = 'uniform float celestialEyeY;\nvarying float celestialAltitude;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
                #include <project_vertex>
                celestialAltitude = (modelMatrix * vec4(transformed, 1.0)).y - celestialEyeY;
                gl_Position.z = gl_Position.w;
            `);
            shader.fragmentShader = 'varying float celestialAltitude;\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `
                #include <clipping_planes_fragment>
                if (celestialAltitude < 0.0) discard;
            `);
        };
        material.customProgramCacheKey = () => 'celestial-horizon-r128-v1';
        const mesh = new THREE.Mesh(plane, material);
        mesh.name = 'celestial-' + name;
        mesh.frustumCulled = false;
        // Transparent bodies draw before clouds/glass; only landscape writes depth.
        mesh.renderOrder = -9999;
        mesh.userData.direction = new THREE.Vector3();
        mesh.onBeforeRender = (_renderer, _scene, camera) => {
            const direction = mesh.userData.direction;
            const distance = camera.far * 0.9;
            camera.getWorldPosition(s.eye);
            eyeY.value = s.eye.y;
            mesh.position.copy(s.eye).addScaledVector(direction, distance);
            mesh.scale.setScalar(distance * angularSize);
            s.up.set(-direction.y, direction.x, 0);
            s.normal.copy(direction).negate();
            s.basis.makeBasis(s.right, s.up, s.normal);
            mesh.quaternion.setFromRotationMatrix(s.basis);
            mesh.updateMatrixWorld(true);
        };
        group.add(mesh);
        return mesh;
    }
    s.sun = body('sun', 0.12);
    s.moon = body('moon', 0.10);
    world.add(group);
    celestialSky = s;
    return s;
}

function updateCelestialSky({dayTime, currentDimension = 'overworld', selectedTerrain = 'plains', inWater = false, inLava = false, submerged = false}) {
    const s = celestialSky;
    if (!s) return false;
    const active = currentDimension === 'overworld' && selectedTerrain !== 'moon' && !inWater && !inLava && !submerged && Number.isFinite(dayTime);
    s.group.visible = active;
    if (!active) {
        if (s.light && s.lighting) {
            s.light.color.copy(s.lightColor);
            s.light.position.copy(s.lightPosition);
        }
        // The main loop has already chosen this environment's intensity and fog.
        s.lighting = false;
        return false;
    }
    const phase = dayTime % (Math.PI * 2), height = Math.sin(phase);
    const smooth = THREE.MathUtils.smoothstep;
    const daylight = smooth(height, -0.20, 0.30);
    const warmth = (1 - smooth(Math.abs(height), 0.02, 0.32)) * smooth(height, -0.22, -0.02);
    s.direction.set(Math.cos(phase), height, 0);
    s.sun.userData.direction.copy(s.direction);
    s.moon.userData.direction.copy(s.direction).negate();
    s.sun.visible = height > -0.065;
    s.moon.visible = height < 0.055;
    s.sun.material.color.copy(s.whiteLight).lerp(s.warmLight, warmth * 0.55);
    const uniforms = s.sky.material.uniforms;
    uniforms.zenith.value.copy(s.nightTop).lerp(s.dayTop, daylight).lerp(s.warmTop, warmth * 0.35);
    uniforms.horizon.value.copy(s.nightHorizon).lerp(s.dayHorizon, daylight).lerp(s.warmHorizon, warmth * 0.90);
    if (s.scene.background && s.scene.background.isColor) s.scene.background.copy(uniforms.horizon.value);
    if (s.scene.fog) s.scene.fog.color.copy(uniforms.horizon.value);
    if (s.light) {
        s.lighting = true;
        s.light.intensity = 0.1 + 0.7 * smooth(height, -0.12, 0.55);
        s.light.color.copy(s.whiteLight).lerp(s.warmLight, warmth * 0.55);
        s.light.color.lerp(s.moonLight, 1 - smooth(height, -0.30, -0.08));
        s.light.target.getWorldPosition(s.origin);
        s.light.position.copy(s.origin).addScaledVector(height >= 0 ? s.sun.userData.direction : s.moon.userData.direction, 100);
        if (s.light.parent) s.light.parent.worldToLocal(s.light.position);
    }
    return true;
}

function clearCelestialSky() {
    const s = celestialSky;
    if (!s) return;
    if (s.group.parent) s.group.parent.remove(s.group);
    s.sky.geometry.dispose();
    s.sky.material.dispose();
    s.sun.geometry.dispose();
    for (const mesh of [s.sun, s.moon]) {
        mesh.material.map.dispose();
        mesh.material.dispose();
    }
    if (s.light && s.lighting) {
        s.light.color.copy(s.lightColor);
        s.light.position.copy(s.lightPosition);
        s.light.intensity = s.lightIntensity;
    }
    celestialSky = null;
}
