/**
 * Explicit owner release gate. Neither a configured custom domain nor synthetic
 * tests can automatically turn real-bank compatibility claims into SEO pages.
 * A manually-approved, public, owner-reviewed UAT case is required per route.
 */
import {validatePublicRegistry} from './uat-evidence.mjs';

function insist(value,message){if(!value)throw Error('Production release gate: '+message);}
const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
const exactDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&
  new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;

export function assessProductionRelease({approval,registry,tools,siteUrl='',publishSeo=false}){
  validatePublicRegistry(registry);
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
      insist(registry.cases.some(c=>
        c.route_slug===slug&&c.evidence_scope==='real_bank_read_only'&&c.review_state==='owner_reviewed'
      ),'no owner-reviewed real-bank source evidence for '+slug);
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
    releaseReason:production?'manually_approved_real_bank_evidence':'unapproved_or_preview_noindex'
  };
}
