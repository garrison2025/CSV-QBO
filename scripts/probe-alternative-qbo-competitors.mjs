/**
 * ONE-TIME, consent-free PUBLIC free tools only, synthetic transactional test.
 * Not Intuit QB Online import certification, nor issuer-original evidence.
 * No CAPTCHA bypass, authenticated state, payment, bank credentials or contacts.
 * This is black-box behavior analysis, not code scraping or reverse engineering.
 */
import {chromium} from 'playwright-core';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseInput,quickBooksCSVExportPlan} from '../src/core.mjs';

const cases=[
 {url:'https://sonomir.com/csv-to-qbo',id:'sonomir'},
 {url:'https://csvdock.com/csv-to-qbo',id:'csvdock'},
 {url:'https://www.statementedge.com/tools/csv-to-qbo',id:'statementedge'},
];
const csv='Date,Description,Amount,Reference\n10/14/2026,Fictional Espresso,-12.50,SYN001\n10/15/2026,Fictional Refund,20.75,SYN002\n';
const expected=parseInput(csv,'csv');
const hash=v=>createHash('sha256').update(v).digest('hex');
const results={scope:'independent_competitor_semantics_synthetic_not_QBO_import',timestamp:new Date().toISOString(),
 sourceSha256:hash(Buffer.from(csv)),sourceRows:2,sourceNet:'8.25',actualQuickBooksImportObserved:false,
 actualBankOriginalUsed:false,competitors:[]};
const ours=quickBooksCSVExportPlan(expected.transactions);
results.ourCurrentOutput={kind:'manual_3_column_CSV_not_WebConnect_QBO',
 rows:expected.transactions.length,totalsReconciled:ours.report.totalsReconciled,
 orderedRowsReconciled:ours.report.orderedRowsReconciled};
