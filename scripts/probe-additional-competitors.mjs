/**
 * ONE-TIME public competitor browser probe (2026-11-05).
 * Uses only 2 explicitly fictional sample rows. Never creates accounts,
 * enters authentic bank identifiers, pays, bypasses access restrictions, or
 * equates third-party vendor output with a QuickBooks import acceptance.
 * Run MANUALLY via the short-lived PR CI step; not part of permanent CI.
 */
import {chromium} from 'playwright-core';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseInput,toMinorUnits} from '../src/core.mjs';

const source=await readFile('dist/samples/sonomir-synthetic-source-test-only.csv');
const sha=b=>createHash('sha256').update(b).digest('hex');
const expected=parseInput(source.toString('utf8'),'csv').transactions;
const sites=[
 {id:'qbomaker',url:'https://qbomaker.com/'},
 {id:'csvdock',url:'https://csvdock.com/csv-to-qbo'},
 {id:'balancetick',url:'https://balancetick.com/convert/csv-to-qbo'},
 {id:'convertfin',url:'https://convertfin.com/convert/csv-to-qbo'},
 {id:'accountingconverter-retry',url:'https://accountingconverter.com/tools/csv-to-qbo'}
];
const report={scope:'additional_original_data_competitor_browser_probe',
 observedAt:new Date().toISOString(),
 sampleFilename:'sonomir-synthetic-source-test-only.csv',
 inputSha256:sha(source),
 expectedCount:expected.length,
 expectedNetCents:expected.reduce((n,r)=>n+toMinorUnits(r.amount),0n).toString(),
 actualQuickBooksImportObserved:false,
 vendorClaimsNotEvidence:true, sites:[]};
