import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseInput,parseQIF,parseCSV,isoDate,totals,toQuickBooksCSV,
  guessMapping,csvColumnEvidence,suggestCSVDescriptionRemap,
  genericCSVExportPlan,validateQuickBooksCSVParts
} from '../src/core.mjs';
import {reconcileLocalPair} from '../scripts/uat-local-check.mjs';
import {externalSamples} from './external-bank-fixtures.mjs';

const b=s=>Buffer.from(s,'utf8');
test('externally-authored fixture provenance is separate from real bank acceptance',()=>{
  assert.equal(externalSamples.length,7);
  assert.equal(new Set(externalSamples.map(x=>x.source)).size,7);
  for(const s of externalSamples){
    assert.ok(s.source.startsWith('examples/'));
    assert.ok(s.count>0);
    assert.match(s.net,/^-?\d+\.\d{2}$/);
  }
});
for(const sample of externalSamples){
  test('independent vendor fixture: '+sample.name,()=>{
    const parsed=parseInput(sample.text,sample.input,{mapping:sample.mapping,dateFormat:'us'});
    assert.equal(parsed.transactions.length,sample.count,'hard-coded source expected count');
    assert.equal(totals(parsed.transactions).net,sample.net,'hard-coded source expected signed cents');
    assert.ok(parsed.transactions.every(r=>r.date.startsWith('2024-')));
    if(sample.input==='csv'){
      const csv=toQuickBooksCSV(parsed.transactions);
      const csvRows=parseCSV(csv);
      assert.deepEqual(csvRows[0],['Date','Description','Amount']);
      assert.equal(csvRows.length,sample.count+1);
      const preflight=reconcileLocalPair({
        route_slug:'quickbooks-csv-formatter',
        source_bytes:b(sample.text),output_bytes:b(csv),
        mapping:sample.mapping,date_format:'us',
        expected_rows:sample.count,
        expected_net_cents:BigInt(sample.net.replace('.','')).toString()
      });
      assert.equal(preflight.target_import_observed,false);
      assert.equal(preflight.source_authenticity_verified,false);
      assert.equal(preflight.parsed_rows,sample.count);
      assert.equal(preflight.output_format,'qb-csv');
      validateQuickBooksCSVParts(parsed.transactions,[csv]);
    }else{
      assert.equal(parsed.integrity.apostropheYearDates,1);
      assert.ok(parsed.warnings.some(w=>w.includes('apostrophe-year')));
      assert.ok(parsed.warnings.some(w=>w.includes('category/split')));
      assert.equal(parsed.transactions[3].date,'2024-03-15');
      assert.equal(parsed.transactions[1].amount,'1800.00');
      const csv=genericCSVExportPlan(parsed.transactions,{includeMemo:true}).csv;
      const result=reconcileLocalPair({
        route_slug:'qif-to-csv',source_bytes:b(sample.text),output_bytes:b(csv),
        date_format:'us',expected_rows:sample.count,expected_net_cents:'121351'
      });
      assert.equal(result.exported_rows,4);
      assert.equal(result.target_import_observed,false);
    }
  });
}
test('Wells Fargo-style blank Payee requires review and explicit Memo-to-Description mapping',()=>{
  const sample=externalSamples.find(s=>s.requiresExplicitDescriptionRemap);
  const guessed={...sample.mapping,description:3,memo:4};
  assert.throws(()=>parseInput(sample.text,'csv',{mapping:guessed,dateFormat:'us'}),/Description is empty/);
  assert.equal(parseInput(sample.text,'csv',{mapping:sample.mapping,dateFormat:'us'}).transactions[0].description,'GAS STATION 4471 PURCHASE AUTHORIZED');
});
test('credit-card signed amount output is not blindly reinterpreted as a bank debit',()=>{
  const cards=externalSamples.filter(s=>s.creditCardSignsNeedTargetReview);
  assert.equal(cards.length,3);
  const amex=cards.find(s=>s.name.startsWith('American Express'));
  const parsed=parseInput(amex.text,'csv',{mapping:amex.mapping});
  assert.equal(parsed.transactions[0].amount,'45.20');
  assert.equal(parsed.transactions[3].amount,'-250.00');
  // This is syntactic preservation, NOT evidence which signs the target
  // QuickBooks card account will expect. An actual import must verify that.
  assert.equal(toQuickBooksCSV(parsed.transactions).includes('02/01/2024,GAS STATION 4471,45.20'),true);
});
test('QIF apostrophe dates are converted only with explicit century marker',()=>{
  for(const pair of [["03/15'24",'2024-03-15'],["3/ 1' 8",'2008-03-01'],["12/31'99",'2099-12-31']]){
    const raw='!Type:Bank\nD'+pair[0]+'\nT-2.50\nPExample\n^\n';
    const parsed=parseQIF(raw);
    assert.equal(parsed.transactions[0].date,pair[1]);
    assert.equal(parsed.integrity.apostropheYearDates,1);
  }
  for(const ambiguous of ['03/15/24','03/15/99',"03/15'100","13/15'24","02/30'24"]){
    assert.throws(()=>parseQIF('!Type:Bank\nD'+ambiguous+'\nT-1.25\nPExample\n^\n'),/date|Invalid/);
  }
});

