import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFinancialBytes,parseInput,parseCSV,genericCSVExportPlan,toQuickBooksCSV} from '../src/core.mjs';

const encoder=new TextEncoder();
const makeLegacy=(suffix='.csv')=>{
  const head=suffix==='.tsv'?'Date\tDescription\tAmount\tReference\n':'Date,Description,Amount,Reference\n';
  const separator=suffix==='.tsv'?'\t':',';
  const first='11/04/2026'+separator+'Caf';
  const rest=''+separator+'-12.50'+separator+'000099\n11/05/2026'+separator+'Salary'+separator+'20.00'+separator+'000100\n';
  return new Uint8Array([...encoder.encode(head+first),0xe9,...encoder.encode(rest)]);
};

test('legacy Windows-1252 CSV never silently falls back from UTF-8',()=>{
  const bytes=makeLegacy();
  assert.throws(()=>decodeFinancialBytes(bytes,'csv'),/choose that encoding manually/);
  const decoded=decodeFinancialBytes(bytes,'csv',{csvEncoding:'windows-1252'});
  assert.equal(decoded.encoding,'windows-1252');
  assert.match(decoded.text,/Café/);
  const result=parseInput(decoded.text,'csv');
  assert.deepEqual(result.transactions.map(t=>t.amount),['-12.50','20.00']);
  assert.deepEqual(result.transactions.map(t=>t.id),['000099','000100']);
  assert.equal(result.transactions[0].description,'Café');
  assert.match(toQuickBooksCSV(result.transactions),/Café,-12\.50/);
  const generic=genericCSVExportPlan(result.transactions);
  assert.match(generic.csv,/Café/);
  assert.equal(generic.report.rowCount,2);
});
test('legacy Windows-1252 TSV is a user-chosen input encoding, not an extension alias',()=>{
  const bytes=makeLegacy('.tsv');
  assert.throws(()=>decodeFinancialBytes(bytes,'tsv'),/Cannot decode utf-8/);
  const decoded=decodeFinancialBytes(bytes,'tsv',{csvEncoding:'windows-1252'});
  const parsed=parseInput(decoded.text,'tsv');
  assert.equal(parsed.transactions[0].description,'Café');
  assert.equal(parsed.transactions.length,2);
  assert.equal(parsed.transactions[0].amount,'-12.50');
});
test('UTF-8 default remains unchanged and invalid override cannot weaken OFX or QIF guarantees',()=>{
  const utf8=encoder.encode('Date,Description,Amount\n11/04/2026,Café,-12.50\n');
  assert.equal(decodeFinancialBytes(utf8,'csv').encoding,'utf-8');
  assert.match(decodeFinancialBytes(utf8,'csv').text,/Café/);
  assert.throws(()=>decodeFinancialBytes(utf8,'qbo',{csvEncoding:'windows-1252'}),/only supported for CSV\/TSV/);
  assert.throws(()=>decodeFinancialBytes(utf8,'qif',{csvEncoding:'windows-1252'}),/only supported for CSV\/TSV/);
  assert.throws(()=>decodeFinancialBytes(utf8,'csv',{csvEncoding:'latin1'}),/Unsupported CSV character encoding/);
  assert.throws(()=>decodeFinancialBytes(utf8,'csv',{csvEncoding:'auto-fallback'}),/Unsupported CSV character encoding/);
  assert.equal(parseCSV(decodeFinancialBytes(utf8,'csv').text)[1][1],'Café');
});
test('UTF-8 and UTF-16 BOM are authoritative and cannot be overridden to misread original bank bytes',()=>{
  const text='Date,Description,Amount\n11/04/2026,Café,-5.00\n';
  const utf8BOM=new Uint8Array([0xef,0xbb,0xbf,...encoder.encode(text)]);
  const utf16=new Uint8Array([0xff,0xfe,...Buffer.from(text,'utf16le')]);
  const utf16BE=new Uint8Array([0xfe,0xff,...Buffer.from(text,'utf16le').swap16()]);
  for(const bytes of [utf8BOM,utf16,utf16BE]){
    assert.throws(()=>decodeFinancialBytes(bytes,'csv',{csvEncoding:'windows-1252'}),/explicit UTF byte-order mark/);
    const result=decodeFinancialBytes(bytes,'csv');
    assert.equal(parseInput(result.text,'csv').transactions[0].description,'Café');
  }
  assert.equal(decodeFinancialBytes(utf8BOM,'csv').encoding,'utf-8');
  assert.equal(decodeFinancialBytes(utf16,'csv').encoding,'utf-16le');
  assert.equal(decodeFinancialBytes(utf16BE,'csv').encoding,'utf-16be');
});
test('Windows-1252 undefined byte mappings and NUL still block conversion rather than replace text',()=>{
  const bytes=makeLegacy();
  const corrupted=new Uint8Array(bytes);
  corrupted[corrupted.indexOf(0xe9)]=0x81; // undefined Windows-1252 code point -> U+FFFD
  assert.throws(()=>decodeFinancialBytes(corrupted,'csv',{csvEncoding:'windows-1252'}),/replacement characters/);
  const nul=new Uint8Array(bytes);
  nul[nul.indexOf(0xe9)]=0;
  assert.throws(()=>decodeFinancialBytes(nul,'csv',{csvEncoding:'windows-1252'}),/null byte/);
});
test('choosing legacy encoding is not a substitute for strict CSV financial amount validation',()=>{
  const source=encoder.encode('Date,Description,Amount\n11/04/2026,Merchant,-5,00\n');
  const decoded=decodeFinancialBytes(source,'csv',{csvEncoding:'windows-1252'});
  assert.throws(()=>parseInput(decoded.text,'csv'),/expected 3 columns, found 4/);
});
