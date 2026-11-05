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


test('batch validation reports OFX retrieval window without leaking bank or transaction names',()=>{
 const text='<OFX><CURDEF>USD<BANKTRANLIST><DTSTART>20261104<DTEND>20261106'+
  '<STMTTRN><DTPOSTED>20261103<TRNAMT>-5.05<FITID>PRIVATE-REF-01<NAME>Private Bank Payment</STMTTRN>'+
  '<STMTTRN><DTPOSTED>20261105<TRNAMT>7.50<FITID>PRIVATE-REF-02<NAME>Private Bank Deposit</STMTTRN>'+
  '</BANKTRANLIST></OFX>';
 const result=batchConvert([{name:'bank-account-private-123.ofx',text}]);
 const item=result.report.files[0];
 assert.equal(result.report.totalTransactions,2);
 assert.deepEqual(item.parserIntegrity.statementRange,{startInclusive:'2026-11-04',endExclusive:'2026-11-06'});
 assert.equal(item.parserIntegrity.postedBeforeRangeCount,1);
 assert.equal(item.parserIntegrity.postedAfterRangeCount,0);
 assert.equal(item.net,'2.45');
 assert.ok(item.warnings.some(x=>x.includes('can be legitimate')));
 const metadata=JSON.stringify(result.report);
 for(const secret of ['PRIVATE-REF','bank-account-private','Private Bank Payment','Private Bank Deposit'])
  assert.ok(!metadata.includes(secret));
});
test('batch refuses an incomplete bank list and does not create partial ZIP output',()=>{
 const good='<OFX><BANKTRANLIST><STMTTRN><DTPOSTED>20261105<TRNAMT>2.00<NAME>Valid</STMTTRN></BANKTRANLIST></OFX>';
 const bad='<OFX><BANKTRANLIST><STMTTRN><DTPOSTED>20261105<TRNAMT>1.00<NAME>Truncated</STMTTRN></OFX>';
 assert.throws(()=>batchConvert([{name:'good.ofx',text:good},{name:'bad.ofx',text:bad}]),/Batch file 2: Multiple or incomplete BANKTRANLIST/);
});


