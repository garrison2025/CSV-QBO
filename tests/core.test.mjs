import test from 'node:test';
import assert from 'node:assert/strict';
import {toMinorUnits,fromMinorUnits,isoDate,parseCSV,toCSV,guessMapping,csvTransactions,parseQIF,parseOFX,parseIIF,parseInput,toQIF,toQuickBooksCSV,quickBooksCSVParts,auditTransactions,totals} from '../src/core.mjs';
import {toXLSX,toZIP} from '../src/xlsx.mjs';

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
 assert.match(toQuickBooksCSV(records),/Date,Description,Amount\r\n11\/04\/2026,Refund,12.30/);
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

// Release gates for the QuickBooks Online CSV workflow.
test('QuickBooks CSV is 3-column format with US date, no QBO impersonation',()=>{
 const actual=toQuickBooksCSV([{date:'2026-11-04',description:'Opening balance',amount:'1234.56'}]);
 assert.equal(actual,'\uFEFFDate,Description,Amount\r\n11/04/2026,Opening balance,1234.56\r\n');
 assert.throws(()=>toQuickBooksCSV([{date:'2026-11-04',description:'',amount:'1.00'}]),/Description/);
 assert.throws(()=>toQuickBooksCSV([]),/No transactions/);
});
test('QuickBooks CSV auto-splits at 1000 transactions and does not drop rows',()=>{
 const data=Array.from({length:2301},(_,i)=>({date:'2026-11-04',description:'Entry '+i,amount:i%2?'-0.01':'0.02',id:'T'+i}));
 const parts=quickBooksCSVParts(data);
 assert.equal(parts.length,3);
 assert.deepEqual(parts.map(x=>parseCSV(x).length-1),[1000,1000,301]);
 assert.equal(parts.reduce((n,x)=>n+parseCSV(x).length-1,0),2301);
 for(const p of parts)assert.ok(new TextEncoder().encode(p).length<=350000);
});
test('QuickBooks CSV splits at byte limits including UTF-8, with BOM and headers',()=>{
 const data=Array.from({length:6},(_,i)=>({date:'2026-11-04',description:'上海 '+i+' 😊',amount:'5.00',id:'R'+i}));
 const parts=quickBooksCSVParts(data,{maxRows:1000,maxBytes:135});
 assert.ok(parts.length>1);
 assert.equal(parts.reduce((n,p)=>n+parseCSV(p).length-1,0),6);
 assert.ok(parts.every(p=>new TextEncoder().encode(p).length<=135));
 assert.throws(()=>quickBooksCSVParts([{date:'2026-11-04',description:'Long '.repeat(100),amount:'10.00'}],{maxBytes:140}),/too large/);
});
test('audit duplicate references and fingerprints without deleting rows',()=>{
 const tx=[{date:'2026-11-04',description:' Market  ',amount:'-1.25',id:'ABC'},{date:'2026-11-04',description:'market',amount:'-1.25',id:'ABC'},{date:'2026-11-05',description:'market',amount:'1.25',id:'XYZ'}];
 const audit=auditTransactions(tx);
 assert.equal(audit.summary.count,3);
 assert.equal(audit.duplicateIds.length,1);
 assert.equal(audit.possibleDuplicates.length,1);
 assert.equal(tx.length,3);
 assert.ok(audit.warnings.some(x=>x.includes('no rows were deleted')));
});
test('CSV debit and credit must not conflict in one row',()=>{
 assert.throws(()=>csvTransactions('Date,Description,Debit,Credit\n11/04/2026,Conflict,10.00,10.00'),/Both Debit and Credit/);
 assert.throws(()=>csvTransactions('Date,Description,Debit,Credit\n11/04/2026,Conflict,-10.00,0'),/cannot contain negative/);
 assert.throws(()=>csvTransactions('Date,Description,Amount\n11/04/2026,,10.00'),/Description is empty/);
});
test('ZIP archive handles real XLSX bytes and multiple CSV parts',()=>{
 const transactions=[{date:'2026-11-04',description:'Test',amount:'10.01',id:'A'}];
 const xlsx=toXLSX(transactions),csv=toQuickBooksCSV(transactions);
 const result=toZIP({'export.xlsx':xlsx,'quickbooks.csv':csv});
 assert.equal(String.fromCharCode(...result.slice(0,2)),'PK');
 assert.ok(result.length>xlsx.length);
 assert.throws(()=>toZIP({'../secret.csv':'malicious'}),/Unsafe/);
 assert.throws(()=>toZIP({}),/No output/);
});


test('ZIP writer handles a 350 KB standalone CSV without argument spread overflow',()=>{
 const content='header\r\n'+'A'.repeat(349000)+'\r\n';
 const archive=toZIP({'large.csv':content});
 assert.ok(archive.length>349000);
 assert.equal(String.fromCharCode(...archive.slice(0,2)),'PK');
});

