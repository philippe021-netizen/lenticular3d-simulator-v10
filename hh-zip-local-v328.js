/* HappyHolo V3.28 — ZIP local sans dépendance externe */
(() => {
'use strict';

const table = (() => {
  const t = new Uint32Array(256);
  for(let n=0;n<256;n++){
    let c=n;
    for(let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);
    t[n]=c>>>0;
  }
  return t;
})();

function crc32(u8){
  let c=0xFFFFFFFF;
  for(let i=0;i<u8.length;i++) c=table[(c^u8[i])&0xFF]^(c>>>8);
  return (c^0xFFFFFFFF)>>>0;
}
function u16(n){ return new Uint8Array([n&255,(n>>>8)&255]); }
function u32(n){ return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]); }
function concat(parts){
  const total=parts.reduce((s,p)=>s+p.length,0);
  const out=new Uint8Array(total); let o=0;
  for(const p of parts){out.set(p,o);o+=p.length;}
  return out;
}
async function asBytes(v){
  if(v instanceof Blob) return new Uint8Array(await v.arrayBuffer());
  if(v instanceof Uint8Array) return v;
  return new TextEncoder().encode(String(v));
}
async function createZip(entries){
  const locals=[],centrals=[]; let offset=0;
  for(const entry of entries){
    const nameBytes=new TextEncoder().encode(entry.name);
    const data=await asBytes(entry.data);
    const crc=crc32(data);
    const local=concat([
      u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),
      u32(crc),u32(data.length),u32(data.length),
      u16(nameBytes.length),u16(0),nameBytes,data
    ]);
    locals.push(local);
    const central=concat([
      u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),
      u32(crc),u32(data.length),u32(data.length),
      u16(nameBytes.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),nameBytes
    ]);
    centrals.push(central);
    offset+=local.length;
  }
  const centralBlob=concat(centrals);
  const end=concat([
    u32(0x06054b50),u16(0),u16(0),u16(entries.length),u16(entries.length),
    u32(centralBlob.length),u32(offset),u16(0)
  ]);
  return new Blob([...locals,centralBlob,end],{type:'application/zip'});
}
window.HappyHoloZipLocal={createZip};
})();