/**
 * One-time independent black-box probe of ORIGINAL V3 reference competitors.
 * Only fictional file bytes; never signs in, purchases, contacts support,
 * bypasses CAPTCHA, modifies accounts or inspects nonpublic endpoints.
 * Returns an OBSERVED result, not a claimed Intuit import acceptance.
 */
import {chromium} from 'playwright-core';
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const sample='Date,Description,Amount\n10/14/2026,Fictional Espresso,-12.50\n10/15/2026,Fictional Refund,20.75\n';
const expected={count:2,dates:['2026-10-14','2026-10-15'],amounts:['-12.50','20.75'],netCents:'825'};
const sites=[
 {id:'accountingconverter',url:'https://accountingconverter.com/tools/csv-to-qbo'},
 {id:'docuclipper',url:'https://www.docuclipper.com/solutions/convert-csv-to-qbo/'}
];
const results={
 scope:'observed_public_original_competitor_black_box_check',
 githubRun:'GitHub Actions PR, 2026-11-05',
 sampleSha256:createHash('sha256').update(sample).digest('hex'),
 inputContainsOnlyClearlyFictionalData:true,
 expected,anyOutputCertifiedByIntuit:false,
 actualQuickBooksAccountImportObserved:false,
 actualIssuerOriginBankStatementUsed:false,
 sites:[]
};
const takeSafe=async p=>({
 title:(await p.title().catch(()=>''))?.slice(0,160),
 host:new URL(p.url()).hostname,
 path:new URL(p.url()).pathname,
 fileInputs:await p.locator('input[type=file]').count()
});
const sampleBytes=Buffer.from(sample,'utf8');
let browser;
try{
 browser=await chromium.launch({headless:true,channel:'chrome',args:['--no-sandbox']});
 for(const target of sites){
  let page;
  const info={site:target.id,source:target.url,status:'started',
    uploadConfirmed:false,downloadObserved:false,fullCsvToQboComparatorPassed:false,
    noLoginOrPaymentUsed:true,rawNetworkBodiesRecorded:false,externalHttpErrors:[]};
  const downloads=[];
  try{
    page=await browser.newPage({acceptDownloads:true,viewport:{width:1366,height:850}});
    page.setDefaultTimeout(5000);
    page.on('download',d=>downloads.push(d));
    page.on('response',res=>{
      try{
        if(res.status()>=400&&info.externalHttpErrors.length<8){
          const u=new URL(res.url());
          if(u.hostname===new URL(target.url).hostname||u.hostname.endsWith('.docuclipper.com'))
             info.externalHttpErrors.push({status:res.status(),host:u.hostname,path:u.pathname.slice(0,110)});
        }
      }catch{}
    });
    await page.goto(target.url,{waitUntil:'domcontentloaded',timeout:25000});
    await page.waitForTimeout(1700);
    Object.assign(info,await takeSafe(page));
    info.pageHasLogin=/\b(sign up|log in|login|start free trial)\b/i.test((await page.locator('body').innerText().catch(()=>''))?.slice(0,1100)||'');
    const file=page.locator('input[type=file]').first();
    if(info.fileInputs){
      await file.setInputFiles({name:'fictional-v3-source.csv',mimeType:'text/csv',buffer:sampleBytes});
      await page.waitForTimeout(3000);
      const b=(await page.locator('body').innerText().catch(()=>''))||'';
      info.fileSelectionObserved=b.includes('fictional-v3-source.csv');
      info.visibleFailure=b.match(/\b(Forbidden|unauthorized|please sign in|sign up to continue|file cannot be processed|error converting)\b/i)?.[0]||null;
      info.uploadConfirmed=!info.visibleFailure&&Boolean(info.fileSelectionObserved);
      const triggers=page.locator('button,[role=button],input[type=submit],a[download]');
      info.visibleActions=[];
      for(const button of (await triggers.all()).slice(0,35)){
        if(!await button.isVisible().catch(()=>false))continue;
        const label=(await button.evaluate(el=>
          String(el.innerText||el.value||el.getAttribute('aria-label')||'').trim().slice(0,80)
        ).catch(()=>''));
        if(label)info.visibleActions.push(label);
      }
      if(!info.visibleFailure){
        for(const button of (await triggers.all()).slice(0,28)){
          if(downloads.length)break;
          if(!await button.isVisible().catch(()=>false)||!await button.isEnabled().catch(()=>false))continue;
          const label=(await button.evaluate(el=>
             String(el.innerText||el.value||el.getAttribute('aria-label')||'').trim().slice(0,90)
          ).catch(()=>''));
          if(!/^(download|convert|generate|export|create)(\s|$)/i.test(label))continue;
          if(/sign|login|register|premium|upgrade|subscribe|purchase|start trial/i.test(label))continue;
          await button.click({timeout:4000}).catch(()=>{});
          await page.waitForTimeout(2100);
        }
      }
    }else{
      // Marketing landing pages are not conversion tools. Follow a single
      // public start-converting link to see whether actual product login is needed.
      const body=(await page.locator('body').innerText().catch(()=>''))||'';
      info.publicMarketingClaimsQbo=/CSV to QBO|QuickBooks Web Connect/i.test(body);
      const go=page.getByRole('link',{name:/start converting|upload your csv|start free trial|convert csv to qbo/i}).first();
      if(await go.count()&&await go.isVisible().catch(()=>false)){
        const href=await go.getAttribute('href').catch(()=>null);
        if(href)info.startConversionDestinationHost=new URL(href,page.url()).hostname;
        if(href){
          await go.click({timeout:3800}).catch(()=>{});
          await page.waitForTimeout(1400);
          Object.assign(info,await takeSafe(page));
        }
      }
      const nextBody=(await page.locator('body').innerText().catch(()=>''))||'';
      info.productRequiresAuth=/\b(sign up|create account|login|log in|continue with google|email address|password)\b/i.test(nextBody.slice(0,1400));
      info.marketingNoDirectUpload=info.fileInputs===0;
    }
    if(downloads.length){
      const d=downloads[0],f=await import('node:fs/promises').then(x=>x.readFile(d.path()));
      info.downloadObserved=true;
      info.downloadBytes=f.length;
      info.downloadExtension=d.suggestedFilename().split('.').pop()?.toLowerCase()||null;
      info.downloadSha256=createHash('sha256').update(f).digest('hex');
      if(f.length>0&&f.length<2e6&&info.downloadExtension==='qbo'){
       try{
        const {parseInput}=await import('../src/core.mjs');
        const tx=parseInput(f.toString('utf8'),'qbo').transactions;
        info.comparison={
          countMatches:tx.length===2,
          datesMatch:tx.length===2&&tx.every((v,i)=>v.date===expected.dates[i]),
          amountsMatch:tx.length===2&&tx.every((v,i)=>v.amount===expected.amounts[i]),
          netCentsMatch:tx.reduce((n,v)=>n+BigInt(Math.round(Number(v.amount)*100)),0n)===825n
        };
        info.fullCsvToQboComparatorPassed=Object.values(info.comparison).every(Boolean);
       }catch(e){
         info.comparison={parseErrorCategory:'local_ofx_reader_rejected_external_qbo',message:String(e.message||'').slice(0,170)};
       }
      }
    }
    info.status=info.fullCsvToQboComparatorPassed?'independent_competitor_conversion_verified':
       info.downloadObserved?'output_downloaded_but_semantic_match_not_verified':
       info.visibleFailure?'site_displayed_failure':
       info.productRequiresAuth?'product_requires_authentication':
       info.marketingNoDirectUpload?'no_direct_conversion_form_on_public_page':
       'no_download_observed';
    await page.screenshot({path:'original-competitor-'+target.id+'.png',fullPage:true,timeout:6000}).catch(()=>{});
   }catch(e){
    info.status='site_or_browser_execution_failure';
    info.errorType=String(e.name||'error').slice(0,90);
    info.errorDescription=String(e.message||'').split('\n')[0].slice(0,200);
   }finally{
    results.sites.push(info);
    await page?.close().catch(()=>{});
   }
 }
}finally{
 await browser?.close().catch(()=>{});
 await writeFile('original-competitor-20261105.json',JSON.stringify(results,null,2)+'\n');
 console.log('ORIGINAL_V3_COMPETITOR_VERIFICATION '+JSON.stringify(results));
}
