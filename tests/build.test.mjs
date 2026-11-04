import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {parseInput,totals,decodeFinancialBytes} from '../src/core.mjs';
const root=path.resolve(import.meta.dirname,'..');
const read=p=>readFileSync(path.join(root,'dist',p),'utf8');
execFileSync(process.execPath,['scripts/build.mjs'],{cwd:root,env:{...process.env,SITE_URL:'',PUBLISH_SEO:''}});
test('preview noindex and robots blocking',()=>{
 assert.match(read('index.html'),/noindex,nofollow/);
 assert.match(read('robots.txt'),/Disallow: \/\n/);
 assert.equal(existsSync(path.join(root,'dist','sitemap.xml')),false);
});
test('no unverified QBO writing SEO landing page',()=>{
 assert.equal(existsSync(path.join(root,'dist','tools','csv-to-qbo','index.html')),false);
 assert.equal(existsSync(path.join(root,'dist','tools','ofx-to-qbo','index.html')),false);
});
test('each generated tool page includes real downloadable workflow and unique H1',()=>{
 const tools=JSON.parse(readFileSync(path.join(root,'data/tools.json'),'utf8'));
 for(const t of tools){const html=read('tools/'+t.slug+'/index.html');
 assert.match(html,/<h1>/);assert.match(html,/id="file-input"/);assert.match(html,/id="export-button"/);
 assert.match(html,/noindex,nofollow/);assert.match(html,new RegExp(t.label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 }
});
test('keyword database and 27-route plan preserved',()=>{
 const keywords=JSON.parse(readFileSync(path.join(root,'data/keywords-250.json'),'utf8'));
 assert.equal(keywords.length,250);
 assert.equal(new Set(keywords.map(x=>x.keyword)).size,250);
 assert.equal(keywords.find(x=>x.keyword==='csv to qbo converter').kd,5);
 const plan=JSON.parse(readFileSync(path.join(root,'data/seo-plan-v3.json'),'utf8'));
 assert.equal(plan.pages.length,27);
});


test('every published reader offers a synthetic fixture matching its input format',()=>{
 const tools=JSON.parse(readFileSync(path.join(root,'data/tools.json'),'utf8'));
 for(const tool of tools){
   const filename=tool.input+'-synthetic.'+tool.input;
   const location='samples/'+filename;
   assert.ok(existsSync(path.join(root,'dist',location)),location+' should exist');
   const page=read('tools/'+tool.slug+'/index.html');
   assert.ok(page.includes('/'+location),tool.slug+' must link its source fixture');
   const parsed=parseInput(read(location),tool.input,{dateFormat:'us'});
   assert.equal(parsed.transactions.length,2,tool.slug+' synthetic sample row count');
   assert.equal(totals(parsed.transactions).net,'107.50');
 }
 assert.match(read('index.html'),/samples\/csv-synthetic\.csv/);
});
test('clear workspace control is available on every converter page',()=>{
 assert.match(read('index.html'),/id="clear-workspace"/);
 assert.match(read('tools/qbo-to-csv/index.html'),/id="clear-workspace"/);
});

test('Clear workspace covers batch state and asynchronous file-read guards',()=>{
 const html=read('index.html');
 assert.match(html,/id="clear-workspace" type="button">Clear workspace/);
 const app=readFileSync(path.join(root,'src','app.mjs'),'utf8');
 assert.match(app,/selectionEpoch\+\+/);
 assert.match(app,/batchEpoch\+\+/);
 assert.match(app,/if\(epoch!==selectionEpoch\)return/);
 assert.match(app,/if\(epoch!==batchEpoch\)return/);
});


test('all single-file converter workspaces expose an explicit warning acknowledgement control',()=>{
 for(const route of ['index.html','tools/qbo-to-csv/index.html','tools/quickbooks-csv-formatter/index.html']){
  const html=read(route);
  assert.match(html,/id="warning-ack-label"/);
  assert.match(html,/id="warning-ack"/);
  assert.match(html,/I have reviewed these format and duplicate warnings/);
 }
 const app=readFileSync(path.join(root,'src','app.mjs'),'utf8');
 assert.match(app,/quickBooksCSVExportPlan\(parsed.transactions\)/);
 assert.match(app,/quickbooks-csv-validation\.json/);
 assert.match(app,/warning-ack'\)\.checked/);
});


test('OFX XML and Windows-1252 synthetic variants parse to two reconciled bank rows',()=>{
 for(const [filename,expectedEncoding,firstName] of [
  ['ofx-xml-synthetic.ofx','utf-8','Sample café & bookstore'],
  ['ofx-win1252-synthetic.ofx','windows-1252','Sample café']
 ]){
  const bytes=readFileSync(path.join(root,'dist','samples',filename));
  const decoded=decodeFinancialBytes(bytes,'ofx');
  assert.equal(decoded.encoding,expectedEncoding,filename);
  const parsed=parseInput(decoded.text,'ofx');
  assert.equal(parsed.transactions.length,2,filename);
  assert.equal(parsed.transactions[0].description,firstName,filename);
  assert.equal(parsed.integrity.recordCount,2,filename);
  assert.equal(totals(parsed.transactions).net,'107.50',filename);
 }
 const page=read('tools/ofx-to-csv/index.html');
 assert.match(page,/\/samples\/ofx-xml-synthetic\.ofx/);
 assert.match(page,/\/samples\/ofx-win1252-synthetic\.ofx/);
 assert.match(page,/noindex,nofollow/);
});
test('bank file inputs are decoded by strict byte readers, including batch mode',()=>{
 const app=readFileSync(path.join(root,'src','app.mjs'),'utf8');
 assert.match(app,/decodeFinancialBytes/);
 assert.match(app,/chosen\.arrayBuffer\(\)/);
 assert.match(app,/selected\.arrayBuffer\(\)/);
 assert.ok(!app.includes('await chosen.text()'));
});


test('synthetic OFX/QBO/QFX statement windows are declared and complete',()=>{
 for(const filename of ['ofx-synthetic.ofx','qbo-synthetic.qbo','qfx-synthetic.qfx','ofx-xml-synthetic.ofx','ofx-win1252-synthetic.ofx']){
  const bytes=readFileSync(path.join(root,'dist','samples',filename));
  const ext=filename.split('.').pop();
  const {text}=decodeFinancialBytes(bytes,ext);
  const data=parseInput(text,ext);
  assert.equal(data.integrity.statementRange.startInclusive,'2026-11-04',filename);
  assert.equal(data.integrity.statementRange.endExclusive,'2026-11-06',filename);
  assert.equal(data.integrity.postedBeforeRangeCount,0,filename);
  assert.equal(data.integrity.postedAfterRangeCount,0,filename);
 }
});
test('bank source preview displays retrieval period, without suggesting it is ledger reconciliation',()=>{
 for(const page of ['index.html','tools/qbo-to-csv/index.html','tools/ofx-to-csv/index.html']){
  assert.match(read(page),/id="statement-coverage"/);
 }
 const app=readFileSync(path.join(root,'src','app.mjs'),'utf8');
 assert.match(app,/Bank retrieval period/);
 assert.match(app,/end exclusive/);
 assert.match(app,/posted outside the displayed dates; no rows were removed/);
 const compatibility=read('compatibility/index.html');
 assert.match(compatibility,/DTSTART\/DTEND are retrieval windows/);
 assert.match(compatibility,/not guaranteed DTPOSTED coverage/);
});
