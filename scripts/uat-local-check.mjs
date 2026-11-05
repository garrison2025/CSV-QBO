/**
 * Local-only real-file preflight, NOT bank authenticity proof or QuickBooks import.
 * Never sends bytes anywhere. Private draft must never be committed to Git.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {
  MAX_FILE_BYTES, decodeFinancialBytes, parseInput, parseQIF, parseCSV,
  validateGenericCSVExport, validateQuickBooksCSVParts, toMinorUnits
} from '../src/core.mjs';
import {directions} from './uat-evidence.mjs';
import {inspectExactXLSX,inspectQuickBooksZIP} from './uat-archive-inspect.mjs';

const REPO_ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const CSV_READ=new Set(['qbo-to-csv','qif-to-csv','iif-to-csv','ofx-to-csv','qfx-to-csv']);
const XLSX_READ=new Set(['qbo-to-excel','qif-to-excel','iif-to-excel','ofx-to-excel','qfx-to-excel']);
const IMPORT=new Set(['quickbooks-csv-formatter','csv-to-qif']);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function assert(cond,why){if(!cond)throw Error(why);}
function net(rows){return rows.reduce((total,t)=>total+toMinorUnits(t.amount),0n).toString();}
function readUTF8(bytes){
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
function sourceDecode(bytes,format){
  return decodeFinancialBytes(bytes,format).text;
}
function canonicalField(t,k){return k==='amount'?toMinorUnits(t.amount).toString():String(t[k]??'');}
function compareQIF(source,output){
  const records=parseQIF(output,'us').transactions;
  assert(records.length===source.length,'QIF export row count mismatch');
  for(let i=0;i<source.length;i++){
    for(const k of ['date','amount','description','id','memo']){
      assert(canonicalField(source[i],k)===canonicalField(records[i],k),'QIF field/order mismatch at row '+(i+1)+': '+k);
    }
  }
  return records;
}
function csvTotals(wire,col){
  return parseCSV(wire).slice(1).reduce((sum,row)=>sum+toMinorUnits(row[col]),0n).toString();
}
function explicitCSVMapping(mapping,header){
  assert(mapping&&typeof mapping==='object'&&!Array.isArray(mapping),'CSV bank source requires explicit column positions; never guess for UAT');
  const required=['date','description','amount','debit','credit','id','memo'];
  assert(Object.keys(mapping).length===required.length&&Object.keys(mapping).every(k=>required.includes(k)),'CSV mapping must list exactly date, description, amount, debit, credit, id, memo');
  for(const field of required)assert(Number.isInteger(mapping[field])&&mapping[field]>=-1&&mapping[field]<header.length,'Invalid source column position: '+field);
  assert(mapping.date>=0&&mapping.description>=0,'Date and Description mapping required');
  assert(mapping.amount>=0?mapping.debit===-1&&mapping.credit===-1:mapping.debit>=0&&mapping.credit>=0,'Select Amount OR Debit/Credit explicitly');
}
export function reconcileLocalPair({route_slug,source_bytes,output_bytes,mapping,date_format='us',expected_rows=null,expected_net_cents=null}){
  const spec=directions[route_slug];
  assert(spec,'Unsupported UAT route');
  assert(CSV_READ.has(route_slug)||XLSX_READ.has(route_slug)||IMPORT.has(route_slug),'Local checker does not support this route');
  assert(['us','eu'].includes(date_format),'Choose explicit source date order: us or eu');
  const input=Buffer.from(source_bytes??[]),output=Buffer.from(output_bytes??[]);
  assert(input.length&&input.length<=MAX_FILE_BYTES,'Source file size outside browser limits');
  assert(output.length&&output.length<=32*1024*1024,'Output file size outside local validation limits');
  const srcText=sourceDecode(input,spec[0]);
  if(spec[0]==='csv'){
    const data=parseCSV(srcText);
    explicitCSVMapping(mapping,data[0]);
  }
  const parsed=parseInput(srcText,spec[0],{mapping,dateFormat:date_format});
  const original=parsed.transactions;
  assert(original.length>0,'Source has no supported transactions');
  if(expected_rows!==null)assert(Number.isSafeInteger(expected_rows)&&expected_rows===original.length,'Independent bank source row count mismatch');
  const inputNet=net(original);
  if(expected_net_cents!==null){
    assert(typeof expected_net_cents==='string'&&/^-?\d+$/.test(expected_net_cents),'Expected net must be integer minor-unit string');
    assert(expected_net_cents===inputNet,'Independent bank source signed-cent total mismatch');
  }
  let exported=[],limitation=null,notes=[];
  if(XLSX_READ.has(route_slug)){
    const checked=inspectExactXLSX(output,original);
    assert(checked.netCents===inputNet,'XLSX exact signed-cent net differs from bank source');
    exported=Array.from({length:checked.rows});
    if(route_slug==='iif-to-excel'){
      limitation='IIF TRNS summaries only: SPL account allocations not represented';
      notes.push('IIF TRNS amount and payee checked, not a reconstructed accounting ledger');
    }
  }else if(CSV_READ.has(route_slug)){
    const outputText=readUTF8(output);
    const header=parseCSV(outputText)[0];
    const memo=header.length===5;
    const checked=validateGenericCSVExport(original,outputText,{includeMemo:memo});
    assert(checked.memoRowsOmitted===0,'Source Memo rows were omitted: download CSV with Memo column');
    const rows=parseCSV(outputText);
    exported=rows.slice(1).map(r=>({date:r[0],description:r[1],amount:r[2],id:r[3],memo:memo?r[4]:''}));
    assert(csvTotals(outputText,2)===inputNet,'CSV signed-cent sum mismatch');
    if(route_slug==='iif-to-csv'){
      limitation='IIF TRNS summary ONLY, not SPL allocation or full ledger';
      notes.push('IIF SPL account allocations are deliberately not exported; never infer an import-ready ledger');
    }
  }else if(route_slug==='quickbooks-csv-formatter'){
    if(output[0]===0x50&&output[1]===0x4b){
      const checked=inspectQuickBooksZIP(output,original);
      assert(checked.netCents===inputNet,'QuickBooks ZIP signed-cent net mismatch');
      exported=Array.from({length:checked.rows});
      notes.push('Compared '+checked.parts+' independent QuickBooks CSV files and the packaged validation manifest');
    }else{
      const outputText=readUTF8(output);
      validateQuickBooksCSVParts(original,[outputText]);
      const rows=parseCSV(outputText);
      exported=rows.slice(1).map(r=>({date:r[0],description:r[1],amount:r[2]}));
      assert(csvTotals(outputText,2)===inputNet,'QuickBooks CSV signed-cent sum mismatch');
    }
    limitation='QuickBooks Online 3-column manual upload, NOT Web Connect .qbo';
    notes.push('Reference IDs/Memo are not represented in three-column QuickBooks CSV; check import behavior manually');
  }else{
    const outputText=readUTF8(output);
    exported=compareQIF(original,outputText);
    assert(net(exported)===inputNet,'QIF signed-cent sum mismatch');
    limitation='QIF syntax only; target application import not observed';
  }
  assert(exported.length===original.length,'Exported record count mismatch');
  return {
    status:'local_cross_file_preflight_only',
    route_slug,input_format:spec[0],output_format:spec[1],
    source_sha256:sha(input),output_sha256:sha(output),
    parsed_rows:original.length,exported_rows:exported.length,
    parsed_net_cents:inputNet,exported_net_cents:inputNet,
    independent_bank_row_total_checked:expected_rows!==null,
    independent_bank_net_total_checked:expected_net_cents!==null,
    target_import_observed:false,source_authenticity_verified:false,
    limitation,notes
  };
}
export function createPrivateDraft(preflight,{parser_commit='REPLACE_WITH_ACTUAL_GIT_SHA',tested_at=new Date().toISOString().slice(0,10),private_evidence_location='private:/review-required'}={}){
  const target=preflight.route_slug==='quickbooks-csv-formatter'?'QuickBooks Online':
    preflight.route_slug==='csv-to-qif'?'Quicken':'not_applicable';
  return {
    schema_version:1,cases:[{
      case_id:'pending-owner-review',route_slug:preflight.route_slug,
      input_format:preflight.input_format,output_format:preflight.output_format,
      source_kind:'PENDING_AUTHENTICITY_REVIEW',
      owner_authorized:false,redaction_reviewed:false,
      public_bank_label:'REPLACE_WITH_APPROVED_LABEL',
      source_variant:'REPLACE_WITH_ACTUAL_BANK_EXPORT_DIALECT',region:'US',
      source_sha256:preflight.source_sha256,output_sha256:preflight.output_sha256,
      expected_rows:null,parsed_rows:preflight.parsed_rows,exported_rows:preflight.exported_rows,
      expected_net_cents:null,parsed_net_cents:preflight.parsed_net_cents,exported_net_cents:preflight.exported_net_cents,
      source_order_fields_match:false,parser_commit,tested_at,
      operator_code:'REVIEW_REQUIRED',reviewer_code:'REVIEW_REQUIRED',owner_approved:false,
      private_evidence_location,screenshot_redacted:false,
      target_product:target,
      target_version:target==='not_applicable'?'not_applicable':'NOT_RUN',
      target_account_type:target==='not_applicable'?'not_applicable':'NOT_RUN',
      target_import_result:target==='not_applicable'?'not_applicable':'NOT_RUN',
      imported_rows:null,imported_net_cents:null,
      reimport_result:target==='not_applicable'?'not_applicable':'NOT_RUN'
    }],
    local_preflight:{
      status:'LOCAL_ONLY_NOT_ACCEPTANCE',
      independent_bank_row_total_checked:preflight.independent_bank_row_total_checked,
      independent_bank_net_total_checked:preflight.independent_bank_net_total_checked,
      limitation:preflight.limitation,
      notes:preflight.notes
    }
  };
}

function safePath(ref){
  assert(typeof ref==='string'&&ref.trim().length>0,'Missing private filesystem path');
  const resolved=path.resolve(ref);
  const relative=path.relative(REPO_ROOT,resolved);
  assert(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative),'Bank data, configs and evidence MUST be outside the repository');
  return resolved;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const manifestFile=safePath(process.argv[2]);
    const cfg=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
    assert(cfg&&typeof cfg==='object'&&!Array.isArray(cfg),'Private manifest must be an object');
    for(const key of Object.keys(cfg)){
      assert(['route_slug','source_file','output_file','mapping','date_format','expected_rows','expected_net_cents','parser_commit','report_file'].includes(key),'Unknown manifest option: '+key);
    }
    const source=safePath(cfg.source_file),output=safePath(cfg.output_file),report=safePath(cfg.report_file);
    assert(source!==output&&report!==source&&report!==output,'Keep original, converted file and report separate');
    assert(!fs.existsSync(report),'Refusing to overwrite existing private UAT evidence');
    const checked=reconcileLocalPair({
      route_slug:cfg.route_slug,source_bytes:fs.readFileSync(source),output_bytes:fs.readFileSync(output),
      mapping:cfg.mapping,date_format:cfg.date_format,expected_rows:cfg.expected_rows??null,
      expected_net_cents:cfg.expected_net_cents??null
    });
    const draft=createPrivateDraft(checked,{parser_commit:cfg.parser_commit});
    fs.writeFileSync(report,JSON.stringify(draft,null,2)+'\n',{flag:'wx',mode:0o600});
    process.stdout.write('Local source/output reconciliation completed. PRIVATE draft created outside Git. Bank authenticity and destination import: NOT VERIFIED.\n');
  }catch{
    // Parser exceptions can contain financial values, file names or references.
    // Do not print raw exceptions to terminal logs, CI or bug reports.
    process.stderr.write('Local UAT preflight failed: check file paths, source format/mapping, row values and totals PRIVATELY. No approval recorded.\n');
    process.exitCode=1;
  }
}