test('Wells-style empty Payee is detected from every transaction and only explicitly remapped to Memo',()=>{
  const sample=externalSamples.find(x=>x.requiresExplicitDescriptionRemap);
  const rows=parseCSV(sample.text),guessed=guessMapping(rows[0]);
  assert.equal(guessed.description,3);
  assert.equal(guessed.memo,4);
  const evidence=csvColumnEvidence(rows);
  assert.deepEqual(evidence.populated,[5,5,5,0,5]);
  assert.equal(evidence.rowCount,5);
  const recommendation=suggestCSVDescriptionRemap(evidence,guessed);
  assert.deepEqual(recommendation,{descriptionIndex:3,memoIndex:4,rowsChecked:5});
  assert.throws(()=>parseInput(sample.text,'csv',{mapping:guessed}),/Description is empty/);
  const explicit={...guessed,description:recommendation.memoIndex,memo:-1};
  const accepted=parseInput(sample.text,'csv',{mapping:explicit});
  assert.equal(accepted.transactions.length,5);
  assert.equal(accepted.transactions[0].description,'GAS STATION 4471 PURCHASE AUTHORIZED');
  assert.equal(accepted.transactions[0].memo,'');
  assert.equal(totals(accepted.transactions).net,'1119.22');
});
test('no suggestion unless every real row has populated Memo and empty selected Description',()=>{
  const rows=parseCSV('Date,Payee,Memo,Amount\n01/01/2024,,Note 1,-2.00\n01/02/2024,Primary,Note 2,10.00\n');
  const map=guessMapping(rows[0]);
  assert.equal(suggestCSVDescriptionRemap(csvColumnEvidence(rows),map),null);
  const partial=parseCSV('Date,Payee,Memo,Amount\n01/01/2024,,Note 1,-2.00\n01/02/2024,,,10.00\n');
  assert.equal(suggestCSVDescriptionRemap(csvColumnEvidence(partial),map),null);
  const alternate={...map,memo:-1};
  assert.equal(suggestCSVDescriptionRemap(csvColumnEvidence(rows),alternate),null);
  const genericMemo=parseCSV('Date,Payee,Remarks,Amount\n01/01/2024,,Note,-2.00\n');
  const remap={date:0,description:1,memo:2,amount:3,debit:-1,credit:-1,id:-1};
  assert.equal(suggestCSVDescriptionRemap(csvColumnEvidence(genericMemo),remap),null);
});
test('realistic posted and transaction date headers are recognized without inferring target account semantics',()=>{
  const rows=parseCSV('Trans. Date,Post Date,Description,Amount\n01/31/2024,02/01/2024,Purchase,10.00\n');
  const guessed=guessMapping(rows[0]);
  assert.equal(guessed.date,1,'posting date preferred for bank statement date by default');
  assert.equal(guessed.description,2);
  const parsed=parseInput('Trans. Date,Post Date,Description,Amount\n01/31/2024,02/01/2024,Purchase,10.00\n','csv',{mapping:guessed});
  assert.equal(parsed.transactions[0].date,'2024-02-01');
  assert.equal(guessMapping(['Check or Slip #']).id,0);
  assert.equal(guessMapping(['Credit Card Number']).id,-1,'do not misinterpret account number as transaction reference');
});
