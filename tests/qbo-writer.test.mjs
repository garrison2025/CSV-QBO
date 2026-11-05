import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseInput,toMinorUnits} from '../src/core.mjs';
import {readReferenceQBO,writeWebConnectQBO} from '../src/qbo-writer.mjs';

const reference=Buffer.from(readFileSync(new URL('./fixtures/sonomir-synthetic-qbo-20261105.base64',import.meta.url),'utf8').trim(),'base64').toString('utf8');
const sourceCSV='Date,Description,Amount,Reference\n'+
 '10/14/2026,Fictional Espresso,-12.50,SYN001\n'+
 '10/15/2026,Fictional Refund,20.75,SYN002\n';
const source=parseInput(sourceCSV,'csv').transactions;
const profile=readReferenceQBO(reference);
const opts={serverTime:'20261105070726'};
function independentlyReadWire(wire){
 return [...wire.matchAll(/<STMTTRN>\r\n([\s\S]*?)<\/STMTTRN>/g)].map((match)=>{
   const field=name=>match[1].match(new RegExp('<'+name+'>([^<\\r\\n]+)'))?.[1];
   return {date:field('DTPOSTED'),amount:field('TRNAMT'),payee:field('NAME'),
     fitid:field('FITID'),type:field('TRNTYPE')};
 });
}
test('actual Sonomir QBO fixture yields a bank metadata reference, never a hardcoded global default',()=>{
 assert.equal(profile.fid,'3000');
 assert.equal(profile.intuBid,'3000');
 assert.equal(profile.bankId,'000000000');
 assert.equal(profile.accountId,'0000');
 assert.equal(profile.accountType,'CHECKING');
});
test('real CSV->QBO file writer aligns with independent competitor output row for row, exact cents',async()=>{
 const {wire,report}=await writeWebConnectQBO(source,profile,opts);
 const competitor=parseInput(reference,'qbo').transactions;
 const rows=independentlyReadWire(wire);
 assert.match(wire,/^OFXHEADER:100\r\nDATA:OFXSGML/);
 assert.match(wire,/<INTU\.BID>3000/);
 assert.equal(rows.length,2);
 for(let i=0;i<rows.length;i++){
   assert.equal(rows[i].date,source[i].date.replaceAll('-',''));
   assert.equal(toMinorUnits(rows[i].amount),toMinorUnits(competitor[i].amount));
   assert.equal(rows[i].payee,competitor[i].description);
   assert.equal(rows[i].type,i===0?'DEBIT':'CREDIT');
   assert.match(rows[i].fitid,/^FFL[A-F0-9]{28}$/);
 }
 assert.equal(rows.reduce((sum,r)=>sum+toMinorUnits(r.amount),0n),825n);
 assert.equal(report.netCents,'825');
 assert.equal(report.orderedRowRoundTrip,true);
 assert.equal(report.status,'syntax_valid_only');
 assert.equal(report.targetQuickBooksImportVerified,false);
});
test('FITIDs are stable across repeated export and input row reordering',async()=>{
 const a=await writeWebConnectQBO(source,profile,opts);
 const b=await writeWebConnectQBO(source,profile,opts);
 assert.equal(a.wire,b.wire);
 const c=await writeWebConnectQBO([...source].reverse(),profile,opts);
 assert.deepEqual(independentlyReadWire(c.wire).map(t=>t.fitid),independentlyReadWire(a.wire).map(t=>t.fitid).reverse());
});
test('OFX escaping preserves ampersand, markup-like characters and memo exactly',async()=>{
 const transaction={date:'2026-10-14',description:'Smith & Sons <Office>',amount:'-1.01',id:'001',memo:'Fee & adjustment'};
 const {wire}=await writeWebConnectQBO([transaction],profile,opts);
 assert.match(wire,/<NAME>Smith &amp; Sons &lt;Office&gt;/);
 const parsed=parseInput(wire,'qbo').transactions[0];
 assert.equal(parsed.description,transaction.description);
 assert.equal(parsed.memo,transaction.memo);
});
test('unknown or invalid issuer profile cannot silently reuse competitor bank identity',async()=>{
 await assert.rejects(writeWebConnectQBO(source,null,opts),/bank-specific/);
 await assert.rejects(writeWebConnectQBO(source,{...profile,intuBid:'abc'},opts),/bank-specific/);
 assert.throws(()=>readReferenceQBO(reference.replace(/<INTU\.BID>[^\r\n<]+/,'<INTU.BID>')),/INTU\.BID/);
});
test('financial ambiguity, Unicode truncation and non-USD source are rejected',async()=>{
 await assert.rejects(writeWebConnectQBO([{...source[0],amount:'0.00'}],profile,opts),/zero-amount/);
 await assert.rejects(writeWebConnectQBO([source[0],source[0]],profile,opts),/duplicate/);
 await assert.rejects(writeWebConnectQBO([{...source[0],description:'Café'}],profile,opts),/ASCII/);
 assert.throws(()=>parseInput('Date,Description,Amount,Currency\n10/14/2026,Sample,-1.00,EUR\n','csv'),/Only USD/);
});
