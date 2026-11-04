import test from 'node:test';
import assert from 'node:assert/strict';
import {toMinorUnits,fromMinorUnits,isoDate,parseCSV,toCSV,guessMapping,csvTransactions,parseQIF,parseOFX,parseIIF,parseInput,toQIF,toQuickBooksCSV,totals} from '../src/core.mjs';
import {toXLSX} from '../src/xlsx.mjs';

test('strict cents and signed amounts',()=>{
 assert.equal(toMinorUnits('1,234.56'),123456n);
 assert.equal(toMinorUnits('(15.28)'),-1528n);
 assert.equal(toMinorUnits('-$10.01'),-1001n);
 assert.equal(fromMinorUnits(-1n),'-0.01');
 assert.equal(toMinorUnits('-0.00'),0n);
 for(const bad of ['12.345','1,23','hello','', '1e8','1,2.50'])assert.throws(()=>toMinorUnits(bad));
});
test('date strictness and US/EU selection',()=>{
 assert.equal(isoDate('2024-02-29'),'2024-02-29');
 assert.equal(isoDate('03/04/2026','us'),'2026-03-04');
 assert.equal(isoDate('03/04/2026','eu'),'2026-04-03');
 for(const bad of ['02/29/2025','2026-13-01','2026-01-32','12/02/26',''])assert.throws(()=>isoDate(bad));
});
test('CSV quoted multi-line parsing, formula escaping and header guesses',()=>{
 const csv='Date,Description,Amount\r\n11/04/2026,"Coffee, \""special\""",-3.50\r\n11/05/2026,"two\nlines",10.00\r\n';
 const rows=parseCSV(csv);assert.equal(rows[1][1],'Coffee, "special"');assert.equal(rows[2][1],'two\nlines');
 const result=csvTransactions(rows);assert.equal(result.transactions.length,2);
 assert.equal(totals(result.transactions).net,'6.50');
 assert.match(toCSV([{date:'2026-11-04',description:'=1+1',amount:'1.00',id:''}]),/\'=1\+1/);
 assert.equal(guessMapping(['Posted Date','Payee','Debit','Credit']).date,0);
});
test('separate debit credit columns and fail unknown header',()=>{
 const r=csvTransactions(parseCSV('Date,Payee,Debit,Credit\n11/01/2026,A,7.20,\n11/02/2026,B,,8.99\n'));
 assert.deepEqual(r.transactions.map(x=>x.amount),['-7.20','8.99']);
 assert.throws(()=>csvTransactions(parseCSV('A,B,C\nx,y,z\n')));
});
test('QIF parsing and QIF export roundtrip',()=>{
 const q='!Type:Bank\nD11/04/2026\nT-12.34\nPCafe\nMone drink\nNREF1\n^\nD11/05/2026\nT50\nPDeposit\n^\n';
 const r=parseQIF(q);assert.equal(r.transactions.length,2);assert.equal(r.transactions[0].amount,'-12.34');
 const back=parseQIF(toQIF(r.transactions));assert.deepEqual(back.transactions.map(x=>x.amount),['-12.34','50.00']);
 assert.throws(()=>parseQIF('!Type:Bank\nD11/04/2026\nT-12.34\n'));
});
test('OFX SGML and XML-style bank transactions',()=>{
 const body='<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261104120000<TRNAMT>-5.40<FITID>abc123<NAME>Food &amp; Cafe</STMTTRN>';
 const r=parseOFX('<OFX><BANKTRANLIST>'+body+'</BANKTRANLIST></OFX>');
 assert.equal(r.transactions[0].description,'Food & Cafe');assert.equal(r.transactions[0].amount,'-5.40');
 const xml='<STMTTRN><DTPOSTED>20261104</DTPOSTED><TRNAMT>100.20</TRNAMT><FITID>x</FITID><NAME>Salary</NAME></STMTTRN>';
 assert.equal(parseOFX(xml).transactions[0].amount,'100.20');
 assert.throws(()=>parseOFX('<!DOCTYPE a><OFX/>'));
});
test('IIF only TRNS summary, split warning',()=>{
 const r=parseIIF('!TRNS\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tMEMO\tDOCNUM\nTRNS\tCHECK\t11/04/2026\tCash\t-50.00\tRent\t100\nSPL\tCHECK\t11/04/2026\tExpense\t50.00\nENDTRNS\n');
 assert.equal(r.transactions.length,1);assert.equal(r.transactions[0].description,'Rent');assert.match(r.warnings[0],/SPL/);
});
test('real XLSX ZIP output and QuickBooks formatter CSV output',()=>{
 const records=[{date:'2026-11-04',description:'Refund',amount:'12.30',id:'X'}];
 const x=toXLSX(records);assert.equal(String.fromCharCode(...x.slice(0,2)),'PK');assert.ok(x.length>1000);
 assert.match(toQuickBooksCSV(records),/date,description,amount/);
 assert.throws(()=>toXLSX([]));
});
test('privacy-sensitive invalid input fails loudly',()=>{
 assert.throws(()=>parseInput('Date,Amount,Description\nBAD,1.00,test','csv'),/CSV row 2/);
 assert.throws(()=>parseInput('hello','pdf'),/Unsupported input/);
 assert.throws(()=>parseInput('x'.repeat(8*1024*1024+1),'qif'),/8 MB/);
});

// Property-style coverage: amounts and valid calendar days must remain stable across parser->export->parser.
for (let i=0;i<160;i++){
 const cents=BigInt((i*7919)%200001-100000);
 const amount=fromMinorUnits(cents);
 const date='2026-'+String(Math.floor(i/28)+1).padStart(2,'0')+'-'+String(i%28+1).padStart(2,'0');
 test('property round-trip QIF amount/date '+i,()=>{
   const original=[{date,amount,description:'Test row '+i,id:'T'+i}];
   const parsed=parseQIF(toQIF(original));
   assert.equal(parsed.transactions[0].amount,amount);
   assert.equal(parsed.transactions[0].date,date);
 });
}
for(let i=0;i<70;i++){
 const amount=fromMinorUnits(BigInt(i*3121-45000));
 test('property CSV parse '+i,()=>{
   const record=[{date:'2026-11-04',description:'Entry '+i+', quoted',amount,id:'REF'+i}];
   const output=toCSV(record);const read=csvTransactions(parseCSV(output));
   assert.equal(read.transactions[0].amount,amount);
   assert.equal(read.transactions[0].description,record[0].description);
 });
}
