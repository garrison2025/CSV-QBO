import test from 'node:test';
import assert from 'node:assert/strict';
import {toMinorUnits,fromMinorUnits,isoDate,parseCSV,toCSV,guessMapping,csvTransactions,parseQIF,parseOFX,decodeFinancialBytes,parseIIF,parseInput,validateGenericCSVExport,genericCSVExportPlan,toQIF,toQuickBooksCSV,quickBooksCSVParts,quickBooksCSVExportPlan,validateQuickBooksCSVParts,auditTransactions,totals} from '../src/core.mjs';
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
 assert.throws(()=>parseOFX('<OFX><!-- invalid '+real+'</OFX>'),/Unclosed OFX XML comment/);
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


test('typed-array ZIP writer round-trips 10 MiB of bank CSV without boxed-array copies',()=>{
 const payload='Date,Description,Amount\r\n'+'A'.repeat(10*1024*1024);
 const archive=toZIP({'large-bank-export.csv':payload});
 assert.ok(archive instanceof Uint8Array);
 assert.ok(archive.byteLength>payload.length);
 const bytes=Buffer.from(archive);
 assert.equal(bytes.readUInt32LE(0),0x04034b50);
 assert.equal(bytes.readUInt16LE(8),0); // no compression
 const len=bytes.readUInt32LE(18),nameLen=bytes.readUInt16LE(26),extraLen=bytes.readUInt16LE(28);
 assert.equal(len,new TextEncoder().encode(payload).length);
 const start=30+nameLen+extraLen;
 assert.equal(bytes.subarray(start,start+len).toString('utf8'),payload);
 const end=bytes.byteLength-22;
 assert.equal(bytes.readUInt32LE(end),0x06054b50);
 assert.equal(bytes.readUInt16LE(end+10),1);
 assert.equal(bytes.readUInt32LE(end+16),start+len);
});
test('ZIP writer includes valid central file offsets and exact UTF-8 byte counts',()=>{
 const archive=Buffer.from(toZIP({'one.csv':'a,amount\ncafé,-0.01','two.csv':'name\n你好'}));
 let position=0;
 const names=[];
 while(archive.readUInt32LE(position)===0x04034b50){
  const size=archive.readUInt32LE(position+18),n=archive.readUInt16LE(position+26);
  const extra=archive.readUInt16LE(position+28);
  names.push(archive.subarray(position+30,position+30+n).toString('utf8'));
  position+=30+n+extra+size;
 }
 assert.deepEqual(names,['one.csv','two.csv']);
 const centralStart=position;
 for(let i=0;i<names.length;i++){
  assert.equal(archive.readUInt32LE(position),0x02014b50);
  const n=archive.readUInt16LE(position+28),extra=archive.readUInt16LE(position+30),comment=archive.readUInt16LE(position+32);
  const localOffset=archive.readUInt32LE(position+42);
  assert.equal(archive.readUInt32LE(localOffset),0x04034b50);
  position+=46+n+extra+comment;
 }
 assert.equal(archive.readUInt32LE(position),0x06054b50);
 assert.equal(archive.readUInt32LE(position+16),centralStart);
 assert.equal(archive.readUInt32LE(position+12),position-centralStart);
});


