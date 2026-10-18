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
        if(r.kind==='building')return buildingBlockAt(r,x-r.x,y-r.y,z-r.z);
        if(r.kind==='towers')return cornerTowerBlockAt(r,x-r.x,y-r.y,z-r.z);
        if(r.kind==='fortress')return fortressBlockAt(r,x-r.x,y-r.y,z-r.z);
        if(r.kind==='wall')return 59;
        if(y===r.y)return 63;
        const edge=Math.min(x-r.x,z-r.z,r.x+r.width-1-x,r.z+r.depth-1-z)<r.thickness;
        return edge?(r.kind==='castle'?59:51):0;
    }
    return null;
}

function buildingBlockAt(r,x,y,z) {
    const pitch=r.floorHeight+1,roof=r.floors*pitch;
    const edge=x===0||z===0||x===r.width-1||z===r.depth-1;
    if(y===0)return 63;
    if(y>roof)return edge?6:0;
    // Keep a continuous ladder shaft and a separate, two-block-wide stairwell.
    if(x===r.width-2&&z===r.depth-2)return 7;
    if(x>=2&&x<=pitch+1&&z>=2&&z<=3) {
        const step=x-1;
        return y>=step&&(y-step)%pitch===0?63:0;
    }
    if(y%pitch===0)return 63;
    if(edge) {
        if(z===0&&x===Math.floor(r.width/2)&&y<=2)return y===1?8:9;
        const corner=(x===0||x===r.width-1)&&(z===0||z===r.depth-1);
        const along=x===0||x===r.width-1?z:x;
        return !corner&&y%pitch>=2&&along%4!==0?6:51;
    }
    if(y%pitch===r.floorHeight&&x===r.width-3&&z===2)return 62;
    return 0;
}

function cornerTowerBlockAt(r,x,y,z) {
    if(y===0)return 63;
    const sx=r.towerWidth??r.towerSize,sz=r.towerDepth??r.towerSize,height=r.towerHeight??r.height;
    if(y>height)return 0;
    const farX=r.width-sx,farZ=r.depth-sz;
    const west=x<sx,east=x>=farX,north=z<sz,south=z>=farZ;
    if(!(west||east)||!(north||south))return 0;
    const u=west?x:x-farX,v=north?z:z-farZ,roof=height-1;
    const edge=u===0||v===0||u===sx-1||v===sz-1;
    const corner=(u===0||u===sx-1)&&(v===0||v===sz-1);
    if(y===height)return edge&&(corner||(u+v)%2===0)?3:0;
    if(u===1&&v===sz-2)return 7;
    if(y===roof||(y%4===0&&roof-y>=3))return 63;
    if(edge) {
        const doorV=r.kind==='fortress'?(north?sz-2:1):1;
        if(u===(west?sx-1:0)&&v===doorV&&y<=2)return 0;
        return corner?3:y%4===2?6:59;
    }
    return 0;
}

function fortressBlockAt(r,x,y,z) {
    if(y===0)return 63;
    const u=Math.min(x,r.width-1-x),v=Math.min(z,r.depth-1-z);
    if(u<r.towerWidth&&v<r.towerDepth)return cornerTowerBlockAt(r,x,y,z);
    if(y>r.wallHeight)return 0;
    // A short passage keeps small towers accessible even when the wall is thicker than a tower.
    const turn=Math.max(r.thickness,r.towerWidth),exit=Math.max(r.thickness,r.towerDepth);
    if(y<=2&&((u>=r.towerWidth-1&&u<=turn&&v===r.towerDepth-2)||(u===turn&&v>=r.towerDepth-2&&v<=exit)))return 0;
    if(y<=3&&z<r.thickness&&Math.abs(x-Math.floor(r.width/2))<=1)return 0;
    if(x===r.thickness&&z===Math.floor(r.depth/2))return 7;
    return Math.min(u,v)<r.thickness?59:0;
}

function isFortressCommand(text) {
    return /城墙/.test(text)&&/城楼|角楼/.test(text)&&!/清理|清空|挖空|水|岩浆|撤销|删除|移除|发射|炸|城市|房子|场地|查找|寻找|搜索/.test(text);
}

