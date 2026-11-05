import test from 'node:test';
import assert from 'node:assert/strict';
import {directions,validatePrivateCase,makePublicRegistry,validatePublicRegistry,summarizeRegistry} from '../scripts/uat-evidence.mjs';

const empty={schema_version:1,description:'Owner-reviewed UAT evidence summaries only; no transaction data',cases:[]};
const fakeHash='a'.repeat(64);
// Artificial-only fixture for testing evidence schema. NEVER publish as real source evidence.
function artificialCase(overrides={}){
  return {
    case_id:'artificial-uat-001',route_slug:'quickbooks-csv-formatter',
    input_format:'csv',output_format:'qb-csv',source_kind:'real_bank_export',
    owner_authorized:true,redaction_reviewed:true,public_bank_label:'Test Bank',
    source_variant:'Artificial CSV schema fixture for gate checks only',region:'US',
    source_sha256:fakeHash,output_sha256:'b'.repeat(64),
    expected_rows:2,parsed_rows:2,exported_rows:2,
    expected_net_cents:'-1250',parsed_net_cents:'-1250',exported_net_cents:'-1250',
    source_order_fields_match:true,parser_commit:'3172c8d',
    tested_at:'2026-11-05',operator_code:'operator-test',reviewer_code:'reviewer-test',
    owner_approved:true,private_evidence_location:'private:/fictional/test',
    screenshot_redacted:true,target_product:'QuickBooks Online',
    target_version:'US test setup',target_account_type:'test checking',
    target_import_result:'accepted_and_reconciled',
    imported_rows:2,imported_net_cents:'-1250',reimport_result:'duplicates_possible_documented',
    ...overrides
  };
}
test('fresh project has zero verified bank/import cases',()=>{
  assert.deepEqual(summarizeRegistry(empty),{total:0,byRoute:{},realBankRead:0,targetImports:0});
});
test('private records require explicitly reviewed genuine source evidence',()=>{
  assert.throws(()=>validatePrivateCase(artificialCase({source_kind:'synthetic_fixture'})),/Synthetic samples/);
  assert.throws(()=>validatePrivateCase(artificialCase({owner_approved:false})),/sign-off/);
  assert.throws(()=>validatePrivateCase(artificialCase({screenshot_redacted:false})),/Screenshots/);
});
test('actual imported count and amount must reconcile',()=>{
  assert.throws(()=>validatePrivateCase(artificialCase({imported_rows:1})),/imported row count/);
  assert.throws(()=>validatePrivateCase(artificialCase({imported_net_cents:'1250'})),/signed cents mismatch/);
  assert.throws(()=>validatePrivateCase(artificialCase({parsed_net_cents:'-1249'})),/Signed cents reconciliation/);
  assert.throws(()=>validatePrivateCase(artificialCase({source_order_fields_match:false})),/line-by-line/);
});
test('import cannot be verified with no observed repeat behavior, invalid route or missing file hash',()=>{
  assert.throws(()=>validatePrivateCase(artificialCase({reimport_result:'not_tested'})),/Repeated-import behavior/);
  assert.throws(()=>validatePrivateCase(artificialCase({route_slug:'csv-to-qbo'})),/Unknown or unreleased/);
  assert.throws(()=>validatePrivateCase(artificialCase({source_sha256:'n/a'})),/SHA-256/);
});
test('public summary contains only approved metadata, not source finances or raw file hashes',()=>{
  const registry=makePublicRegistry({schema_version:1,cases:[artificialCase()]});
  assert.equal(registry.cases[0].evidence_scope,'target_import_observed');
  validatePublicRegistry(registry);
  const publicWire=JSON.stringify(registry);
  for(const forbidden of ['source_sha256','output_sha256','expected_net_cents','private_evidence_location','imported_rows','source_order_fields_match','owner_authorized','-1250','operator-test']){
    assert.equal(publicWire.includes(forbidden),false,'leaked: '+forbidden);
  }
});
test('public registry rejects unreviewed, extraneous or invented compatible claims',()=>{
  const registry=makePublicRegistry({schema_version:1,cases:[artificialCase()]});
  assert.throws(()=>validatePublicRegistry({...registry,bank_account:'123456'}),/unexpected key/);
  assert.throws(()=>validatePublicRegistry({...registry,cases:[{...registry.cases[0],bank_account:'123456'}]}),/unexpected key/);
  assert.throws(()=>validatePublicRegistry({...registry,cases:[{...registry.cases[0],review_state:'pending'}]}),/Unreviewed/);
  assert.throws(()=>validatePublicRegistry({...registry,cases:[{...registry.cases[0],evidence_scope:'real_bank_read_only'}]}),/scope mismatch/);
  assert.throws(()=>validatePublicRegistry({...registry,cases:[registry.cases[0],registry.cases[0]]}),/duplicate public/);
});
test('read-only bank exports must not appear as target software imports',()=>{
  const c=artificialCase({route_slug:'qbo-to-csv',input_format:'qbo',output_format:'csv',
    target_product:'not_applicable',target_import_result:'not_applicable',
    imported_rows:null,imported_net_cents:null,reimport_result:'not_applicable'});
  assert.equal(validatePrivateCase(c),true);
  const r=makePublicRegistry({schema_version:1,cases:[c]});
  assert.equal(summarizeRegistry(r).realBankRead,1);
  assert.equal(summarizeRegistry(r).targetImports,0);
});
test('all accepted public routes correspond to a declared tool direction',()=>{
  assert.equal(Object.keys(directions).length,12);
});