test('QuickBooks v2 preflight checks exact serialized row identity and order, not only totals',()=>{
 const tx=[
  {date:'2026-11-04',description:'Original bookstore',amount:'10.00',id:'SECRET-ONE'},
  {date:'2026-11-05',description:'Other bookstore',amount:'10.00',id:'SECRET-TWO'},
  {date:'2026-11-06',description:'Coffee',amount:'-5.00',id:'SECRET-THREE'}
 ];
 const {parts,report}=quickBooksCSVExportPlan(tx,{maxRows:2});
 assert.equal(parts.length,2);
 assert.equal(report.reportType,'Finance File Lab QuickBooks CSV preflight v2');
 assert.equal(report.orderedRowsReconciled,true);
 assert.equal(report.sourceDescriptionsReconciled,true);
 assert.equal(report.sourceAmountsReconciled,true);
 assert.deepEqual(report.parts.map(p=>p.sourceRowRange),[{first:1,last:2},{first:3,last:3}]);
 assert.ok(report.parts.every(p=>p.orderedRowsReconciled));
 assert.deepEqual(validateQuickBooksCSVParts(tx,parts,{maxRows:2}).parts,report.parts);
 const reportOnly=JSON.stringify(report);
 for(const value of ['Original bookstore','Other bookstore','Coffee','SECRET-ONE','SECRET-TWO','SECRET-THREE'])
  assert.ok(!reportOnly.includes(value),'privacy metadata leaked '+value);
 const changedDesc=parts.map(p=>p.replace('Original bookstore','Completely changed payee'));
 assert.throws(()=>validateQuickBooksCSVParts(tx,changedDesc,{maxRows:2}),/source-row mismatch in part 1, row 1/);
 const changedDate=parts.map(p=>p.replace('11\/04\/2026','11/05/2026'));
 assert.throws(()=>validateQuickBooksCSVParts(tx,changedDate,{maxRows:2}),/source-row mismatch/);
 const reordered=parts.slice();
 const lines=parseCSV(parts[0]);
 reordered[0]='\uFEFF'+lines.map(a=>a.join(',')).slice(0,1).concat(lines.slice(1).reverse().map(a=>a.join(','))).join('\r\n')+'\r\n';
 assert.throws(()=>validateQuickBooksCSVParts(tx,reordered,{maxRows:2}),/source-row mismatch/);
 assert.throws(()=>validateQuickBooksCSVParts(tx,[parts[1],parts[0]],{maxRows:2}),/source-row mismatch/);
});
test('QuickBooks validator rejects dropped/additional rows even if arithmetic totals cancel',()=>{
 const tx=[{date:'2026-11-04',description:'A',amount:'1.00'},
           {date:'2026-11-05',description:'B',amount:'-1.00'}];
 const {parts}=quickBooksCSVExportPlan(tx);
 const lines=parts[0].split('\r\n');
 assert.throws(()=>validateQuickBooksCSVParts(tx,[lines.slice(0,2).join('\r\n')+'\r\n']),/source and output totals or row counts differ/);
 const extra=parts[0]+lines[1]+'\r\n';
 assert.throws(()=>validateQuickBooksCSVParts(tx,[extra]),/more rows than the source/);
});
test('QuickBooks validator preserves formula-safe leading characters and UTF-8 multiline payees exactly',()=>{
 const tx=[{date:'2026-11-04',description:'  =SECRET(),"café"\n上海',amount:'-0.01',id:'PRIVATE-REF'},
           {date:'2026-11-05',description:'-not numeric',amount:'0.02',id:'PRIVATE-ID'}];
 const {parts,report}=quickBooksCSVExportPlan(tx,{maxRows:1});
 assert.equal(parts.length,2);
 assert.equal(report.csvEscapedDescriptionCount,2);
 assert.ok(parseCSV(parts[0])[1][1].startsWith("'  =SECRET"));
 assert.ok(parseCSV(parts[1])[1][1].startsWith("'-"));
 const tampered=parts.slice();
 tampered[0]=tampered[0].replace("'  =SECRET","  =SECRET");
 assert.throws(()=>validateQuickBooksCSVParts(tx,tampered,{maxRows:1}),/source-row mismatch/);
 assert.equal(report.parts[0].rows,1);
});
test('QuickBooks validator rejects unsupported part size, headers and missing export parts',()=>{
 const tx=[{date:'2026-11-04',description:'Valid',amount:'1.00'}];
 const {parts}=quickBooksCSVExportPlan(tx);
 assert.throws(()=>validateQuickBooksCSVParts(tx,[]),/one or more generated CSV parts/);
 assert.throws(()=>validateQuickBooksCSVParts(tx,['Date,Wrong,Amount\r\n11/04/2026,Valid,1.00\r\n']),/header does not match/);
 assert.throws(()=>validateQuickBooksCSVParts(tx,parts,{maxRows:0}),/Invalid QuickBooks CSV validation limits/);
 const longTx=[{date:'2026-11-04',description:'A'.repeat(80),amount:'1.00'}];
 assert.throws(()=>validateQuickBooksCSVParts(longTx,[toQuickBooksCSV(longTx)],{maxBytes:64}),/exceeded its row or byte limit/);
});


