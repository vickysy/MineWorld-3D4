const railPathCache=new Map(),railGeometryCache=new Map();
let railRenderMaterial;

function createMinecartModel() {
    const group=new THREE.Group(),box=(w,h,d,c,x,y,z)=>addModelBox(group,w,h,d,c,x,y,z);
    box(0.8,0.1,0.8,0x59656b,0,-0.2,0);
    for(const z of [-0.35,0.35])box(0.8,0.4,0.1,0x9ba7ad,0,0.05,z);
    for(const x of [-0.35,0.35])box(0.1,0.4,0.8,0x818e95,x,0.05,0);
    for(const x of [-0.38,0.38])for(const z of [-0.24,0.24])box(0.1,0.17,0.17,0x27353d,x,-0.3,z);
    box(0.28,0.08,0.015,0xe4bb52,0,0.08,0.408);
    for(const part of group.children)part.position.y-=0.25;
    return group;
}

function connectedRail(x,y,z,dx,dz) {
    for(const dy of [0,1,-1])if(isRailBlockAt(x+dx,y+dy,z+dz))return {x:dx,y:dy,z:dz};
    return null;
}

function railSpec(x,y,z) {
    const links=[[0,-1],[0,1],[-1,0],[1,0]].map(([dx,dz])=>connectedRail(x,y,z,dx,dz)).filter(Boolean);
    let ends;
    if(links.length===2)ends=links;
    else if(links.some(p=>p.x===-1)&&links.some(p=>p.x===1))ends=[links.find(p=>p.x===-1),links.find(p=>p.x===1)];
    else if(links.some(p=>p.z===-1)&&links.some(p=>p.z===1))ends=[links.find(p=>p.z===-1),links.find(p=>p.z===1)];
    else if(links.length)ends=[{x:-links[0].x,y:0,z:-links[0].z},links[0]];
    else ends=[{x:0,y:0,z:-1},{x:0,y:0,z:1}];
    const curved=ends[0].x*ends[1].x+ends[0].z*ends[1].z===0;
    return {ends,curved,key:ends.map(p=>`${p.x},${p.y},${p.z}`).join(';')};
}

function railCurve(spec) {
    if(!railPathCache.has(spec.key)) {
        const [a,b]=spec.ends.map(p=>new THREE.Vector3(p.x/2,p.y/2,p.z/2));
        railPathCache.set(spec.key,spec.curved?new THREE.QuadraticBezierCurve3(a,new THREE.Vector3(),b):new THREE.LineCurve3(a,b));
    }
    return railPathCache.get(spec.key);
}

function railGeometry(spec,powered=false) {
    const key=spec.key+':'+powered;if(railGeometryCache.has(key))return railGeometryCache.get(key);
    const positions=[],normals=[],colors=[],curve=railCurve(spec);
    const add=(w,h,d,color,p,yaw,pitch=0)=>{
        const g=new THREE.BoxGeometry(w,h,d).toNonIndexed();
        g.applyMatrix4(new THREE.Matrix4().compose(p,new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,yaw,0,'YXZ')),new THREE.Vector3(1,1,1)));
        positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);
        const c=new THREE.Color(color);for(let i=0;i<g.attributes.position.count;i++)colors.push(c.r,c.g,c.b);g.dispose();
    };
    for(let i=0;i<=5;i++) {
        const t=i/5,p=curve.getPointAt(t),v=curve.getTangentAt(t);p.y-=0.465;
        add(0.9,0.055,0.11,0x725438,p,Math.atan2(v.x,v.z));
    }
    for(let i=0;i<16;i++) {
        const a=curve.getPointAt(i/16),b=curve.getPointAt((i+1)/16),v=b.clone().sub(a),mid=a.clone().add(b).multiplyScalar(0.5);
        const side=new THREE.Vector3(v.z,0,-v.x).normalize().multiplyScalar(0.29);
        for(const sign of [-1,1]) {
            const p=mid.clone().addScaledVector(side,sign);p.y-=0.42;
            add(0.065,0.07,v.length()+0.025,powered?0xd9b75e:0xc5cdd0,p,Math.atan2(v.x,v.z),-Math.atan2(v.y,Math.hypot(v.x,v.z)));
        }
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    railGeometryCache.set(key,g);return g;
}

function cartRailAt(mc) {
    const x=Math.round(mc.mesh.position.x),z=Math.round(mc.mesh.position.z),y=Math.round(mc.mesh.position.y-0.25);
    for(const dy of [0,-1,1])if(isRailBlockAt(x,y+dy,z))return {x,y:y+dy,z};
    return null;
}