let browser;
try{
browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
for(const site of cases){
 const p={site:site.id,sourceUrl:site.url,status:'not_started',fileDownloaded:false,
   crossVendorQboReconciled:false,actualQuickBooksImportObserved:false};
 let page;
 try{
   page=await browser.newPage({acceptDownloads:true,viewport:{width:1400,height:850}});
   const downloads=[];
   page.on('download',x=>downloads.push(x));
   page.setDefaultTimeout(4500);
   await page.goto(site.url,{waitUntil:'domcontentloaded',timeout:17000});
   await page.waitForTimeout(1200);
   p.finalHost=new URL(page.url()).hostname;
   p.title=(await page.title()).slice(0,100);
   const inputs=page.locator('input[type=file]');
   const count=await inputs.count();
   p.fileInputCount=count;
   if(!count){p.status='no_file_input_in_public_page';continue;}
   await inputs.first().setInputFiles({name:'fictional-bank-compare.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
   await page.waitForTimeout(1400);
   const observed=await inputs.first().evaluate(e=>({
     fileCount:e.files?.length||0,accept:e.accept||'',name:e.name||null
   })).catch(()=>null);
   p.fileInputAfterSelection=observed;
   const controls=await page.locator('button,[role=button],input[type=submit],select,input[type=text],input[type=number],a[download]').all();
   p.visibleControls=[];
   for(const v of controls.slice(0,70)){
     if(!await v.isVisible().catch(()=>false))continue;
     const info=await v.evaluate(e=>({
       tag:e.tagName.toLowerCase(),type:e.type||null,id:e.id||null,name:e.name||null,
       aria:e.getAttribute('aria-label')||null,
       text:(e.innerText||e.value||'').trim().slice(0,80),
       placeholder:e.getAttribute('placeholder')||null
     })).catch(()=>null);
     if(info)p.visibleControls.push(info);
   }
   let body=await page.locator('body').innerText().catch(()=>'');
   p.humanGate=/verify you are human|security verification|captcha/i.test(body);
   p.forbidden=/\bForbidden\b/i.test(body);
   if(p.humanGate||p.forbidden){p.status=p.forbidden?'external_forbidden':'human_verification_required';continue;}
   // Only click explicit convert/download controls; never login, pay, subscribe
   // or perform unrelated website actions.
   const btns=page.locator('button,input[type=submit],[role=button]');
   for(const btn of (await btns.all()).slice(0,20)){
     if(downloads.length)break;
     const label=await btn.evaluate(e=>(e.innerText||e.value||e.getAttribute('aria-label')||'').trim()).catch(()=>'');
     if(!/(convert|generate|download|export|create.*qbo|make.*qbo)/i.test(label)||/(upgrade|premium|pro\b|subscribe|trial|sign.?in|login)/i.test(label))continue;
     if(!await btn.isVisible().catch(()=>false)||!await btn.isEnabled().catch(()=>false))continue;
     try{await btn.click({timeout:3500});}catch{}
     await page.waitForTimeout(1400);
   }
   if(!downloads.length){
     for(const link of (await page.locator('a[download],a[href$=".qbo"]').all()).slice(0,10)){
       if(!await link.isVisible().catch(()=>false))continue;
       try{await link.click({timeout:2000});}catch{}
       await page.waitForTimeout(800);
       if(downloads.length)break;
     }
   }
   if(downloads.length){
     const d=downloads[0],file=await readFile(await d.path());
     p.fileDownloaded=true;p.sizeBytes=file.length;p.sha256=hash(file);
     p.downloadExt=d.suggestedFilename().split('.').pop()?.toLowerCase();
     if(file.length>5_000_000){p.status='unexpected_large_public_output';}
     else{
       try{
         const text=new TextDecoder('utf-8',{fatal:true}).decode(file);
         const candidate=parseInput(text,'qbo');
         const t=candidate.transactions;
         p.comparison={
           format:p.downloadExt,
           parseable:true,
           countMatches:t.length===expected.transactions.length,
           orderDatesMatch:t.length===2&&t.every((v,i)=>v.date===expected.transactions[i].date),
           orderAmountsMatch:t.length===2&&t.every((v,i)=>v.amount===expected.transactions[i].amount),
           sourceNetMatch:t.reduce((n,v)=>n+BigInt(Math.round(Number(v.amount)*100)),0n)===825n,
           idPresent:t.length===2&&t.every(v=>String(v.id||'').length>0)
         };
         p.crossVendorQboReconciled=Object.values(p.comparison).every((v,i)=>i===0||v===true);
         p.status=p.crossVendorQboReconciled?'synthetic_competitor_qbo_semantic_match':'synthetic_competitor_qbo_difference';
       }catch(e){p.status='external_output_not_parseable_in_our_reader';p.parseError=String(e.message||'error').slice(0,130);}
     }
   }else{
     body=(await page.locator('body').innerText().catch(()=>'')).slice(0,3000);
     p.status='no_qbo_download_observed';
     p.pageSignals={
       forbidden:/\bForbidden\b/i.test(body),
       invalidCsv:/invalid (csv|file)|file format not supported/i.test(body),
       missingAccountId:/account (number|id)|bank (id|identifier)/i.test(body),
       ready:/download qbo|ready to download|convert to qbo/i.test(body),
       signIn:/sign.?in|log.?in/i.test(body)
     };
     p.visibleEndText=body.slice(-550);
   }
   if(page&&site.id==='sonomir')await page.screenshot({path:'alternate-competitor-sonomir.png',fullPage:true}).catch(()=>{});
 }catch(e){p.status='external_navigation_or_interaction_error';p.error=String(e.message||'error').split('\n')[0].slice(0,200);}
 finally{results.competitors.push(p);await page?.close().catch(()=>{});}
}
}finally{
 await browser?.close().catch(()=>{});
 await writeFile('alternative-competitor-probe.json',JSON.stringify(results,null,2)+'\n');
 console.log('ALTERNATIVE_COMPETITOR_COMPARE '+JSON.stringify(results));
}