test('OFX XML CDATA with fake transaction tags is description data, never extra ledger rows',()=>{
 const tx='<?xml version="1.0"?><OFX><CURDEF>USD</CURDEF><BANKTRANLIST>'+
 '<DTSTART>20261104000000</DTSTART><DTEND>20261106000000</DTEND>'+
 '<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261104</DTPOSTED>'+
 '<TRNAMT>-12.50</TRNAMT><FITID>TX1</FITID>'+
 '<NAME><![CDATA[Bookstore <STMTTRN><TRNAMT>999.00</TRNAMT></STMTTRN> <!-- fake -->]]></NAME>'+
 '<MEMO><![CDATA[real <NAME>other</NAME> text]]></MEMO></STMTTRN></BANKTRANLIST></OFX>';
 const result=parseOFX(tx);
 assert.equal(result.transactions.length,1);
 assert.equal(result.integrity.recordCount,1);
 assert.equal(result.transactions[0].amount,'-12.50');
 assert.match(result.transactions[0].description,/<STMTTRN><TRNAMT>999.00/);
 assert.equal(result.transactions[0].memo,'real <NAME>other</NAME> text');
 assert.equal(result.integrity.postedAfterRangeCount,0);
});
test('OFX source XML comments cannot inject account counts, errors, other currencies or transactions',()=>{
 const file='<?xml version="1.0"?><OFX><CURDEF>USD</CURDEF>'+
 '<!-- <STATUS><CODE>2000</CODE><SEVERITY>ERROR</SEVERITY></STATUS>'+
 ' <STMTRS><STMTTRN><DTPOSTED>20261104</DTPOSTED><TRNAMT>1000.00</TRNAMT></STMTTRN></STMTRS>'+
 ' <CURDEF>EUR</CURDEF><INVSTMTRS/> -->'+
 '<STMTRS><BANKTRANLIST><STMTTRN><DTPOSTED>20261104</DTPOSTED>'+
 '<TRNAMT>1.25</TRNAMT><NAME>Valid payment</NAME></STMTTRN></BANKTRANLIST></STMTRS></OFX>';
 const result=parseOFX(file);
 assert.equal(result.transactions.length,1);
 assert.equal(result.transactions[0].amount,'1.25');
 assert.equal(result.integrity.declaredCurrency,'USD');
});
test('OFX rejects unclosed, unexpected and nested STATUS tags instead of ignoring bank errors',()=>{
 const base='<BANKTRANLIST><STMTTRN><DTPOSTED>20261104<TRNAMT>1.00<NAME>Test</STMTTRN></BANKTRANLIST>';
 assert.throws(()=>parseOFX('<OFX><STATUS><CODE>2000<SEVERITY>ERROR'+base+'</OFX>'),/Unclosed OFX bank STATUS/);
 assert.throws(()=>parseOFX('<OFX></STATUS>'+base+'</OFX>'),/Unexpected closing STATUS/);
 assert.throws(()=>parseOFX('<OFX><STATUS><STATUS><CODE>0</STATUS></STATUS>'+base+'</OFX>'),/Nested STATUS/);
 assert.throws(()=>parseOFX('<OFX><STATUS><SEVERITY>INFO</STATUS>'+base+'</OFX>'),/missing a required CODE/);
 assert.throws(()=>parseOFX('<OFX><STATUS><CODE>2000<SEVERITY>ERROR</STATUS>'+base+'</OFX>'),/unsuccessful status/);
});
test('OFX XML strict leaf closers reject incomplete transaction data',()=>{
 const head='<?xml version="1.0"?><OFX><BANKTRANLIST><STMTTRN>';
 const close='</STMTTRN></BANKTRANLIST></OFX>';
 const good='<DTPOSTED>20261104</DTPOSTED><TRNAMT>1.00</TRNAMT><NAME>Salary</NAME>';
 assert.equal(parseOFX(head+good+close).transactions.length,1);
 assert.throws(()=>parseOFX(head+'<DTPOSTED>20261104<TRNAMT>1.00</TRNAMT><NAME>Salary</NAME>'+close),/Missing XML closing tag for OFX DTPOSTED/);
 assert.throws(()=>parseOFX(head+'<DTPOSTED>20261104</DTPOSTED><TRNAMT>1.00<NAME>Salary</NAME>'+close),/Missing XML closing tag for OFX TRNAMT/);
 assert.throws(()=>parseOFX(head+'<DTPOSTED>20261104</DTPOSTED><TRNAMT>1.00</TRNAMT><NAME>Salary'+close),/Missing XML closing tag for OFX NAME/);
});
test('OFX XML CDATA requires a matching XML closing tag but SGML leaf CDATA is supported',()=>{
 const head='<?xml version="1.0"?><OFX><STMTTRN><DTPOSTED>20261104</DTPOSTED><TRNAMT>1.00</TRNAMT>';
 const close='</STMTTRN></OFX>';
 assert.throws(()=>parseOFX(head+'<NAME><![CDATA[Coffee]]>'+close),/Missing XML closing tag for OFX NAME/);
 assert.equal(parseOFX('<OFX><STMTTRN><DTPOSTED>20261104<TRNAMT>1.00<NAME><![CDATA[Coffee]]><FITID>ONE</STMTTRN></OFX>').transactions[0].description,'Coffee');
});
test('OFX malformed CDATA and comments reject source without exporting partial transactions',()=>{
 const tx='<STMTTRN><DTPOSTED>20261104<TRNAMT>1.00<NAME>Pay</STMTTRN>';
 assert.throws(()=>parseOFX('<OFX><!-- never ending '+tx),/Unclosed OFX XML comment/);
 assert.throws(()=>parseOFX('<OFX><![CDATA[never ending '+tx),/Unclosed OFX CDATA/);
 assert.throws(()=>parseOFX('<OFX>-->'+tx+'</OFX>'),/Malformed OFX comment terminator/);
 assert.throws(()=>parseOFX('<OFX>]]>'+tx+'</OFX>'),/Malformed OFX CDATA terminator/);
});
test('OFX CDATA content may contain literal script-looking text without executing tags',()=>{
 const xml='<?xml version="1.0"?><OFX><STMTTRN><DTPOSTED>20261104</DTPOSTED>'+
 '<TRNAMT>1.00</TRNAMT><NAME><![CDATA[Pay <script>alert(1)</script>]]></NAME></STMTTRN></OFX>';
 const data=parseOFX(xml);
 assert.equal(data.transactions.length,1);
 assert.equal(data.transactions[0].description,'Pay <script>alert(1)</script>');
});


test('QIF writer preserves literal carets, UTF-8 text, memo and reference without lossy replacement',()=>{
 const tx=[
  {date:'2026-11-04',description:'City ^ North café 😊',amount:'-12.34',id:'REF^A',memo:'Paid ^ Tuesday'},
  {date:'2026-11-05',description:'上海 coffee ^ tea',amount:'12345.67',id:'',memo:'Café ^ 🍵'}
 ];
 const snapshot=JSON.stringify(tx);
 const wire=toQIF(tx);
 assert.match(wire,/PCity \^ North café 😊\r\n/);
 assert.match(wire,/NREF\^A\r\n/);
 assert.match(wire,/MPaid \^ Tuesday\r\n/);
 assert.match(wire,/P上海 coffee \^ tea\r\n/);
 const reloaded=parseQIF(wire,'us');
 assert.deepEqual(reloaded.transactions.map(x=>({date:x.date,amount:x.amount,description:x.description,id:x.id,memo:x.memo})),tx);
 assert.equal(JSON.stringify(tx),snapshot,'source bank data must not be changed by export');
});
test('QIF writer refuses multiline or control-character field content instead of silently changing it',()=>{
 const original={date:'2026-11-04',description:'Bookstore',amount:'1.00',id:'A',memo:'Paid'};
 for(const [field,value] of [
  ['description','Shop\nBranch'],['description','Shop\rBranch'],
  ['description','Shop\r\nBranch'],['description','Shop\tBranch'],
  ['description','Shop\u0000Branch'],['description','Shop\u001fBranch'],
  ['id','CHECK\n123'],['memo','memo\r\nsecond line'],['memo','memo\u007fend']
 ]){
  const record={...original,[field]:value};
  assert.throws(()=>toQIF([record]),/QIF export row 1: .* contains a line break or control character/);
  assert.equal(record[field],value,'rejecting invalid wire text must not mutate original');
 }
});
test('QIF writer rejects empty merchant and invalid amount, without leaking payee or reference',()=>{
 assert.throws(()=>toQIF([]),/No transactions/);
 assert.throws(()=>toQIF([{date:'2026-11-04',description:' ',amount:'1.00'}]),/Description is empty/);
 assert.throws(()=>toQIF([{date:'2026-11-04',description:'Pay',amount:'1.234'}]),/QIF export row 1: Invalid amount/);
 assert.throws(()=>toQIF([{date:'invalid',description:'Pay',amount:'1.00'}]),/QIF export row 1:/);
 try{toQIF([{date:'2026-11-04',description:'Secret customer\naddress',amount:'1.00',id:'REF-PRIVATE'}]);}
 catch(error){
  assert.ok(!error.message.includes('Secret customer'));
  assert.ok(!error.message.includes('REF-PRIVATE'));
 }
});
test('QIF writer round-trips all 1200 ordered rows and exact cent totals',()=>{
 const tx=Array.from({length:1200},(_,i)=>({
  date:'2026-11-'+String(i%28+1).padStart(2,'0'),
  description:'Purchase '+i+' ^ café',
  amount:fromMinorUnits(BigInt((i*1777)%500000-200000)),
  id:'TX-'+i,
  memo:i%3===0?'Memo ^ '+i:''
 }));
 const qif=toQIF(tx);
 const checked=parseQIF(qif);
 assert.equal(checked.transactions.length,tx.length);
 assert.deepEqual(checked.transactions,tx.map(t=>({...t})));
 assert.deepEqual(totals(checked.transactions),totals(tx));
});


