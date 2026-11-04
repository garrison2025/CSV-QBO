import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
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

test('Every workspace exposes local clearing and guards stale async imports',()=>{
 assert.match(read('index.html'),/id="clear-file"/);
 assert.match(read('tools/qbo-to-csv/index.html'),/id="clear-file"/);
 const app=readFileSync(path.join(root,'src','app.mjs'),'utf8');
 assert.match(app,/selectionEpoch\+\+/);
 assert.match(app,/batchEpoch\+\+/);
 assert.match(app,/if\(epoch!==selectionEpoch\)return/);
 assert.match(app,/if\(epoch!==batchEpoch\)return/);
});