test('OFX refuses to silently merge two distinct bank accounts',()=>{
  const bank=account=>'<STMTRS><BANKACCTFROM><ACCTID>'+account+'</ACCTID></BANKACCTFROM><BANKTRANLIST><STMTTRN><DTPOSTED>20261104</DTPOSTED><TRNAMT>10.00</TRNAMT><FITID>'+account+'</FITID><NAME>Test</NAME></STMTTRN></BANKTRANLIST></STMTRS>';
  const mixed='<OFX>'+bank('account1')+bank('account2')+'</OFX>';
  assert.throws(()=>parseOFX(mixed),/Multiple bank or card accounts/);
  assert.equal(parseOFX('<OFX>'+bank('account1')+'</OFX>').transactions.length,1);
});
test('OFX refuses investment feeds even if they contain bank-style records',()=>{
  const investment='<INVSTMTMSGSRSV1><INVSTMTRS><BANKTRANLIST><STMTTRN><DTPOSTED>20261104<TRNAMT>1.00</TRNAMT></STMTTRN></BANKTRANLIST></INVSTMTRS></INVSTMTMSGSRSV1>';
  assert.throws(()=>parseOFX(investment),/Investment OFX feeds/);
});
test('QIF investment type is rejected rather than silently flattened',()=>{
  const investment='!Type:Invst\nD11/04/2026\nT-50.00\nPBuy security\n^\n';
  assert.throws(()=>parseQIF(investment),/Investment QIF transactions/);
});
test('QIF day-first dates explicitly selected by user are parsed correctly',()=>{
  const bank='!Type:Bank\nD04/11/2026\nT10.00\nPDeposit\n^\n';
  assert.equal(parseQIF(bank,'us').transactions[0].date,'2026-04-11');
  assert.equal(parseQIF(bank,'eu').transactions[0].date,'2026-11-04');
});


test('CSV field parser rejects structural corruption rather than shifting amounts',()=>{
  assert.throws(()=>parseCSV('Date,Description,Amount\n11/04/2026,Coffee,-5.00,EXTRA\n'),/expected 3 columns, found 4/);
  assert.throws(()=>parseCSV('Date,Description,Amount\n11/04/2026,Coffee\n'),/expected 3 columns, found 2/);
  assert.throws(()=>parseCSV('Date,Description,Amount\n11/04/2026,"Unclosed,-5.00'),/Unclosed quote/);
  assert.throws(()=>parseCSV('Date,Description,Amount\n11/04/2026,"Coffee"EXTRA,-5.00'),/Unexpected text after CSV quote/);
  assert.throws(()=>parseCSV('Date,Description,Amount\n11/04/2026,Cof"fee,-5.00'),/Unexpected CSV quote/);
});
test('CSV delimiter detection respects quoted header separators and embedded newlines',()=>{
  const semi='Date;"Description, merchant";Amount\r\n11/04/2026;"Two; shops\nand more";-12.30\r\n';
  const rows=parseCSV(semi);
  assert.deepEqual(rows[0],['Date','Description, merchant','Amount']);
  assert.equal(rows[1][1],'Two; shops\nand more');
  assert.equal(rows[1][2],'-12.30');
  const quoted='Date,Description,Amount\n11/04/2026,"A ""quoted"" store",2.00\n';
  assert.equal(parseCSV(quoted)[1][1],'A "quoted" store');
});
test('CSV refuses conflicting or duplicate mapping choices',()=>{
  const three=['Date','Description','Amount','Debit','Credit'];
  const rows=[three,['11/04/2026','Transfer','-4.00','4.00','']];
  assert.throws(()=>csvTransactions(rows),/either the signed Amount column or the Debit and Credit columns/);
  const simple=[['Date','Description','Amount'],['11/04/2026','Lunch','-5.00']];
  assert.throws(()=>csvTransactions(simple,{amount:1}),/assigned to both description and amount/);
  assert.throws(()=>csvTransactions(simple,{amount:99}),/Invalid mapping/);
  assert.equal(csvTransactions(simple).transactions[0].amount,'-5.00');
});

test('CSV blocks null bytes without silently corrupting financial rows',()=>{
 assert.throws(()=>parseCSV('Date,Description,Amount\n11/04/2026,Cafe\u0000,-2.00'),/null bytes/);
});
test('Only explicit USD amount and OFX statement currencies are accepted',()=>{
 for(const n of ['€12.00','£12.00','¥12.00','₹12.00'])assert.throws(()=>toMinorUnits(n),/Non-USD/);
 const tx='<STMTTRN><DTPOSTED>20261104<TRNAMT>12.00<FITID>1<NAME>Test</STMTTRN>';
 const wrap=c=>'<OFX><CURDEF>'+c+'</CURDEF><BANKTRANLIST>'+tx+'</BANKTRANLIST></OFX>';
 assert.throws(()=>parseOFX(wrap('EUR')),/Only USD/);
 assert.equal(parseOFX(wrap('USD')).transactions[0].amount,'12.00');
 assert.ok(parseOFX('<OFX>'+tx+'</OFX>').warnings.some(w=>w.includes('currency')));
 assert.throws(()=>parseOFX('<OFX><CURRENCY><CURRATE>1.2</CURRENCY>'+tx+'</OFX>'),/currency conversion/);
});
test('XLSX refuses invalid XML control characters',()=>{
 assert.throws(()=>toXLSX([{date:'2026-11-04',description:'bad\u0001cell',amount:'1.00',id:'x'}]),/control character/);
});