function readStoredXlsxParts(archive){
 const bytes=Buffer.from(archive),parts=new Map();
 let at=0;
 while(at+30<=bytes.length&&bytes.readUInt32LE(at)===0x04034b50){
  assert.equal(bytes.readUInt16LE(at+8),0,'XLSX ZIP entries must use stored encoding');
  const n=bytes.readUInt16LE(at+26),extra=bytes.readUInt16LE(at+28),size=bytes.readUInt32LE(at+18);
  const name=bytes.subarray(at+30,at+30+n).toString('utf8'),begin=at+30+n+extra;
  assert.ok(begin+size<=bytes.length,'XLSX part bytes must fit inside ZIP');
  parts.set(name,bytes.subarray(begin,begin+size).toString('utf8'));
  at=begin+size;
 }
 assert.ok(parts.has('xl/worksheets/sheet1.xml'));
 assert.ok(parts.has('xl/styles.xml'));
 return parts;
}
test('XLSX serializes real Excel dates and numeric cents with ISO date and 2-decimal formats',()=>{
 const tx=[
  {date:'2026-11-04',description:'Store',amount:'-12.34',id:'000123'},
  {date:'2026-11-05',description:'Refund',amount:'120.00',id:'ID 2'}
 ];
 const files=readStoredXlsxParts(toXLSX(tx));
 const sheet=files.get('xl/worksheets/sheet1.xml'),styles=files.get('xl/styles.xml');
 assert.match(sheet,/<c r="A2" s="2"><v>46330<\/v><\/c>/);
 assert.match(sheet,/<c r="A3" s="2"><v>46331<\/v><\/c>/);
 assert.match(sheet,/<c r="C2" s="1"><v>-12\.34<\/v><\/c>/);
 assert.match(sheet,/<c r="C3" s="1"><v>120\.00<\/v><\/c>/);
 assert.match(sheet,/<c r="D2" t="inlineStr"><is><t xml:space="preserve">000123<\/t><\/is><\/c>/);
 assert.match(styles,/numFmtId="164" formatCode="yyyy-mm-dd"/);
 assert.match(styles,/numFmtId="2" xfId="0" applyNumberFormat="1"/);
 assert.match(styles,/numFmtId="164" xfId="0" applyNumberFormat="1"/);
 assert.match(sheet,/<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
 assert.match(sheet,/<autoFilter ref="A1:D3"\/>/);
 assert.match(files.get('xl/workbook.xml'),/date1904="0"/);
 assert.ok(!sheet.includes('<f>'),'no transaction cell may become an Excel formula');
});
test('XLSX handles leap-year boundaries, 1900 date system and cent-extreme values',()=>{
 const tx=[
  {date:'1900-01-01',description:'First supported day',amount:'0.01',id:'0001'},
  {date:'1900-02-28',description:'Before Excel phantom leap day',amount:'-0.01',id:''},
  {date:'1900-03-01',description:'After Excel phantom leap day',amount:'9999999999999.99',id:'XL-003'},
  {date:'2000-02-29',description:'Actual leap day',amount:'-9999999999999.99',id:'A'},
  {date:'2100-12-31',description:'Last supported year',amount:'10.50',id:'Z'}
 ];
 const xml=readStoredXlsxParts(toXLSX(tx)).get('xl/worksheets/sheet1.xml');
 for(const [row,serial]of [[2,1],[3,59],[4,61],[5,36585],[6,73415]]){
  assert.ok(xml.includes('<c r="A'+row+'" s="2"><v>'+serial+'</v></c>'),'date serial '+row);
 }
 for(const [row,money]of [[2,'0.01'],[3,'-0.01'],[4,'9999999999999.99'],[5,'-9999999999999.99'],[6,'10.50']]){
  const cell='<c r="C'+row+'" s="1"><v>'+money+'</v></c>';
  assert.ok(xml.includes(cell),'amount numeric '+row);
  assert.equal(BigInt(Math.round(Number(money)*100)),toMinorUnits(money),'Excel number rounds back to exact cents');
 }
});
test('XLSX fails closed on bad dates, amounts, unsafe XML and overlong text without leaking financial data',()=>{
 const source={date:'2026-11-04',description:'Confidential shop',amount:'1.00',id:'Private-REF'};
 const bad=[
  [{...source,date:'not a date'},/invalid transaction date/],
  [{...source,date:'1900-02-29'},/invalid transaction date/],
  [{...source,amount:'not a number'},/invalid amount or unsupported cent precision/],
  [{...source,amount:'1.235'},/invalid amount or unsupported cent precision/],
  [{...source,description:'Confidential\u0001Name'},/unsupported control character or invalid text in Description/],
  [{...source,id:'Private\u0000ID'},/unsupported control character or invalid text in Reference/],
  [{...source,id:'x'.repeat(32768)},/unsupported control character or invalid text in Reference/],
  [{...source,description:'Confidential\ud800Name'},/unsupported control character or invalid text in Description/],
 ];
 for(const [value,pattern]of bad){
  try{toXLSX([value]);assert.fail('Expected fail-closed XLSX rejection');}
  catch(error){
   if(error.code==='ERR_ASSERTION')throw error;
   assert.match(error.message,pattern);
   assert.ok(!error.message.includes('Confidential'));
   assert.ok(!error.message.includes('Private-REF'));
  }
 }
 const escaped=readStoredXlsxParts(toXLSX([
  {...source,description:'=SUM(1,2) & <test>\r\nsecond line',id:'0000123'}
 ])).get('xl/worksheets/sheet1.xml');
 assert.match(escaped,/<t xml:space="preserve">=SUM\(1,2\) &amp; &lt;test&gt;&#13;\nsecond line<\/t>/);
 assert.ok(!escaped.includes('<f>'),'formula-looking payee should be inert inline text');
});


test('classic Mac CR-only QIF records preserve every bank date, signed cent, payee and reference',()=>{
 const rows=['!Type:Bank',
 'D11/04/2026','T-12.34','U-12.34','PCafé ^ 北门','N000123','MReceipt 001','^',
 'D11/05/2026','T15.00','PSalary + bonus','NREF-A','^',
 'D11/06/2026','T-0.01','PLast cent','NEND','^'];
 const cr=rows.join('\r')+'\r';
 const lf=rows.join('\n')+'\n';
 const mixed=rows.map((row,i)=>row+(i%3===0?'\r\n':i%3===1?'\r':'\n')).join('');
 const expected=parseQIF(lf);
 for(const bankText of [cr,mixed]){
  const output=parseQIF(bankText);
  assert.deepEqual(output.transactions,expected.transactions);
  assert.deepEqual(output.integrity,expected.integrity);
  assert.deepEqual(output.warnings,expected.warnings);
  assert.equal(output.transactions.length,3);
  assert.equal(totals(output.transactions).net,'2.65');
  assert.equal(output.transactions[0].id,'000123');
  assert.equal(output.transactions[0].description,'Café ^ 北门');
 }
});
test('classic Mac CR-only balanced IIF journal groups read fully without dropping splits',()=>{
 const lines=[
 '!TRNS\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tMEMO\tDOCNUM',
 '!SPL\tTRNSTYPE\tDATE\tACCNT\tAMOUNT\tMEMO\tDOCNUM',
 'TRNS\tCHECK\t11/04/2026\tBank\t-10.01\tFirst rent\t0001',
 'SPL\tCHECK\t11/04/2026\tExpense\t10.01\tFirst rent\t0001',
 'ENDTRNS',
 'TRNS\tDEPOSIT\t11/05/2026\tBank\t100.00\tSale revenue\t0002',
 'SPL\tDEPOSIT\t11/05/2026\tRevenue\t-65.00\tSale revenue\t0002',
 'SPL\tDEPOSIT\t11/05/2026\tFees\t-35.00\tSale revenue\t0002',
 'ENDTRNS'
 ];
 const original=lines.join('\n')+'\n';
 const expected=parseIIF(original);
 for(const formatted of [lines.join('\r')+'\r',lines.join('\r\n')+'\r\n',lines.map((x,i)=>x+(i%2?'\r\n':'\r')).join('')]){
  const output=parseIIF(formatted);
  assert.deepEqual(output.transactions,expected.transactions);
  assert.deepEqual(output.integrity,expected.integrity);
  assert.deepEqual(output.warnings,expected.warnings);
  assert.equal(output.integrity.balancedGroups,2);
  assert.equal(output.integrity.splitRows,3);
  assert.equal(totals(output.transactions).net,'89.99');
  assert.deepEqual(output.transactions.map(x=>x.id),['0001','0002']);
 }
});
test('CR-only truncated QIF and unbalanced or unterminated IIF still fail closed',()=>{
 const invalidQif='!Type:Bank\rD11/04/2026\rT5.00\rPPayee\r';
 assert.throws(()=>parseQIF(invalidQif),/lacks terminating \^/);
 const invalidIif=['!TRNS\tDATE\tAMOUNT\tMEMO','!SPL\tDATE\tAMOUNT',
  'TRNS\t11/04/2026\t-1.00\tRent','SPL\t11/04/2026\t0.99','ENDTRNS'].join('\r')+'\r';
 assert.throws(()=>parseIIF(invalidIif),/do not balance/);
 const noEnd=invalidIif.replace(/\rENDTRNS\r?$/,'');
 assert.throws(()=>parseIIF(noEnd),/missing ENDTRNS/);
});
test('CR-only QIF encoded with UTF-16LE BOM decodes to identical transactions',()=>{
 const raw='!Type:Bank\rD11/04/2026\rT-0.05\rP旧式银行流水\rN00009\r^\r';
 const bytes=new Uint8Array([0xff,0xfe,...Buffer.from(raw,'utf16le')]);
 const decoded=decodeFinancialBytes(bytes,'qif');
 assert.equal(decoded.encoding,'utf-16le');
 assert.deepEqual(parseQIF(decoded.text).transactions,parseQIF(raw).transactions);
 assert.equal(parseQIF(decoded.text).transactions[0].id,'00009');
});


test('OFX 2.x XML mixed entity text, comments and CDATA reconstructs payee and memo exactly',()=>{
 const xml='<?xml version="1.0"?><OFX><CURDEF>USD</CURDEF>'+
 '<BANKTRANLIST><STMTTRN><DTPOSTED>20261104</DTPOSTED>'+
 '<TRNAMT>-12.34</TRNAMT><FITID>TX-001</FITID>'+
 '<NAME>Book &amp; <!-- internal remark --><![CDATA[Café &bogus; ^]]> &#x4E2D;&#25991;</NAME>'+
 '<MEMO>before<![CDATA[ &quoted; ]]><!-- hidden -->after &lt;test&gt;</MEMO>'+
 '</STMTTRN></BANKTRANLIST></OFX>';
 const parsed=parseOFX(xml);
 assert.equal(parsed.transactions.length,1);
 assert.equal(parsed.transactions[0].amount,'-12.34');
 assert.equal(parsed.transactions[0].description,'Book & Café &bogus; ^ 中文');
 assert.equal(parsed.transactions[0].memo,'before &quoted; after <test>');
 assert.equal(parsed.transactions[0].id,'TX-001');
 assert.equal(auditTransactions(parsed.transactions).summary.net,'-12.34');
 const csv=toCSV(parsed.transactions,['date','description','amount','id','memo']);
 assert.match(csv,/Book & Café &bogus; \^ 中文/);
 assert.match(csv,/before &quoted; after <test>/);
 assert.ok(!csv.includes('internal remark'),'XML comments are not data');
 assert.ok(!csv.includes('hidden'),'XML comments are not data');
});
test('OFX XML unescaped or unknown named entities reject conversion before bank export',()=>{
 const front='<?xml version="1.0"?><OFX><STMTTRN><DTPOSTED>20261104</DTPOSTED><TRNAMT>1.00</TRNAMT>';
 const rear='</STMTTRN></OFX>';
 for(const payee of ['A & B','A &bogus; B','A &amp B','A &#abc; B','A &#x; B',
                      'A &AMPB; B','A &AMP; B','A &#0; B','A &#1; B','A &#xFFFF; B',
                      'A &#xD800; B','A &#x110000; B']){
  assert.throws(()=>parseOFX(front+'<NAME>'+payee+'</NAME>'+rear),
    /Malformed or unsupported OFX XML character entity|Invalid OFX character entity/);
 }
});
test('OFX XML rejects illegal literal controls in text and CDATA without leaking bank details',()=>{
 const front='<?xml version="1.0"?><OFX><STMTTRN><DTPOSTED>20261104</DTPOSTED><TRNAMT>1.00</TRNAMT>';
 const rear='</STMTTRN></OFX>';
 for(const payee of ['Private\u0001Shop','Private\u000bShop','Private\ud800Shop',
  '<![CDATA[Private\u0002Shop]]>','<![CDATA[Private\udfffShop]]>']){
  try{parseOFX(front+'<NAME>'+payee+'</NAME>'+rear);assert.fail('Expected invalid XML');}
  catch(error){
   if(error.code==='ERR_ASSERTION')throw error;
   assert.match(error.message,/Invalid XML character in OFX/);
   assert.ok(!error.message.includes('Private'));
  }
 }
});
test('Legacy OFX 1.x SGML still accepts merchant ampersands without XML-style escaping',()=>{
 const old='OFXHEADER:100\r\nDATA:OFXSGML\r\nVERSION:102\r\n\r\n'+
 '<OFX><STMTTRN><DTPOSTED>20261104<TRNAMT>-9.50'+
 '<NAME>Smith & Sons<!-- internal annotation --> Coffee & Bakes'+
 '<FITID>000700</STMTTRN></OFX>';
 const result=parseOFX(old);
 assert.equal(result.transactions.length,1);
 assert.equal(result.transactions[0].description,'Smith & Sons Coffee & Bakes');
 assert.equal(result.transactions[0].amount,'-9.50');
 assert.equal(result.transactions[0].id,'000700');
});
test('XML leaf mixed text must not be silently cut short by comments or CDATA',()=>{
 const front='<?xml version="1.0"?><OFX><STMTTRN><DTPOSTED>20261104</DTPOSTED><TRNAMT>1.00</TRNAMT>';
 const rear='</STMTTRN></OFX>';
 const variants=[
 ['Alpha<![CDATA[ & Beta]]> Gamma','Alpha & Beta Gamma'],
 ['Start<!-- comment -->End','StartEnd'],
 ['<![CDATA[First]]> and <![CDATA[Second]]>','First and Second'],
 ['A &amp; B&#32;C','A & B C'],
 ['<![CDATA[Original &bogus;]]>','Original &bogus;']
 ];
 for(const [input,expected] of variants){
  const bank=parseOFX(front+'<NAME>'+input+'</NAME>'+rear);
  assert.equal(bank.transactions[0].description,expected);
 }
 assert.throws(()=>parseOFX(front+'<NAME>one<OTHER>two</OTHER></NAME>'+rear),
  /Missing XML closing tag for OFX NAME/);
});


test('CSV mapping reads a distinct Memo column without trimming multiline note content',()=>{
 const input='Date,Description,Memo,Amount,Reference\r\n'+
  '11/04/2026,Cafe,"  second floor,\r\n""special"" memo  ",-12.34,00019\r\n'+
  '11/05/2026,Salary,"Paid by employer",100.00,00020\r\n';
 const rows=parseCSV(input);
 const mapping=guessMapping(rows[0]);
 assert.equal(mapping.description,1);
 assert.equal(mapping.memo,2);
 const output=csvTransactions(rows,mapping);
 assert.equal(output.transactions.length,2);
 assert.equal(output.transactions[0].memo,'  second floor,\r\n"special" memo  ');
 assert.equal(output.transactions[0].id,'00019');
 assert.equal(output.transactions[1].memo,'Paid by employer');
 assert.equal(output.transactions[0].amount,'-12.34');
 assert.equal(output.transactions[1].amount,'100.00');
 const defaultCSV=toCSV(output.transactions);
 assert.equal(parseCSV(defaultCSV)[0].length,4,'legacy four-column output is unchanged');
 const withMemo=toCSV(output.transactions,['date','description','amount','id','memo']);
 const parsed=parseCSV(withMemo);
 assert.equal(parsed[0][4],'memo');
 assert.equal(parsed[1][4],'  second floor,\r\n"special" memo  ');
 assert.equal(parsed[2][4],'Paid by employer');
 assert.equal(parsed[1][2],'-12.34');
 assert.equal(parsed[2][3],'00020');
});
test('CSV containing a single Memo used as Description must not duplicate it as a second field',()=>{
 const rows=parseCSV('Date,Memo,Amount\n11/04/2026,Coffee,-0.01\n');
 const guess=guessMapping(rows[0]);
 assert.equal(guess.description,1);
 assert.equal(guess.memo,-1);
 const records=csvTransactions(rows);
 assert.equal(records.transactions[0].description,'Coffee');
 assert.equal(records.transactions[0].memo,'');
 assert.throws(()=>csvTransactions(rows,{...guess,memo:1}),/assigned to both description and memo/);
});
test('optional CSV Memo output retains quoted text and guards spreadsheet formulas',()=>{
 const data=[{date:'2026-11-04',description:'Cafe',amount:'1.00',id:'A',memo:'=HYPERLINK("bad")'},
             {date:'2026-11-05',description:'Store',amount:'-2.00',id:'B',memo:'first,\r\nsecond "line"'}];
 const wire=toCSV(data,['date','description','amount','id','memo']);
 const parsed=parseCSV(wire);
 assert.equal(parsed[0].join(','),'date,description,amount,id,memo');
 assert.equal(parsed[1][4],"'"+data[0].memo,'memo formula must remain inert after opening CSV');
 assert.equal(parsed[2][4],data[1].memo,'safe multiline memo must retain exact characters');
 assert.deepEqual(parsed.slice(1).map(r=>r[2]),['1.00','-2.00']);
 const legacy=toCSV(data);
 assert.equal(parseCSV(legacy)[0].length,4);
});
test('opt-in Excel Memo column is text-only and defaults to the existing four columns',()=>{
 const src=[{date:'2026-11-04',description:'Cafe',amount:'-0.01',id:'000123',memo:'Payment =SUM(1,2)\r\n"receipt"'}];
 const defaultParts=readStoredXlsxParts(toXLSX(src));
 const legacy=defaultParts.get('xl/worksheets/sheet1.xml');
 assert.match(legacy,/<dimension ref="A1:D2"\/>/);
 assert.match(legacy,/<autoFilter ref="A1:D2"\/>/);
 assert.ok(!legacy.includes('r="E2"'));
 const memo=readStoredXlsxParts(toXLSX(src,{includeMemo:true})).get('xl/worksheets/sheet1.xml');
 assert.match(memo,/<dimension ref="A1:E2"\/>/);
 assert.match(memo,/<autoFilter ref="A1:E2"\/>/);
 assert.match(memo,/<c r="E1" t="inlineStr"><is><t>Memo<\/t><\/is><\/c>/);
 assert.match(memo,/<c r="E2" t="inlineStr"><is><t xml:space="preserve">Payment =SUM\(1,2\)&#13;\n&quot;receipt&quot;<\/t><\/is><\/c>/);
 assert.match(memo,/<c r="C2" s="1"><v>-0.01<\/v><\/c>/);
 assert.match(memo,/<c r="D2" t="inlineStr"><is><t xml:space="preserve">000123<\/t><\/is><\/c>/);
 assert.ok(!memo.includes('<f>'),'memo text must never execute as spreadsheet formulas');
 assert.throws(()=>toXLSX(src,{includeMemo:'yes'}),/Invalid Excel Memo export option/);
 assert.throws(()=>toXLSX([{...src[0],memo:'private\u0001line'}],{includeMemo:true}),/unsupported control character or invalid text in Memo/);
});


test('quoted CSV source preserves exact leading/trailing whitespace in payee, reference and Memo',()=>{
 const source='Date,Description,Memo,Amount,Reference\r\n'+
 '11/04/2026,"  Café & Co  ","  Original memo, with  spaces  ",-12.50,"  000123  "\r\n'+
 '11/05/2026,"Office  ","Receipt \r\n second line",10.00," REF-B "\r\n';
 const parsed=csvTransactions(parseCSV(source));
 assert.equal(parsed.transactions.length,2);
 assert.equal(parsed.transactions[0].description,'  Café & Co  ');
 assert.equal(parsed.transactions[0].id,'  000123  ');
 assert.equal(parsed.transactions[0].memo,'  Original memo, with  spaces  ');
 assert.equal(parsed.transactions[1].description,'Office  ');
 assert.equal(parsed.transactions[1].id,' REF-B ');
 const plan=genericCSVExportPlan(parsed.transactions,{includeMemo:true});
 const after=parseCSV(plan.csv);
 assert.deepEqual(after[1],['2026-11-04','  Café & Co  ','-12.50','  000123  ','  Original memo, with  spaces  ']);
 assert.equal(after[2][4],'Receipt \r\n second line');
 assert.equal(plan.report.exactTextReconciled,true);
 assert.equal(plan.report.signedAmountsReconciled,true);
 assert.equal(plan.report.memoRowsOmitted,0);
 assert.deepEqual(plan.report.rowCount,2);
 assert.ok(!JSON.stringify(plan.report).includes('Café'));
 assert.ok(!JSON.stringify(plan.report).includes('000123'));
});
test('generic CSV preflight catches tampering even when counts and signed totals match',()=>{
 const tx=[
 {date:'2026-11-04',description:'Confidential First',amount:'-10.00',id:'001',memo:'Private A'},
 {date:'2026-11-05',description:'Confidential Second',amount:'10.00',id:'002',memo:'Private B'},
 ];
 const source=genericCSVExportPlan(tx,{includeMemo:true});
 assert.equal(source.report.rowCount,2);
 const tests=[
 [source.csv.replace('Confidential First','Changed Merchant'),/description changed or moved/],
 [source.csv.replace('2026-11-04','2026-11-05'),/date changed or moved/],
 [source.csv.replace('Private B','Tampered'),/memo changed or moved/],
 [source.csv.replace('001','099'),/id changed or moved/],
 [source.csv.replace('-10.00','-9.00'),/amount changed or moved/],
 [source.csv.replace('date,description,amount,id,memo','date,memo,amount,id,description'),/column names or order differ/],
 [source.csv.replace('Confidential Second','Confidential First'),/description changed or moved/],
 [source.csv.replace(/\r\n2026-11-05,[^\r\n]+\r\n$/,'\r\n'),/source and output row counts differ/],
 ];
 for(const [wire,expected]of tests){
  try{validateGenericCSVExport(tx,wire,{includeMemo:true});assert.fail('Expected preflight rejection');}
  catch(error){
    if(error.code==='ERR_ASSERTION')throw error;
    assert.match(error.message,expected);
    assert.ok(!error.message.includes('Confidential'));
    assert.ok(!error.message.includes('Private A'));
    assert.ok(!error.message.includes('Private B'));
  }
 }
});
test('generic CSV preflight guards formulas while keeping exact text and cents',()=>{
 const data=[
  {date:'2026-11-04',description:'=HYPERLINK("bad", "payee")',amount:'-0.01',id:'+SECRET-ID',memo:'=SUM(1,2)'},
  {date:'2026-11-05',description:'Store',amount:'0.01',id:'00005',memo:'\n=DROP'}
 ];
 const result=genericCSVExportPlan(data,{includeMemo:true});
 assert.equal(result.report.formulaGuardedCells,4);
 assert.equal(result.report.memoRowsWithContent,2);
 const rows=parseCSV(result.csv);
 assert.deepEqual(rows[1],['2026-11-04',"'"+data[0].description,'-0.01',"'+SECRET-ID","'=SUM(1,2)"]);
 assert.equal(rows[2][4],"'"+data[1].memo);
 const attacked=result.csv.replace("'=SUM(1,2)",'=SUM(1,2)');
 assert.throws(()=>validateGenericCSVExport(data,attacked,{includeMemo:true}),/memo changed or moved/);
});
test('generic CSV rejects encoding changes, NUL and unpaired surrogate with private errors',()=>{
 const data=[{date:'2026-11-04',description:'Sensitive shop',amount:'1.00',id:'0001',memo:''}];
 const wire=genericCSVExportPlan(data).csv;
 assert.throws(()=>validateGenericCSVExport(data,wire+'\u0000'),/output encoding or record structure is invalid/);
 const invalid={...data[0],description:'Sensitive \ud800 bank'};
 try{genericCSVExportPlan([invalid]);assert.fail('Expected invalid unicode rejection');}
 catch(error){if(error.code==='ERR_ASSERTION')throw error;
  assert.match(error.message,/output encoding or record structure is invalid/);
  assert.ok(!error.message.includes('Sensitive'));
 }
 assert.throws(()=>genericCSVExportPlan([{...data[0],amount:'1.001'}]),/CSV export row 1/);
 assert.throws(()=>genericCSVExportPlan(data,{includeMemo:'true'}),/Invalid generic CSV Memo export option/);
});
test('1200-row generic CSV with embedded Unicode quotes and Memo preserves ordered signed cents',()=>{
 const input=Array.from({length:1200},(_,i)=>({
 date:'2026-11-'+String(i%28+1).padStart(2,'0'),
 description:'Shop '+i+' "日本"  ',amount:fromMinorUnits(BigInt((i*211)%1000000-500000)),
 id:'000'+i,memo:i%7===0?'Optional,\r\nnote '+i:''
 }));
 const plan=genericCSVExportPlan(input,{includeMemo:true});
 assert.equal(plan.report.rowCount,1200);
 assert.equal(plan.report.memoRowsOmitted,0);
 assert.equal(plan.report.memoRowsWithContent,172);
 const rows=parseCSV(plan.csv);
 assert.equal(rows.length,1201);
 for(const i of [0,1,6,7,1198,1199]){
  assert.equal(rows[i+1][0],input[i].date);
  assert.equal(rows[i+1][1],input[i].description);
  assert.equal(rows[i+1][2],input[i].amount);
  assert.equal(rows[i+1][3],input[i].id);
  assert.equal(rows[i+1][4],input[i].memo);
 }
 assert.equal(totals(input).net,totals(rows.slice(1).map(r=>({date:r[0],description:r[1],amount:r[2],id:r[3],memo:r[4]}))).net);
});
