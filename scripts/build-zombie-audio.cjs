// Convert the CC0 stereo WAV recordings to mono PCM and embed them for file:// play.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=process.argv[2];
if(!source)throw Error('Pass the directory containing the three original ZombieMoans WAV files.');
const files=fs.readdirSync(source).filter(n=>/ZombieMoan[123]\.wav$/.test(n)).sort(),encoded=[];
if(files.length!==3)throw Error('Expected three original WAV recordings');
for(const [index,file] of files.entries()){
 const input=fs.readFileSync(path.join(source,file));let data,channels,rate,bits;
 for(let p=12;p+8<=input.length;){const name=input.toString('ascii',p,p+4),n=input.readUInt32LE(p+4),start=p+8;if(name==='fmt '){channels=input.readUInt16LE(start+2);rate=input.readUInt32LE(start+4);bits=input.readUInt16LE(start+14);}if(name==='data')data=input.subarray(start,start+n);p=start+n+(n%2);}
 if(!data||bits!==16||rate!==44100)throw Error('Expected 44.1kHz 16-bit PCM');
 const frames=Math.floor(data.length/(channels*2)/2),output=Buffer.alloc(44+frames*2);
 output.write('RIFF');output.writeUInt32LE(output.length-8,4);output.write('WAVEfmt ',8);output.writeUInt32LE(16,16);output.writeUInt16LE(1,20);output.writeUInt16LE(1,22);output.writeUInt32LE(22050,24);output.writeUInt32LE(44100,28);output.writeUInt16LE(2,32);output.writeUInt16LE(16,34);output.write('data',36);output.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++){let sum=0;for(let k=0;k<2;k++)for(let c=0;c<channels;c++)sum+=data.readInt16LE(((i*2+k)*channels+c)*2);output.writeInt16LE(Math.round(sum/(channels*2)),44+i*2);}
 fs.writeFileSync(path.join(root,`assets/audio/zombie-moan-${index+1}.wav`),output);encoded.push(output.toString('base64'));
 console.log(file,frames/22050+'s',output.length+' bytes');
}
fs.writeFileSync(path.join(root,'zombie-voices.js'),'// Generated from CC0 recordings by EmoPreben. See THIRD_PARTY_NOTICES.txt.\nconst ZOMBIE_VOICE_DATA='+JSON.stringify(encoded)+';\n');
