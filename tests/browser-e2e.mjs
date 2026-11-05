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
 const excelParts=storedZip(output.content);
 const xml=excelParts.get('xl/worksheets/sheet1.xml').toString('utf8');
 const format=excelParts.get('xl/styles.xml').toString('utf8');
 assert.match(xml,/Sample bookstore/);assert.match(xml,/120\.00/);
 assert.match(xml,/<c r="A2" s="2"><v>46330<\/v><\/c>/);
 assert.match(xml,/<c r="C2" s="1"><v>-12\.50<\/v><\/c>/);
 assert.match(xml,/<c r="A3" s="2"><v>46331<\/v><\/c>/);
 assert.match(xml,/<c r="C3" s="1"><v>120\.00<\/v><\/c>/);
 assert.match(xml,/<autoFilter ref="A1:D3"\/>/);
 assert.match(format,/numFmtId="164" formatCode="yyyy-mm-dd"/);
 assert.match(format,/<cellXfs count="3">/);
 console.log('PASS browser QBO-to-XLSX real date cells, exact-cent numeric amounts and filterable worksheet');

 // Exercise the downloaded workbook with a 1-cent debit and a reference ID
 // that must retain leading zeros. Date and amount are numeric; text stays inert.
 await page.goto(base+'/tools/qif-to-excel/');
 const tinyQif='!Type:Bank\nD11/04/2026\nT-0.01\nPSalary ^ café\nN00001234\n^\n';
 await page.locator('#file-input').setInputFiles(file('small.qif',tinyQif));
 await page.locator('#preview-panel').waitFor({state:'visible'});
 if(await page.locator('#warning-ack-label').isVisible())await page.locator('#warning-ack').check();
 output=await dl('#export-button');
 assert.ok(output.name.endsWith('.xlsx'));
 const cells=storedZip(output.content).get('xl/worksheets/sheet1.xml').toString('utf8');
 assert.match(cells,/<c r="A2" s="2"><v>46330<\/v><\/c>/);
 assert.match(cells,/<c r="C2" s="1"><v>-0.01<\/v><\/c>/);
 assert.match(cells,/<c r="D2" t="inlineStr"><is><t xml:space="preserve">00001234<\/t><\/is><\/c>/);
 assert.match(cells,/Salary \^ café/);
 console.log('PASS browser QIF-to-XLSX one-cent debit and leading-zero transaction reference');

 // Default four-column workbooks must not accidentally claim the source Memo
 // is included. Opt-in adds a fifth text-only column, preserving integer cents.
 await page.goto(base+'/tools/qif-to-excel/');
 const memoQIF='!Type:Bank\nD11/04/2026\nT-1.01\nPStore\nM=SUM(1,2) & <note>\nN00001234\n^\n';
 await page.locator('#file-input').setInputFiles(file('memo.qif',memoQIF));
 await page.locator('#preview-panel').waitFor({state:'visible'});
 assert.equal(await page.locator('#preview-memo-head').isVisible(),true);
 assert.equal(await page.locator('#memo-toggle-label').isVisible(),true);
 assert.match(await page.locator('#memo-coverage').textContent(),/default four-column Excel download EXCLUDES Memo/);
 assert.match(await page.locator('#preview-body tr').first().textContent(),/=SUM\(1,2\) & <note>/);
 await page.locator('#preview-search').fill('=SUM(1,2)');
 assert.equal(await page.locator('#preview-body tr').count(),1);
 await page.locator('#preview-search').fill('');
 output=await dl('#export-button');
 const noMemoSheet=storedZip(output.content).get('xl/worksheets/sheet1.xml').toString('utf8');
 assert.match(noMemoSheet,/<dimension ref="A1:D2"\/>/);
 assert.ok(!noMemoSheet.includes('r="E2"'));
 await page.locator('#include-memo').check();
 assert.match(await page.locator('#memo-coverage').textContent(),/additional Memo column WILL be included/);
 output=await dl('#export-button');
 const memoSheet=storedZip(output.content).get('xl/worksheets/sheet1.xml').toString('utf8');
 assert.match(memoSheet,/<dimension ref="A1:E2"\/>/);
 assert.match(memoSheet,/<c r="C2" s="1"><v>-1\.01<\/v><\/c>/);
 assert.match(memoSheet,/<c r="D2" t="inlineStr"><is><t xml:space="preserve">00001234<\/t><\/is><\/c>/);
 assert.match(memoSheet,/<c r="E2" t="inlineStr"><is><t xml:space="preserve">=SUM\(1,2\) &amp; &lt;note&gt;<\/t><\/is><\/c>/);
 assert.ok(!memoSheet.includes('<f>'),'memo cannot become Excel formula');
 console.log('PASS Chrome QIF-to-XLSX optional fifth Memo text column and unchanged default workbook');

 // The same source can preserve Memo in a generic five-column CSV after opt-in.
 await page.goto(base+'/tools/qif-to-csv/');
 await page.locator('#file-input').setInputFiles(file('memo.qif',memoQIF));
 await page.locator('#preview-panel').waitFor({state:'visible'});
 output=await dl('#export-button');
 assert.match(output.content.toString('utf8'),/^﻿date,description,amount,id\r\n/);
 assert.ok(!output.content.toString('utf8').includes('=SUM(1,2)'));
 await page.locator('#include-memo').check();
 output=await dl('#export-button');
 assert.match(output.content.toString('utf8'),/^﻿date,description,amount,id,memo\r\n/);
 assert.ok(output.content.toString('utf8').includes("'=SUM(1,2) & <note>"),
  'CSV guard must neutralize formula-like Memo values');
 console.log('PASS Chrome QIF-to-CSV Memo option and formula-injection guard');

 // Source whitespace in merchant/reference IDs is meaningful in quoted CSV
 // and must survive local parsing plus the new exact row-by-row CSV preflight.
 await page.goto(base+'/tools/qif-to-csv/');
 const paddedQIF='!Type:Bank\nD11/04/2026\nT-4.01\nP  Café Trading  \nN  0000456  \nM  Optional note  \n^\n';
 await page.locator('#file-input').setInputFiles(file('padded.qif',paddedQIF));
 await page.locator('#preview-panel').waitFor({state:'visible'});
 assert.equal(await page.locator('#summary-count').textContent(),'1');
 assert.equal(await page.locator('#summary-net').textContent(),'-4.01');
 await page.locator('#include-memo').check();
 output=await dl('#export-button');
 const paddedCSV=output.content.toString('utf8');
 assert.match(paddedCSV,/date,description,amount,id,memo\r\n/);
 assert.match(paddedCSV,/2026-11-04,  Café Trading  ,-4\.01,  0000456  ,  Optional note  \r\n/);
 assert.equal(paddedCSV.split(/\r\n/).length,3);
 console.log('PASS Chrome generic CSV reparse preflight preserves original payee/reference/Memo whitespace');


 // QuickBooks Online bank-upload format stays strictly three columns. A CSV
 // source with independent Memo explicitly discloses exclusion before download.
 await page.goto(base+'/tools/quickbooks-csv-formatter/');
 const mappedMemoCSV='Date,Description,Memo,Amount,Reference\n11/04/2026,Office shop,Private separate Memo,-2.50,0002\n';
 await page.locator('#file-input').setInputFiles(file('source-memo.csv',mappedMemoCSV));
 await page.locator('#mapping-panel').waitFor({state:'visible'});
 assert.equal(await page.locator('#map-memo').inputValue(),'2');
 await page.locator('#preview-button').click();
 assert.match(await page.locator('#memo-coverage').textContent(),/QuickBooks Online requires exactly three CSV columns/);
 assert.equal(await page.locator('#memo-toggle-label').isHidden(),true);
 assert.match(await page.locator('#preview-body').textContent(),/Private separate Memo/);
 output=await dl('#export-button');
 assert.equal(output.content.toString('utf8').trim().split(/\r?\n/)[0],'Date,Description,Amount');
 assert.ok(!output.content.toString('utf8').includes('Private separate Memo'));
 console.log('PASS Chrome QuickBooks strict 3-column CSV with separate Memo exclusion disclosed');

 // Batch mode must acknowledge Memo omissions; opt-in regenerates files and
 // reports counts without leaking private Memo text in its JSON validation.
 await page.goto(base+'/tools/qif-to-csv/');
 const extraMemo='!Type:Bank\nD11/05/2026\nT3.00\nPSecond source\nMSeparate batch Memo\nN0003\n^\n';
 const bankBatch=[file('memo-first.qif',memoQIF),file('memo-second.qif',extraMemo)];
 await page.locator('#batch-input').setInputFiles(bankBatch);
 await page.waitForFunction(()=>document.querySelector('#batch-status')?.textContent.includes('separate outputs ready'));
 assert.equal(await page.locator('#batch-export').isDisabled(),true);
 assert.match(await page.locator('#batch-status').textContent(),/2 source transaction\(s\) have separate Memo/);
 await page.locator('#batch-include-memo').check();
 assert.match(await page.locator('#batch-status').textContent(),/Reselect batch files/);
 await page.locator('#batch-input').setInputFiles(bankBatch);
 await page.waitForFunction(()=>document.querySelector('#batch-status')?.textContent.includes('separate outputs ready'));
 assert.equal(await page.locator('#batch-export').isEnabled(),true);
 output=await dl('#batch-export');
 const memoBatchZIP=storedZip(output.content);
 const memoReport=JSON.parse(memoBatchZIP.get('batch-validation.json').toString('utf8'));
 assert.equal(memoReport.memoIncluded,true);
 assert.equal(memoReport.memoRowsWithContent,2);
 assert.equal(memoReport.memoRowsOmitted,0);
 assert.ok(!JSON.stringify(memoReport).includes('Separate batch Memo'));
 const csvPart=memoBatchZIP.get('converted-001.csv').toString('utf8');
 assert.match(csvPart,/date,description,amount,id,memo/);
 assert.match(csvPart,/'=SUM\(1,2\) & <note>/);
 console.log('PASS Chrome batch Memo opt-in, preserved ZIP source rows and private report counts');


 // Legacy bank exports may use Mac-style CR-only records rather than LF/CRLF.
 // Validate the actual UI upload and independent XLSX ZIP contents.
 await page.goto(base+'/tools/qif-to-excel/');
 const oldQif=['!Type:Bank','D11/04/2026','T-5.25','PClassic Mac Café',
  'N000098','^','D11/05/2026','T10.00','PRefund ☕','N000099','^',''].join('\r');
 await page.locator('#file-input').setInputFiles(file('legacy-mac.qif',oldQif));
 await page.locator('#preview-panel').waitFor({state:'visible'});
 assert.equal(await page.locator('#summary-count').textContent(),'2');
 assert.equal(await page.locator('#summary-net').textContent(),'4.75');
 assert.match(await page.locator('#preview-body').textContent(),/Classic Mac Café/);
 if(await page.locator('#warning-ack-label').isVisible())await page.locator('#warning-ack').check();
 output=await dl('#export-button');
 const macSheet=storedZip(output.content).get('xl/worksheets/sheet1.xml').toString('utf8');
 assert.match(macSheet,/Classic Mac Café/);
 assert.match(macSheet,/Refund ☕/);
 assert.match(macSheet,/<c r="C2" s="1"><v>-5\.25<\/v><\/c>/);
 assert.match(macSheet,/<c r="C3" s="1"><v>10\.00<\/v><\/c>/);
 assert.match(macSheet,/000098/);
 assert.match(macSheet,/000099/);
 console.log('PASS Chrome QIF CR-only legacy bank file preserves two signed rows and references');

 await page.goto(base+'/tools/iif-to-excel/');
 const oldIif=[
  '!TRNS\tDATE\tAMOUNT\tMEMO\tDOCNUM',
  '!SPL\tDATE\tAMOUNT',
  'TRNS\t11/04/2026\t-4.01\tOld Mac rent\t000111',
  'SPL\t11/04/2026\t4.01',
  'ENDTRNS',''].join('\r');
 await page.locator('#file-input').setInputFiles(file('legacy-mac.iif',oldIif));
 await page.locator('#preview-panel').waitFor({state:'visible'});
 assert.equal(await page.locator('#summary-count').textContent(),'1');
 assert.equal(await page.locator('#summary-net').textContent(),'-4.01');
 assert.match(await page.locator('#preview-body').textContent(),/Old Mac rent/);
 await page.locator('#warning-ack').check();
 output=await dl('#export-button');
 const journalSheet=storedZip(output.content).get('xl/worksheets/sheet1.xml').toString('utf8');
 assert.match(journalSheet,/<c r="C2" s="1"><v>-4\.01<\/v><\/c>/);
 assert.match(journalSheet,/000111/);
 console.log('PASS Chrome IIF CR-only balanced TRNS/SPL bank-summary output without partial rows');



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

 // Old OFX 1.x source must decode Windows-1252 on the real browser upload path.
 await page.goto(base+'/tools/ofx-to-csv/');
 const legacy=await readFile(path.join(dist,'samples/ofx-win1252-synthetic.ofx'));
 await page.locator('#file-input').setInputFiles({name:'legacy.ofx',mimeType:'application/octet-stream',buffer:legacy});
 await page.locator('#preview-panel').waitFor({state:'visible'});
 assert.equal(await page.locator('#summary-net').textContent(),'107.50');
 assert.equal(await page.locator('#preview-body tr').first().locator('td').nth(1).textContent(),'Sample café');
 await page.locator('#warning-ack').check();
 output=await dl('#export-button');
 assert.match(output.content.toString('utf8'),/Sample café/);
 console.log('PASS Windows-1252 OFX browser decode and CSV download');

 // Genuine XML markup must be distinguished from inert CDATA/comment content:
 // fake STMTTRN tags inside merchant names cannot create or alter bank rows.
 await page.goto(base+'/tools/ofx-to-csv/');
 const xmlNote='<?xml version="1.0"?><OFX><CURDEF>USD</CURDEF><BANKTRANLIST>'+
   '<!-- <STMTTRN><TRNAMT>900.00</TRNAMT></STMTTRN> -->'+
   '<STMTTRN><DTPOSTED>20261104</DTPOSTED><TRNAMT>-7.75</TRNAMT>'+
   '<NAME><![CDATA[Merchant <script>alert(1)</script> <STMTTRN><TRNAMT>999.00</TRNAMT></STMTTRN>]]></NAME>'+
   '</STMTTRN></BANKTRANLIST></OFX>';
 await page.locator('#file-input').setInputFiles(file('xml-note.ofx',xmlNote));
 await page.locator('#preview-panel').waitFor({state:'visible'});
 assert.equal(await page.locator('#summary-count').textContent(),'1');
 assert.equal(await page.locator('#summary-net').textContent(),'-7.75');
 assert.match(await page.locator('#preview-body tr').first().textContent(),/Merchant <script>alert\(1\)<\/script>/);
 assert.equal(await page.locator('#preview-body script').count(),0);
 await page.locator('#warning-ack').check();
 output=await dl('#export-button');
 assert.match(output.content.toString('utf8'),/Merchant <script>alert\(1\)<\/script>/);
 assert.ok(!output.content.toString('utf8').includes('900.00'));
 console.log('PASS Chrome OFX XML CDATA/comment tag isolation and escaped preview');

 // XML 2.x leaf fields can contain entity-escaped text, comments and
 // multiple CDATA segments. The browser must not silently drop any segment.
 const mixedXML='<?xml version="1.0"?><OFX><CURDEF>USD</CURDEF><STMTTRN>'+
 '<DTPOSTED>20261104</DTPOSTED><TRNAMT>-8.05</TRNAMT>'+
 '<NAME>Local &amp; <!-- internal only --><![CDATA[Café ^]]> &#x4E2D;&#25991;</NAME>'+
 '<MEMO>Memo<![CDATA[ &original; ]]>end</MEMO><FITID>000099</FITID>'+
 '</STMTTRN></OFX>';
 await page.locator('#file-input').setInputFiles(file('mixed-bank.xml.ofx',mixedXML));
 await page.locator('#preview-panel').waitFor({state:'visible'});
 assert.equal(await page.locator('#summary-count').textContent(),'1');
 assert.equal(await page.locator('#summary-net').textContent(),'-8.05');
 assert.match(await page.locator('#preview-body').textContent(),/Local & Café \^ 中文/);
 assert.ok(!(await page.locator('#preview-body').textContent()).includes('internal only'));
 await page.locator('#warning-ack').check();
 output=await dl('#export-button');
 assert.match(output.content.toString('utf8'),/Local & Café \^ 中文/);
 assert.match(output.content.toString('utf8'),/000099/);
 assert.ok(!output.content.toString('utf8').includes('internal only'));
 console.log('PASS Chrome OFX mixed XML entities/CDATAs preserve exact payee without copying XML comments');

 const badXML=mixedXML.replace('Local &amp; ', 'Private merchant &unsupported; ');
 await page.locator('#file-input').setInputFiles(file('invalid-entity.ofx',badXML));
 await page.locator('#work-status[data-state="error"]').waitFor({state:'visible'});
 assert.equal(await page.locator('#preview-panel').isHidden(),true);
 assert.equal(await page.locator('#export-button').isDisabled(),true);
 assert.equal(await page.locator('#work-status').getAttribute('data-state'),'error');
 const entityStatus=await page.locator('#work-status').textContent();
 assert.match(entityStatus,/Malformed or unsupported OFX XML character entity/);
 assert.ok(!entityStatus.includes('Private merchant'));
 assert.ok(!entityStatus.includes('000099'));
 console.log('PASS Chrome invalid XML entity fails closed with privacy-safe error and no downloadable stale preview');



 // Verify the CSV -> experimental QIF workflow is an actual downloaded file.
 await page.goto(base+'/tools/csv-to-qif/');
 await page.locator('#file-input').setInputFiles(file('convert.csv',csv));
 await page.locator('#mapping-panel').waitFor({state:'visible'});
 await page.locator('#preview-button').click();
 output=await dl('#export-button');
 assert.ok(output.name.endsWith('.qif'));
 assert.match(output.content.toString('utf8'),/^!Type:Bank\r\n/);
 assert.match(output.content.toString('utf8'),/D11\/04\/2026\r\nT-12\.50\r\nPSample bookstore/);
 console.log('PASS browser CSV -> experimental QIF syntax download');

 // CSV source columns must map Memo to a QIF M field independently of Payee,
 // Amount and Reference, without mutating the source transaction.
 const memoSource='Date,Description,Memo,Amount,Reference\n'+
 '11/04/2026,Bookshop,Separate source Memo,-4.25,000891\n';
 await page.locator('#file-input').setInputFiles(file('source-memo.csv',memoSource));
 await page.locator('#mapping-panel').waitFor({state:'visible'});
 assert.equal(await page.locator('#map-memo').inputValue(),'2');
 await page.locator('#preview-button').click();
 assert.match(await page.locator('#memo-coverage').textContent(),/QIF Bank export retains supported Memo values as M records/);
 output=await dl('#export-button');
 const qifMemoDownload=output.content.toString('utf8');
 assert.match(qifMemoDownload,/PBookshop\r\nN000891\r\nMSeparate source Memo\r\n\^\r\n/);
 assert.match(qifMemoDownload,/D11\/04\/2026\r\nT-4\.25\r\n/);
 console.log('PASS Chrome CSV mapped Memo exports as separate QIF M field with identical date and cents');

 // CSV source quoted payee/reference whitespace must survive parsing and QIF
 // serialization, rather than being silently trimmed away.
 const sourceWhitespace='Date,Description,Memo,Amount,Reference\n'+
 '11/04/2026,"  Café & Co  ","  receipt  ",-1.50,"  00077  "\n';
 await page.locator('#file-input').setInputFiles(file('whitespace.csv',sourceWhitespace));
 await page.locator('#mapping-panel').waitFor({state:'visible'});
 await page.locator('#preview-button').click();
 assert.match(await page.locator('#preview-body tr').first().textContent(),/  Café & Co  /);
 output=await dl('#export-button');
 assert.match(output.content.toString('utf8'),/P  Café & Co  \r\nN  00077  \r\nM  receipt  \r\n\^\r\n/);
 console.log('PASS Chrome CSV source quoted payee/reference/Memo spaces survive QIF output');



 // QIF fields are line-oriented; source payee newlines must fail rather than
 // silently changing the transaction and serving a corrupt accounting file.
 const caretCSV='Date,Description,Amount,Reference\n11/04/2026,Bookstore ^ café,-5.25,REF^A\n';
 await page.locator('#file-input').setInputFiles(file('caret.csv',caretCSV));
 await page.locator('#mapping-panel').waitFor({state:'visible'});
 await page.locator('#preview-button').click();
 output=await dl('#export-button');
 assert.match(output.content.toString('utf8'),/PBookstore \^ café\r\nNREF\^A\r\n\^\r\n/);
 console.log('PASS Chrome CSV-to-QIF preserves literal caret and UTF-8 reference without rewriting');

 const multilineCSV='Date,Description,Amount,Reference\n11/04/2026,"Private merchant\nnorth floor",-5.25,CONFIDENTIAL-REF\n';
 await page.locator('#file-input').setInputFiles(file('multiline.csv',multilineCSV));
 await page.locator('#mapping-panel').waitFor({state:'visible'});
 await page.locator('#preview-button').click();
 assert.equal(await page.locator('#preview-panel').isVisible(),true);
 await page.locator('#export-button').click();
 assert.equal(await page.locator('#work-status').getAttribute('data-state'),'error');
 const errorText=await page.locator('#work-status').textContent();
 assert.match(errorText,/QIF export row 1: Description contains a line break or control character/);
 assert.ok(!errorText.includes('Private merchant'));
 assert.ok(!errorText.includes('CONFIDENTIAL-REF'));
 console.log('PASS Chrome blocks lossy newline QIF export without exposing source details in errors');


 // 1,001 unique bank rows must split into two real QuickBooks CSV files and a
 // privacy-minimized report. Check the browser-downloaded ZIP, not just a stub.
 await page.goto(base+'/tools/quickbooks-csv-formatter/');
 const manyCSV=['Date,Description,Amount,Reference',...Array.from({length:1001},(_,i)=>
   '11/04/2026,Synthetic payment '+String(i+1).padStart(4,'0')+',0.01,DEMO-'+String(i+1).padStart(4,'0')),''].join('\r\n');
 await page.locator('#file-input').setInputFiles(file('large-synthetic.csv',manyCSV));
 await page.locator('#mapping-panel').waitFor({state:'visible'});
 await page.locator('#preview-button').click();
 assert.equal(await page.locator('#summary-count').textContent(),'1,001');
 assert.equal(await page.locator('#summary-net').textContent(),'10.01');
 assert.equal(await page.locator('#preview-body tr').count(),25);
 assert.equal(await page.locator('#preview-page-status').textContent(),'Page 1 of 41');
 assert.match(await page.locator('#preview-caption').textContent(),/downloads include all 1001 transactions/);
 assert.equal(await page.locator('#preview-previous').isDisabled(),true);
 for(let i=0;i<40;i++)await page.locator('#preview-next').click();
 assert.equal(await page.locator('#preview-page-status').textContent(),'Page 41 of 41');
 assert.equal(await page.locator('#preview-body tr').count(),1);
 assert.match(await page.locator('#preview-body').textContent(),/Synthetic payment 1001/);
 assert.equal(await page.locator('#preview-next').isDisabled(),true);
 assert.equal(await page.locator('#summary-count').textContent(),'1,001');
 await page.locator('#preview-search').fill('Synthetic payment 1001');
 assert.equal(await page.locator('#preview-body tr').count(),1);
 assert.equal(await page.locator('#preview-body tr').first().getAttribute('data-row-number'),'1001');
 assert.match(await page.locator('#preview-filter-status').textContent(),/1 of 1001/);
 await page.locator('#preview-search').fill('NO-SUCH-BANK-TRANSACTION');
 assert.equal(await page.locator('#preview-body tr').count(),0);
 assert.equal(await page.locator('#export-button').isEnabled(),true);
 assert.match(await page.locator('#preview-caption').textContent(),/Downloads still include all 1001 transactions/);
 await page.locator('#preview-search').fill('');
 assert.equal(await page.locator('#preview-body tr').count(),25);
 output=await dl('#export-button');
 assert.ok(output.name.endsWith('.zip'));
 const split=storedZip(output.content);
 const first=split.get('quickbooks-online-part-001.csv');
 const second=split.get('quickbooks-online-part-002.csv');
 assert.ok(first&&second,'two data parts are required');
 assert.equal(first.toString('utf8').match(/Synthetic payment \d{4}/g)?.length,1000);
 assert.equal(second.toString('utf8').match(/Synthetic payment \d{4}/g)?.length,1);
 assert.ok(first.toString('utf8').includes('Synthetic payment 0001,0.01'));
 assert.ok(second.toString('utf8').includes('Synthetic payment 1001,0.01'));
 const splitReport=JSON.parse(split.get('quickbooks-csv-validation.json').toString('utf8'));
 assert.equal(splitReport.reportType,'Finance File Lab QuickBooks CSV preflight v2');
 assert.equal(splitReport.orderedRowsReconciled,true);
 assert.equal(splitReport.sourceDescriptionsReconciled,true);
 assert.equal(splitReport.sourceAmountsReconciled,true);
 assert.equal(splitReport.sourceRows,1001);
 assert.deepEqual(splitReport.parts.map(p=>p.sourceRowRange),[{first:1,last:1000},{first:1001,last:1001}]);
 assert.equal(splitReport.sourceTotals.net,'10.01');
 assert.ok(!JSON.stringify(splitReport).includes('Synthetic payment 0001'));
 assert.ok(!JSON.stringify(splitReport).includes('DEMO-1001'));
 console.log('PASS Chrome 1,001-row QuickBooks CSV ZIP download, ordered data and private v2 reconciliation report');

 console.log('PASS Chrome 41-page transaction preview reaches final source row without changing exported ZIP');

 // Duplicates can appear far beyond the default first page. The review
 // control must find both original and later matching rows, without filtering.
 const flaggedCSV=['Date,Description,Amount,Reference',...Array.from({length:52},(_,i)=>{
   const match=i===1||i===50;
   return '11/04/2026,'+(match?'Same merchant':'Merchant '+i)+','+(match?'-7.00':(i+1)+'.00')+','+(match?'DUP-REF':'UNIQUE-'+i);
 }),'' ].join('\r\n');
 await page.locator('#file-input').setInputFiles(file('flagged.csv',flaggedCSV));
 await page.locator('#mapping-panel').waitFor({state:'visible'});
 await page.locator('#preview-button').click();
 assert.equal(await page.locator('#summary-count').textContent(),'52');
 assert.equal(await page.locator('#export-button').isDisabled(),true);
 await page.locator('#preview-review').click();
 assert.match(await page.locator('#preview-page-status').textContent(),/Review row 2 of 52/);
 await page.locator('#preview-review').click();
 assert.match(await page.locator('#preview-page-status').textContent(),/Review row 51 of 52/);
 assert.equal(await page.locator('#preview-body tr').count(),2);
 assert.equal(await page.locator('#preview-body tr.is-current-review-row').getAttribute('data-row-number'),'51');
 assert.equal(await page.locator('#preview-body tr.is-review-row .row-flag').count(),1);
 await page.locator('#preview-only-flags').check();
 assert.equal(await page.locator('#preview-body tr').count(),2);
 assert.equal(await page.locator('#preview-body tr').first().getAttribute('data-row-number'),'2');
 assert.equal(await page.locator('#preview-body tr').last().getAttribute('data-row-number'),'51');
 assert.match(await page.locator('#preview-filter-status').textContent(),/2 of 52/);
 await page.locator('#preview-search').fill('Same merchant');
 assert.equal(await page.locator('#preview-body tr').count(),2);
 await page.locator('#preview-search').fill('no-match');
 assert.equal(await page.locator('#preview-body tr').count(),0);
 assert.equal(await page.locator('#preview-review').isHidden(),true);
 await page.locator('#preview-search').fill('');
 assert.equal(await page.locator('#preview-body tr').count(),2);
 await page.locator('#warning-ack').check();
 assert.equal(await page.locator('#export-button').isEnabled(),true);
 console.log('PASS Chrome duplicate review locates source rows on distant pages and keeps download acknowledgement gate');



 // Responsive smoke check: functionality remains usable at a typical phone width.
 await page.setViewportSize({width:390,height:844});
 await page.goto(base+'/tools/quickbooks-csv-formatter/');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
 assert.ok(overflow<=2,'mobile page must not overflow horizontally by '+overflow+'px');
 console.log('PASS 390px mobile layout without horizontal overflow');
 assert.deepEqual(errors,[]);
 console.log('PASS zero uncaught page JavaScript errors');
}catch(e){
 if(page)await page.screenshot({path:'browser-e2e-failure.png',fullPage:true}).catch(()=>{});
 console.error('FAIL browser acceptance:',e);process.exitCode=1;
}finally{
 await browser?.close();
 await new Promise(done=>server.close(done));
}
