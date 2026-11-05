import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessProductionRelease} from '../scripts/production-gate.mjs';
const approval=JSON.parse(readFileSync(new URL('../data/production-release.json',import.meta.url),'utf8'));
const registry=JSON.parse(readFileSync(new URL('../data/uat-public.json',import.meta.url),'utf8'));
const tools=JSON.parse(readFileSync(new URL('../data/tools.json',import.meta.url),'utf8'));

test('current published registry has no real-bank UAT and no SEO approvals',()=>{
  const result=assessProductionRelease({
    approval,registry,tools,siteUrl:'https://owned-finance-site.com',publishSeo:true
  });
  assert.equal(result.production,false);
  assert.deepEqual(result.routes,[]);
  assert.equal(result.evidenceCaseCount,0);
});
test('Pages deployment and localhost never index merely from publish flag',()=>{
  for(const siteUrl of ['https://csv-qbo.pages.dev','https://localhost','http://example.org']){
    const r=assessProductionRelease({approval,registry,tools,siteUrl,publishSeo:true});
    assert.equal(r.production,false);
  }
});
const reviewedCase={
  case_id:'fictional-uat-gate-001',route_slug:'qbo-to-csv',input_format:'qbo',
  output_format:'csv',public_bank_label:'Example Bank',source_variant:'Artificial example statement export',
  region:'US',parser_commit:'75797eb',tested_at:'2026-11-05',
  evidence_digest:'a'.repeat(64),evidence_scope:'real_bank_read_only',
  target_product:'not_applicable',target_version:'not_applicable',
  reimport_result:'not_applicable',review_state:'owner_reviewed'
};
const exampleRegistry={...registry,cases:[reviewedCase]};
const approved={schema_version:1,approved:true,approved_routes:['qbo-to-csv'],
  reviewed_at:'2026-11-05',reviewer:'Owner UAT reviewer',notes:'Example-only validation test: never publish this fixture'};
test('only an explicitly owner-approved reviewed route could become indexable',()=>{
  const result=assessProductionRelease({
    approval:approved,registry:exampleRegistry,tools,siteUrl:'https://finance-example-real.com',publishSeo:true
  });
  assert.equal(result.production,true);
  assert.deepEqual(result.routes,['qbo-to-csv']);
  assert.equal(assessProductionRelease({
    approval:approved,registry:exampleRegistry,tools,
    siteUrl:'https://csv-qbo.pages.dev',publishSeo:true
  }).production,false);
  assert.equal(assessProductionRelease({
    approval:approved,registry:exampleRegistry,tools,
    siteUrl:'https://finance-example-real.com',publishSeo:false
  }).production,false);
});
test('explicit approval without a genuine accepted registry record is blocked',()=>{
  assert.throws(()=>assessProductionRelease({
    approval:approved,registry,tools,
    siteUrl:'https://finance-example-real.com',publishSeo:true
  }),/no owner-reviewed real-bank source evidence/);
});
test('unknown route, unrelated evidence and experimental CSV formatter cannot be released',()=>{
  for(const slug of ['qbo-to-excel','quickbooks-csv-formatter','not-a-route']){
    assert.throws(()=>assessProductionRelease({
      approval:{...approved,approved_routes:[slug]},
      registry:exampleRegistry,tools,siteUrl:'https://finance-example-real.com',publishSeo:true
    }),/evidence|experimental|unknown/);
  }
});
test('unapproved release cannot smuggle route approvals, reviewer names, or extra financial fields',()=>{
  for(const changes of [
    {approved_routes:['qbo-to-csv']},
    {reviewer:'Somebody'},
    {reviewed_at:'2026-11-05'},
    {private_bank_account:'1234'}
  ]){
    assert.throws(()=>assessProductionRelease({
      approval:{...approval,...changes},registry,tools,
      siteUrl:'https://finance-example-real.com',publishSeo:true
    }),/Production release gate:/);
  }
});
test('manually approved UAT must be limited to real studied nonbrand KD<=29 reader directions',()=>{
  const wrongKd=tools.map(t=>t.slug==='qbo-to-csv'?{...t,kd:30}:t);
  assert.throws(()=>assessProductionRelease({
    approval:approved,registry:exampleRegistry,tools:wrongKd,
    siteUrl:'https://finance-example-real.com',publishSeo:true
  }),/KD<=29/);
  const unverified={...reviewedCase,evidence_scope:'target_import_observed'};
  assert.throws(()=>assessProductionRelease({
    approval:approved,registry:{...registry,cases:[unverified]},tools,
    siteUrl:'https://finance-example-real.com',publishSeo:true
  }),/Public evidence scope mismatch/);
});
