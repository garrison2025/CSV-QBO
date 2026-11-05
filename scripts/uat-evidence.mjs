/**
 * Real-bank UAT evidence gate. This module validates *human-observed* facts:
 * it cannot independently authenticate a bank export or QuickBooks UI.
 * Private evidence is never committed; only an allow-listed public summary is.
 */
import fs from 'node:fs';
import {createHash} from 'node:crypto';

export const directions = Object.freeze({
  'qbo-to-csv': ['qbo','csv','read'],
  'qbo-to-excel': ['qbo','xlsx','read'],
  'qif-to-csv': ['qif','csv','read'],
  'qif-to-excel': ['qif','xlsx','read'],
  'iif-to-csv': ['iif','csv','read'],
  'iif-to-excel': ['iif','xlsx','read'],
  'ofx-to-csv': ['ofx','csv','read'],
  'ofx-to-excel': ['ofx','xlsx','read'],
  'qfx-to-csv': ['qfx','csv','read'],
  'qfx-to-excel': ['qfx','xlsx','read'],
  'quickbooks-csv-formatter': ['csv','qb-csv','import'],
  'csv-to-qif': ['csv','qif','import']
});
const hex64=/^[a-f0-9]{64}$/i;
const date=/^\d{4}-\d{2}-\d{2}$/;
const safeId=/^[a-z0-9][a-z0-9-]{5,63}$/;
const shortLabel=/^[\p{L}\p{N}][\p{L}\p{N} ._&()/+-]{1,79}$/u;
const cents=/^-?(0|[1-9]\d*)$/;
const validInt=n=>Number.isSafeInteger(n)&&n>0&&n<=1000000;
function assert(ok,msg){if(!ok)throw new Error(msg);}
function nonempty(v,min=2,max=160){return typeof v==='string'&&v.trim().length>=min&&v.trim().length<=max;}
function checkTimestamp(v){return typeof v==='string'&&date.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'));}
function checkMoney(v){return typeof v==='string'&&cents.test(v)&&v.length<24;}
function noUnknownKeys(v,keys,where){for(const key of Object.keys(v))assert(keys.includes(key),where+': unexpected key '+key);}

export function validatePrivateCase(c){
  assert(c&&typeof c==='object'&&!Array.isArray(c),'UAT case must be an object');
  assert(safeId.test(c.case_id||''),'Invalid case_id');
  const spec=directions[c.route_slug];
  assert(Boolean(spec),'Unknown or unreleased route '+c.route_slug);
  assert(c.input_format===spec[0]&&c.output_format===spec[1],'Route input/output mismatch');
  assert(c.source_kind==='real_bank_export','Synthetic samples are not real-bank evidence');
  assert(c.owner_authorized===true&&c.redaction_reviewed===true,'Explicit source permission and redaction review required');
  assert(nonempty(c.public_bank_label,2,80)&&shortLabel.test(c.public_bank_label),'Public bank label must be approved and non-sensitive');
  assert(nonempty(c.source_variant,8,160),'Identify the tested bank export variant');
  assert(nonempty(c.region,2,32)&&/^[A-Z]{2,3}$/.test(c.region),'Use two/three-letter country code');
  assert(hex64.test(c.source_sha256||'')&&hex64.test(c.output_sha256||''),'Source and converted-file SHA-256 hashes required');
  for(const name of ['expected_rows','parsed_rows','exported_rows'])assert(validInt(c[name]),name+' must be a positive integer');
  assert(c.expected_rows===c.parsed_rows&&c.parsed_rows===c.exported_rows,'Count reconciliation failed');
  for(const name of ['expected_net_cents','parsed_net_cents','exported_net_cents'])assert(checkMoney(c[name]),name+' must be exact integer-cents string');
  assert(c.expected_net_cents===c.parsed_net_cents&&c.parsed_net_cents===c.exported_net_cents,'Signed cents reconciliation failed');
  assert(c.source_order_fields_match===true,'Source order, dates, signed amounts, descriptions and references must be checked line-by-line');
  assert(checkTimestamp(c.tested_at),'Valid test date required');
  assert(nonempty(c.parser_commit,7,40)&&/^[a-f0-9]{7,40}$/i.test(c.parser_commit),'Real parser Git SHA required');
  assert(nonempty(c.operator_code,2,80)&&nonempty(c.reviewer_code,2,80),'Operator and reviewer codes required');
  assert(c.owner_approved===true,'Manual evidence review/sign-off required');
  assert(typeof c.private_evidence_location==='string'&&c.private_evidence_location.startsWith('private:/'),'Evidence must be held outside public repository');
  assert(c.screenshot_redacted===true,'Screenshots and logs must be reviewed for private bank/account details');
  if(spec[2]==='import'){
    assert(c.target_product===(c.route_slug==='quickbooks-csv-formatter'?'QuickBooks Online':'Quicken'),'Wrong target application');
    assert(nonempty(c.target_version,2,100)&&nonempty(c.target_account_type,2,80),'Target software version and account type required');
    assert(c.target_import_result==='accepted_and_reconciled','Manual import success and transaction reconciliation required');
    assert(c.imported_rows===c.expected_rows,'Actual imported row count mismatch');
    assert(checkMoney(c.imported_net_cents)&&c.imported_net_cents===c.expected_net_cents,'Actual imported signed cents mismatch');
    assert(['no_new_duplicates','duplicates_possible_documented'].includes(c.reimport_result),'Repeated-import behavior must be tested and documented');
  }else{
    assert(c.target_product==='not_applicable'&&c.target_import_result==='not_applicable','Read-only export is not a QuickBooks import certification');
    assert(c.imported_rows===null&&c.imported_net_cents===null&&c.reimport_result==='not_applicable','Read-only import evidence must be not applicable');
  }
  return true;
}

export function makePublicRegistry(privateRegistry){
  assert(privateRegistry?.schema_version===1&&Array.isArray(privateRegistry.cases),'Private UAT registry version 1 required');
  const ids=new Set();
  const cases=privateRegistry.cases.map(c=>{
    validatePrivateCase(c);
    assert(!ids.has(c.case_id),'Duplicate UAT case id');ids.add(c.case_id);
    const spec=directions[c.route_slug];
    return {
      case_id:c.case_id,route_slug:c.route_slug,public_bank_label:c.public_bank_label,
      source_variant:c.source_variant,region:c.region,input_format:c.input_format,
      output_format:c.output_format,parser_commit:c.parser_commit,tested_at:c.tested_at,
      evidence_digest:createHash('sha256').update(JSON.stringify(c)).digest('hex'),
      evidence_scope:spec[2]==='read'?'real_bank_read_only':'target_import_observed',
      target_product:c.target_product,
      target_version:spec[2]==='import'?c.target_version:'not_applicable',
      reimport_result:c.reimport_result,
      review_state:'owner_reviewed'
    };
  });
  return {schema_version:1,description:'Owner-reviewed UAT evidence summaries only; no transaction data',cases};
}

export function validatePublicRegistry(registry){
  assert(registry?.schema_version===1&&Array.isArray(registry.cases),'Public UAT registry version 1 required');
  noUnknownKeys(registry,['schema_version','description','cases'],'public registry');
  assert(registry.description==='Owner-reviewed UAT evidence summaries only; no transaction data','Public registry description must remain fixed');
  const ids=new Set();
  const keys=['case_id','route_slug','public_bank_label','source_variant','region','input_format','output_format','parser_commit','tested_at','evidence_digest','evidence_scope','target_product','target_version','reimport_result','review_state'];
  for(const c of registry.cases){
    assert(c&&typeof c==='object'&&!Array.isArray(c),'Invalid public UAT case');
    noUnknownKeys(c,keys,c.case_id||'UAT case');
    assert(safeId.test(c.case_id||'')&&!ids.has(c.case_id),'Missing/duplicate public UAT ID');ids.add(c.case_id);
    const spec=directions[c.route_slug];
    assert(Boolean(spec)&&c.input_format===spec[0]&&c.output_format===spec[1],'Unsupported public UAT direction');
    assert(shortLabel.test(c.public_bank_label||'')&&nonempty(c.source_variant,8,160),'Invalid public bank label/variant');
    assert(/^[A-Z]{2,3}$/.test(c.region||'')&&checkTimestamp(c.tested_at),'Invalid public location/date');
    assert(/^[a-f0-9]{7,40}$/i.test(c.parser_commit||'')&&hex64.test(c.evidence_digest||''),'Evidence digest and parser commit required');
    assert(c.review_state==='owner_reviewed','Unreviewed evidence cannot be published');
    const isImport=spec[2]==='import';
    assert(c.evidence_scope===(isImport?'target_import_observed':'real_bank_read_only'),'Public evidence scope mismatch');
    assert(c.target_product===(isImport?(c.route_slug==='quickbooks-csv-formatter'?'QuickBooks Online':'Quicken'):'not_applicable'),'Target product mismatch');
    assert(isImport?nonempty(c.target_version,2,100):c.target_version==='not_applicable','Missing target version');
    assert(isImport?['no_new_duplicates','duplicates_possible_documented'].includes(c.reimport_result):c.reimport_result==='not_applicable','Missing repeated-import result');
  }
  return true;
}
export function summarizeRegistry(registry){
  validatePublicRegistry(registry);
  const counts={};
  for(const c of registry.cases){
    if(!counts[c.route_slug])counts[c.route_slug]={real_bank_read_only:0,target_import_observed:0};
    counts[c.route_slug][c.evidence_scope]++;
  }
  return {total:registry.cases.length,byRoute:counts,realBankRead:registry.cases.filter(x=>x.evidence_scope==='real_bank_read_only').length,targetImports:registry.cases.filter(x=>x.evidence_scope==='target_import_observed').length};
}
if(process.argv[1]&&/uat-evidence\.mjs$/.test(process.argv[1])){
  const [action,path]=process.argv.slice(2);
  try{
    assert(path,'Usage: node scripts/uat-evidence.mjs check-private|export-public|check-public <json-file>');
    const parsed=JSON.parse(fs.readFileSync(path,'utf8'));
    if(action==='check-private'){makePublicRegistry(parsed);process.stdout.write('Private UAT evidence validated (manual authenticity still requires review).\n');}
    else if(action==='export-public'){process.stdout.write(JSON.stringify(makePublicRegistry(parsed),null,2)+'\n');}
    else if(action==='check-public'){const stats=summarizeRegistry(parsed);process.stdout.write('Public UAT cases: '+stats.total+'; target imports: '+stats.targetImports+'\n');}
    else throw Error('Unknown UAT action');
  }catch(e){process.stderr.write('UAT evidence gate: '+e.message+'\n');process.exitCode=1;}
}
