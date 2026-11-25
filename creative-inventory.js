let hotbarItems=Array(9).fill(null),activeHotbarSlot=0,catalogSelection=0,inventoryCategory='build';
const itemIcons=new Map();
function itemIcon(id){
    if(itemIcons.has(id))return itemIcons.get(id);
    const source=document.getElementById('inv-'+Object.keys(getInventorySlotMapping()).find(k=>getInventorySlotMapping()[k]===id))?.querySelector('img');
    const mat=Array.isArray(materials[id])?materials[id][2]:materials[id],canvas=mat?.map?.image;
    const url=source?.src||(canvas?.toDataURL?canvas.toDataURL():null);if(url)itemIcons.set(id,url);return url;
}
function appendItemIcon(parent,id){
    const url=itemIcon(id);
    if(url){const img=document.createElement('img');img.src=url;img.alt='';img.draggable=false;parent.append(img);}
    else {const name=document.createElement('span');name.className='item-short-name';name.textContent=getBlockName(id);parent.append(name);}
}
function selectedStackAmount(){return Math.max(1,Math.min(64,Math.floor(Number(document.getElementById('catalog-amount')?.value)||64)));}
function assignHotbar(index,id,count=64){
    if(index<0||index>=9||!Number.isInteger(index)||id&&!getBlockName(id))return;
    hotbarItems[index]=id?{id,count:Math.max(1,Math.min(64,Math.floor(count)||64))}:null;
    selectHotbarIndex(index);
}
function selectHotbarIndex(index){
    if(!Number.isInteger(index)||index<0||index>8)return;
    activeHotbarSlot=index;currentBlock=hotbarItems[index]?.id||0;
    heldTorchLight.intensity=currentBlock===16?1.5:0;updateHeldItem3D(currentBlock);renderHotbar();
}
function restoreHotbar(data){
    hotbarItems=Array.from({length:9},(_,i)=>{const s=data?.items?.[i];return s&&Number.isInteger(s.id)&&getBlockName(s.id)?{id:s.id,count:Math.max(1,Math.min(64,Math.floor(s.count)||64))}:null;});
    activeHotbarSlot=Number.isInteger(data?.active)?Math.max(0,Math.min(8,data.active)):0;
    selectHotbarIndex(activeHotbarSlot);
}
function renderHotbar(){
    for(const [element,editing] of [[document.getElementById('hotbar'),false],[document.getElementById('inventory-hotbar'),true]]){
        if(!element)continue;element.replaceChildren();
        for(let i=0;i<9;i++){
            const entry=hotbarItems[i],slot=document.createElement('button');slot.type='button';slot.className='hotbar-slot'+(i===activeHotbarSlot?' selected':'');
            slot.dataset.index=i;slot.setAttribute('aria-label',`Hotbar ${i+1}${entry?': '+getBlockName(entry.id):': Empty'}`);slot.title=entry?getBlockName(entry.id):'Empty';
            const key=document.createElement('span');key.className='hotbar-number';key.textContent=i+1;slot.append(key);
            if(entry){appendItemIcon(slot,entry.id);const n=document.createElement('span');n.className='stack-count';n.textContent=isCreativeMode()?entry.count:Math.min(64,playerInventory[entry.id]||0);slot.append(n);}
            slot.onclick=()=>editing&&catalogSelection?assignHotbar(i,catalogSelection,selectedStackAmount()):selectHotbarIndex(i);
            slot.oncontextmenu=e=>{e.preventDefault();if(editing)assignHotbar(i,0);};
            slot.ondragover=e=>e.preventDefault();slot.ondrop=e=>{e.preventDefault();const id=Number(e.dataTransfer.getData('text/plain'));if(getBlockName(id))assignHotbar(i,id,selectedStackAmount());};
            element.append(slot);
        }
    }
}
function chooseCatalogItem(id){
    catalogSelection=id;
    if(!isCreativeMode())selectSlot(Number(Object.keys(getInventorySlotMapping()).find(k=>getInventorySlotMapping()[k]===id)));
    for(const slot of document.querySelectorAll('.catalog-item'))slot.classList.toggle('selected',Number(slot.dataset.item)===id);
    const name=document.getElementById('catalog-selected');if(name){name.replaceChildren();appendItemIcon(name,id);name.append(document.createTextNode(getBlockName(id)));}
    renderRecipeBook(id);
}
function filterCatalog(){
    const query=(document.getElementById('catalog-search')?.value||'').trim().toLowerCase();
    for(const panel of document.querySelectorAll('#inventory-ui > .slot-container')){
        let visible=0;
        for(const item of panel.querySelectorAll('.catalog-item')){
            const match=!query||item.dataset.search.includes(query);item.hidden=!match;if(match)visible++;
        }
        panel.style.display=(query?visible>0:panel.id==='tab-'+inventoryCategory)?'flex':'none';
        const recipes=panel.querySelector('.recipes');if(recipes)recipes.hidden=!!query;
    }
}
function renderRecipeBook(id){
    const area=document.getElementById('catalog-recipes');if(!area)return;area.replaceChildren();
    if(isCreativeMode())return;
    const smelt={ [GOLD_INGOT]:37,[IRON_INGOT]:36,[SILVER_INGOT]:SILVER_ORE }[id];
    if(smelt)appendSmeltingRecipe(area,smelt);
    for(const recipe of recipes.filter(r=>r.out===id)){
        const row=document.createElement('div');row.className='recipe-row';
        const label=document.createElement('span');label.textContent=Object.entries(recipe.ing).map(([item,n])=>`${getBlockName(Number(item))} x${n}`).join(' + ')+` = ${getBlockName(id)} x${recipe.count}`;
        const craft=document.createElement('button');craft.textContent='Craft';craft.disabled=!isCreativeMode()&&(recipeNeedsWorkbench(recipe)&&!hasWorkbench()||Object.entries(recipe.ing).some(([item,n])=>(playerInventory[item]||0)<n));
        craft.onclick=()=>{if(!isCreativeMode()&&(recipeNeedsWorkbench(recipe)&&!hasWorkbench()||Object.entries(recipe.ing).some(([item,n])=>(playerInventory[item]||0)<n)))return;
            for(const [item,n] of Object.entries(recipe.ing))consumeInventoryItem(Number(item),n);playerInventory[id]=(playerInventory[id]||0)+recipe.count;
            assignHotbar(activeHotbarSlot,id,recipe.count);updateHotbarUI();renderRecipeBook(id);};
        row.append(label,craft);area.append(row);
    }
}
function initCreativeInventory(){
    for(const [key,name] of [['materials','Materials'],['nature','Plants'],['food','Food']]){
        const tab=document.createElement('button');tab.className='tab-btn';tab.textContent=name;tab.onclick=()=>switchTab(key,tab);document.getElementById('inventory-tabs').append(tab);
        const panel=document.createElement('div');panel.className='slot-container';panel.id='tab-'+key;panel.style.display='none';inventoryUI.append(panel);
    }
    const search=document.createElement('input');search.type='search';search.id='catalog-search';search.setAttribute('aria-label','Search items');search.placeholder='Search';search.oninput=filterCatalog;
    document.getElementById('inventory-tabs').before(search);
    const footer=document.createElement('section');footer.id='catalog-footer';
    footer.innerHTML='<div class="catalog-selection"><span id="catalog-selected">Hotbar</span><label>Count <input id="catalog-amount" type="number" min="1" max="64" value="64"></label><button id="clear-hotbar-slot" title="Clear selected slot" aria-label="Clear selected slot">&#215;</button></div><div id="inventory-hotbar"></div><div id="catalog-recipes"></div>';
    inventoryUI.append(footer);document.getElementById('clear-hotbar-slot').onclick=()=>assignHotbar(activeHotbarSlot,0);
    const mapping=getInventorySlotMapping();
    for(const [slotId,id] of Object.entries(mapping)){
        const el=document.getElementById('inv-'+slotId);if(!el||el.hidden)continue;
        let category=el.closest('.slot-container')?.id.slice(4)||'build';
        if([36,37,38,SILVER_ORE,EMERALD_ORE,...TREASURE_COMPONENTS].includes(id))category='materials';
        else if([39,40,RAW_FISH,RICE,WHEAT,...EDIBLE_GARDEN,...Object.keys(KITCHEN_FOOD).map(Number)].includes(id))category='food';
        else if(NATURE_PLANTS.has(id)||LEAF_TYPES.has(id)||[COBWEB,STRING_ITEM,RICE_SEEDS,FLOWER_RED,FLOWER_BLUE].includes(id))category='nature';
        if([GOLD_BLOCK,SILVER_BLOCK,IRON_BLOCK,EMERALD_BLOCK,SAPPHIRE_BLOCK,GOLD_PYRAMID,SILVER_PYRAMID,SANDSTONE].includes(id))category='build';
        if(id===FISHING_ROD||id===STRING_ITEM)category='weapon';
        if(WEAPON_IDS.has(id))category='weapon';
        if(ADVENTURE_EGGS.has(id))category='mods';
        document.getElementById('tab-'+category).append(el);
        el.classList.add('catalog-item');el.dataset.item=id;el.dataset.search=(getBlockName(id)+' '+Object.keys(COMMAND_ITEMS).filter(k=>COMMAND_ITEMS[k]===id).join(' ')).toLowerCase();
        el.onclick=()=>chooseCatalogItem(id);el.draggable=true;el.ondragstart=e=>{chooseCatalogItem(id);e.dataTransfer.setData('text/plain',String(id));};
        if(!el.querySelector('img')){const icon=document.createElement('span');appendItemIcon(icon,id);if(icon.querySelector('img'))el.prepend(icon.firstChild);}
    }
    inventoryUI.querySelector('p')?.remove();
    document.getElementById('tab-weapon').prepend(document.getElementById('inv-'+(FISHING_ROD-12)));
    filterCatalog();renderHotbar();
    document.addEventListener('wheel',e=>{if(controls.isLocked&&!photoMode){e.preventDefault();selectHotbarIndex((activeHotbarSlot+(e.deltaY>0?1:8))%9);}},{passive:false});
}