test('batch flags repeated references and transaction fingerprints across different source files',()=>{
 const a='!Type:Bank\nD11/04/2026\nT-3.25\nPLunch\nNAB-1\n^\n';
 const b='!Type:Bank\nD11/04/2026\nT-3.25\nPLunch\nNAB-1\n^\n';
 const result=batchConvert([{name:'first.qif',text:a},{name:'second.qif',text:b}]);
 assert.equal(result.report.totalTransactions,2);
 assert.equal(result.report.crossFileReferenceMatches,1);
 assert.equal(result.report.crossFileFingerprintMatches,1);
 assert.equal(result.report.crossFileMatchesAreWarningsOnly,true);
 assert.equal(result.report.autoDeletedTransactions,false);
 assert.deepEqual(result.report.files[1].matchedEarlierFileNumbers,[1]);
 assert.equal(result.report.files[1].crossFileReferenceMatches,1);
 assert.equal(result.report.files[1].crossFileFingerprintMatches,1);
 assert.ok(result.report.files[1].warnings.some(w=>w.includes('against earlier batch files')));
 assert.deepEqual(result.report.files.map(f=>f.outputFile),['converted-001.csv','converted-002.csv']);
 const report=JSON.stringify(result.report);
 assert.ok(!report.includes('AB-1'));
 assert.ok(!report.includes('Lunch'));
 assert.ok(!report.includes('first.qif'));
});
test('batch detects same transaction across files even with differing FITIDs, without claiming certainty',()=>{
 const a='!Type:Bank\nD11/04/2026\nT10.00\nPShop\nNOLD-A\n^\n';
 const b='!Type:Bank\nD11/04/2026\nT10.00\nPShop\nNNEW-B\n^\n';
 const r=batchConvert([{name:'a.qif',text:a},{name:'b.qif',text:b}]);
 assert.equal(r.report.crossFileReferenceMatches,0);
 assert.equal(r.report.crossFileFingerprintMatches,1);
 assert.ok(r.report.files[1].warnings.some(w=>w.includes('possible overlaps')));
 assert.deepEqual(r.report.files[1].matchedEarlierFileNumbers,[1]);
});
test('batch never treats repeated rows within one source as cross-file duplicates',()=>{
 const data='!Type:Bank\nD11/04/2026\nT-3.00\nPCoffee\nNREPEAT\n^\nD11/04/2026\nT-3.00\nPCoffee\nNREPEAT\n^\n';
 const r=batchConvert([{name:'one.qif',text:data}]);
 assert.equal(r.report.crossFileReferenceMatches,0);
 assert.equal(r.report.crossFileFingerprintMatches,0);
 assert.equal(r.report.files[0].duplicateReferenceCount,1);
 assert.equal(r.report.files[0].possibleDuplicateCount,1);
});
test('batch duplicate references reused by different accounts are warnings, never deleted',()=>{
 const accountA='!Type:Bank\nD11/04/2026\nT-3.00\nPCoffee\nNCHK-123\n^\n';
 const accountB='!Type:Bank\nD11/05/2026\nT-100.00\nPRent\nNCHK-123\n^\n';
 const r=batchConvert([{name:'checking.qif',text:accountA},{name:'savings.qif',text:accountB}]);
 assert.equal(r.report.crossFileReferenceMatches,1);
 assert.equal(r.report.crossFileFingerprintMatches,0);
 assert.equal(r.report.totalTransactions,2);
 assert.match(r.report.files[1].warnings.join(' '),/Different bank accounts may legitimately reuse references/);
});
test('batch original-byte accounting supports non-UTF8 encoding sizes without output truncation',()=>{
 const latin='!Type:Bank\nD11/04/2026\nT-12.00\nPCafé\n^\n';
 const size=new TextEncoder().encode(latin).length;
 const r=batchConvert([{name:'legacy.qif',text:latin,encoding:'windows-1252',byteLength:size-1}]);
 assert.equal(r.report.totalTransactions,1);
 assert.ok(r.report.files[0].warnings.some(x=>x.includes('windows-1252')));
 assert.throws(()=>batchConvert([{name:'bad.qif',text:latin,byteLength:-1}]),/invalid source byte length/);
 assert.throws(()=>batchConvert([{name:'bad.qif',text:latin,byteLength:8*1024*1024+1}]),/8 MB/);
});
test('batch fails atomically for QIF contradictory U/T amounts, even after a valid first file',()=>{
 const good='!Type:Bank\nD11/04/2026\nT1.00\nPValid\n^\n';
 const broken='!Type:Bank\nD11/04/2026\nT1.00\nU2.00\nPWrong amount\n^\n';
 assert.throws(()=>batchConvert([{name:'ok.qif',text:good},{name:'broken.qif',text:broken}]),/Batch file 2.*T and U amount fields disagree/);
});


test('batch keeps CR-only QIF and IIF accounts separate with exact signed totals',()=>{
 const classicQif=['!Type:Bank','D11/04/2026','T-1.99','PBank Coffee','NREF-ONE','^',''].join('\r');
 const classicIif=[
  '!TRNS\tDATE\tAMOUNT\tMEMO\tDOCNUM',
  '!SPL\tDATE\tAMOUNT',
  'TRNS\t11/05/2026\t9.50\tSales\tID-0002',
  'SPL\t11/05/2026\t-9.50','ENDTRNS',''
 ].join('\r');
 const {archive,report}=batchConvert([
  {name:'older.qif',text:classicQif},
  {name:'ledger.iif',text:classicIif}
 ],{target:'csv'});
 assert.equal(report.totalFiles,2);
 assert.equal(report.totalTransactions,2);
 assert.deepEqual(report.files.map(x=>x.net),['-1.99','9.50']);
 assert.deepEqual(report.files.map(x=>x.rows),[1,1]);
 assert.equal(report.autoMergedAccounts,false);
 assert.equal(report.autoDeletedTransactions,false);
 assert.equal(String.fromCharCode(...archive.slice(0,2)),'PK');
 assert.ok(!JSON.stringify(report).includes('Bank Coffee'));
 assert.ok(!JSON.stringify(report).includes('REF-ONE'));
 assert.ok(!JSON.stringify(report).includes('ID-0002'));
});
test('one malformed CR-only QIF record blocks the complete batch archive',()=>{
 const valid='!Type:Bank\rD11/04/2026\rT1.00\rPValid\r^\r';
 const invalid='!Type:Bank\rD11/04/2026\rT1.00\rPMissing terminator\r';
 assert.throws(()=>batchConvert([
  {name:'ok.qif',text:valid},{name:'truncated.qif',text:invalid}
 ]),/Batch file 2: QIF final transaction lacks terminating \^/);
});


