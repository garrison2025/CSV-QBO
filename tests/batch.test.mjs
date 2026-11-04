import test from 'node:test';
import assert from 'node:assert/strict';
import {batchConvert,MAX_BATCH_FILES,MAX_BATCH_BYTES} from '../src/batch.mjs';
const qif=(name,amount='12.25')=>'!Type:Bank\nD11/04/2026\nT'+amount+'\nP'+name+'\n^\n';
const ofx='<OFX><BANKTRANLIST><STMTTRN><DTPOSTED>20261104<TRNAMT>-5.00<FITID>X3<NAME>Food</STMTTRN></BANKTRANLIST></OFX>';
test('batch creates one entry per original file and a privacy-minimized JSON summary',()=>{
 const r=batchConvert([{name:'alpha.qif',text:qif('Coffee')},{name:'bank.ofx',text:ofx}]);
 assert.equal(r.report.totalFiles,2);
 assert.equal(r.report.totalTransactions,2);
 assert.deepEqual(r.report.files.map(x=>x.outputFile),['converted-001.csv','converted-002.csv']);
 assert.equal(r.report.files[0].net,'12.25');
 assert.equal(r.report.files[1].net,'-5.00');
 assert.equal(r.report.autoMergedAccounts,false);
 assert.equal(r.report.quickBooksImportTested,false);
 assert.equal(r.archive[0],80);
 assert.equal(r.archive[1],75);
 const summary=JSON.stringify(r.report);
 assert.ok(!summary.includes('Coffee')&&!summary.includes('alpha.qif'));
});
test('XLSX batch ZIP includes real binary Office workbooks',()=>{
 const r=batchConvert([{name:'alpha.qif',text:qif('Coffee')}],{target:'xlsx'});
 assert.equal(r.report.files[0].outputFile,'converted-001.xlsx');
 assert.ok(r.archive.length>1600);
});
test('batch does not remove identical inputs and warns about duplicated source contents',()=>{
 const input={name:'a.qif',text:qif('Coffee')};
 const r=batchConvert([input,{name:'b.qif',text:input.text}]);
 assert.equal(r.report.totalTransactions,2);
 assert.ok(r.warningCount>0);
 assert.ok(r.report.files[1].warnings.some(x=>x.includes('duplicates batch item 1')));
});
test('batch refuses an unsupported import direction and mismatched source types',()=>{
 assert.throws(()=>batchConvert([{name:'x.csv',text:'Date,Amount'}]),/CSV requires manual column mapping/);
 assert.throws(()=>batchConvert([{name:'x.qif',text:qif('Test')}],{source:'qbo'}),/expected .qbo/);
 assert.throws(()=>batchConvert([{name:'x.qif',text:qif('Test')}],{target:'qbo'}),/CSV or Excel only/);
});
test('batch is all-or-nothing when one bank file contains invalid records',()=>{
 assert.throws(()=>batchConvert([{name:'a.qif',text:qif('First')},{name:'b.qif',text:'!Type:Bank\nD11/04/2026\nTbad\nPNo\n^'}]),/Batch file 2/);
});
test('batch rejects mixed-account OFX and unsupported investment sections',()=>{
 const bad='<OFX><STMTRS/><STMTRS/><BANKTRANLIST><STMTTRN><DTPOSTED>20261104<TRNAMT>1.00</STMTTRN></BANKTRANLIST></OFX>';
 assert.throws(()=>batchConvert([{name:'bank.ofx',text:bad}]),/Multiple bank or card accounts/);
 const invest='!Type:Invst\nD11/04/2026\nT10\nPBuy\n^';
 assert.throws(()=>batchConvert([{name:'invest.qif',text:invest}]),/Investment QIF/);
});
test('batch restricts number of files and total bytes',()=>{
 assert.throws(()=>batchConvert(Array.from({length:MAX_BATCH_FILES+1},()=>({name:'x.qif',text:qif('X')}))),/at most 10/);
 assert.throws(()=>batchConvert([{name:'x.qif',text:'a'.repeat(8*1024*1024+1)}]),/8 MB/);
 assert.throws(()=>batchConvert([{name:'x.qif',text:qif('X')}],{dateFormat:'other'}),/Unsupported date order/);
});
test('file-level output names never copy source account labels or filenames',()=>{
 const r=batchConvert([{name:'private-account-123456.qif',text:qif('My private account')}]);
 assert.deepEqual(r.report.files.map(x=>x.outputFile),['converted-001.csv']);
 assert.ok(!JSON.stringify(r.report).includes('123456'));
});


