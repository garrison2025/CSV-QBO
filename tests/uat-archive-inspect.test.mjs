import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInput,quickBooksCSVExportPlan} from '../src/core.mjs';
import {toXLSX,toZIP} from '../src/xlsx.mjs';
import {inspectStoredArchive,inspectExactXLSX,inspectQuickBooksZIP} from '../scripts/uat-archive-inspect.mjs';
import {reconcileLocalPair,createPrivateDraft} from '../scripts/uat-local-check.mjs';

const qif="!Type:Bank\nD11/04/2026\nT-12.50\nP=SUM(1,2) & <Cafe>\nN00001234\nMmulti\nline? no\n^\nD11/05/2026\nT120.00\nPRefund\nN00000111\n^\n";
const source="Date,Description,Amount,Reference,Memo\n11/04/2026,Books,-12.50,000001,Accounting\n11/05/2026,Refund,120.00,000002,Store credit\n11/06/2026,Fee,-0.01,000003,Admin\n11/07/2026,Deposit,50.10,000004,Salary\n11/08/2026,Utility,-22.09,000005,Power\n";
const mapping={date:0,description:1,amount:2,debit:-1,credit:-1,id:3,memo:4};
const b=s=>Buffer.from(s,'utf8');
const tx=parseInput(source,'csv',{mapping}).transactions;
// Test-only in-place same-size mutation of a STORED ZIP member, followed by
// repair of BOTH local and central CRC values. This ensures the checker
// catches changed financial XML, not merely a broken ZIP checksum.
function crc(bytes){
  let n=0xffffffff;
  for(const b of bytes){
    n^=b;
    for(let i=0;i<8;i++)n=(n>>>1)^(0xedb88320&-(n&1));
  }
  return (n^0xffffffff)>>>0;
}
function memberLocation(zip,name){
  const end=zip.length-22;
  let pos=zip.readUInt32LE(end+16),count=zip.readUInt16LE(end+10);
  for(let i=0;i<count;i++){
    const n=zip.readUInt16LE(pos+28),x=zip.readUInt16LE(pos+30),c=zip.readUInt16LE(pos+32);
    if(zip.subarray(pos+46,pos+46+n).toString('utf8')===name){
      const local=zip.readUInt32LE(pos+42),len=zip.readUInt32LE(pos+24);
      const start=local+30+zip.readUInt16LE(local+26)+zip.readUInt16LE(local+28);
      return {pos,local,start,len,nameLength:n};
    }
    pos+=46+n+x+c;
  }
  throw Error('Missing member in test fixture: '+name);
}
function repack(bytes,name,transform){
  const zip=Buffer.from(bytes), loc=memberLocation(zip,name);
  const oldBody=zip.subarray(loc.start,loc.start+loc.len).toString('utf8');
  const newBody=Buffer.from(transform(oldBody),'utf8');
  assert.equal(newBody.length,loc.len,'Test mutation must preserve member size');
  newBody.copy(zip,loc.start);
  const sum=crc(newBody);
  zip.writeUInt32LE(sum,loc.local+14);
  zip.writeUInt32LE(sum,loc.pos+16);
  return zip;
}
function renameStoredMember(bytes,oldName,newName){
  const zip=Buffer.from(bytes),loc=memberLocation(zip,oldName);
  assert.equal(Buffer.byteLength(oldName),Buffer.byteLength(newName));
  Buffer.from(newName).copy(zip,loc.pos+46);
  Buffer.from(newName).copy(zip,loc.local+30);
  return zip;
}
function qaInput(input='qif'){
  if(input==='qif')return "!Type:Bank\nD11/04/2026\nT-12.50\nPFormula & <tag>\nN00001234\nMSecond memo\n^\nD11/05/2026\nT120.00\nPRefund\nN00001111\n^\n";
  throw Error('Unknown test fixture');
}
test('independently reads actual XLSX archive bytes and reconciles date styles, cents, reference, memo and order',()=>{
  const text=qaInput(),sourceTx=parseInput(text,'qif').transactions;
  const xlsx=toXLSX(sourceTx,{includeMemo:true});
  const result=inspectExactXLSX(xlsx,sourceTx);
  assert.equal(result.rows,2);
  assert.equal(result.netCents,'10750');
  assert.equal(result.memoIncluded,true);
  const check=reconcileLocalPair({route_slug:'qif-to-excel',source_bytes:b(text),output_bytes:xlsx,expected_rows:2,expected_net_cents:'10750'});
  assert.equal(check.status,'local_cross_file_preflight_only');
  assert.equal(check.output_format,'xlsx');
  assert.equal(check.target_import_observed,false);
  const draft=createPrivateDraft(check);
  assert.equal(draft.cases[0].source_kind,'PENDING_AUTHENTICITY_REVIEW');
  assert.equal(draft.cases[0].owner_approved,false);
});
test('XLSX checker refuses excluded source Memo until optional Memo exported',()=>{
  const text=qaInput(),sourceTx=parseInput(text,'qif').transactions;
  const noMemo=toXLSX(sourceTx);
  assert.throws(()=>inspectExactXLSX(noMemo,sourceTx),/Source Memo omitted/);
  assert.throws(()=>reconcileLocalPair({route_slug:'qif-to-excel',source_bytes:b(text),output_bytes:noMemo}),/Source Memo omitted/);
});
test('independent XLSX checker catches tampered Excel date, cents, payee, IDs and Memo even after CRC repair',()=>{
  const sourceTx=parseInput(qaInput(),'qif').transactions, original=toXLSX(sourceTx,{includeMemo:true});
  const xml='xl/worksheets/sheet1.xml';
  for(const [oldVal,newVal] of [
    ['<v>46330</v>','<v>46331</v>'],
    ['<v>-12.50</v>','<v>-12.49</v>'],
    ['Formula &amp; &lt;tag&gt;','Hacked! &amp; &lt;tag&gt;'],
    ['00001234','99991234'],
    ['Second memo','Changed mem']
  ]){
    const changed=repack(original,xml,s=>{
      assert.ok(s.includes(oldVal),'fixture missing '+oldVal);
      return s.replace(oldVal,newVal);
    });
    assert.throws(()=>inspectExactXLSX(changed,sourceTx),/changed/);
  }
});
test('XLSX checker rejects actual damaged CRC, unexpected file, XML formula and false numeric styles',()=>{
  const sourceTx=parseInput(qaInput(),'qif').transactions, original=toXLSX(sourceTx,{includeMemo:true});
  const bad=Buffer.from(original),index=bad.indexOf(Buffer.from('Formula'));
  assert.ok(index>0);
  bad[index]^=1;
  assert.throws(()=>inspectStoredArchive(bad),/CRC checksum mismatch/);
  const renamed=renameStoredMember(original,'xl/styles.xml','xl/broken.xml');
  assert.throws(()=>inspectExactXLSX(renamed,sourceTx),/missing or unexpected/);
  const xml='xl/worksheets/sheet1.xml';
  const formula=repack(original,xml,s=>s.replace('<v>-12.50</v>','<f>1</f>.....'));
  assert.throws(()=>inspectExactXLSX(formula,sourceTx),/contains formulas/);
  const styles=repack(original,'xl/styles.xml',s=>s.replace('formatCode="yyyy-mm-dd"','formatCode="mm-dd-yyyy"'));
  assert.throws(()=>inspectExactXLSX(styles,sourceTx),/Date number format/);
});
test('real downloaded multipart QuickBooks ZIP compares every CSV part and bundled report to the source',()=>{
  const {parts,report}=quickBooksCSVExportPlan(tx,{maxRows:2});
  assert.equal(parts.length,3);
  const entries=Object.fromEntries(parts.map((part,i)=>['quickbooks-online-part-'+String(i+1).padStart(3,'0')+'.csv',part]));
  entries['quickbooks-csv-validation.json']=JSON.stringify(report,null,2);
  const zip=toZIP(entries);
  const checked=inspectQuickBooksZIP(zip,tx);
  assert.equal(checked.rows,5);
  assert.equal(checked.parts,3);
  assert.equal(checked.netCents,'13550');
  const result=reconcileLocalPair({
    route_slug:'quickbooks-csv-formatter',source_bytes:b(source),
    output_bytes:zip,mapping,expected_rows:5,expected_net_cents:'13550'
  });
  assert.equal(result.parsed_rows,5);
  assert.equal(result.exported_rows,5);
  assert.ok(result.notes.some(s=>s.includes('3 independent QuickBooks CSV')));
  assert.equal(result.target_import_observed,false);
});
test('QuickBooks ZIP fails on tampered part even if another part has cancelling amount, on missing file, or changed manifest',()=>{
  const {parts,report}=quickBooksCSVExportPlan(tx,{maxRows:2});
  const entries=Object.fromEntries(parts.map((part,i)=>['quickbooks-online-part-'+String(i+1).padStart(3,'0')+'.csv',part]));
  entries['quickbooks-csv-validation.json']=JSON.stringify(report,null,2);
  const zip=toZIP(entries);
  const changed=repack(zip,'quickbooks-online-part-001.csv',s=>s.replace('-12.50','-12.49'));
  assert.throws(()=>inspectQuickBooksZIP(changed,tx),/source-row mismatch/);
  const missing=inspectStoredArchive(zip);missing.delete('quickbooks-online-part-002.csv');
  assert.throws(()=>inspectQuickBooksZIP(toZIP(Object.fromEntries(missing)),tx),/Unexpected files|part missing|part count/);
  const fake=repack(zip,'quickbooks-csv-validation.json',s=>s.replace('"sourceRows": 5','"sourceRows": 4'));
  assert.throws(()=>inspectQuickBooksZIP(fake,tx),/manifest and actual CSV bytes differ/);
});
test('archive inspector prohibits non-stored ZIPs, hidden payloads, and corrupted local/central directory',()=>{
  const sample=toXLSX(tx);
  const archive=Buffer.from(sample);
  archive.writeUInt16LE(8,8);// unsupported ZIP compression method in local header
  assert.throws(()=>inspectStoredArchive(archive),/flags mismatch|Unsupported/);
  const swapped=Buffer.from(sample);
  swapped.writeUInt32LE(12345,14);// wrong CRC
  assert.throws(()=>inspectStoredArchive(swapped),/sizes or CRC disagree/);
});
