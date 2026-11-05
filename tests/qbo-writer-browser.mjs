// Real Chrome browser acceptance for the UNINDEXED writer pilot.
// All transactions and reference account numbers are fictional.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {parseInput,toMinorUnits} from '../src/core.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const csv='Date,Description,Amount,Reference\n10/14/2026,Fictional Espresso,-12.50,SYN001\n10/15/2026,Fictional Refund,20.75,SYN002\n';
const reference=Buffer.from(readFileSync(path.join(root,'tests/fixtures/sonomir-synthetic-qbo-20261105.base64'),'utf8').trim(),'base64');
const mime={'.mjs':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
 try{
  let route=new URL(req.url,'http://localhost').pathname;
  if(route.endsWith('/'))route+='index.html';
  const requested=path.resolve(dist,'.'+decodeURIComponent(route));
  if(!requested.startsWith(dist+path.sep))throw Error('Invalid path');
  const data=await readFile(requested);
  res.writeHead(200,{'Content-Type':mime[path.extname(requested)]||'application/octet-stream'});
  res.end(data);
 }catch{res.writeHead(404);res.end('Not found');}
});
let browser,page;
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 page=await browser.newPage({acceptDownloads:true});
 page.setDefaultTimeout(15000);
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const url='http://127.0.0.1:'+server.address().port+'/lab/csv-to-qbo/';
 assert.ok(existsSync(path.join(dist,'lab','csv-to-qbo','index.html')),'Lab HTML must be generated in actual dist before Chrome starts');
 const response=await page.goto(url,{waitUntil:'networkidle'});
 assert.equal(response.status(),200,'Lab route must return HTTP 200, received: '+(await page.content()).slice(0,240));
 assert.match(await page.locator('head meta[name="robots"]').getAttribute('content'),/noindex,nofollow/);
 assert.equal(await page.locator('#lab-preview').isDisabled(),true);
 await page.locator('#lab-csv').setInputFiles({name:'fictional.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
 await page.locator('#lab-reference').setInputFiles({name:'fictional-reference.qbo',mimeType:'application/x-ofx',buffer:reference});
 await page.locator('#lab-preview').click();
 await page.locator('#lab-result').waitFor({state:'visible'});
 assert.match(await page.locator('#lab-status').textContent(),/every output row matched/i);
 assert.equal(await page.locator('#lab-download').isDisabled(),true);
 await page.locator('#lab-ack').check();
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#lab-download').click()]);
 assert.equal(download.suggestedFilename(),'bank-transactions-experimental.qbo');
 const wire=await readFile(await download.path(),'utf8');
 assert.match(wire,/^OFXHEADER:100\r\n/);
 const rows=parseInput(wire,'qbo').transactions;
 assert.equal(rows.length,2);
 assert.deepEqual(rows.map(x=>x.description),['Fictional Espresso','Fictional Refund']);
 assert.deepEqual(rows.map(x=>x.amount),['-12.50','20.75']);
 assert.equal(rows.reduce((x,r)=>x+toMinorUnits(r.amount),0n),825n);
 assert.notEqual(rows[0].id,rows[1].id);
 assert.ok(rows.every(x=>/^FFL[A-F0-9]{28}$/.test(x.id)));
 console.log('PASS actual Chrome CSV + real competitor QBO reference -> ours .qbo download -> 2 rows, 825 cents');

 // Replacing the source revokes the old generated file and forces fresh review.
 await page.locator('#lab-csv').setInputFiles({name:'new.csv',mimeType:'text/csv',buffer:Buffer.from('Date,Description,Amount\n10/14/2026,New,-4.00\n')});
 assert.equal(await page.locator('#lab-result').isVisible(),false);
 assert.equal(await page.locator('#lab-download').isDisabled(),true);
 console.log('PASS input change prevents stale QBO download');

 await page.setViewportSize({width:390,height:844});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
 assert.ok(overflow<=2,'Lab mobile page horizontally overflows by '+overflow+' pixels');
 assert.deepEqual(errors,[]);
 console.log('PASS mobile layout and no uncaught browser JavaScript errors');
}catch(e){
 if(page)await page.screenshot({path:'qbo-writer-browser-failure.png',fullPage:true}).catch(()=>{});
 console.error('QBO Chrome E2E failure:',e);
 process.exitCode=1;
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
}
