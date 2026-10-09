import assert from 'node:assert/strict';
import test from 'node:test';
import { PRINTER_PRESETS, evaluatePrintSetup } from '../modules/microplayer-print-planner.js';

test('three exact machine models and verified manufacturer specifications', () => {
  assert.deepEqual(PRINTER_PRESETS.map(p=>p.id),['canon-pro-200s','roland-lef-20','hp-officejet-pro-8720']);
  assert.deepEqual(PRINTER_PRESETS.map(p=>[p.maxPrinterDpiX,p.maxPrinterDpiY]),[
    [4800,2400],[1440,720],[4800,1200]
  ]);
  assert.deepEqual([PRINTER_PRESETS[1].maxPrintWidthMm,PRINTER_PRESETS[1].maxPrintHeightMm],[508,330]);
  assert.equal(PRINTER_PRESETS[0].supportedModes[0].x,600);
  assert.equal(PRINTER_PRESETS[2].supportedModes[1].x,1200);
});

test('Canon 600 DPI + 50 LPI creates 12 raster pixels per lens on the 10×15 format', () => {
  const result=evaluatePrintSetup({printerId:'canon-pro-200s',rasterDpiX:600,rasterDpiY:600,nominalLpi:50,calibratedLpi:50});
  assert.equal(result.pixelsPerLens,12);
  assert.equal(result.candidates.find(v=>v.viewCount===9).pixelsPerView,12/9);
  assert.equal(result.existingEngineSupportsNineViews,true);
  assert.equal(result.suggestedViewCount,6);
  assert.ok(result.warnings.some(x=>x.includes('1,5 pixel')));
  assert.equal(result.paperFits,true);
  assert.equal(result.outWidthPx,3543);
  assert.equal(result.outHeightPx,2362);
});

test('Roland 1440×720 dpi and 60 LPI: 8 or 12 integer stripes only across X',()=>{
 const x=evaluatePrintSetup({printerId:'roland-lef-20',rasterDpiX:1440,rasterDpiY:720,nominalLpi:60,calibratedLpi:60,lensOrientation:'vertical'});
 assert.equal(x.effectiveDpi,1440);
 assert.equal(x.pixelsPerLens,24);
 assert.equal(x.candidates.find(v=>v.viewCount===8).exactIntegerStripes,true);
 assert.equal(x.candidates.find(v=>v.viewCount===12).exactIntegerStripes,true);
 assert.equal(x.suggestedViewCount,8);
 assert.ok(x.suggestedAlternatives.includes(12));
 const y=evaluatePrintSetup({printerId:'roland-lef-20',rasterDpiX:1440,rasterDpiY:720,nominalLpi:60,calibratedLpi:60,lensOrientation:'horizontal'});
 assert.equal(y.effectiveDpi,720);
 assert.equal(y.pixelsPerLens,12);
 assert.equal(y.candidates.find(v=>v.viewCount===8).exactIntegerStripes,false);
 assert.equal(y.candidates.find(v=>v.viewCount===6).exactIntegerStripes,true);
 assert.equal(y.candidates.find(v=>v.viewCount===12).exactIntegerStripes,true);
 assert.equal(y.suggestedViewCount,6);
});

test('Roland 1440×720 and 50 LPI: x=28.8, y=14.4 pixels/lens',()=>{
 const settings={printerId:'roland-lef-20',rasterDpiX:1440,rasterDpiY:720,nominalLpi:50,calibratedLpi:50};
 assert.equal(evaluatePrintSetup({...settings,lensOrientation:'vertical'}).pixelsPerLens,28.8);
 assert.equal(evaluatePrintSetup({...settings,lensOrientation:'horizontal'}).pixelsPerLens,14.4);
});

test('pitch calibration applied to measured pitch rather than nominal',()=>{
 const x=evaluatePrintSetup({calibratedLpi:50.2});
 assert.ok(Math.abs(x.pixelsPerLens-600/50.2)<1e-6);
});

test('Roland accepts A3 and refuses oversize, even if rotated',()=>{
 assert.equal(evaluatePrintSetup({printerId:'roland-lef-20',widthMm:420,heightMm:297}).paperFits,true);
 const big=evaluatePrintSetup({printerId:'roland-lef-20',widthMm:509,heightMm:331});
 assert.equal(big.paperFits,false);
 assert.ok(big.warnings.some(x=>x.includes('HORS ZONE')));
});

test('HP borderless A4 size fits, oversize does not',()=>{
 assert.equal(evaluatePrintSetup({printerId:'hp-officejet-pro-8720',widthMm:210,heightMm:297}).paperFits,true);
 assert.equal(evaluatePrintSetup({printerId:'hp-officejet-pro-8720',widthMm:330,heightMm:500}).paperFits,false);
});

test('the legacy 9-view printer/export remains exclusively Canon 600 × 600',()=>{
 assert.equal(evaluatePrintSetup({printerId:'hp-officejet-pro-8720'}).existingEngineSupportsNineViews,false);
 assert.equal(evaluatePrintSetup({printerId:'roland-lef-20'}).existingEngineSupportsNineViews,false);
 assert.equal(evaluatePrintSetup({printerId:'canon-pro-200s',rasterDpiX:1200,rasterDpiY:1200}).existingEngineSupportsNineViews,false);
 assert.equal(evaluatePrintSetup({printerId:'canon-pro-200s',widthMm:210,heightMm:297}).existingEngineSupportsNineViews,false);
});

test('reject invalid dimensions, anisotropic DPI and material pitch',()=>{
 assert.throws(()=>evaluatePrintSetup({rasterDpiX:0}),/résolution raster/i);
 assert.throws(()=>evaluatePrintSetup({rasterDpiY:NaN}),/numériques/i);
 assert.throws(()=>evaluatePrintSetup({widthMm:-1}),/dimensions physiques/i);
});
