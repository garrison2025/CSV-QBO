// Real Chrome acceptance checks for locally generated static site. Synthetic financial data only.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const mime={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
 try{
  let route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(route.endsWith('/'))route+='index.html';
  const file=path.resolve(dist,'.'+route);
  if(!file.startsWith(dist+path.sep))throw Error('Unsafe path');
  const bytes=await readFile(file);
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});
  res.end(bytes);
 }catch{res.writeHead(404);res.end('Not found');}
});
function storedZip(buf){
 const files=new Map();let pos=0;
 while(pos+30<=buf.length&&buf.readUInt32LE(pos)===0x04034b50){
  assert.equal(buf.readUInt16LE(pos+8),0,'expected stored ZIP');
  const n=buf.readUInt16LE(pos+26),x=buf.readUInt16LE(pos+28),length=buf.readUInt32LE(pos+18);
  const name=buf.subarray(pos+30,pos+30+n).toString('utf8');
  const from=pos+30+n+x;assert.ok(from+length<=buf.length);
  files.set(name,buf.subarray(from,from+length));pos=from+length;
 }
 assert.ok(files.size);return files;
}
const file=(name,text)=>({name,mimeType:'text/plain',buffer:Buffer.from(text)});
let browser,page;
try{
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 page=await browser.newPage({acceptDownloads:true});
 page.setDefaultTimeout(20000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 async function dl(selector){
  const [d]=await Promise.all([page.waitForEvent('download'),page.locator(selector).click()]);
  assert.equal(await d.failure(),null);
  return {name:d.suggestedFilename(),content:await readFile(await d.path())};
 }
 await page.goto(base+'/tools/quickbooks-csv-formatter/');
 const csv='Date,Description,Amount,Other Amount,Reference\r\n11/04/2026,Sample bookstore,-12.50,12.00,A1\r\n11/05/2026,Sample refund,120.00,25.00,A2\r\n';
 await page.locator('#file-input').setInputFiles(file('bank.csv',csv));
 await page.locator('#mapping-panel').waitFor({state:'visible'});
 await page.locator('#preview-button').click();
 assert.equal(await page.locator('#summary-net').textContent(),'107.50');
 let output=await dl('#export-button');
 assert.match(output.content.toString('utf8'),/11\/05\/2026,Sample refund,120\.00/);
 await page.locator('#map-amount').selectOption('3');
 assert.equal(await page.locator('#export-button').isDisabled(),true);
 assert.equal(await page.locator('#download-report').isDisabled(),true);
 await page.locator('#preview-button').click();
 assert.equal(await page.locator('#summary-net').textContent(),'37.00');
 await page.locator('#map-amount').selectOption('1');
 await page.locator('#preview-button').click();
 assert.equal(await page.locator('#export-button').isDisabled(),true);
 console.log('PASS Chrome CSV selection, QuickBooks CSV download, stale-preview guard');

 const dupe='Date,Description,Amount,Reference\n11/04/2026,Coffee,-3.00,REF-1\n11/04/2026,Coffee,-3.00,REF-1\n';
 await page.locator('#file-input').setInputFiles(file('duplicates.csv',dupe));
 await page.locator('#mapping-panel').waitFor({state:'visible'});
 await page.locator('#preview-button').click();
 assert.equal(await page.locator('#export-button').isDisabled(),true);
 await page.locator('#warning-ack').check();
 output=await dl('#export-button');
 assert.equal(output.content.toString('utf8').match(/Coffee,-3\.00/g).length,2);
 await page.locator('#clear-workspace').click();
 assert.equal(await page.locator('#export-button').isDisabled(),true);
 assert.equal(await page.locator('#download-report').isDisabled(),true);
 console.log('PASS warning acknowledgement, duplicate retention, clear workspace');

 await page.goto(base+'/tools/qbo-to-excel/');
 const qbo=await readFile(path.join(dist,'samples/qbo-synthetic.qbo'));
 await page.locator('#file-input').setInputFiles({name:'sample.qbo',mimeType:'application/octet-stream',buffer:qbo});
 await page.locator('#preview-panel').waitFor({state:'visible'});
 assert.equal(await page.locator('#summary-net').textContent(),'107.50');
 await page.locator('#warning-ack').check();
 output=await dl('#export-button');
 assert.ok(output.name.endsWith('.xlsx'));
 const xml=storedZip(output.content).get('xl/worksheets/sheet1.xml').toString('utf8');
 assert.match(xml,/Sample bookstore/);assert.match(xml,/120\.00/);
 console.log('PASS browser QBO read-only input and actual Excel workbook download');

 await page.goto(base+'/');
 const qif='!Type:Bank\nD11/04/2026\nT-3.00\nPCoffee\nNREF-1\n^\n';
 await page.locator('#batch-input').setInputFiles([file('first.qif',qif),file('second.qif',qif)]);
 await page.waitForFunction(()=>document.querySelector('#batch-status')?.textContent.includes('separate outputs ready'));
 assert.equal(await page.locator('#batch-export').isDisabled(),true);
 assert.match(await page.locator('#batch-status').textContent(),/cross-file possible match/);
 await page.locator('#batch-ack').check();
 output=await dl('#batch-export');
 const archive=storedZip(output.content),r=JSON.parse(archive.get('batch-validation.json').toString('utf8'));
 assert.ok(archive.has('converted-001.csv')&&archive.has('converted-002.csv'));
 assert.equal(r.totalTransactions,2);assert.equal(r.crossFileReferenceMatches,1);
 assert.equal(r.crossFileFingerprintMatches,1);assert.equal(r.autoMergedAccounts,false);
 assert.equal(r.autoDeletedTransactions,false);assert.ok(!JSON.stringify(r).includes('REF-1'));
 console.log('PASS real batch ZIP output, separate files and privacy-safe validation');
 assert.deepEqual(errors,[]);
 console.log('PASS zero uncaught page JavaScript errors');
}catch(e){
 if(page)await page.screenshot({path:'browser-e2e-failure.png',fullPage:true}).catch(()=>{});
 console.error('FAIL browser acceptance:',e);process.exitCode=1;
}finally{
 await browser?.close();
 await new Promise(done=>server.close(done));
}