function parseFortressCommand(text) {
    if(!isFortressCommand(text))return null;
    if(/[-+−]\d|\d[.．]\d/.test(text))throw new Error('城墙和城楼的尺寸必须是正整数。');
    const source=text.replace(/(?:4角)?城楼(?:加|和|与|\+|搭配)城墙/,'城墙').replace(/城墙(?:加|和|与|\+)城楼/,'城墙');
    const sections=Array.from(source.matchAll(/城墙|(?:4角)?城楼|角楼/g));
    const values={};
    for(let i=0;i<sections.length;i++){
        const name=sections[i][0]==='城墙'?'wall':'tower';
        if(values[name])throw new Error('请分别填写一组城墙尺寸和一组四角城楼尺寸。');
        const part=source.slice(sections[i].index+sections[i][0].length,sections[i+1]?.index);
        if(/\d+×\d+/.test(part))throw new Error('组合城堡请分别写长、宽、高和墙厚，避免混淆。');
        const d={};for(const axis of ['长','宽','高','厚']){
            const matches=Array.from(part.matchAll(new RegExp(axis+'(?:度)?(?:为|是|等于)?(\\d+)','g')));
            if(matches.length>1)throw new Error('同一部分的'+axis+'只能填写一次。');if(matches.length)d[axis]=Number(matches[0][1]);
        }values[name]=d;
    }
    const w=values.wall||{},t=values.tower||{},width=w.长,depth=w.宽,thickness=w.厚??1,wallHeight=w.高??10;
    const towerWidth=t.长??4,towerDepth=t.宽??4,towerHeight=t.高??wallHeight+2;
    if(![width,depth,thickness,wallHeight,towerWidth,towerDepth,towerHeight].every(Number.isSafeInteger)||
        width>200||depth>200||width<=2*Math.max(thickness,towerWidth)+2||depth<=2*Math.max(thickness,towerDepth)+2||
        thickness<1||thickness>20||wallHeight<3||towerHeight<wallHeight+2||towerHeight>200||towerWidth<4||towerWidth>16||towerDepth<4||towerDepth>16||t.厚!==undefined)
        throw new Error('请补全城墙长宽：最大200格，墙厚1到20格、高至少3格；城楼长宽4到16格，比城墙至少高2格，总高不超过200格，并留出中间庭院。');
    return {kind:'construction',shape:'fortress',width,depth,height:towerHeight,thickness,wallHeight,towerWidth,towerDepth,towerHeight,
        label:`城楼加城墙：总占地${width}×${depth}格，城墙厚${thickness}、高${wallHeight}格；四角各一座${towerWidth}×${towerDepth}、高${towerHeight}格的城楼。城楼与围墙连接，有大门、通往庭院的通道和登顶爬梯，中间不封顶。会替换范围内建筑；需单人执行，撤销恢复整个世界，请先保存。`};
}

