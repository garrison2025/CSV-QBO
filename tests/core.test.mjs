import test from 'node:test';
import assert from 'node:assert/strict';
import {toMinorUnits,fromMinorUnits,isoDate,parseCSV,toCSV,guessMapping,csvTransactions,parseQIF,parseOFX,decodeFinancialBytes,parseIIF,parseInput,toQIF,toQuickBooksCSV,quickBooksCSVParts,quickBooksCSVExportPlan,auditTransactions,totals} from '../src/core.mjs';
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
test('IIF only exports a checked, balanced TRNS summary',()=>{
 const text='!TRNS\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tMEMO\tDOCNUM\n'+
   '!SPL\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tMEMO\tDOCNUM\n'+
   'TRNS\tCHECK\t11/04/2026\tCash\t-50.00\tRent\t100\n'+
   'SPL\tCHECK\t11/04/2026\tRent expense\t50.00\tRent\t100\nENDTRNS\n';
 const r=parseIIF(text);
 assert.equal(r.transactions.length,1);
 assert.equal(r.transactions[0].amount,'-50.00');
 assert.deepEqual(r.integrity,{check:'iif_trns_split_balance',status:'passed',balancedGroups:1,splitRows:1,ignoredRows:0});
 assert.match(r.warnings.join(' '),/not SPL allocations/);
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


// V0.7 fail-closed financial parser regression tests.
test('money parser never silently collapses internal spaces or misplaced currency symbols',()=>{
 assert.equal(toMinorUnits(' 1,234.50 '),123450n);
 assert.equal(toMinorUnits('($1,234.50)'),-123450n);
 assert.equal(toMinorUnits('-$10.01'),-1001n);
 for(const bad of ['1 2.34','12 .34','1 234.56','$1 $2','1$2','1\t2','12.3 4']) {
   assert.throws(()=>toMinorUnits(bad),/Invalid amount/);
 }
});
test('compact OFX dates preserve posted calendar day but validate time and suffix',()=>{
 assert.equal(isoDate('20261104'),'2026-11-04');
 assert.equal(isoDate('20261104123456[-5:EST]'),'2026-11-04');
 assert.equal(isoDate('20261104123456.000[0:GMT]'),'2026-11-04');
 assert.equal(isoDate('202611041234'),'2026-11-04');
 for(const bad of ['20261104250000','20261104126000','20261104125961','20261104120000garbage','202611041BAD','20261104123456[bogus]','20261104120000[-5:EST]junk']) {
   assert.throws(()=>isoDate(bad));
 }
});
test('OFX does not export truncated or nested STMTTRN records',()=>{
 const entry='<STMTTRN><DTPOSTED>20261104<TRNAMT>-5.00<FITID>ABC<NAME>Valid';
 assert.throws(()=>parseOFX('<OFX>'+entry+'</OFX>'),/Incomplete STMTTRN/);
 assert.throws(()=>parseOFX('<OFX>'+entry+'<STMTTRN><DTPOSTED>20261105<TRNAMT>1.00<NAME>Nested</STMTTRN></STMTTRN></OFX>'),/Nested or unclosed/);
 assert.throws(()=>parseOFX('<OFX></STMTTRN>'+entry+'</STMTTRN></OFX>'),/Unexpected closing/);
 assert.equal(parseOFX('<OFX>'+entry+'</STMTTRN></OFX>').transactions.length,1);
});
test('OFX refuses missing payee descriptions rather than inventing transaction names',()=>{
 const missing='<STMTTRN><DTPOSTED>20261104<TRNAMT>9.00<FITID>X1</STMTTRN>';
 assert.throws(()=>parseOFX('<BANKTRANLIST>'+missing+'</BANKTRANLIST>'),/NAME and MEMO are both empty/);
});
test('QIF writer preserves transaction reference N and memo M separately',()=>{
 const source=[{date:'2026-11-04',amount:'-12.50',description:'Sample',id:'REF-123',memo:'Paid locally'}];
 const wire=toQIF(source);
 assert.match(wire,/\r\nNREF-123\r\n/);
 const back=parseQIF(wire);
 assert.equal(back.transactions[0].id,'REF-123');
 assert.equal(back.transactions[0].memo,'Paid locally');
});
test('QIF blocks non-bank, mixed-account and missing type files',()=>{
 assert.throws(()=>parseQIF('D11/04/2026\nT-5\nPTest\n^\n'),/missing a supported/);
 assert.throws(()=>parseQIF('!Type:Cat\nNFood\n^\n'),/Unsupported QIF section type/);
 assert.throws(()=>parseQIF('!Account\nNPrivate Bank\n^\n!Type:Bank\nD11/04/2026\nT12\nPTest\n^\n'),/account-list sections/);
 assert.throws(()=>parseQIF('!Type:Bank\nD11/04/2026\nT12\nPTest\n^\n!Type:CCard\nD11/05/2026\nT-1\nPCard\n^\n'),/Multiple QIF/);
});
test('QIF read-only export records loss of category allocations',()=>{
 const bank='!Type:Bank\nD11/04/2026\nT-5\nPLunch\nLMeals\n^\n';
 assert.match(parseQIF(bank).warnings.join(' '),/category\/split/);
 const card='!Type:CCard\nD11/04/2026\nT-5\nPCard\n^\n';
 assert.equal(parseQIF(card).transactions[0].amount,'-5.00');
});


test('IIF rejects incomplete TRNS groups and orphan SPL or ENDTRNS lines',()=>{
 const h='!TRNS\tDATE\tAMOUNT\tMEMO\n!SPL\tDATE\tAMOUNT\tMEMO\n';
 const trns='TRNS\t11/04/2026\t-19.95\tPayment\n';
 const spl='SPL\t11/04/2026\t19.95\tExpense\n';
 assert.throws(()=>parseIIF(h+trns+spl),/missing ENDTRNS/);
 assert.throws(()=>parseIIF(h+trns+'ENDTRNS\n'),/no SPL entries/);
 assert.throws(()=>parseIIF(h+spl),/orphan SPL/);
 assert.throws(()=>parseIIF(h+'ENDTRNS\n'),/ENDTRNS without TRNS/);
 assert.throws(()=>parseIIF(h+trns+trns+spl+'ENDTRNS\n'),/previous TRNS is missing ENDTRNS/);
});
test('IIF rejects unbalanced TRNS/SPL groups and keeps output all-or-nothing',()=>{
 const h='!TRNS\tDATE\tAMOUNT\tMEMO\n!SPL\tDATE\tAMOUNT\tMEMO\n';
 const good='TRNS\t11/04/2026\t-5.00\tGood\nSPL\t11/04/2026\t5.00\tGood\nENDTRNS\n';
 const bad='TRNS\t11/05/2026\t-9.00\tBad\nSPL\t11/05/2026\t8.99\tBad\nENDTRNS\n';
 assert.throws(()=>parseIIF(h+good+bad),/do not balance to zero/);
});
test('IIF balance checks sum multiple SPL legs using exact cents',()=>{
 const h='!TRNS\tDATE\tAMOUNT\tMEMO\n!SPL\tDATE\tAMOUNT\tMEMO\n';
 const x=h+'TRNS\t11/04/2026\t-12.37\tSupplier\n'+
  'SPL\t11/04/2026\t10.11\tExpense\nSPL\t11/04/2026\t2.26\tTax\nENDTRNS\n';
 const p=parseIIF(x);
 assert.equal(p.transactions.length,1);
 assert.equal(p.integrity.balancedGroups,1);
 assert.equal(p.integrity.splitRows,2);
 assert.equal(p.transactions[0].amount,'-12.37');
});
test('IIF validates headers, amounts, dates and account data without returning partial rows',()=>{
 const h='!TRNS\tDATE\tAMOUNT\tMEMO\n!SPL\tDATE\tAMOUNT\tMEMO\n';
 assert.throws(()=>parseIIF('TRNS\t11/04/2026\t-4.00\tTest'),/missing a !TRNS header/);
 assert.throws(()=>parseIIF('!TRNS\tDATE\tMEMO\n'),/missing AMOUNT\/AMT column/);
 assert.throws(()=>parseIIF('!TRNS\tDATE\tAMOUNT\tDATE\n'),/duplicate column names/);
 assert.throws(()=>parseIIF(h+'TRNS\t11/04/2026\tbad\tTest\n'),/Invalid amount/);
 assert.throws(()=>parseIIF(h+'TRNS\t2026-02-30\t-4.00\tTest\n'),/Invalid calendar date/);
 assert.throws(()=>parseIIF(h+'TRNS\t11/04/2026\t-4.00\tTest\nSPL\t11/04/2026\twrong\tExpense\n'),/Invalid amount/);
});
test('IIF warns that unrelated list rows are not included in accounting exports',()=>{
 const h='!ACCNT\tNAME\tTYPE\nACCNT\tSynthetic account\tBANK\n'+
  '!TRNS\tDATE\tAMOUNT\tMEMO\n!SPL\tDATE\tAMOUNT\tMEMO\n';
 const p=parseIIF(h+'TRNS\t11/04/2026\t-12.50\tTesting\nSPL\t11/04/2026\t12.50\tTesting\nENDTRNS\n');
 assert.equal(p.integrity.ignoredRows,2);
 assert.match(p.warnings.join(' '),/non-transaction IIF row/);
});


test('QuickBooks preflight re-parses 1001 export rows, checks file bounds and reconciles cents',()=>{
 const tx=Array.from({length:1001},(_,i)=>({date:'2026-11-04',description:'Shop '+i,amount:i%2?'-0.25':'1.01',id:'REF-'+i}));
 const {parts,report}=quickBooksCSVExportPlan(tx);
 assert.equal(parts.length,2);
 assert.equal(report.partCount,2);
 assert.deepEqual(report.parts.map(p=>p.rows),[1000,1]);
 assert.equal(report.sourceRows,1001);
 assert.equal(report.generatedCSVReparsed,true);
 assert.equal(report.totalsReconciled,true);
 assert.equal(report.quickBooksImportTested,false);
 assert.equal(report.isQBOWebConnect,false);
 assert.equal(report.containsTransactionDescriptions,false);
 assert.equal(report.containsTransactionReferences,false);
 assert.equal(report.sourceFileNamesIncluded,false);
 const all=parts.flatMap(x=>parseCSV(x).slice(1));
 assert.equal(all.length,tx.length);
 assert.equal(all.filter(x=>x[2]==='-0.25').length,500);
 assert.equal(report.parts.reduce((sum,x)=>sum+x.rows,0),1001);
 for(let i=0;i<parts.length;i++){
  assert.equal(report.parts[i].bytes,new TextEncoder().encode(parts[i]).length);
  assert.ok(report.parts[i].bytes<=350000);
  assert.ok(report.parts[i].rows<=1000);
 }
 const summary=totals(tx);
 assert.deepEqual(report.sourceTotals,summary);
 const info=JSON.stringify(report);
 assert.ok(!info.includes('REF-'));
 assert.ok(!info.includes('Shop '));
});
test('QuickBooks preflight is byte-exact for UTF-8 emoji, multiline CSV and formula-like descriptions',()=>{
 const tx=[
  {date:'2026-11-04',description:'="Private" 😀, \nTwo lines',amount:'-5.10',id:'SECRET-ID'},
  {date:'2026-11-05',description:'Refund café',amount:'15.15',id:'OTHER-ID'},
  {date:'2026-11-05',description:'-not-a-number',amount:'0.01'}
 ];
 const {parts,report}=quickBooksCSVExportPlan(tx,{maxRows:2,maxBytes:350});
 assert.equal(parts.length,2);
 assert.equal(report.sourceRows,3);
 assert.equal(report.sourceTotals.net,'10.06');
 assert.equal(report.csvEscapedDescriptionCount,2);
 assert.ok(report.warnings.some(x=>x.includes('apostrophe')));
 assert.equal(parseCSV(parts[0])[1][1].startsWith("'="),true);
 assert.equal(parseCSV(parts[1])[1][1].startsWith("'-"),true);
 assert.equal(report.parts[0].dateRange.first,'2026-11-04');
 assert.equal(report.parts[1].dateRange.first,'2026-11-05');
 const reportOnly=JSON.stringify(report);
 assert.ok(!reportOnly.includes('SECRET-ID'));
 assert.ok(!reportOnly.includes('Two lines'));
 assert.ok(!reportOnly.includes('Refund café'));
});
test('QuickBooks preflight never discards duplicate rows or silently modifies total',()=>{
 const tx=[{date:'2026-11-04',description:'Repeat',amount:'-3.33',id:'FIT-1'},
 {date:'2026-11-04',description:'Repeat',amount:'-3.33',id:'FIT-1'}];
 const r=quickBooksCSVExportPlan(tx);
 assert.equal(r.report.sourceRows,2);
 assert.equal(parseCSV(r.parts[0]).length,3);
 assert.equal(r.report.duplicateReferenceCount,1);
 assert.equal(r.report.possibleDuplicateCount,1);
 assert.equal(r.report.sourceTotals.net,'-6.66');
 assert.ok(r.report.warnings.some(w=>w.includes('duplicates')));
});
test('QuickBooks preflight rejects oversize rows and invalid user transactions before ZIP',()=>{
 const tooBig=[{date:'2026-11-04',description:'A'.repeat(350100),amount:'1.00'}];
 assert.throws(()=>quickBooksCSVExportPlan(tooBig),/too large/);
 assert.throws(()=>quickBooksCSVExportPlan([{date:'2026-11-04',description:'',amount:'1.00'}]),/Description is required/);
 assert.throws(()=>quickBooksCSVExportPlan([{date:'2026-11-04',description:'Pay',amount:'1.234'}]),/Invalid amount/);
});


test('OFX SGML and XML reader handles explicit leaf XML tags and multiline text',()=>{
 const xml='<?xml version="1.0" encoding="UTF-8"?><OFX><CURDEF>USD</CURDEF><BANKTRANLIST>'+
  '<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261104120000[-5:EST]</DTPOSTED><TRNAMT>-5.25</TRNAMT><FITID>R1</FITID><NAME><![CDATA[Café & Bakery]]></NAME><MEMO>First&#10;line</MEMO></STMTTRN>'+
  '<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261105</DTPOSTED><TRNAMT>12.00</TRNAMT><FITID>R2</FITID><NAME>Refund &#xE9;lite</NAME></STMTTRN></BANKTRANLIST></OFX>';
 const result=parseOFX(xml);
 assert.equal(result.transactions.length,2);
 assert.equal(result.transactions[0].description,'Café & Bakery');
 assert.equal(result.transactions[0].memo,'First\nline');
 assert.equal(result.transactions[1].description,'Refund élite');
 assert.equal(result.integrity.recordCount,2);
 assert.equal(result.integrity.declaredCurrency,'USD');
});
test('OFX signed TRNAMT is authoritative regardless of TRNTYPE label',()=>{
 const credit='<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261104<TRNAMT>-2.50<FITID>R1<NAME>Correction</STMTTRN>';
 const r=parseOFX('<OFX><CURDEF>USD'+credit+'</OFX>');
 assert.equal(r.transactions[0].amount,'-2.50');
 assert.equal(r.integrity.missingTypeCount,0);
});
test('OFX blocks duplicate monetary fields, conflicting XML endings and incomplete CDATA',()=>{
 const line='<STMTTRN><DTPOSTED>20261104<TRNAMT>1.00<FITID>R1<NAME>Test</STMTTRN>';
 const twice=line.replace('<FITID>','<TRNAMT>4.00<FITID>');
 assert.throws(()=>parseOFX(twice),/Duplicate OFX TRNAMT/);
 const mismatch=line.replace('<NAME>Test','<NAME>Test</MEMO>');
 assert.throws(()=>parseOFX(mismatch),/Malformed OFX NAME closing tag/);
 assert.throws(()=>parseOFX(line.replace('<NAME>Test','<NAME><![CDATA[Open')),/Unclosed OFX CDATA/);
});
test('OFX refuses unsuccessful bank status rather than reading stale embedded records',()=>{
 const header='<STATUS><CODE>15500<SEVERITY>ERROR</STATUS>';
 const t='<STMTTRN><DTPOSTED>20261104<TRNAMT>2.00<FITID>A<NAME>Test</STMTTRN>';
 assert.throws(()=>parseOFX('<OFX>'+header+t+'</OFX>'),/unsuccessful status/);
 assert.equal(parseOFX('<OFX><STATUS><CODE>0<SEVERITY>INFO</STATUS>'+t+'</OFX>').transactions.length,1);
});
test('OFX comments do not generate ghost transactions or transaction status',()=>{
 const ghost='<!-- <STATUS><CODE>15500<SEVERITY>ERROR</STATUS><STMTTRN><DTPOSTED>20261104<TRNAMT>9.00<NAME>Ghost</STMTTRN> -->';
 const real='<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261104<TRNAMT>-5.00<FITID>A<NAME>Real</STMTTRN>';
 const r=parseOFX('<OFX>'+ghost+real+'</OFX>');
 assert.equal(r.transactions.length,1);
 assert.equal(r.transactions[0].description,'Real');
 assert.throws(()=>parseOFX('<OFX><!-- invalid '+real+'</OFX>'),/Malformed OFX comment/);
});
test('missing FITID and TRNTYPE are disclosed as warnings without inventing identifiers',()=>{
 const t='<STMTTRN><DTPOSTED>20261104<TRNAMT>-1.00<NAME>Unsupported bank variant</STMTTRN>';
 const r=parseOFX(t);
 assert.equal(r.transactions[0].id,'');
 assert.equal(r.integrity.missingReferenceCount,1);
 assert.equal(r.integrity.missingTypeCount,1);
 assert.match(r.warnings.join(' '),/no FITID/);
 assert.match(r.warnings.join(' '),/no TRNTYPE/);
});
test('OFX Windows-1252 bank header decodes accented descriptions without corruption',()=>{
 const header='OFXHEADER:100\r\nDATA:OFXSGML\r\nVERSION:102\r\nENCODING:USASCII\r\nCHARSET:1252\r\n\r\n';
 const first=header+'<OFX><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261104<TRNAMT>-4.00<FITID>1<NAME>Caf';
 const tail='</STMTTRN></OFX>';
 const bytes=new Uint8Array([...new TextEncoder().encode(first),0xe9,...new TextEncoder().encode(tail)]);
 const result=decodeFinancialBytes(bytes,'ofx');
 assert.equal(result.encoding,'windows-1252');
 assert.equal(parseOFX(result.text).transactions[0].description,'Café');
 assert.throws(()=>decodeFinancialBytes(bytes,'csv'),/Cannot decode utf-8/);
});
test('OFX encoding fails closed on unsupported declared charsets and damaged UTF-8',()=>{
 const utf8=new TextEncoder();
 assert.throws(()=>decodeFinancialBytes(utf8.encode('OFXHEADER:100\r\nCHARSET:936\r\n\r\n<OFX></OFX>'),'qfx'),/Unsupported OFX character set/);
 assert.throws(()=>decodeFinancialBytes(new Uint8Array([0xc3,0x28]),'ofx'),/Cannot decode utf-8/);
 assert.throws(()=>decodeFinancialBytes(utf8.encode('bad\u0000header'),'ofx'),/null byte/);
});
test('UTF-16 BOM bank exports decode locally without changing transaction amounts',()=>{
 const data='<OFX><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261104<TRNAMT>15.05<FITID>U1<NAME>Unicode café</STMTTRN></OFX>';
 const buf=Buffer.from(data,'utf16le');
 const bytes=Buffer.concat([Buffer.from([0xff,0xfe]),buf]);
 const decoded=decodeFinancialBytes(bytes,'ofx');
 assert.equal(decoded.encoding,'utf-16le');
 assert.equal(parseOFX(decoded.text).transactions[0].amount,'15.05');
});


test('OFX BANKTRANLIST reads inclusive start and exclusive end dates as retrieval metadata',()=>{
 const input='<OFX><CURDEF>USD<BANKTRANLIST><DTSTART>20261104000000<DTEND>20261106000000'+
 '<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261105<TRNAMT>-15.75<FITID>R-A<NAME>Purchase</STMTTRN>'+
 '<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261105<TRNAMT>20.00<FITID>R-B<NAME>Return</STMTTRN>'+
 '</BANKTRANLIST></OFX>';
 const data=parseOFX(input);
 assert.equal(data.transactions.length,2);
 assert.deepEqual(data.integrity.statementRange,{startInclusive:'2026-11-04',endExclusive:'2026-11-06'});
 assert.equal(data.integrity.postedBeforeRangeCount,0);
 assert.equal(data.integrity.postedAfterRangeCount,0);
 assert.equal(totals(data.transactions).net,'4.25');
});
test('OFX warns about posted dates outside bank system-add retrieval window without dropping entries',()=>{
 const input='<OFX><BANKTRANLIST><DTSTART>20261104000000<DTEND>20261106000000'+
 '<STMTTRN><DTPOSTED>20261031<TRNAMT>-1.01<FITID>R1<NAME>Delayed post</STMTTRN>'+
 '<STMTTRN><DTPOSTED>20261108<TRNAMT>10.03<FITID>R2<NAME>Future posted</STMTTRN>'+
 '<STMTTRN><DTPOSTED>20261106<TRNAMT>-2.00<FITID>R3<NAME>End-date transaction</STMTTRN>'+
 '</BANKTRANLIST></OFX>';
 const data=parseOFX(input);
 assert.equal(data.transactions.length,3);
 assert.equal(data.integrity.postedBeforeRangeCount,1);
 assert.equal(data.integrity.postedAfterRangeCount,1);
 assert.ok(data.warnings.some(w=>w.includes('can be legitimate')));
 assert.equal(totals(data.transactions).net,'7.02');
});
test('OFX refuses duplicated, unterminated or conflicting BANKTRANLIST ranges',()=>{
 const tx='<STMTTRN><DTPOSTED>20261105<TRNAMT>1.00<FITID>R1<NAME>Test</STMTTRN>';
 assert.throws(()=>parseOFX('<OFX><BANKTRANLIST>'+tx+'</OFX>'),/Multiple or incomplete BANKTRANLIST/);
 assert.throws(()=>parseOFX('<OFX><BANKTRANLIST>'+tx+'</BANKTRANLIST><BANKTRANLIST>'+tx+'</BANKTRANLIST></OFX>'),/Multiple or incomplete BANKTRANLIST/);
 assert.throws(()=>parseOFX('<OFX><BANKTRANLIST><DTSTART>20261107<DTEND>20261101'+tx+'</BANKTRANLIST></OFX>'),/DTSTART is after DTEND/);
 assert.throws(()=>parseOFX('<OFX><BANKTRANLIST><DTSTART>not-a-date'+tx+'</BANKTRANLIST></OFX>'),/Unsupported date/);
});
test('OFX refuses transactions outside a declared BANKTRANLIST aggregate',()=>{
 const tx='<STMTTRN><DTPOSTED>20261105<TRNAMT>1.00<FITID>R1<NAME>Test</STMTTRN>';
 const withStray='<OFX><BANKTRANLIST><DTSTART>20261104<DTEND>20261106'+tx+'</BANKTRANLIST>'+tx+'</OFX>';
 assert.throws(()=>parseOFX(withStray),/outside the declared BANKTRANLIST/);
});
test('OFX incomplete bank retrieval metadata is disclosed, never fabricated',()=>{
 const tx='<STMTTRN><DTPOSTED>20261105<TRNAMT>1.00<FITID>R1<NAME>Test</STMTTRN>';
 const data=parseOFX('<BANKTRANLIST><DTSTART>20261104'+tx+'</BANKTRANLIST>');
 assert.equal(data.transactions.length,1);
 assert.deepEqual(data.integrity.statementRange,{startInclusive:'2026-11-04',endExclusive:null});
 assert.ok(data.warnings.some(x=>x.includes('incomplete DTSTART/DTEND')));
});


test('QIF never silently overwrites repeated date, amount, payee or reference fields',()=>{
 const base='!Type:Bank\n';
 const parts=['D11/04/2026','T-5.00','PBookstore','NREF-1'];
 for(const [key,duplicated] of [['D','D11/05/2026'],['T','T9999.00'],['P','POther payee'],['N','NREF-2']]){
  const input=base+parts.join('\n')+'\n'+duplicated+'\n^\n';
  assert.throws(()=>parseQIF(input),new RegExp('duplicate '+key+' field'));
 }
});
test('QIF redundant U amount must match T exactly in integer cents',()=>{
 const valid='!Type:Bank\nD11/04/2026\nT-5.55\nU-5.55\nPPayment\n^\n';
 const out=parseQIF(valid);
 assert.equal(out.transactions.length,1);
 assert.equal(out.transactions[0].amount,'-5.55');
 assert.equal(out.integrity.consistentRedundantAmounts,1);
 assert.ok(out.warnings.some(w=>w.includes('redundant U')));
 for(const bad of ['U-5.54','U100.00','U-5.55\nU-5.55']){
  const input='!Type:Bank\nD11/04/2026\nT-5.55\n'+bad+'\nPPayment\n^\n';
  assert.throws(()=>parseQIF(input),/amount fields disagree|duplicate U field/);
 }
});
test('QIF reports discarded cleared-state, address and category/split metadata without account claims',()=>{
 const qif='!Type:Bank\nD11/04/2026\nT-2.00\nPCoffee\nC*\nFflag\nAAddress\nLFood\nSCategory\nEPart\n$-2.00\n^\n';
 const p=parseQIF(qif);
 assert.equal(p.transactions.length,1);
 assert.equal(p.integrity.ignoredMetadataFields,3);
 assert.equal(p.integrity.ignoredCategorySplitFields,4);
 assert.ok(p.warnings.some(w=>w.includes('cleared-state')));
 assert.ok(p.warnings.some(w=>w.includes('category/split')));
});
test('QIF unknown record codes, metadata-only groups and repeated sections fail closed',()=>{
 assert.throws(()=>parseQIF('!Type:Bank\nD11/04/2026\nT1.00\nPShop\nZunknown\n^\n'),/Unsupported QIF field/);
 assert.throws(()=>parseQIF('!Type:Bank\nC*\n^\n'),/metadata but no D\/T/);
 assert.throws(()=>parseQIF('!Type:Bank\nD11\/04\/2026\nT1.00\nPShop\n^\n!Type:Bank\nD11\/05\/2026\nT2.00\nPOther\n^\n'),/Repeated QIF transaction type header/);
 assert.throws(()=>parseQIF('!Type:Bank\nD11/04/2026\nT1.00\nPShop\n^\nC*'),/lacks terminating/);
});
test('QIF missing payee and memo fails rather than exporting blank merchant fields',()=>{
 assert.throws(()=>parseQIF('!Type:Bank\nD11/04/2026\nT2.00\n^\n'),/no payee or memo/);
});
