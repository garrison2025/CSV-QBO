/**
 * Writer acceptance matrix: synthetic data only; no bank identities are authenticated.
 * This is a format/round-trip test, NOT QuickBooks import validation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseInput,toMinorUnits} from '../src/core.mjs';
import {readReferenceQBO,writeWebConnectQBO} from '../src/qbo-writer.mjs';

const fixture=Buffer.from(readFileSync(new URL('./fixtures/sonomir-synthetic-qbo-20261105.base64',import.meta.url),'utf8').trim(),'base64');
const reference=fixture.toString('utf8');
const profile=readReferenceQBO(reference);
const stamp={serverTime:'20261105070726'};
const row=(n,overrides={})=>({
 date:'2026-10-14',description:'Fictional transaction '+n,
 amount:n%2===0?'-1.25':'2.50',id:'SYN'+n,memo:'Synthetic memo '+n,
 ...overrides
});
const create=(transactions,scope=profile)=>writeWebConnectQBO(transactions,scope,stamp);
const has=(s,value)=>s.includes(value);

test('independently downloaded synthetic comparator has pinned size and SHA-256',()=>{
 assert.equal(fixture.byteLength,923);
 assert.equal(createHash('sha256').update(fixture).digest('hex'),
  '00e5202de9a425ed3d0c4fba337271e54cfe8e48a87538c394c378ae95a74e69');
 assert.equal(profile.referenceHasPlaceholderMetadata,true);
});
test('1,000 synthetic transactions generate a bounded QBO with exact cents and unique FITIDs',async()=>{
 const source=Array.from({length:1000},(_,i)=>row(i));
 const {wire,report}=await create(source);
 assert.equal(report.transactionCount,1000);
 assert.equal(new TextEncoder().encode(wire).length<=350000,true);
 assert.equal(report.referenceHasPlaceholderMetadata,true);
 assert.equal(report.status,'syntax_valid_only');
 const back=parseInput(wire,'qbo').transactions;
 assert.equal(back.length,1000);
 assert.equal(new Set(back.map(r=>r.id)).size,1000);
 const inputNet=source.reduce((sum,x)=>sum+toMinorUnits(x.amount),0n);
 const outputNet=back.reduce((sum,x)=>sum+toMinorUnits(x.amount),0n);
 assert.equal(outputNet,inputNet);
 assert.equal(report.netCents,inputNet.toString());
 for(const [i,x] of back.entries()){
  assert.equal(x.date,source[i].date);
  assert.equal(x.amount,source[i].amount);
  assert.equal(x.description,source[i].description);
  assert.equal(x.memo,source[i].memo);
 }
});
test('1,001 row input fails before any partial QBO export',async()=>{
 await assert.rejects(create(Array.from({length:1001},(_,i)=>row(i))),/up to 1,000/);
});
test('350 KB output cap refuses overly long 1,000-row QBO instead of returning a partial file',async()=>{
 const huge=Array.from({length:1000},(_,i)=>row(i,{
   description:'P'.repeat(252)+String(i).padStart(3,'0'),
   memo:'M'.repeat(252)+String(i).padStart(3,'0')
 }));
 await assert.rejects(create(huge),/350 KB conservative/);
});
test('FITIDs are scoped by account and stable between subset and complete exports',async()=>{
 const source=[row(2),row(3),row(4)];
 const full=parseInput((await create(source)).wire,'qbo').transactions;
 const subset=parseInput((await create([source[2],source[0]])).wire,'qbo').transactions;
 assert.equal(subset[0].id,full[2].id);
 assert.equal(subset[1].id,full[0].id);
 const other=parseInput((await create(source,{...profile,accountId:'0987654321'})).wire,'qbo').transactions;
 for(let i=0;i<source.length;i++)assert.notEqual(other[i].id,full[i].id);
 const newFi=parseInput((await create(source,{...profile,intuBid:'4567'})).wire,'qbo').transactions;
 for(let i=0;i<source.length;i++)assert.notEqual(newFi[i].id,full[i].id);
});
test('same date, payee and amount with distinct legitimate references are preserved as distinct events',async()=>{
 const input=[row(1,{id:'REF001'}),row(1,{id:'REF002'})];
 const back=parseInput((await create(input)).wire,'qbo').transactions;
 assert.equal(back.length,2);
 assert.notEqual(back[0].id,back[1].id);
 assert.equal(back[0].description,back[1].description);
});
test('identical rows are refused: output cannot fabricate separate transaction identity',async()=>{
 await assert.rejects(create([row(4),row(4)]),/indistinguishable duplicate/);
});
test('sign conventions preserve negative, positive and extreme USD cents exactly',async()=>{
 const input=[row(1,{amount:'9999999999999.99'}),row(2,{amount:'-9999999999999.99'})];
 const {wire}=await create(input);
 const back=parseInput(wire,'qbo').transactions;
 assert.deepEqual(back.map(x=>x.amount),['9999999999999.99','-9999999999999.99']);
 assert.equal(back.reduce((sum,t)=>sum+toMinorUnits(t.amount),0n),0n);
});
test('zero, negative zero, invalid decimal and mixed currency symbols fail closed',async()=>{
 for(const amount of ['0.00','-0.00','1.001','€1.00','$-1.00','1,2,3.00']){
  await assert.rejects(create([row(1,{amount})]),/zero-amount|amount|currency|format/i,amount);
 }
});
test('calendar boundary: leap day preserved and impossible dates rejected',async()=>{
 const input=[row(1,{date:'2028-02-29'}),row(2,{date:'2028-03-01'})];
 const {wire}=await create(input);
 const back=parseInput(wire,'qbo').transactions;
 assert.deepEqual(back.map(x=>x.date),['2028-02-29','2028-03-01']);
 await assert.rejects(create([row(1,{date:'2027-02-29'})]),/Invalid calendar date/);
});
test('end-exclusive statement dates cannot overflow the supported 2100 calendar',async()=>{
 const ok=await create([row(1,{date:'2100-12-30'})]);
 assert.match(ok.wire,/<DTEND>21001231/);
 await assert.rejects(create([row(1,{date:'2100-12-31'})]),/end-exclusive.*2100/i);
});
test('SGML names and memos survive HTML-sensitive ASCII characters exactly',async()=>{
 const input=[row(1,{description:'R&D <Bookstore> "Sample" >',memo:'Donation & fee <review> "ok"'})];
 const {wire}=await create(input);
 assert.ok(has(wire,'R&amp;D &lt;Bookstore&gt;'));
 assert.ok(has(wire,'Donation &amp; fee &lt;review&gt;'));
 const back=parseInput(wire,'qbo').transactions;
 assert.equal(back[0].description,input[0].description);
 assert.equal(back[0].memo,input[0].memo);
});
test('newline, control bytes and non-ASCII cannot cause silent field loss',async()=>{
 for(const bad of ['text\ninjected','a\r\n<STMTTRN>','José','a\u0000b','🙂']){
  await assert.rejects(create([row(1,{description:bad})]),/printable ASCII/,bad);
  await assert.rejects(create([row(1,{memo:bad})]),/printable ASCII/,bad);
 }
});
test('input and bank metadata must be explicitly user supplied; no blank FI or BID defaults',async()=>{
 await assert.rejects(create([row(1)],null),/bank-specific/);
 await assert.rejects(create([row(1)],{...profile,fid:''}),/bank-specific/);
 await assert.rejects(create([row(1)],{...profile,intuBid:'ABC'}),/bank-specific/);
 await assert.rejects(create([row(1)],{...profile,accountId:'**-raw'}),/bank-specific/);
 assert.throws(()=>readReferenceQBO('random text'),/OFX 1.x/);
});
test('reference parser rejects invalid currency, duplicate account metadata and credit card inputs',()=>{
 assert.throws(()=>readReferenceQBO(reference.replace('<CURDEF>USD','<CURDEF>EUR')),/Only USD/);
 assert.throws(()=>readReferenceQBO(reference.replace('<INTU.BID>3000','<INTU.BID>')),/INTU\.BID/);
 assert.throws(()=>readReferenceQBO(reference.replace('</OFX>','<BANKACCTFROM></BANKACCTFROM></OFX>')),/Multiple bank\/card|exactly one|Multiple bank/);
 assert.throws(()=>readReferenceQBO(reference.replace('<BANKACCTFROM>','<CCACCTFROM>')),/Credit-card|BANKACCTFROM/i);
});
test('privacy: returned validation report contains no bank account, source payee or raw FITID',async()=>{
 const {report,wire}=await create([row(42,{description:'PRIVATE SYNTHETIC LABEL',memo:'NOT STORED'})]);
 assert.equal(report.containsSourceAccountDetails,false);
 assert.equal(report.targetQuickBooksImportVerified,false);
 assert.equal(report.referenceHasPlaceholderMetadata,true);
 assert.equal(report.orderedRowRoundTrip,true);
 const serialized=JSON.stringify(report);
 assert.ok(!serialized.includes(profile.accountId));
 assert.ok(!serialized.includes(profile.bankId));
 assert.ok(!serialized.includes('PRIVATE SYNTHETIC LABEL'));
 assert.ok(!serialized.includes('NOT STORED'));
 assert.ok(wire.includes('PRIVATE SYNTHETIC LABEL'));
});
