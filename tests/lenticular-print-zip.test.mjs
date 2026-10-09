import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStoredZip } from '../modules/lenticular-print-zip.js';

test('print bundle ZIP stores the PNG and manifest as valid UTF-8 named entries', async () => {
  const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  const manifest = '{"widthMm":100,"heightMm":150}';
  const blob = await buildStoredZip([
    { name: 'microplayer-interlace.png', data: png },
    { name: 'manifest-impression.json', data: manifest }
  ], { date: new Date('2026-10-02T12:00:00Z') });
  const zip = Buffer.from(await blob.arrayBuffer());
  assert.equal(blob.type, 'application/zip');
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.readUInt16LE(8), 0); // STORE method
  const firstNameLength = zip.readUInt16LE(26);
  const firstSize = zip.readUInt32LE(18);
  const firstName = zip.toString('utf8', 30, 30 + firstNameLength);
  const firstStart = 30 + firstNameLength;
  assert.equal(firstName, 'microplayer-interlace.png');
  assert.deepEqual(zip.subarray(firstStart, firstStart + firstSize), Buffer.from(png));

  const secondHeader = firstStart + firstSize;
  assert.equal(zip.readUInt32LE(secondHeader), 0x04034b50);
  const secondNameLength = zip.readUInt16LE(secondHeader + 26);
  const secondSize = zip.readUInt32LE(secondHeader + 18);
  const secondName = zip.toString('utf8', secondHeader + 30, secondHeader + 30 + secondNameLength);
  const secondStart = secondHeader + 30 + secondNameLength;
  assert.equal(secondName, 'manifest-impression.json');
  assert.equal(zip.toString('utf8', secondStart, secondStart + secondSize), manifest);
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  assert.equal(zip.readUInt16LE(zip.length - 14), 2);
});

test('print bundle ZIP rejects traversal paths', async () => {
  await assert.rejects(buildStoredZip([{ name: '../unexpected.txt', data: 'x' }]), /Nom de fichier/i);
});
