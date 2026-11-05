import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileLocalPair,createPrivateDraft} from '../scripts/uat-local-check.mjs';
import {parseQIF,parseInput,genericCSVExportPlan,toQuickBooksCSV,toQIF} from '../src/core.mjs';
import {makePublicRegistry} from '../scripts/uat-evidence.mjs';

// These examples are ARTIFICIAL. None proves any bank or QuickBooks import worked.
const srcQIF='!Type:Bank\r\nD11/04/2026\r\nT-12.50\r\nPBooks\r\nNAB-1\r\nMShelf\r\n^\r\nD11/05/2026\r\nT120.00\r\nPRefund\r\nNAB-2\r\n^\r\n';
const srcCSV='Date,Description,Amount,Reference\r\n11/04/2026,Books,-12.50,AB-1\r\n11/05/2026,Refund,120.00,AB-2\r\n';
const mapping={date:0,description:1,amount:2,debit:-1,credit:-1,id:3,memo:-1};
const bytes=t=>Buffer.from(t,'utf8');
const txQIF=parseQIF(srcQIF).transactions;
const qbOutput=toQuickBooksCSV(parseInput(srcCSV,'csv',{mapping,dateFormat:'us'}).transactions);
test('compares actual separate QIF input bytes and CSV output bytes row-by-row, preserving Memo',()=>{
  const csv=genericCSVExportPlan(txQIF,{includeMemo:true}).csv;
  const result=reconcileLocalPair({route_slug:'qif-to-csv',source_bytes:bytes(srcQIF),output_bytes:bytes(csv),date_format:'us',expected_rows:2,expected_net_cents:'10750'});
  assert.equal(result.status,'local_cross_file_preflight_only');
  assert.equal(result.parsed_rows,2);
  assert.equal(result.exported_net_cents,'10750');
  assert.equal(result.independent_bank_net_total_checked,true);
  assert.equal(result.target_import_observed,false);
  assert.match(result.source_sha256,/^[a-f0-9]{64}$/);
});
test('rejects missing source Memo, changed text, and reordered rows even when net remains equal',()=>{
  const noMemo=genericCSVExportPlan(txQIF).csv;
  assert.throws(()=>reconcileLocalPair({route_slug:'qif-to-csv',source_bytes:bytes(srcQIF),output_bytes:bytes(noMemo)}),/Memo rows were omitted/);
  const good=genericCSVExportPlan(txQIF,{includeMemo:true}).csv;
  assert.throws(()=>reconcileLocalPair({route_slug:'qif-to-csv',source_bytes:bytes(srcQIF),output_bytes:bytes(good.replace('Books','Altered'))}),/changed or moved/);
  const rows=good.split('\r\n');
  [rows[1],rows[2]]=[rows[2],rows[1]];
  assert.throws(()=>reconcileLocalPair({route_slug:'qif-to-csv',source_bytes:bytes(srcQIF),output_bytes:bytes(rows.join('\r\n'))}),/changed or moved/);
});
test('compares QuickBooks Online 3-column CSV wires but never claims actual import',()=>{
  const v=reconcileLocalPair({route_slug:'quickbooks-csv-formatter',source_bytes:bytes(srcCSV),output_bytes:bytes(qbOutput),mapping,date_format:'us'});
  assert.equal(v.parsed_net_cents,'10750');
  assert.equal(v.output_format,'qb-csv');
  assert.equal(v.target_import_observed,false);
  assert.match(v.limitation,/NOT Web Connect/);
  const draft=createPrivateDraft(v,{parser_commit:'abcdef0123456789'});
  assert.equal(draft.cases[0].owner_approved,false);
  assert.equal(draft.cases[0].target_import_result,'NOT_RUN');
  assert.equal(draft.cases[0].source_kind,'PENDING_AUTHENTICITY_REVIEW');
  assert.equal(draft.cases[0].expected_rows,null);
  assert.throws(()=>makePublicRegistry(draft),/Synthetic samples are not real-bank evidence/);
});
test('rejects changed QuickBooks output signs, missing rows or column header',()=>{
  assert.throws(()=>reconcileLocalPair({route_slug:'quickbooks-csv-formatter',source_bytes:bytes(srcCSV),output_bytes:bytes(qbOutput.replace('-12.50','12.50')),mapping}),/mismatch/);
  assert.throws(()=>reconcileLocalPair({route_slug:'quickbooks-csv-formatter',source_bytes:bytes(srcCSV),output_bytes:bytes(qbOutput.replace('Date,Description,Amount','Date,Payee,Amount')),mapping}),/header/);
  assert.throws(()=>reconcileLocalPair({route_slug:'quickbooks-csv-formatter',source_bytes:bytes(srcCSV),output_bytes:bytes(qbOutput.replace(/11\/05\/2026[^\r\n]+/,'').replace(/\r\n\r\n/,'\r\n')),mapping}),/rows|mismatch/);
});
test('requires explicit CSV mapping and exact independent signed cents',()=>{
  assert.throws(()=>reconcileLocalPair({route_slug:'quickbooks-csv-formatter',source_bytes:bytes(srcCSV),output_bytes:bytes(qbOutput)}),/explicit column positions/);
  assert.throws(()=>reconcileLocalPair({route_slug:'quickbooks-csv-formatter',source_bytes:bytes(srcCSV),output_bytes:bytes(qbOutput),mapping,expected_net_cents:'-10750'}),/Independent bank source signed-cent/);
  assert.throws(()=>reconcileLocalPair({route_slug:'quickbooks-csv-formatter',source_bytes:bytes(srcCSV),output_bytes:bytes(qbOutput),mapping,expected_rows:1}),/Independent bank source row/);
});
test('QIF export comparison checks every date, signed cents, payee and reference',()=>{
  const tx=parseInput(srcCSV,'csv',{mapping}).transactions;
  const good=toQIF(tx);
  const v=reconcileLocalPair({route_slug:'csv-to-qif',source_bytes:bytes(srcCSV),output_bytes:bytes(good),mapping});
  assert.equal(v.exported_rows,2);
  assert.equal(v.target_import_observed,false);
  assert.throws(()=>reconcileLocalPair({route_slug:'csv-to-qif',source_bytes:bytes(srcCSV),output_bytes:bytes(good.replace('PBooks','PNot books')),mapping}),/QIF field\/order mismatch/);
});
test('rejects formats not implemented in the independent local verifier and wrong date setting',()=>{
  assert.throws(()=>reconcileLocalPair({route_slug:'qbo-to-excel',source_bytes:bytes(srcQIF),output_bytes:bytes(qbOutput)}),/XLSX requires separate independent inspection/);
  assert.throws(()=>reconcileLocalPair({route_slug:'csv-to-qbo',source_bytes:bytes(srcCSV),output_bytes:bytes(qbOutput),mapping}),/Unsupported UAT route/);
  assert.throws(()=>reconcileLocalPair({route_slug:'quickbooks-csv-formatter',source_bytes:bytes(srcCSV),output_bytes:bytes(qbOutput),mapping,date_format:'invalid'}),/explicit source date/);
});
