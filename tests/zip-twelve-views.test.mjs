import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function storedZip(count){
 const locals=[],central=[];let offset=0;
 for(let i=1;i<=count;i++){
  const name=Buffer.from(`vue-${String(i).padStart(2,'0')}.png`),data=Buffer.from([i]);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(name.length,26);
  const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt32LE(data.length,20);entry.writeUInt16LE(name.length,28);entry.writeUInt32LE(offset,42);
  locals.push(local,name,data);central.push(entry,name);offset+=local.length+name.length+data.length;
 }
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(count,10);end.writeUInt32LE(offset,16);
 return new Blob([Buffer.concat([...locals,...central,end])]);
}
function loader(){
 const context={window:{},document:{readyState:'loading',addEventListener(){}},Blob,URL,TextDecoder,DataView,Uint8Array,Intl};
 vm.runInNewContext(readFileSync(new URL('../happyholo-zip9-loader.js',import.meta.url),'utf8'),context);
 return context.window.HappyHoloZip9;
}
for(const count of [9,12])test(`ZIP importer retains all ${count} real frames in natural order`,async()=>{
 const result=await loader().extract(storedZip(count));
 assert.equal(result.urls.length,count);assert.equal(result.names.at(-1),`vue-${String(count).padStart(2,'0')}.png`);
 for(let i=0;i<count;i++){const bytes=new Uint8Array(await (await fetch(result.urls[i])).arrayBuffer());assert.equal(bytes[0],i+1);URL.revokeObjectURL(result.urls[i]);}
});
test('oversized archive is rejected rather than silently losing views',async()=>{
 await assert.rejects(loader().extract(storedZip(13)),/12 vues maximum/);
});