test('batch fails atomically on an incomplete OFX transaction',()=>{
 const broken='<OFX><BANKTRANLIST><STMTTRN><DTPOSTED>20261104<TRNAMT>5.00<NAME>Truncated</BANKTRANLIST></OFX>';
 assert.throws(()=>batchConvert([{name:'good.qif',text:qif('First')},{name:'broken.ofx',text:broken}]),/Batch file 2.*Incomplete STMTTRN/);
});
test('batch refuses a mixed-type QIF export rather than silently combining accounts',()=>{
 const mixed='!Type:Bank\nD11/04/2026\nT12.00\nPDeposit\n^\n!Type:CCard\nD11/05/2026\nT-3.00\nPCard\n^\n';
 assert.throws(()=>batchConvert([{name:'mixed.qif',text:mixed}]),/Multiple QIF transaction section types/);
});


test('batch includes IIF zero-sum group evidence without leaking ledger details',()=>{
 const balanced='!TRNS\tDATE\tAMOUNT\tMEMO\n!SPL\tDATE\tAMOUNT\tMEMO\n'+
  'TRNS\t11/04/2026\t-50.00\tPrivate transaction\n'+
  'SPL\t11/04/2026\t50.00\tSecret expense\nENDTRNS\n';
 const result=batchConvert([{name:'PRIVATE-COMPANY.iif',text:balanced}]);
 assert.equal(result.report.files[0].parserIntegrity.status,'passed');
 assert.equal(result.report.files[0].parserIntegrity.balancedGroups,1);
 assert.equal(result.report.files[0].parserIntegrity.splitRows,1);
 assert.deepEqual(result.report.files[0].dateRange,{first:'2026-11-04',last:'2026-11-04'});
 assert.equal(result.report.files[0].outputIsLedger,false);
 assert.equal(result.report.reportScope.includes('not reconstructed'),true);
 assert.equal(result.report.totalTransactions,1);
 const metadata=JSON.stringify(result.report);
 for(const secret of ['PRIVATE-COMPANY','Private transaction','Secret expense'])assert.ok(!metadata.includes(secret));
});
test('batch blocks any unbalanced IIF file and never returns partial ZIP',()=>{
 const balanced='!TRNS\tDATE\tAMOUNT\tMEMO\n!SPL\tDATE\tAMOUNT\tMEMO\n'+
  'TRNS\t11/04/2026\t-10.00\tA\nSPL\t11/04/2026\t10.00\tB\nENDTRNS\n';
 const unbalanced='!TRNS\tDATE\tAMOUNT\tMEMO\n!SPL\tDATE\tAMOUNT\tMEMO\n'+
  'TRNS\t11/04/2026\t-10.00\tA\nSPL\t11/04/2026\t9.99\tB\nENDTRNS\n';
 assert.throws(()=>batchConvert([{name:'good.iif',text:balanced},{name:'bad.iif',text:unbalanced}]),/Batch file 2: .*do not balance to zero/);
});


test('batch identifies legacy OFX encoding and missing bank transaction references without exposing descriptions',()=>{
 const sgml='<OFX><CURDEF>USD<STMTTRN><DTPOSTED>20261104<TRNAMT>-7.00<NAME>Legacy bank transaction</STMTTRN></OFX>';
 const result=batchConvert([{name:'private-account.ofx',text:sgml,encoding:'windows-1252'}]);
 assert.equal(result.report.totalTransactions,1);
 assert.equal(result.report.files[0].parserIntegrity.check,'ofx_statement_records');
 assert.equal(result.report.files[0].parserIntegrity.missingReferenceCount,1);
 assert.ok(result.report.files[0].warnings.some(x=>x.includes('windows-1252')));
 assert.ok(result.report.files[0].warnings.some(x=>x.includes('no FITID')));
 assert.ok(!JSON.stringify(result.report).includes('private-account'));
 assert.ok(!JSON.stringify(result.report).includes('Legacy bank transaction'));
});
test('batch blocks OFX statements with bank error status or duplicate TRNAMT',()=>{
 const tx='<STMTTRN><DTPOSTED>20261104<TRNAMT>7.00<NAME>Sample</STMTTRN>';
 assert.throws(()=>batchConvert([{name:'bad.ofx',text:'<OFX><STATUS><CODE>15500<SEVERITY>ERROR</STATUS>'+tx+'</OFX>'}]),/unsuccessful status/);
 assert.throws(()=>batchConvert([{name:'bad.ofx',text:tx.replace('<NAME>','<TRNAMT>8.00<NAME>')}]),/Duplicate OFX TRNAMT/);
});
