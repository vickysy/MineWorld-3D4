const VIEW_FOV_STORAGE='daniel-view-fov-v1';
const DEFAULT_VIEW_FOV=90;
function getHandFovScale(){return Math.tan(camera.fov*Math.PI/360)/Math.tan(75*Math.PI/360);}
function setViewFov(value,persist=true){
    const number=Number(value);if(!Number.isFinite(number))return false;
    const fov=Math.round(THREE.MathUtils.clamp(number,75,105));
    camera.fov=fov;camera.updateProjectionMatrix();
    mechCamera.fov=fov;mechCamera.updateProjectionMatrix();
    for(const input of document.querySelectorAll('[data-view-fov]'))input.value=fov;
    for(const output of document.querySelectorAll('[data-view-fov-value]'))output.textContent=fov+' deg';
    if(persist)try{localStorage.setItem(VIEW_FOV_STORAGE,String(fov));}catch{}
    if(typeof heldItemGroup!=='undefined')resetHandAnimation();
    return true;
}
function initViewSettings(){
    let value=DEFAULT_VIEW_FOV;
    try{const saved=localStorage.getItem(VIEW_FOV_STORAGE);if(saved!==null&&Number.isFinite(Number(saved)))value=Number(saved);}catch{}
    setViewFov(value,false);
}
