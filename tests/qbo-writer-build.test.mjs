import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const dist=path.join(root,'dist');
test('CSV-QBO experimental route remains outside published SEO tools',()=>{
 const tools=JSON.parse(readFileSync(path.join(root,'data/tools.json'),'utf8'));
 assert.ok(!tools.some(x=>x.slug==='csv-to-qbo'));
 assert.equal(existsSync(path.join(dist,'tools','csv-to-qbo','index.html')),false);
 const lab=readFileSync(path.join(dist,'lab','csv-to-qbo','index.html'),'utf8');
 assert.match(lab,/<meta name="robots" content="noindex,nofollow">/);
 assert.match(lab,/syntax-only pilot/i);
 assert.match(lab,/lab-csv/);
 assert.match(lab,/lab-reference/);
 assert.match(lab,/lab-download/);
 assert.ok(existsSync(path.join(dist,'assets','qbo-writer.mjs')));
 assert.ok(existsSync(path.join(dist,'assets','qbo-writer-ui.mjs')));
 if(existsSync(path.join(dist,'sitemap.xml')))assert.doesNotMatch(readFileSync(path.join(dist,'sitemap.xml'),'utf8'),/lab\/csv-to-qbo|tools\/csv-to-qbo/);
});
test('new lab doesn't alter the existing QuickBooks manual CSV tool',()=>{
 const existing=readFileSync(path.join(dist,'tools','quickbooks-csv-formatter','index.html'),'utf8');
 assert.match(existing,/not \.qbo/i);
 assert.match(existing,/noindex,nofollow/);
});