function advanceMinecarts(delta) {
    document.getElementById('minecart-ui').style.display=ridingMinecart?'block':'none';
    for(const mc of minecarts) {
        if(mc.track&&!isRailBlockAt(mc.track.x,mc.track.y,mc.track.z))mc.track=null;
        if(!mc.track) {
            const at=cartRailAt(mc);
            if(at) {
                const spec=railSpec(at.x,at.y,at.z),curve=railCurve(spec),local=mc.mesh.position.clone().sub(new THREE.Vector3(at.x,at.y+0.25,at.z));
                let t=0,distance=Infinity;
                for(let i=0;i<=40;i++){const d=curve.getPointAt(i/40).distanceToSquared(local);if(d<distance){distance=d;t=i/40;}}
                const motion=new THREE.Vector3(mc.vx,0,mc.vz);
                if(motion.lengthSq()<0.001)camera.getWorldDirection(motion);
                mc.track={...at,t,sign:motion.dot(curve.getTangentAt(t))>=0?1:-1};
                mc.railSpeed=Math.hypot(mc.vx,mc.vz)||(mc.isRiding?4:0);
                mc.reversing=false;
            }
        }
        if(!mc.track) {
            mc.derailed=true;mc.vx*=Math.exp(-6*delta);mc.vz*=Math.exp(-6*delta);
            mc.mesh.position.x+=mc.vx*delta;mc.mesh.position.z+=mc.vz*delta;
            const floor=Math.round(mc.mesh.position.y-0.75);
            if(isSolid(Math.round(mc.mesh.position.x),floor,Math.round(mc.mesh.position.z)))mc.mesh.position.y=floor+0.75;
            else mc.mesh.position.y-=10*delta;
            continue;
        }
        mc.derailed=false;
        let tr=mc.track,powered=getBlock(tr.x,tr.y,tr.z)===27&&machinePowered(tr.x,tr.y,tr.z);
        if(mc.isRiding) {
            mc.railSpeed+=(Number(moveForward)-Number(moveBackward))*(mc.reversing?-1:1)*5*delta;
            if(mc.railSpeed<0){tr.sign*=-1;mc.railSpeed=-mc.railSpeed;mc.reversing=!mc.reversing;}
        }
        if(powered)mc.railSpeed+=4*delta;
        mc.railSpeed=Math.min(powered?10:5,Math.max(0,mc.railSpeed));
        let remaining=mc.railSpeed*Math.min(delta,0.1);
        for(let step=0;step<8&&remaining>1e-8;step++) {
            const spec=railSpec(tr.x,tr.y,tr.z),curve=railCurve(spec),length=curve.getLength(),available=(tr.sign>0?1-tr.t:tr.t)*length;
            if(remaining<available){tr.t+=tr.sign*remaining/length;remaining=0;break;}
            remaining-=available;tr.t=tr.sign>0?1:0;
            const end=spec.ends[tr.sign>0?1:0],next=connectedRail(tr.x,tr.y,tr.z,end.x,end.z);
            if(!next){mc.railSpeed=0;remaining=0;break;}
            const nx=tr.x+next.x,ny=tr.y+next.y,nz=tr.z+next.z,other=railSpec(nx,ny,nz);
            const entry=other.ends.findIndex(e=>e.x===-end.x&&e.z===-end.z&&e.y===-next.y);
            if(entry<0){mc.railSpeed=0;remaining=0;break;}
            tr=mc.track={x:nx,y:ny,z:nz,t:entry,sign:entry===0?1:-1};
        }
        const curve=railCurve(railSpec(tr.x,tr.y,tr.z)),p=curve.getPointAt(tr.t),tangent=curve.getTangentAt(tr.t).multiplyScalar(tr.sign);
        mc.mesh.position.set(tr.x+p.x,tr.y+0.25+p.y,tr.z+p.z);
        mc.mesh.rotation.order='YXZ';mc.mesh.rotation.set(-Math.atan2(tangent.y,Math.hypot(tangent.x,tangent.z)),Math.atan2(tangent.x,tangent.z),0);
        mc.vx=tangent.x*mc.railSpeed;mc.vz=tangent.z*mc.railSpeed;
    }
    if(ridingMinecart){camera.position.copy(ridingMinecart.mesh.position).y+=0.8;velocity.set(0,0,0);}
}

function tryMechStep(before,motion) {
    const blocked=camera.position.clone();camera.position.copy(before);
    const up=moveTinyAxis('y',1.01);
    const hitX=up||moveTinyAxis('x',motion.x),hitZ=up||moveTinyAxis('z',motion.z);
    if(!up&&!hitX&&!hitZ&&moveTinyAxis('y',-1.03)&&camera.position.y>before.y+0.05) {velocity.y=0;return true;}
    camera.position.copy(blocked);return false;
}