test('batch exports separate Memo columns only on opt-in and reports omissions without private text',()=>{
 const source='!Type:Bank\nD11/04/2026\nT-1.00\nPCafé\nMPrivate note ^ first\nN0012\n^\n';
 const second='!Type:Bank\nD11/05/2026\nT2.00\nPRefund\nMPrivate note ^ second\nN0013\n^\n';
 const inputs=[{name:'account-a.qif',text:source},{name:'account-b.qif',text:second}];
 const defaultBatch=batchConvert(inputs,{target:'csv'});
 assert.equal(defaultBatch.report.memoIncluded,false);
 assert.equal(defaultBatch.report.memoRowsWithContent,2);
 assert.equal(defaultBatch.report.memoRowsOmitted,2);
 assert.deepEqual(defaultBatch.report.files.map(f=>f.memoRowsOmitted),[1,1]);
 assert.ok(defaultBatch.report.files.every(f=>f.warnings.some(w=>/separate Memo values that are omitted/.test(w))));
 assert.ok(defaultBatch.warningCount>=2,'default Memo omission requires acknowledgement');
 const opt=batchConvert(inputs,{target:'csv',includeMemo:true});
 assert.equal(opt.report.memoIncluded,true);
 assert.equal(opt.report.memoRowsWithContent,2);
 assert.equal(opt.report.memoRowsOmitted,0);
 assert.deepEqual(opt.report.files.map(f=>f.memoRowsIncluded),[1,1]);
 assert.ok(opt.warningCount<defaultBatch.warningCount);
 for(const sourceString of ['Private note ^ first','Private note ^ second'])
  assert.ok(!JSON.stringify(opt.report).includes(sourceString),'report must not disclose source memos');
 assert.ok(opt.archive.length>0&&defaultBatch.archive.length>0);
 const defaultText=Buffer.from(defaultBatch.archive);
 const enhancedText=Buffer.from(opt.archive);
 assert.ok(!defaultText.includes(Buffer.from('Private note ^ first')));
 assert.ok(enhancedText.includes(Buffer.from('Private note ^ first')));
 assert.ok(enhancedText.includes(Buffer.from('Private note ^ second')));
 assert.throws(()=>batchConvert(inputs,{includeMemo:'yes'}),/Unsupported Memo-column/);
});
test('batch optional Excel Memo remains source-order text with true numeric cents',()=>{
 const source='!Type:Bank\nD11/04/2026\nT-0.01\nPShop\nM=FORMULA(1)\nN0001\n^\n';
 const result=batchConvert([{name:'memo.qif',text:source}],{target:'xlsx',includeMemo:true});
 assert.equal(result.report.totalTransactions,1);
 assert.equal(result.report.memoIncluded,true);
 assert.equal(result.report.memoRowsWithContent,1);
 assert.equal(result.report.memoRowsOmitted,0);
 const bytes=Buffer.from(result.archive);
 assert.ok(bytes.includes(Buffer.from('E2')));
 // XLSX is itself nested in the outer ZIP; these markers belong to the
 // metadata report. A real workbook XML assertion is in core + Chrome E2E.
 assert.equal(result.report.files[0].memoRowsIncluded,1);
 assert.equal(result.report.files[0].net,'-0.01');
});


test('batch generic CSV source-to-wire validation retains payee/reference whitespace and Memo order',()=>{
 const qifA='!Type:Bank\nD11/04/2026\nT-1.25\nP  Coffee & Sons  \nN  000012  \nMPrivate,\n^\n';
 const qifB='!Type:Bank\nD11/05/2026\nT4.00\nP  Salary  \nN  000013  \nMNote\n^\n';
 const result=batchConvert([{name:'a.qif',text:qifA},{name:'b.qif',text:qifB}],
   {target:'csv',includeMemo:true});
 assert.equal(result.report.totalTransactions,2);
 assert.equal(result.report.memoIncluded,true);
 assert.equal(result.report.memoRowsOmitted,0);
 assert.equal(result.report.totalFiles,2);
 const bytes=Buffer.from(result.archive);
 assert.ok(bytes.includes(Buffer.from('  Coffee & Sons  ')));
 assert.ok(bytes.includes(Buffer.from('  000012  ')));
 assert.ok(bytes.includes(Buffer.from('  Salary  ')));
 assert.ok(bytes.includes(Buffer.from('Private,')));
 assert.ok(!JSON.stringify(result.report).includes('Coffee & Sons'));
 assert.ok(!JSON.stringify(result.report).includes('000012'));
 assert.deepEqual(result.report.files.map(f=>f.net),['-1.25','4.00']);
});


