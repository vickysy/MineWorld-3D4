let skinEditor=null;
function skinIcon(name){return `<img src="assets/ui/${name}.svg" alt="">`;}
function initSkinEditor(){
    getLocalPlayerSkin();
    const dialog=document.createElement('dialog');dialog.id='skin-editor';dialog.setAttribute('aria-labelledby','skin-editor-title');
    const tool=(id,icon,label)=>`<button type="button" id="${id}" class="skin-icon-button" title="${label}" aria-label="${label}">${skinIcon(icon)}</button>`;
    dialog.innerHTML=`<header><h2 id="skin-editor-title">Your Skin</h2>${tool('skin-close','x','Close skin editor')}</header>
        <div class="skin-workspace"><section class="skin-model-section"><div id="skin-preview"></div>
        <label class="skin-rotation">View <input id="skin-rotation" type="range" min="-180" max="180" value="0"></label></section>
        <section class="skin-edit-section"><div class="skin-file-actions">
        <button id="skin-import">${skinIcon('folder-open')}Import Skin</button><button id="skin-photo">${skinIcon('camera')}Use Photo</button>${tool('skin-export','download','Download skin PNG')}</div>
        <input id="skin-file" type="file" accept="image/png" hidden><input id="skin-photo-file" type="file" accept="image/png,image/jpeg,image/webp" capture="user" hidden>
        <div id="skin-paint-panel"><div class="skin-selectors"><label>Part<select id="skin-part">${Object.entries(SKIN_PARTS).map(([id,p])=>`<option value="${id}">${p.label}</option>`).join('')}</select></label>
        <label>Face<select id="skin-face">${['front','back','left','right','top','bottom'].map(f=>`<option value="${f}">${f[0].toUpperCase()+f.slice(1)}</option>`).join('')}</select></label>
        <label>Layer<select id="skin-layer"><option value="base">Base</option><option value="overlay">Overlay</option></select></label></div>
        <div class="skin-paint-tools" role="toolbar" aria-label="Paint tools">${tool('skin-pencil','pencil','Pencil')}${tool('skin-fill','paint-bucket','Fill connected color')}${tool('skin-pick','pipette','Pick color')}${tool('skin-erase','eraser','Erase')}
        <input id="skin-color" type="color" value="#d6514b" aria-label="Paint color"><label>Size <input id="skin-brush" type="number" min="1" max="4" value="1" aria-label="Brush size"></label></div>
        <div id="skin-swatches" aria-label="Colors"></div><div class="skin-paint-surface"><canvas id="skin-pixels" aria-label="Skin pixel editor" tabindex="0"></canvas></div>
        <div class="skin-history">${tool('skin-undo','undo-2','Undo')}${tool('skin-redo','redo-2','Redo')}${tool('skin-reset','rotate-ccw','Reset to original skin')}</div></div>
        <div id="skin-photo-panel" hidden><canvas id="skin-photo-preview" width="256" height="256" aria-label="Photo crop preview"></canvas>
        <label>Zoom<input id="skin-photo-zoom" type="range" min="1" max="4" step="0.05" value="1"></label>
        <label>Horizontal<input id="skin-photo-x" type="range" min="0" max="100" value="50"></label>
        <label>Vertical<input id="skin-photo-y" type="range" min="0" max="100" value="50"></label>
        <div class="skin-file-actions"><button id="skin-photo-apply">Apply Photo</button><button id="skin-photo-cancel">Cancel Photo</button></div></div>
        </section></div><footer><span id="skin-status" role="status" aria-live="polite"></span><button id="skin-save">Save Skin</button></footer>`;
    document.body.append(dialog);
    skinEditor={dialog,draft:null,undo:[],redo:[],tool:'pencil',painting:false,photo:null,token:0,view:null};
    const el=id=>dialog.querySelector('#'+id);
    for(const color of ['#d0a07e','#49382b','#397d86','#45536d','#d6514b','#edbd4b','#f4f4ec','#262d31']){
        const b=document.createElement('button');b.type='button';b.className='skin-swatch';b.style.backgroundColor=color;b.title=color;b.setAttribute('aria-label','Color '+color);b.onclick=()=>{el('skin-color').value=color;};el('skin-swatches').append(b);
    }
    for(const name of ['pencil','fill','pick','erase'])el('skin-'+name).onclick=()=>{
        skinEditor.tool=name;for(const n of ['pencil','fill','pick','erase'])el('skin-'+n).setAttribute('aria-pressed',String(n===name));
    };
    el('skin-pencil').click();
    for(const id of ['skin-part','skin-face','skin-layer'])el(id).onchange=renderSkinEditor;
    el('skin-close').onclick=closeSkinEditor;dialog.addEventListener('cancel',e=>{e.preventDefault();closeSkinEditor();});
    el('skin-save').onclick=()=>{const stored=savePlayerSkin(skinEditor.draft);closeSkinEditor();showToast(stored?'Skin saved.':'Skin applied for this session. Browser storage is unavailable.');};
    el('skin-import').onclick=()=>el('skin-file').click();el('skin-photo').onclick=()=>el('skin-photo-file').click();
    el('skin-file').onchange=e=>importSkinFile(e.target,false);el('skin-photo-file').onchange=e=>importSkinFile(e.target,true);
    el('skin-export').onclick=()=>{const link=document.createElement('a');link.download='Daniel-Game-Skin.png';link.href=skinEditor.draft.toDataURL('image/png');link.click();};
    el('skin-undo').onclick=()=>restoreSkinHistory(false);el('skin-redo').onclick=()=>restoreSkinHistory(true);
    el('skin-reset').onclick=()=>{pushSkinHistory();skinEditor.draft=defaultPlayerSkin();renderSkinEditor();};
    for(const id of ['skin-photo-x','skin-photo-y','skin-photo-zoom'])el(id).oninput=renderSkinPhoto;
    el('skin-photo-cancel').onclick=closeSkinPhoto;
    el('skin-photo-apply').onclick=()=>{
        if(!skinEditor.photo)return;pushSkinHistory();
        const c=skinEditor.draft.getContext('2d');c.clearRect(...skinFaceRect('head','front','overlay'));
        c.imageSmoothingEnabled=true;c.drawImage(skinEditor.photo,...skinPhotoCrop(),...skinFaceRect('head','front'));
        el('skin-part').value='head';el('skin-face').value='front';el('skin-layer').value='base';closeSkinPhoto();renderSkinEditor();
    };
    const canvas=el('skin-pixels');
    canvas.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);skinEditor.painting=true;skinEditor.lastPixel=null;if(skinEditor.tool!=='pick')pushSkinHistory();paintSkinPixel(e);};
    canvas.onpointermove=e=>{if(skinEditor.painting)paintSkinPixel(e);};
    const finish=()=>{skinEditor.painting=false;skinEditor.lastPixel=null;};canvas.onpointerup=canvas.onpointercancel=canvas.onlostpointercapture=finish;
    el('skin-rotation').oninput=()=>{skinEditor.view.model.rotation.y=Number(el('skin-rotation').value)*Math.PI/180;renderSkinPreview();};
    document.addEventListener('keydown',e=>{
        if(!dialog.open)return;e.stopImmediatePropagation();
        if(e.code==='Escape'){e.preventDefault();closeSkinEditor();}
        else if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'){e.preventDefault();restoreSkinHistory(e.shiftKey);}
    },true);
}
function skinElement(id){return document.getElementById('skin-'+id);}
function openSkinEditor(){
    if(!skinEditor)initSkinEditor();const e=skinEditor;e.token++;e.draft=skinCanvas(getLocalPlayerSkin());e.undo=[];e.redo=[];
    clearMovementInput();if(controls.isLocked)controls.unlock();closeSkinPhoto();skinElement('status').textContent='';
    e.dialog.showModal();
    if(!e.view){
        const host=skinElement('preview'),world=new THREE.Scene();world.background=new THREE.Color(0xc5d1ca);
        world.add(new THREE.HemisphereLight(0xffffff,0x748a82,1));const light=new THREE.DirectionalLight(0xffffff,.6);light.position.set(-3,5,-4);world.add(light);
        const model=buildSkinAvatar(e.draft);world.add(model);const grid=new THREE.GridHelper(5,10,0x81938a,0xb2c1b9);grid.position.y=-1.01;world.add(grid);
        const view=new THREE.PerspectiveCamera(36,1,.1,20);view.position.set(1.8,.85,-3.8);view.lookAt(0,-.05,0);
        const output=new THREE.WebGLRenderer({antialias:false,alpha:false});output.setPixelRatio(Math.min(devicePixelRatio,2));host.append(output.domElement);
        e.view={world,view,renderer:output,model};
        new ResizeObserver(()=>{if(e.dialog.open)renderSkinPreview();}).observe(host);
        let drag=null;output.domElement.onpointerdown=event=>{drag=event.clientX;output.domElement.setPointerCapture(event.pointerId);};
        output.domElement.onpointermove=event=>{if(drag===null)return;model.rotation.y+=(event.clientX-drag)*.012;drag=event.clientX;skinElement('rotation').value=Math.atan2(Math.sin(model.rotation.y),Math.cos(model.rotation.y))*180/Math.PI;renderSkinPreview();};
        output.domElement.onpointerup=output.domElement.onpointercancel=()=>{drag=null;};
    }
    e.view.model.rotation.y=0;skinElement('rotation').value=0;renderSkinEditor();skinElement('part').focus();
}
function closeSkinPhoto(){
    skinEditor.photo?.close?.();skinEditor.photo=null;skinElement('photo-panel').hidden=true;skinElement('paint-panel').hidden=false;
}
function closeSkinEditor(){
    skinEditor.token++;skinEditor.painting=false;closeSkinPhoto();skinEditor.dialog.close();document.getElementById('skin-menu-button')?.focus();
}
function renderSkinPreview(){
    const e=skinEditor;if(!e?.dialog.open||!e.view)return;const {renderer,view,world}=e.view,host=skinElement('preview');
    const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);renderer.setSize(w,h,false);view.aspect=w/h;view.updateProjectionMatrix();renderer.render(world,view);
}
function renderSkinEditor(){
    const e=skinEditor;if(!e?.draft)return;
    const [x,y,w,h]=skinFaceRect(skinElement('part').value,skinElement('face').value),canvas=skinElement('pixels'),c=canvas.getContext('2d');
    canvas.width=w*24;canvas.height=h*24;c.imageSmoothingEnabled=false;
    c.drawImage(flattenedPlayerSkin(e.draft),x,y,w,h,0,0,canvas.width,canvas.height);
    c.strokeStyle='rgba(20,35,28,.2)';c.lineWidth=1;
    for(let i=0;i<=w;i++){c.beginPath();c.moveTo(i*24+.5,0);c.lineTo(i*24+.5,canvas.height);c.stroke();}
    for(let i=0;i<=h;i++){c.beginPath();c.moveTo(0,i*24+.5);c.lineTo(canvas.width,i*24+.5);c.stroke();}
    skinElement('undo').disabled=!e.undo.length;skinElement('redo').disabled=!e.redo.length;
    if(e.view){applyAvatarSkin(e.view.model,e.draft);renderSkinPreview();}
}
function pushSkinHistory(){const e=skinEditor;e.undo.push(encodeSkinPixels(e.draft));if(e.undo.length>32)e.undo.shift();e.redo=[];}
function restoreSkinHistory(redo){
    const e=skinEditor,from=redo?e.redo:e.undo,to=redo?e.undo:e.redo;if(!from.length)return;
    to.push(encodeSkinPixels(e.draft));e.draft=decodeSkinPixels(from.pop());renderSkinEditor();
}
function paintSkinPixel(event){
    const e=skinEditor,canvas=skinElement('pixels'),bounds=canvas.getBoundingClientRect();
    const [ox,oy,w,h]=skinFaceRect(skinElement('part').value,skinElement('face').value,skinElement('layer').value);
    const x=Math.min(w-1,Math.max(0,Math.floor((event.clientX-bounds.left)/bounds.width*w))),y=Math.min(h-1,Math.max(0,Math.floor((event.clientY-bounds.top)/bounds.height*h)));
    const c=e.draft.getContext('2d'),color=skinElement('color').value;
    if(e.tool==='pick'){
        const [bx,by]=skinFaceRect(skinElement('part').value,skinElement('face').value),p=flattenedPlayerSkin(e.draft).getContext('2d').getImageData(bx+x,by+y,1,1).data;
        skinElement('color').value='#'+[...p].slice(0,3).map(n=>n.toString(16).padStart(2,'0')).join('');return;
    }
    c.fillStyle=color;
    if(e.tool==='fill'){
        if(e.lastPixel)return;const pixels=c.getImageData(ox,oy,w,h).data,start=(y*w+x)*4,target=[...pixels.slice(start,start+4)],seen=new Set(),queue=[[x,y]];
        for(let i=0;i<queue.length;i++){
            const [px,py]=queue[i],index=(py*w+px)*4,key=py*w+px;if(px<0||py<0||px>=w||py>=h||seen.has(key))continue;seen.add(key);
            if(!target.every((v,n)=>v===pixels[index+n]))continue;c.fillRect(ox+px,oy+py,1,1);queue.push([px-1,py],[px+1,py],[px,py-1],[px,py+1]);
        }
    }else{
        const from=e.lastPixel||[x,y],steps=Math.max(1,Math.abs(x-from[0]),Math.abs(y-from[1])),size=Math.max(1,Math.min(4,Number(skinElement('brush').value)||1));
        for(let i=0;i<=steps;i++){
            const px=Math.round(from[0]+(x-from[0])*i/steps),py=Math.round(from[1]+(y-from[1])*i/steps),bw=Math.min(size,w-px),bh=Math.min(size,h-py);
            if(e.tool==='erase'&&skinElement('layer').value==='overlay')c.clearRect(ox+px,oy+py,bw,bh);
            else{c.fillStyle=e.tool==='erase'?'#cb9a77':color;c.fillRect(ox+px,oy+py,bw,bh);}
        }
    }e.lastPixel=[x,y];renderSkinEditor();
}
async function importSkinFile(input,photo){
    const file=input.files?.[0];input.value='';if(!file)return;const e=skinEditor,token=++e.token;
    try{
        if(file.size>8*1024*1024)throw new Error('Choose an image smaller than 8 MB.');
        if(!(photo?/^image\/(png|jpeg|webp)$/:/^image\/png$/).test(file.type))throw new Error(photo?'Choose a PNG, JPEG or WebP photo.':'Choose a PNG skin.');
        skinElement('status').textContent='Opening image...';const image=await createImageBitmap(file);
        if(token!==e.token||!e.dialog.open){image.close();return;}
        if(image.width>8192||image.height>8192||image.width*image.height>24000000){image.close();throw new Error('Choose a smaller image, up to 24 megapixels.');}
        if(photo){
            closeSkinPhoto();e.photo=image;skinElement('photo-panel').hidden=false;skinElement('paint-panel').hidden=true;
            skinElement('photo-zoom').value=1;skinElement('photo-x').value=skinElement('photo-y').value=50;renderSkinPhoto();
        }else{
            let draft;try{draft=normalizedSkinImage(image);}finally{image.close();}
            pushSkinHistory();e.draft=draft;closeSkinPhoto();renderSkinEditor();
        }skinElement('status').textContent='';
    }catch(error){if(token===e.token)skinElement('status').textContent=error.message;}
}
function skinPhotoCrop(){
    const p=skinEditor.photo,size=Math.min(p.width,p.height)/Number(skinElement('photo-zoom').value);
    return [(p.width-size)*Number(skinElement('photo-x').value)/100,(p.height-size)*Number(skinElement('photo-y').value)/100,size,size];
}
function renderSkinPhoto(){
    if(!skinEditor.photo)return;const canvas=skinElement('photo-preview'),c=canvas.getContext('2d');
    c.clearRect(0,0,256,256);c.drawImage(skinEditor.photo,...skinPhotoCrop(),0,0,256,256);
}