const text=p=>p.locator('body').innerText().catch(()=>'');
const label=el=>el.evaluate(x=>String(x.innerText||x.value||x.getAttribute('aria-label')||'').trim().slice(0,95)).catch(()=>'');
const wait=async p=>{await p.waitForTimeout(1400);};
let browser;
try {
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--no-sandbox']});
 for(const target of sites){
  let page;
  const out={id:target.id,url:target.url,status:'started',sampleMatches:false,downloadObserved:false,
    realBankCredentialsSupplied:false,accountCreated:false,networkErrors:[]};
  const downloads=[];
  try{
   page=await browser.newPage({acceptDownloads:true,viewport:{width:1320,height:850}});
   page.setDefaultTimeout(6000);
   page.on('download',d=>downloads.push(d));
   page.on('response',res=>{
    if(res.status()>=400&&out.networkErrors.length<7){
     try{const u=new URL(res.url());
      if(u.host===new URL(target.url).host)
       out.networkErrors.push({status:res.status(),path:u.pathname.slice(0,90)});
     }catch{}
    }
   });
   await page.goto(target.url,{waitUntil:'domcontentloaded',timeout:26000});
   await wait(page);
   out.title=(await page.title()).slice(0,110);
   out.finalUrl=page.url();
   let input=page.locator('input[type=file]').first();
   out.fileInputs=await page.locator('input[type=file]').count();
   if(!out.fileInputs){
     const choose=page.getByRole('button',{name:/choose.*csv|choose.*file|select.*file|upload csv|browse/i}).first();
     if(await choose.count())await choose.click({timeout:3000}).catch(()=>{});
     out.fileInputs=await page.locator('input[type=file]').count();
     input=page.locator('input[type=file]').first();
   }
   if(out.fileInputs){
     await input.setInputFiles({name:'fictional-test-transactions.csv',mimeType:'text/csv',buffer:source});
     await wait(page);
     out.fileSelected=true;
   }else{out.fileSelected=false;}
   const used=new Set();
   for(let round=0;round<5&&!downloads.length;round++){
     const candidates=[];
     for(const el of (await page.locator('button,[role=button],input[type=submit],input[type=button],a').all()).slice(0,100)){
       if(!await el.isVisible().catch(()=>false)||!await el.isEnabled().catch(()=>false))continue;
       const name=await label(el);
       if(!name||used.has(name))continue;
       const isAction=/\b(download|convert|generate|export|create)\b.*\b(qbo|file|web connect)\b|\b(qbo|web connect)\b.*\b(download|convert|generate|export)\b|^(convert|download qbo|export qbo|qbo)$/i.test(name);
       if(!isAction||/sign up|subscribe|login|register|premium|upgrade|pay|buy|start free trial|purchase/i.test(name))continue;
       candidates.push({el,name});
     }
     if(!candidates.length)break;
     // Convert first when an initial mapping page is present; download next.
     candidates.sort((a,b)=>{
       const weight=s=>/^convert$/i.test(s)?-4:/convert.*qbo/i.test(s)?-3:/download.*qbo/i.test(s)?-2:0;
       return weight(a.name)-weight(b.name);
     });
     const c=candidates[0];used.add(c.name);
     out.clicked=(out.clicked||[]).concat(c.name);
     await c.el.click({timeout:3500}).catch(e=>{out.lastClickError=String(e.message).split('\n')[0].slice(0,100)});
     await page.waitForTimeout(2300);
    }
    out.visibleActions=[];
    for(const el of (await page.locator('button,[role=button],input[type=submit]').all()).slice(0,40)){
      if(await el.isVisible().catch(()=>false)){
        const n=await label(el);if(n)out.visibleActions.push(n);
      }
    }
    const b=(await text(page)).slice(0,15000);
    out.visibleBlockingMessage=b.match(/\b(Forbidden|Access Denied|please sign in|create your account|sign up to continue|free trial|exceeded your limit|invalid file)\b/i)?.[0]||null;
    if(downloads.length){
      const d=downloads.find(x=>/\.qbo$/i.test(x.suggestedFilename()))||downloads[0];
      const f=await readFile(await d.path());
      out.downloadObserved=true;
      out.downloadFilename=d.suggestedFilename().replace(/[^a-z0-9_.-]/ig,'_').slice(0,90);
      out.downloadBytes=f.length;out.downloadSha256=sha(f);
      out.qboExtension=/\.qbo$/i.test(out.downloadFilename);
      if(out.qboExtension&&f.length&&f.length<400000){
        try{
          const parsed=parseInput(f.toString('utf8'),'qbo').transactions;
          out.parsedCount=parsed.length;
          out.parsedNetCents=parsed.reduce((n,r)=>n+toMinorUnits(r.amount),0n).toString();
          out.rowByRowMatch=parsed.length===expected.length&&parsed.every((r,i)=>
            r.date===expected[i].date &&
            toMinorUnits(r.amount)===toMinorUnits(expected[i].amount) &&
            r.description===expected[i].description);
          out.sampleMatches=out.rowByRowMatch&&out.parsedNetCents===report.expectedNetCents;
          out.qboBase64ForFixture=f.length<=10000?f.toString('base64'):null;
        }catch(e){
          out.parseFailure=String(e.message||e).slice(0,220);
          out.qboBase64ForFixture=f.length<=5000?f.toString('base64'):null;
        }
      }
    }
    out.status=out.sampleMatches?'downloaded_qbo_and_rowwise_compared':
      out.downloadObserved?'download_observed_semantics_not_verified':
      out.visibleBlockingMessage?'blocked_or_gate_visible':
      out.fileSelected?'file_selected_no_qbo_download':'no_public_upload';
    await page.screenshot({path:'additional-competitor-'+target.id+'.png',fullPage:true,timeout:5000}).catch(()=>{});
  }catch(e){
    out.status='browser_or_site_error';
    out.error=String(e.message||e).split('\n')[0].slice(0,210);
  }finally{
    report.sites.push(out);
    console.log('EXTERNAL_QBO_CHECK '+JSON.stringify(out));
    await page?.close().catch(()=>{});
  }
 }
}finally{
 await browser?.close().catch(()=>{});
 await writeFile('additional-competitor-20261105.json',JSON.stringify(report,null,2)+'\n');
 console.log('EXTERNAL_QBO_REPORT '+JSON.stringify({inputSha256:report.inputSha256,
  expectedNetCents:report.expectedNetCents,results:report.sites.map(s=>({
   id:s.id,status:s.status,sha256:s.downloadSha256||null,rows:s.parsedCount||null,
   net:s.parsedNetCents||null
  }))}));
}