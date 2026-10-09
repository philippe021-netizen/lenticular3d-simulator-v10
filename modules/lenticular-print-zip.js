const CRC_TABLE = new Uint32Array(256);
for (let value = 0; value < CRC_TABLE.length; value++) {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  CRC_TABLE[value] = crc >>> 0;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

async function bytesOf(data) {
  if (typeof data === 'string') return new TextEncoder().encode(data);
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  throw new TypeError('Contenu ZIP non pris en charge.');
}

/** Build a standards-compliant, uncompressed ZIP for already compressed PNGs. */
export async function buildStoredZip(entries, { date = new Date() } = {}) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 0xffff) {
    throw new RangeError('Le ZIP doit contenir de 1 à 65535 fichiers.');
  }
  const stamp = dosTimestamp(date);
  const localParts = [];
  const directoryParts = [];
  let localOffset = 0;

  for (const entry of entries) {
    if (!entry || typeof entry.name !== 'string' || !entry.name || entry.name.includes('..')) {
      throw new TypeError('Nom de fichier ZIP invalide.');
    }
    const name = new TextEncoder().encode(entry.name);
    const data = await bytesOf(entry.data);
    const checksum = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true); // UTF-8 filenames
    localView.setUint16(8, 0, true); // STORE: PNG data is already compressed
    localView.setUint16(10, stamp.time, true);
    localView.setUint16(12, stamp.date, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    localParts.push(local, data);

    const directory = new Uint8Array(46 + name.length);
    const dirView = new DataView(directory.buffer);
    dirView.setUint32(0, 0x02014b50, true);
    dirView.setUint16(4, 0x0314, true); // Unix, ZIP 2.0
    dirView.setUint16(6, 20, true);
    dirView.setUint16(8, 0x0800, true);
    dirView.setUint16(10, 0, true);
    dirView.setUint16(12, stamp.time, true);
    dirView.setUint16(14, stamp.date, true);
    dirView.setUint32(16, checksum, true);
    dirView.setUint32(20, data.length, true);
    dirView.setUint32(24, data.length, true);
    dirView.setUint16(28, name.length, true);
    dirView.setUint32(38, 0, true); // external attributes
    dirView.setUint32(42, localOffset, true);
    directory.set(name, 46);
    directoryParts.push(directory);
    localOffset += local.length + data.length;
  }

  const directoryOffset = localOffset;
  const directorySize = directoryParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, directorySize, true);
  endView.setUint32(16, directoryOffset, true);
  return new Blob([...localParts, ...directoryParts, end], { type: 'application/zip' });
}
