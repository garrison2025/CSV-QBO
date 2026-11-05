import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseInput,parseQIF,parseCSV,isoDate,totals,toQuickBooksCSV,
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
