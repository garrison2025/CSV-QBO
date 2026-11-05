import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {writeQboLab} from '../scripts/build-qbo-lab.mjs';

const root=path.resolve(import.meta.dirname,'..');
test('CSV-QBO experimental route remains outside SEO tool registry',()=>{
 const tools=JSON.parse(readFileSync(path.join(root,'data','tools.json'),'utf8'));
 assert.ok(!tools.some(x=>x.slug==='csv-to-qbo'));
 const folder=mkdtempSync(path.join(tmpdir(),'qbo-lab-'));
 try{
   mkdirSync(path.join(folder,'assets'));
   writeQboLab(folder,root);
   const page=readFileSync(path.join(folder,'lab','csv-to-qbo','index.html'),'utf8');
   assert.match(page,/<meta name="robots" content="noindex,nofollow">/);
   assert.match(page,/syntax-only pilot/i);
   for(const id of ['lab-csv','lab-reference','lab-download'])
     assert.ok(page.includes('id="'+id+'"'),id);
   assert.ok(existsSync(path.join(folder,'assets','qbo-writer.mjs')));
   assert.ok(existsSync(path.join(folder,'assets','qbo-writer-ui.mjs')));
   assert.match(page,/sonomir-synthetic-reference-test-only\.qbo/);
   const ref=readFileSync(path.join(folder,'samples','sonomir-synthetic-reference-test-only.qbo'));
   assert.equal(ref.length,923);
   assert.equal(createHash('sha256').update(ref).digest('hex'),'00e5202de9a425ed3d0c4fba337271e54cfe8e48a87538c394c378ae95a74e69');
   assert.equal(existsSync(path.join(folder,'tools','csv-to-qbo','index.html')),false);
 }finally{rmSync(folder,{recursive:true,force:true});}
});
test('existing QuickBooks Online CSV formatter stays a distinct real tool',()=>{
 const tools=JSON.parse(readFileSync(path.join(root,'data','tools.json'),'utf8'));
 const formatter=tools.find(x=>x.slug==='quickbooks-csv-formatter');
 assert.ok(formatter);
 assert.equal(formatter.output,'qb-csv');
 assert.match(formatter.summary+' '+formatter.detail,/CSV/);
});
