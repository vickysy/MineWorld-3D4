let constructionRegions=[];
const constructionIndex=new Map();

function indexConstructionRegions() {
    constructionIndex.clear();
    for(const r of constructionRegions)for(let x=Math.floor(r.x/CHUNK_SIZE);x<=Math.floor((r.x+r.width-1)/CHUNK_SIZE);x++)for(let z=Math.floor(r.z/CHUNK_SIZE);z<=Math.floor((r.z+r.depth-1)/CHUNK_SIZE);z++) {
        const key=`${x},${z}`;if(!constructionIndex.has(key))constructionIndex.set(key,[]);constructionIndex.get(key).push(r);
    }
}

function insideConstruction(r,x,y,z) {return x>=r.x&&x<r.x+r.width&&z>=r.z&&z<r.z+r.depth&&y>=r.y&&y<=r.y+r.height;}
function constructionTypeAt(x,y,z) {
    if(!constructionRegions.length)return null;
    const list=constructionIndex.get(`${Math.floor(x/CHUNK_SIZE)},${Math.floor(z/CHUNK_SIZE)}`);
    for(let i=(list?.length||0)-1;i>=0;i--) {
        const r=list[i];if(!insideConstruction(r,x,y,z))continue;
        if(r.kind==='wall')return 59;
        if(y===r.y)return 63;
        const edge=Math.min(x-r.x,z-r.z,r.x+r.width-1-x,r.z+r.depth-1-z)<r.thickness;
        return edge?(r.kind==='castle'?59:51):0;
    }
    return null;
}

function parseConstructionCommand(text) {
    if((!/field|场地|庭院|院子|城墙|围墙|wall|墙|空间/.test(text)&&!/^\d+(?:×\d+){1,2}$/.test(text))||/清理|清空|挖空|填水/.test(text))return null;
    if(/[-+−]\d|\d[.．]\d/.test(text))throw new Error('尺寸必须是正整数。');
    const runs=text.match(/\d+(?:×\d+)+/g)||[];
    if(runs.length>1||runs.some(s=>s.split('×').length>3))throw new Error('请只填写一组尺寸。');
    const dimensions={};
    const namedText=text.replace(/length/g,'长').replace(/width/g,'宽').replace(/height/g,'高').replace(/thickness/g,'厚');
    for(const axis of ['长','宽','高','厚']) {
        const matches=Array.from(namedText.matchAll(new RegExp(axis+'(?:度)?(?:为|是|等于)?(\\d+)','g')));
        if(matches.length>1)throw new Error('同一个尺寸不能重复填写。');if(matches.length)dimensions[axis]=Number(matches[0][1]);
    }
    if(runs.length&&['长','宽','高'].some(k=>k in dimensions))throw new Error('数字尺寸和长宽高不要重复定义。');
    let sizes=runs[0]?.split('×').map(Number);
    const cube=text.match(/边长(\d+)/);if(!sizes&&cube&&/正方体|立方体|正方形/.test(text)){sizes=Array(3).fill(Number(cube[1]));delete dimensions.长;}
    if(!sizes&&!('长' in dimensions))return null;
    if(/空间/.test(text)&&!sizes?.[2]&&!('高' in dimensions)&&!/场地|field|墙/.test(text))return null;
    let kind=/城墙|围墙/.test(text)?'castle':/wall|墙/.test(text)||sizes?.length===2?'wall':'field';
    const thickness=dimensions.厚??1;
    const width=sizes?.[0]??dimensions.长;
    const depth=kind==='wall'?thickness:(sizes?.[1]??dimensions.宽);
    const height=kind==='wall'?(sizes?.[2]??sizes?.[1]??dimensions.高??10):(sizes?.[2]??dimensions.高??10);
    if(![width,depth,height,thickness].every(Number.isSafeInteger)||width<1||depth<1||height<1||width>200||depth>200||height>200||thickness<1||thickness>20)
        throw new Error('长、宽、高支持1到200格，墙厚支持1到20格，请补全尺寸。');
    if(kind!=='wall'&&(width<=thickness*2||depth<=thickness*2))throw new Error('长和宽必须大于两倍墙厚，内部才有空间。');
    const label=kind==='wall'?`建墙：长${width}、高${height}、厚${thickness}格。`:`${kind==='castle'?'城墙':'无顶场地'}：长 × 宽 × 高：${width} × ${depth} × ${height} 格，墙厚${thickness}格；有地板，内部挖空，不封顶。`;
    return {kind:'construction',shape:kind,width,depth,height,thickness,label:label+'会替换选定范围内的建筑。确认后执行，可撤销。'};
}