function parseBuildingCommand(text) {
    const towers=/城楼|角楼|cornertowers?/.test(text);
    if(!towers&&!/房子|楼房|楼宇|大楼|住宅|house|building/.test(text))return null;
    if(/清理|清空|挖空|填水/.test(text))return null;
    if(/[-+−]\d|\d[.．]\d/.test(text))throw new Error('建筑尺寸、层数和间隔必须是正整数。');
    const runs=text.match(/\d+(?:×\d+)+/g)||[];
    if(!towers&&runs.length===1&&runs[0].split('×').length===3&&!/层/.test(text))return null;
    if(runs.length>1||runs.some(s=>s.split('×').length!==2))throw new Error('请用一组长×宽，再分别写层数、每层高度或城楼高度。');
    const pair=runs[0]?.split('×').map(Number);
    const read=(source,pattern,label)=>{
        const matches=Array.from(source.matchAll(new RegExp(pattern,'g')));
        if(matches.length>1)throw new Error(label+'只能填写一次。');
        return matches.length?Number(matches[0][1]):undefined;
    };
    const namedWidth=read(text,'长(?:度)?(?:为|是|等于)?(\\d+)','长度');
    const namedDepth=read(text,'宽(?:度)?(?:为|是|等于)?(\\d+)','宽度');
    if(!towers&&!/层/.test(text)&&namedWidth!==undefined&&namedDepth!==undefined&&/高(?:度)?(?:为|是|等于)?\d+/.test(text))return null;
    if(pair&&(namedWidth!==undefined||namedDepth!==undefined))throw new Error('长×宽和命名尺寸不要重复定义。');
    const suffix='会替换范围内的建筑。大型建造需单人执行；撤销会恢复建造前的整个世界。';
    if(towers) {
        const width=pair?.[0]??namedWidth??4,depth=pair?.[1]??namedDepth??width;
        const gap=read(text,'(?:间隔|间距|相隔|距离)(?:为|是|等于)?(\\d+)','城楼间隔')??20;
        const height=read(text,'高(?:度)?(?:为|是|等于)?(\\d+)','城楼高度')??12;
        if(![width,depth,gap,height].every(Number.isSafeInteger)||width!==depth||width<4||width>16||gap<1||2*width+gap>200||height<5||height>200)
            throw new Error('每座城楼须为4到16格的正方形；净间隔至少1格，总边长不超过200格；高度5到200格。');
        const side=2*width+gap;
        return {kind:'construction',shape:'towers',width:side,depth:side,height,thickness:1,towerSize:width,gap,
            label:`四角城楼：每座${width}×${width}格，高${height}格（含顶部垛口）；外墙之间净间隔${gap}格，总占地${side}×${side}格。四角各一座，中间是露天庭院；有入口和通顶爬梯。`+suffix};
    }
    const floorPattern='(?:每层|每1层|1层|层高)(?:的)?(?:净高|高度|高)?(?:为|是|等于)?(\\d+)';
    const floorHeight=read(text,floorPattern,'每层净高')??3;
    const rest=text.replace(new RegExp(floorPattern,'g'),'');
    const namedFloors=read(rest,'(?:层数|楼层数)(?:为|是|等于)?(\\d+)','层数');
    const countedFloors=read(rest,'(\\d+)层(?!数|高)','层数');
    if(namedFloors!==undefined&&countedFloors!==undefined)throw new Error('层数只能填写一次。');
    if(/(?:高|厚)(?:度)?(?:为|是|等于)?\d+/.test(rest))throw new Error('楼房请写“每层高3格、10层”，总高度会自动计算。');
    const floors=namedFloors??countedFloors??1,width=pair?.[0]??namedWidth,depth=pair?.[1]??namedDepth;
    const height=floors*(floorHeight+1)+1;
    if(![width,depth,floors,floorHeight].every(Number.isSafeInteger)||floorHeight<3||floorHeight>12||floors<1||height>200||width<Math.max(8,floorHeight+4)||width>200||depth<8||depth>200)
        throw new Error('请填写房子长×宽；长至少8格且不小于每层净高+4，宽8到200格，每层净高3到12格，至少1层，总高含楼板和屋顶护栏不超过200格。');
    return {kind:'construction',shape:'building',width,depth,height,thickness:1,floors,floorHeight,
        label:`楼房：占地${width}×${depth}格，${floors}层，每层室内净高${floorHeight}格，楼板另占1格；总高${height}格（含屋顶护栏）。自动设置门窗、楼梯、爬梯、照明和可布置家具的空房间。`+suffix};
}

function parseConstructionCommand(text) {
    const fortress=parseFortressCommand(text);if(fortress)return fortress;
    const building=parseBuildingCommand(text);if(building)return building;
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
    if(plan.shape==='building'&&plan.floorHeight<getPlayerHeight()+0.2*playerScale){showCommandStatus('当前人物太高，请先恢复正常大小，或增加每层净高。');return false;}
    const r={kind:plan.shape,width:plan.width,depth:plan.depth,height:plan.height,thickness:plan.thickness,
        floors:plan.floors,floorHeight:plan.floorHeight,towerSize:plan.towerSize,gap:plan.gap,
        wallHeight:plan.wallHeight,towerWidth:plan.towerWidth,towerDepth:plan.towerDepth,towerHeight:plan.towerHeight,
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
    if(r.kind!=='wall'){
        if(r.kind==='building'){camera.position.x=r.x+Math.floor(r.width/2);camera.position.z=r.z+r.depth-3;}
        camera.position.y=r.y+0.5+getPlayerHeight();velocity.set(0,0,0);
    }
    commandJob=null;showCommandStatus(r.kind==='wall'?'墙体已完成。':r.kind==='building'?`${r.floors}层楼房已完成。`:
        r.kind==='fortress'?'城墙和四角城楼已一起完成。':r.kind==='towers'?'四角城楼已完成，中间为露天庭院。':'已完成。场地没有屋顶。');
}

function undoConstruction() {
    const snapshot=commandUndo.snapshot;commandUndo=null;
    window.loadSaveFile({target:{files:[new File([snapshot],'before-construction.json',{type:'application/json'})]}},error=>showCommandStatus(error?'恢复失败，请加载此前的存档。':'已撤销大型建造。'));
    return true;
}
