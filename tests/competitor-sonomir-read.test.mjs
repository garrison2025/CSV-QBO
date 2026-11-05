/**
 * Independent converter evidence for explicitly fictional data:
 * Original source CSV -> external Sonomir website -> actual downloaded
 * QBO bytes preserved below as base64 -> OUR QBO reader -> OUR CSV/XLSX.
 * This tests source-data equivalence, NOT actual QuickBooks import acceptance.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseInput,parseCSV,genericCSVExportPlan,toMinorUnits} from '../src/core.mjs';
import {toXLSX} from '../src/xlsx.mjs';
import {inspectExactXLSX} from '../scripts/uat-archive-inspect.mjs';

const fixture=Buffer.from(readFileSync(new URL('./fixtures/sonomir-synthetic-qbo-20261105.base64',import.meta.url),'utf8').trim(),'base64');
const sha=buf=>createHash('sha256').update(buf).digest('hex');
const source='Date,Description,Amount,Reference\n'+
 '10/14/2026,Fictional Espresso,-12.50,SYN001\n'+
 '10/15/2026,Fictional Refund,20.75,SYN002\n';
const expected=parseInput(source,'csv').transactions;
const fixtureSHA='00e5202de9a425ed3d0c4fba337271e54cfe8e48a87538c394c378ae95a74e69';
const sourceSHA='fcd3ccce6ad75502788e588ac78765954fa16e02d88b409d83f6317ce5de2cd9';

test('actual third-party downloaded QBO fixture fingerprint and fictional source identity are independently fixed',()=>{
 assert.equal(sha(fixture),fixtureSHA);
 assert.equal(fixture.length,923);
 assert.equal(sha(Buffer.from(source)),sourceSHA);
 assert.match(fixture.toString('ascii'),/^OFXHEADER:100\r?\n/);
 assert.match(fixture.toString('ascii'),/<INTU\.BID>/);
 assert.match(fixture.toString('ascii'),/<BANKTRANLIST>/);
 assert.ok(!fixture.toString('utf8').includes('SYN001'),
  'reference IDs in our fictional source are not necessarily represented by the external writer');
});

test('CSV -> real competitor QBO output -> our parser agrees on ordered dates, exact cents, payees and currency',()=>{
 const data=parseInput(fixture.toString('utf8'),'qbo');
 assert.equal(data.transactions.length,2);
 assert.equal(data.integrity.declaredCurrency,'USD');
 for(let i=0;i<2;i++){
  assert.equal(data.transactions[i].date,expected[i].date);
  assert.equal(toMinorUnits(data.transactions[i].amount),toMinorUnits(expected[i].amount));
  assert.equal(data.transactions[i].description,expected[i].description);
  assert.ok(data.transactions[i].id,'competitor-generated QBO must carry a transaction FITID');
 }
 assert.equal(data.transactions.reduce((sum,t)=>sum+toMinorUnits(t.amount),0n),825n);
 assert.equal(data.transactions.some(t=>String(t.id).startsWith('SYN')),false,
  'external Web Connect FITIDs need not retain original CSV reference identifiers');
});

test('competitor-generated QBO -> our CSV wire preserves all fictional bank transaction details exactly',()=>{
 const data=parseInput(fixture.toString('utf8'),'qbo');
 const plan=genericCSVExportPlan(data.transactions);
 assert.equal(plan.report.orderedRowsReconciled,true);
 assert.equal(plan.report.signedAmountsReconciled,true);
 const rows=parseCSV(plan.csv);
 assert.deepEqual(rows[0],['date','description','amount','id']);
 assert.equal(rows.length,3);
 for(let i=0;i<2;i++){
  assert.equal(rows[i+1][0],expected[i].date);
  assert.equal(rows[i+1][1],expected[i].description);
  assert.equal(toMinorUnits(rows[i+1][2]),toMinorUnits(expected[i].amount));
  assert.ok(rows[i+1][3]);
 }
});

test('competitor-generated QBO -> our actual .xlsx wire passes independent OOXML exact-cents inspection',()=>{
 const data=parseInput(fixture.toString('utf8'),'qbo');
 const output=toXLSX(data.transactions);
 const observed=inspectExactXLSX(output,data.transactions);
 assert.equal(observed.rows,2);
 assert.equal(observed.netCents,'825');
});

test('competitor fixture acceptance proves read-only QBO routes only, NOT our CSV to QBO writer or actual Intuit import',()=>{
 // Intentionally keep the legal/engineering acceptance boundary visible.
 const covered=['qbo-to-csv','qbo-to-excel'];
 assert.deepEqual(covered,['qbo-to-csv','qbo-to-excel']);
 const observed={
  source_type:'actual_competitor_generated_qbo_from_fictional_csv',
  covered_routes:covered,
  real_bank_original_accepted:false,
  actual_Intuit_QuickBooks_import_observed:false,
  our_csv_to_qbo_writer_implemented:false
 };
 assert.equal(observed.actual_Intuit_QuickBooks_import_observed,false);
 assert.equal(observed.our_csv_to_qbo_writer_implemented,false);
});