test('batch rejects any IIF row-width or AMOUNT/AMT contradiction without producing a partial ZIP',()=>{
 const qif='!Type:Bank\nD11/04/2026\nT1.00\nPValid first bank\n^\n';
 const header='!TRNS\tDATE\tAMOUNT\tAMT\tMEMO\n!SPL\tAMOUNT\tAMT\n';
 const invalid=[
  header+'TRNS\t11/04/2026\t-1.00\t-1.00\tPRIVATE\tEXTRA\nSPL\t1.00\t1.00\nENDTRNS\n',
  header+'TRNS\t11/04/2026\t-1.00\t-1.01\tPRIVATE\nSPL\t1.00\t1.00\nENDTRNS\n',
  header+'TRNS\t11/04/2026\t-1.00\t-1.00\tPRIVATE\nSPL\t1.00\t0.99\nENDTRNS\n',
 ];
 for(const [i,text]of invalid.entries()){
  try{batchConvert([{name:'safe.qif',text:qif},{name:'private.iif',text}],{target:'csv'});
      assert.fail('Expected to reject corrupt IIF before batch archive');
  }catch(error){
    if(error.code==='ERR_ASSERTION')throw error;
    assert.match(error.message,/Batch file 2:/);
    assert.match(error.message,i===0?/field\(s\), but its header declares/:/AMOUNT and AMT values disagree/);
    assert.ok(!error.message.includes('PRIVATE'));
    assert.ok(!error.message.includes('safe.qif'));
  }
 }
});
test('valid IIF with dual amount aliases produces unchanged signed cents in batch summary',()=>{
 const content='!TRNS\tDATE\tAMOUNT\tAMT\tMEMO\tDOCNUM\n!SPL\tAMOUNT\tAMT\n'+
 'TRNS\t11/04/2026\t-0.01\t-0.01\tPrivate rent\t0006\n'+
 'SPL\t0.01\t0.01\nENDTRNS\n';
 const r=batchConvert([{name:'private.iif',text:content}],{target:'csv'});
 assert.equal(r.report.totalFiles,1);
 assert.equal(r.report.totalTransactions,1);
 assert.equal(r.report.files[0].net,'-0.01');
 assert.equal(r.report.files[0].rows,1);
 const report=JSON.stringify(r.report);
 assert.ok(!report.includes('Private rent'));
 assert.ok(!report.includes('0006'));
});


test('batch blocks all outputs when one QIF or OFX bank file uses contradictory money signs',()=>{
 const valid='!Type:Bank\nD11/04/2026\nT-2.00\nPValid synthetic bank\n^\n';
 const invalid=[
  {name:'invalid.qif',text:'!Type:Bank\nD11/05/2026\nT(-12.34)\nPPrivate customer\n^\n'},
  {name:'invalid.ofx',text:'<OFX><STMTTRN><DTPOSTED>20261105<TRNAMT>(-$12.34)<NAME>Private customer</STMTTRN></OFX>'}
 ];
 for(const file of invalid){
  try{batchConvert([{name:'valid.qif',text:valid},file],{target:'csv'});
   assert.fail('Expected all-or-nothing invalid source rejection');
  }catch(error){
   if(error.code==='ERR_ASSERTION')throw error;
   assert.match(error.message,/Batch file 2:.*Conflicting amount signs/);
   assert.ok(!error.message.includes('Private customer'));
   assert.ok(!error.message.includes('valid.qif'));
  }
 }
});
test('batch retains unambiguous parenthesized negatives with signed totals and complete ZIP',()=>{
 const negative='!Type:Bank\nD11/05/2026\nT($12.34)\nPValid debit\nN001\n^\n';
 const positive='!Type:Bank\nD11/05/2026\nT12.34\nPValid credit\nN002\n^\n';
 const result=batchConvert([{name:'debit.qif',text:negative},{name:'credit.qif',text:positive}],{target:'csv'});
 assert.equal(result.report.totalTransactions,2);
 assert.deepEqual(result.report.files.map(x=>x.net),['-12.34','12.34']);
 assert.equal(result.report.totalFiles,2);
 assert.equal(result.report.files[0].rows,1);
 assert.equal(result.report.files[1].rows,1);
 assert.equal(result.archive[0],80);
 assert.equal(result.archive[1],75);
});
