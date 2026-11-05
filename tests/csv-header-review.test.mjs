import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCSV,csvHeaderReview,csvTransactions,parseInput,toQuickBooksCSV} from '../src/core.mjs';

/** Synthetic CSV records only; no bank issuer originals. */
test('two possible signed amount columns require review but preserve chosen cents and all rows',()=>{
  const source='Date,Description,Amount,Transaction Amount\n'+
    '2026-11-04,Synthetic purchase,-12.50,-1200.00\n'+
    '2026-11-05,Synthetic refund,20.00,2.00\n';
  const raw=parseCSV(source);
  const defaultResult=csvTransactions(raw);
  assert.equal(defaultResult.transactions.length,2);
  assert.deepEqual(defaultResult.transactions.map(x=>x.amount),['-12.50','20.00']);
  assert.deepEqual(defaultResult.headerReview,{
    duplicateHeaderLabels:0,dateCandidates:1,amountCandidates:2,requiresReview:true
  });
  assert.match(defaultResult.warnings.join(' '),/2 possible signed Amount columns/);
  const manuallyChosen=csvTransactions(raw,{amount:3,debit:-1,credit:-1});
  assert.deepEqual(manuallyChosen.transactions.map(x=>x.amount),['-1200.00','2.00']);
  assert.equal(manuallyChosen.headerReview.amountCandidates,2);
  assert.match(toQuickBooksCSV(manuallyChosen.transactions),/Synthetic purchase,-1200.00/);
});
test('two date headings are disclosed without silently changing transaction vs posted-date mapping',()=>{
  const source='Transaction Date,Posted Date,Description,Amount\n'+
    '2026-11-01,2026-11-03,Sample transfer,-15.25\n';
  const rows=parseCSV(source);
  const parsed=csvTransactions(rows);
  assert.equal(parsed.headerReview.dateCandidates,2);
  assert.equal(parsed.transactions[0].date,'2026-11-01');
  assert.match(parsed.warnings.join(' '),/2 possible Date columns/);
  const posted=csvTransactions(rows,{date:1});
  assert.equal(posted.transactions[0].date,'2026-11-03');
  assert.equal(posted.transactions[0].amount,'-15.25');
});
test('repeated case/whitespace-normalized header labels produce counts without source data in review',()=>{
  const source='Date,Description,Amount, amount \n2026-11-04,Secret merchant,-9.99,-999.99\n';
  const result=parseInput(source,'csv');
  assert.equal(result.headerReview.duplicateHeaderLabels,1);
  assert.equal(result.headerReview.amountCandidates,2);
  assert.equal(result.headerReview.requiresReview,true);
  assert.ok(result.warnings.some(x=>x.includes('repeated nonempty column label')));
  assert.equal(result.transactions[0].amount,'-9.99');
  assert.ok(!JSON.stringify(result.headerReview).includes('Secret merchant'));
  assert.ok(!JSON.stringify(result.headerReview).includes('999.99'));
  assert.deepEqual(csvHeaderReview(['Date','Description','Amount']),
    {duplicateHeaderLabels:0,dateCandidates:1,amountCandidates:1,requiresReview:false});
});
test('ordinary CSV with unrelated extra columns does not produce false header ambiguity warnings',()=>{
  const source='Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #\n'+
    'DEBIT,2026-11-04,Synthetic item,-20.00,DEBIT_CARD,1954.80,1042\n';
  const parsed=csvTransactions(parseCSV(source));
  assert.deepEqual(parsed.headerReview,{duplicateHeaderLabels:0,dateCandidates:1,amountCandidates:1,requiresReview:false});
  assert.ok(!parsed.warnings.some(x=>x.includes('possible signed Amount columns')));
  assert.equal(parsed.transactions[0].amount,'-20.00');
});
test('CSV physical line metadata survives multiline quoted descriptions and CR, LF, CRLF boundaries',()=>{
  for(const lineEnd of ['\n','\r','\r\n']){
    const source=['Date,Description,Amount',
      '2026-11-04,"Two'+lineEnd+'source lines",-4.00',
      '2026-11-05,Invalid amount,SECRET-ACCOUNT-VALUE'].join(lineEnd)+lineEnd;
    const rows=parseCSV(source);
    assert.equal(rows.length,3);
    assert.equal(rows[1].sourceLine,2);
    assert.equal(rows[2].sourceLine,4);
    assert.deepEqual(rows[1],['2026-11-04','Two'+lineEnd+'source lines','-4.00']);
    assert.equal(JSON.stringify(rows).includes('sourceLine'),false);
    assert.throws(()=>csvTransactions(rows),e=>{
      assert.match(e.message,/CSV row 3: Invalid amount format/);
      assert.match(e.message,/Source file line 4/);
      assert.ok(!e.message.includes('SECRET-ACCOUNT-VALUE'),'unparsed money not repeated in error message');
      return true;
    });
  }
});
test('CSV direct row API rejects missing or added trailing financial fields before partial export',()=>{
  for(const rows of [
    [['Date','Description','Amount'],['2026-11-04','Good','5.00'],['2026-11-05','Missing']],
    [['Date','Description','Amount'],['2026-11-04','Good','5.00','Unexpected extra']],
    [['Date','Description','Amount'],['2026-11-04','Good','5.00'],null]
  ]){
    assert.throws(()=>csvTransactions(rows),/CSV row \d+: expected 3 columns/);
  }
});