function saveConstruction() {
    const job=commandJob?.kind==='construction'?{...commandJob,before:undefined}:null;
    return {regions:constructionRegions,job};
}
function restoreConstruction(data={}) {
    constructionRegions=data.regions||[];indexConstructionRegions();
    if(data.job)commandJob={...data.job,before:null};
}

function startConstruction(plan) {
    if(multiplayerRoom){showCommandStatus('大型场地请先退出房间，建成后重新创建房间，朋友即可加载完整场地。');return false;}
    if(constructionRegions.length>=32){showCommandStatus('已有32个大型建造区域，请先撤销或新建世界。');return false;}
    const r={kind:plan.shape,width:plan.width,depth:plan.depth,height:plan.height,thickness:plan.thickness,
        x:Math.round(camera.position.x)-Math.floor(plan.width/2),y:Math.round(camera.position.y-getPlayerHeight()-0.5),
        z:Math.round(camera.position.z)-Math.floor(plan.depth/2)};
    if(r.kind==='wall')r.z=Math.round(camera.position.z)-r.depth-3;
    const before=JSON.stringify(getWorldSaveData()),cells=[];
    for(const [key] of worldMap){const p=key.split(',').map(Number);if(insideConstruction(r,...p))cells.push(p);}
    constructionRegions.push(r);indexConstructionRegions();
    commandJob={kind:'construction',region:r,cells,index:0,column:0,before,dimension:currentDimension};
    showCommandStatus('正在生成场地...');return true;
}

function tickConstruction() {
    const job=commandJob,r=job.region,dirty=new Set(),start=performance.now();let count=0;
    const editing=commandEditing;commandEditing=true;
    try {
        while(job.index<job.cells.length&&count++<256&&performance.now()-start<5) {
            const p=job.cells[job.index++];setBlockNoRebuild(...p,0,dirty);worldMap.delete(p.join(','));
        }
        while(job.index===job.cells.length&&job.column<r.width*r.depth&&count++<512&&performance.now()-start<5) {
            const x=r.x+job.column%r.width,z=r.z+Math.floor(job.column/r.width),key=`${x},${z}`;job.column++;
            modifiedColumns.add(key);columnMinY.set(key,Math.min(columnMinY.get(key)??Infinity,r.y));
            const ranges=craterColumns.get(key);
            if(ranges) {
                const clipped=[];for(const [a,b] of ranges){if(a<r.y)clipped.push([a,Math.min(b,r.y-1)]);if(b>r.y+r.height)clipped.push([Math.max(a,r.y+r.height+1),b]);}
                if(clipped.length)craterColumns.set(key,clipped);else craterColumns.delete(key);
            }
            const chunk=`${Math.floor(x/CHUNK_SIZE)},${Math.floor(z/CHUNK_SIZE)}`;
            chunkMaxY.set(chunk,Math.max(chunkMaxY.get(chunk)??-Infinity,r.y+r.height));
            if(chunkMeshes.has(chunk))dirty.add(chunk);
        }
    } finally {commandEditing=editing;addDirtyChunksToQueue(dirty);}
    const done=job.index+job.column,total=job.cells.length+r.width*r.depth;showCommandStatus(`正在生成：${Math.round(done/total*100)}%`);
    if(job.column<r.width*r.depth)return;
    for(const key of chunkMeshes.keys())rebuildQueue.add(key);
    if(job.before)commandUndo={kind:'construction',snapshot:job.before,dimension:currentDimension};
    if(r.kind!=='wall'){camera.position.y=r.y+0.5+getPlayerHeight();velocity.set(0,0,0);}
    commandJob=null;showCommandStatus(r.kind==='wall'?'墙体已完成。':'已完成。场地没有屋顶。');
}

function undoConstruction() {
    const snapshot=commandUndo.snapshot;commandUndo=null;
    window.loadSaveFile({target:{files:[new File([snapshot],'before-construction.json',{type:'application/json'})]}},error=>showCommandStatus(error?'恢复失败，请加载此前的存档。':'已撤销大型建造。'));
    return true;
}
