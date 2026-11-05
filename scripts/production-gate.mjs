/**
 * Explicit owner release gate. Neither a configured custom domain nor synthetic
 * tests can automatically turn real-bank compatibility claims into SEO pages.
 * A manually-approved, public, owner-reviewed UAT case is required per route.
 */
import {validatePublicRegistry} from './uat-evidence.mjs';

function insist(value,message){if(!value)throw Error('Production release gate: '+message);}
const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
const exactDate=s=>{
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const day=new Date(s+'T00:00:00Z');
  return !Number.isNaN(day.getTime())&&day.toISOString().slice(0,10)===s;
};

/**
 * Competitor-generated QBO is suitable as an independent READ-PATH data
 * compatibility check, never as bank-issued original UAT or a successful
 * QuickBooks target import. Evidence is fixture-hash tested by CI.
 */
export function validateCompetitorReadEvidence(comp){
  insist(comp&&comp.schema_version===1&&Array.isArray(comp.cases),
    'independent competitor evidence registry required');
  insist(comp.description==='Independently downloaded competitor-generated fictional QBO evidence for source-specific read-only conversion; NOT actual QuickBooks import or bank issuer certification.',
    'competitor registry scope must be explicit');
  insist(Object.keys(comp).every(k=>['schema_version','description','cases'].includes(k)),
    'unexpected competitor registry field');
  const seen=new Set();
  const keys=['case_id','competitor_name','competitor_url','verified_at','github_run_url',
    'input_sha256','downloaded_qbo_sha256','downloaded_qbo_bytes','source_transaction_count',
    'source_net_cents','fixture_path','verified_routes','dates_and_amounts_match',
    'csv_wire_reconciled','xlsx_wire_reconciled','source_data_fictional',
    'real_bank_original_used','actual_quickbooks_import_observed','outgoing_csv_to_qbo_verified'];
  for(const c of comp.cases){
    insist(c&&typeof c==='object'&&!Array.isArray(c)&&Object.keys(c).every(k=>keys.includes(k)),
      'invalid competitor evidence entry');
    insist(/^[a-z][a-z0-9-]{5,79}$/.test(c.case_id||'')&&!seen.has(c.case_id),
      'invalid/duplicate competitor case id');
    seen.add(c.case_id);
    insist(typeof c.competitor_name==='string'&&c.competitor_name.length>2&&
      typeof c.competitor_url==='string'&&/^https:\/\/[a-z0-9.-]+\/.+/.test(c.competitor_url),
      'invalid public competitor reference');
    insist(exactDate(c.verified_at)&&
      /^https:\/\/github\.com\/garrison2025\/CSV-QBO\/actions\/runs\/[1-9]\d*$/.test(c.github_run_url),
      'invalid independently observed CI run');
    insist(/^[0-9a-f]{64}$/.test(c.input_sha256)&&/^[0-9a-f]{64}$/.test(c.downloaded_qbo_sha256)&&
      Number.isSafeInteger(c.downloaded_qbo_bytes)&&c.downloaded_qbo_bytes>100&&
      c.downloaded_qbo_bytes<=8*1024*1024,'invalid downloaded QBO digest/size');
    insist(Number.isSafeInteger(c.source_transaction_count)&&c.source_transaction_count>=2&&
      /^-?(0|[1-9]\d*)$/.test(c.source_net_cents),'invalid comparator row count or exact net cents');
    insist(/^tests\/fixtures\/[a-z0-9-]+\.base64$/.test(c.fixture_path||''),
      'competitor fixture must be persisted in tests/fixtures');
    insist(Array.isArray(c.verified_routes)&&c.verified_routes.length>0&&
      new Set(c.verified_routes).size===c.verified_routes.length&&
      c.verified_routes.every(x=>['qbo-to-csv','qbo-to-excel'].includes(x)),
      'only compared QBO read routes may use this competitor evidence');
    insist(c.dates_and_amounts_match===true&&c.csv_wire_reconciled===true&&
      c.xlsx_wire_reconciled===true&&c.source_data_fictional===true,
      'all independent competitor read evidence checks must pass');
    insist(c.real_bank_original_used===false&&c.actual_quickbooks_import_observed===false&&
      c.outgoing_csv_to_qbo_verified===false,
      'competitor evidence cannot claim a bank original, QuickBooks import or outgoing QBO writer');
  }
  return true;
}
export function assessProductionRelease({approval,registry,competitorEvidence={schema_version:1,description:'Independently downloaded competitor-generated fictional QBO evidence for source-specific read-only conversion; NOT actual QuickBooks import or bank issuer certification.',cases:[]},tools,siteUrl='',publishSeo=false}){
  validatePublicRegistry(registry);
  validateCompetitorReadEvidence(competitorEvidence);
  insist(approval&&typeof approval==='object'&&!Array.isArray(approval),'approval configuration required');
  const keys=['schema_version','approved','approved_routes','reviewed_at','reviewer','notes'];
  insist(Object.keys(approval).every(k=>keys.includes(k)),'unexpected release metadata');
  insist(approval.schema_version===1&&typeof approval.approved==='boolean','invalid approval schema');
  insist(Array.isArray(approval.approved_routes)&&approval.approved_routes.every(s=>typeof s==='string'),
    'approved_routes must be an array of route slugs');
  insist(new Set(approval.approved_routes).size===approval.approved_routes.length,'duplicate route approvals');
  insist(typeof approval.notes==='string'&&approval.notes.length<=300,'brief release notes required');
  insist(Array.isArray(tools),'tool registry required');
  const bySlug=new Map(tools.map(t=>[t.slug,t]));
  let routes=[];
  if(approval.approved){
    insist(exactDate(approval.reviewed_at),'owner review date required');
    insist(typeof approval.reviewer==='string'&&approval.reviewer.trim().length>=2&&approval.reviewer.length<=80,'owner reviewer required');
    insist(approval.approved_routes.length>0,'at least one independently accepted route needed');
    for(const slug of approval.approved_routes){
      const tool=bySlug.get(slug);
      insist(Boolean(tool),'unknown route '+slug);
      insist(tool.release==='read_only_tested','experimental/non-read-only route not approved '+slug);
      insist(Number.isInteger(tool.kd)&&tool.kd>=0&&tool.kd<=29,'only reviewed KD<=29 routes qualify '+slug);
      const acceptedRealBank=registry.cases.some(c=>
        c.route_slug===slug&&c.evidence_scope==='real_bank_read_only'&&c.review_state==='owner_reviewed'
      );
      const acceptedCompetitor=competitorEvidence.cases.some(c=>c.verified_routes.includes(slug));
      insist(acceptedRealBank||acceptedCompetitor,
        'no owner-reviewed real-bank source evidence or independently verified competitor read evidence for '+slug);
      routes.push(slug);
    }
  }else{
    insist(approval.approved_routes.length===0,'unapproved release must contain zero routes');
    insist(approval.reviewed_at===null&&approval.reviewer===null,'unapproved release cannot claim reviewer signoff');
  }
  const raw=String(siteUrl??'').replace(/\/$/,'');
  let url=null;
  if(raw){try{url=new URL(raw);}catch{insist(false,'SITE_URL must be a valid URL');}}
  const isCustomHttps=Boolean(url&&url.protocol==='https:'&&url.hostname!=='localhost'&&
    url.hostname!=='127.0.0.1'&&!url.hostname.endsWith('.pages.dev')&&!url.hostname.endsWith('.example')&&!url.hostname.endsWith('.test'));
  const production=Boolean(publishSeo===true&&isCustomHttps&&approval.approved&&routes.length);
  return {
    production,
    routes:production?routes:[],
    publishRequested:publishSeo===true,
    evidenceCaseCount:registry.cases.length,
    competitorEvidenceCaseCount:competitorEvidence.cases.length,
    evidenceScope:production&&registry.cases.length===0?'independent_competitor_generated_synthetic_qbo_read':production?'real_bank_or_competitor_approved':'preview',
    releaseReason:production?(registry.cases.length?'manually_approved_real_bank_evidence':'manually_approved_competitor_read_evidence'):'unapproved_or_preview_noindex'
  };
}
