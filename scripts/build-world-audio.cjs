// Download attributed recordings and embed unchanged OGG files for offline/file:// play.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const entries={
 cow:['mobs_mc_cow.ogg'],cow_hurt:['mobs_mc_cow_hurt.ogg'],
 sheep:['mobs_mc_sheep_random.1.ogg','mobs_mc_sheep_random.2.ogg'],sheep_hurt:['mobs_mc_sheep_damage.ogg'],
 pig:['mobs_pig.ogg'],pig_hurt:['mobs_pig_angry.ogg'],
 horse:['mobs_mc_horse_random.1.ogg','mobs_mc_horse_random.2.ogg'],horse_hurt:['mobs_mc_horse_hurt.ogg'],
 villager:['mobs_mc_villager.1.ogg','mobs_mc_villager.2.ogg'],villager_hurt:['mobs_mc_villager_hurt.1.ogg'],
 zombie:['mobs_mc_zombie_growl.ogg'],zombie_hurt:['mobs_mc_zombie_hurt.ogg'],zombie_death:['mobs_mc_zombie_death.ogg'],
 pillager:['mobs_mc_pillager_grunt1.ogg','mobs_mc_pillager_grunt2.ogg'],pillager_hurt:['mobs_mc_pillager_ow1.ogg','mobs_mc_pillager_ow2.ogg'],
 creeper_fuse:['mobs_mc_creeper_hurt.ogg'],creeper_death:['mobs_mc_creeper_death.ogg'],
 player_hurt:['player_damage.ogg'],player_fall:['player_falling_damage.ogg'],
 dirt_step:['default_dirt_footstep.1.ogg','default_dirt_footstep.2.ogg'],grass_step:['default_grass_footstep.1.ogg','default_grass_footstep.2.ogg'],
 dirt_break:['default_dig_crumbly.ogg'],grass_break:['default_dig_snappy.ogg'],
 dirt:['default_dig_crumbly.ogg','default_dirt_footstep.1.ogg','default_dirt_footstep.2.ogg'],
 grass:['default_grass_footstep.1.ogg','default_grass_footstep.2.ogg','default_dig_snappy.ogg'],
 stone:['default_dig_cracky.1.ogg','default_dig_cracky.2.ogg'],
 wood:['default_dig_choppy.1.ogg','default_dig_choppy.2.ogg'],
 sand:['default_sand_footstep.1.ogg','default_sand_footstep.2.ogg'],
 metal:['default_dug_metal.1.ogg','default_dug_metal.2.ogg'],
 glass:['default_break_glass.1.ogg','default_break_glass.2.ogg'],glass_step:['default_glass_footstep.ogg'],
 wood_step:['default_wood_footstep.1.ogg','default_wood_footstep.2.ogg'],stone_step:['default_hard_footstep.1.ogg','default_hard_footstep.2.ogg'],
 place:['default_place_node.1.ogg','default_place_node.2.ogg'],hard_place:['default_place_node_hard.1.ogg']
};
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(url+' '+r.status);return r;}
(async()=>{
 const manifest=path.join(root,'assets/audio/world/source.json');
 const commit=fs.existsSync(manifest)?JSON.parse(fs.readFileSync(manifest,'utf8')).commit:(await(await get('https://api.github.com/repos/VoxeLibre/VoxeLibre/commits/master')).json()).sha;
 const base=`https://raw.githubusercontent.com/VoxeLibre/VoxeLibre/${commit}/mods/`,data={};
 const out=path.join(root,'assets/audio/world');fs.mkdirSync(out,{recursive:true});
 for(const [kind,files] of Object.entries(entries)){
  data[kind]=[];
  for(const file of files){const folder=/^(default_|player_)/.test(file)?'CORE/mcl_sounds/':'ENTITIES/mobs_mc/';
   const local=path.join(out,file),bytes=fs.existsSync(local)?fs.readFileSync(local):Buffer.from(await(await get(base+folder+'sounds/'+file)).arrayBuffer());
   if(bytes.toString('ascii',0,4)!=='OggS')throw Error('Invalid OGG '+file);
   fs.writeFileSync(path.join(out,file),bytes);data[kind].push(bytes.toString('base64'));console.log(file,bytes.length);
  }
 }
 for(const [file,source] of [['mobs-license.md','ENTITIES/mobs_mc/LICENSE-media.md'],['blocks-license.txt','CORE/mcl_sounds/README.txt']])fs.writeFileSync(path.join(out,file),await(await get(base+source)).text());
 fs.writeFileSync(path.join(out,'source.json'),JSON.stringify({repository:'https://github.com/VoxeLibre/VoxeLibre',commit,entries},null,2)+'\n');
 fs.writeFileSync(path.join(root,'world-audio-data.js'),'// Unmodified licensed recordings. See assets/audio/world/*license* and THIRD_PARTY_NOTICES.txt.\nconst WORLD_AUDIO_DATA='+JSON.stringify(data)+';\n');
})().catch(e=>{console.error(e);process.exitCode=1;});
