/**
 * One-off external black-box compatibility probe against a publicly free
 * CSV-to-QBO conversion page. Synthetic transactions ONLY.
 *
 * This is NEVER evidence of a successful Intuit target-account import, and
 * cannot certify another provider's implementation or QuickBooks acceptance.
 * No bank customer data, identities, accounts or payment details are sent.
 */
import {chromium} from 'playwright-core';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseInput,quickBooksCSVExportPlan} from '../src/core.mjs';

const csv='Date,Description,Amount,Reference\n'+
 '10/14/2026,Fictional Espresso,-12.50,SYN001\n'+
 '10/15/2026,Fictional Refund,20.75,SYN002\n';
const expected={rows:2,amounts:['-12.50','20.75'],dates:['2026-10-14','2026-10-15'],netCents:825};
const url='https://accountingconverter.com/tools/csv-to-qbo';
const sha=buf=>createHash('sha256').update(buf).digest('hex');
const result={
  scope:'public_competitor_black_box_synthetic_only',
  source:url,generatedAt:new Date().toISOString(),
  expectedRows:expected.rows,expectedNetCents:expected.netCents,
  inputSha256:sha(Buffer.from(csv)),
  bytesUploadedSyntheticOnly:true,
  actualQuickBooksImportObserved:false,
  actualBankOriginalUsed:false,
  competitorClaimsNotIndependentlyCertified:true,
  status:'not_started',downloadObserved:false,comparison:'not_performed'
};
let browser,page;
const downloads=[];
try{
  const ours=parseInput(csv,'csv');
  const oursPlan=quickBooksCSVExportPlan(ours.transactions);
  result.ourManualCsvResult={
    format:'QuickBooks_Online_manual_3_column_CSV_NOT_WebConnect_QBO',
    rowCount:ours.transactions.length,
    datesMatch:ours.transactions.every((t,i)=>t.date===expected.dates[i]),
    amountsMatch:ours.transactions.every((t,i)=>t.amount===expected.amounts[i]),
    preflightOk:oursPlan.report.totalsReconciled&&oursPlan.report.orderedRowsReconciled
  };
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
  page=await browser.newPage({viewport:{width:1320,height:880},acceptDownloads:true});
  page.on('download',d=>downloads.push(d));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:32000});
  await page.waitForTimeout(2500);
  result.finalHost=new URL(page.url()).hostname;
  result.pageTitle=(await page.title()).slice(0,180);
  const body=(await page.locator('body').innerText({timeout:8000}).catch(()=>'')); 
  result.pageVisible=body.includes('Convert CSV to QBO')||body.includes('CSV to QBO');
  if(/verify you are human|captcha|cloudflare security check|security verification/i.test(body)){
    result.status='blocked_by_website_challenge';
  }else if(!result.pageVisible){
    result.status='competitor_page_not_observed';
  }else{
    const inputs=page.locator('input[type=file]');
    result.fileInputCount=await inputs.count();
    if(!result.fileInputCount){
      result.status='competitor_file_input_absent';
    }else{
      await inputs.first().setInputFiles({
        name:'fictional-accountingconverter-compare.csv',
        mimeType:'text/csv',
        buffer:Buffer.from(csv,'utf8')
      });
      result.syntheticUploadSelected=true;
      result.status='synthetic_input_supplied_no_download_yet';
      await page.waitForTimeout(3200);
      result.uploadInputMeta=await inputs.first().evaluate(e=>({
        name:e.name||null,accept:e.accept||null,files:e.files?.length||0,
        parentText:e.parentElement?.parentElement?.innerText?.slice(0,500)||''
      })).catch(()=>null);
      const availableNodes=page.locator('button,[role="button"],input[type="submit"],a[download]');
      result.allVisibleControls=[];
      for(const node of (await availableNodes.all()).slice(0,65)){
        if(!await node.isVisible().catch(()=>false))continue;
        const info=await node.evaluate(e=>({
          tag:e.tagName.toLowerCase(),
          type:e.type||null,
          aria:e.getAttribute('aria-label')||null,
          text:(e.innerText||e.value||'').trim().slice(0,95)
        })).catch(()=>null);
        if(info)result.allVisibleControls.push(info);
      }
      result.uploadStatusText=(await page.locator('body').innerText().catch(()=>''))
        .slice(0,1800);
      result.fileDownloadAnchors=await page.locator('a[download],a[href$=".qbo"]').count();
      const available=page.getByRole('button',{name:/convert|download|generate|export/i});
      const buttons=await available.all();
      result.actionButtonsSeen=[];
      for(const b of buttons.slice(0,14)){
        const label=(await b.innerText().catch(()=>'')).trim().slice(0,90);
        if(label)result.actionButtonsSeen.push(label);
      }
      for(const b of buttons.slice(0,10)){
        if(downloads.length)break;
        const label=(await b.innerText().catch(()=>'')).trim();
        if(!/convert|download|generate|export/i.test(label))continue;
        if(!await b.isVisible().catch(()=>false))continue;
        if(!await b.isEnabled().catch(()=>false))continue;
        try{await b.click({timeout:4500});}catch{}
        await page.waitForTimeout(1800);
      }
      if(!downloads.length){
        const links=page.locator('a[download],a[href$=".qbo"],a[href*="download"]');
        for(const l of (await links.all()).slice(0,8)){
          if(!await l.isVisible().catch(()=>false))continue;
          try{await l.click({timeout:4000});}catch{}
          await page.waitForTimeout(800);
          if(downloads.length)break;
        }
      }
      await page.waitForTimeout(4000);
      if(downloads.length){
        const d=downloads[0];
        const filename=d.suggestedFilename();
        result.downloadObserved=true;
        result.downloadExt=filename.split('.').pop()?.toLowerCase();
        const path=await d.path();
        const bytes=await readFile(path);
        result.downloadBytes=bytes.length;
        result.downloadSha256=sha(bytes);
        if(result.downloadExt==='qbo'||bytes.toString('utf8').includes('<OFX>')){
          result.downloadAppearsWebConnect=/\<OFX[>\s]/i.test(bytes.toString('utf8'));
          try{
            const txt=bytes.toString('utf8');
            const parsed=parseInput(txt,'qbo');
            const t=parsed.transactions;
            result.comparison={
              generatedWebConnectQBO:true,
              parseableByOurReader:true,
              rowsMatch:t.length===expected.rows,
              datesMatch:t.length===expected.rows&&t.every((v,i)=>v.date===expected.dates[i]),
              amountsMatch:t.length===expected.rows&&t.every((v,i)=>v.amount===expected.amounts[i]),
              netCents:t.reduce((n,v)=>n+BigInt(Math.round(Number(v.amount)*100)),0n).toString()==='825',
              idCount:t.filter(v=>v.id).length,
              outputFormat:'Web_Connect_QBO_NOT_manual_CSV'
            };
            result.status=result.comparison.rowsMatch&&result.comparison.datesMatch&&
              result.comparison.amountsMatch&&result.comparison.netCents?
              'external_qbo_semantic_agreement_synthetic_only':'external_qbo_semantic_difference_found';
          }catch(err){
            result.comparison='competitor_qbo_not_parsed_by_our_reader';
            result.parserErrorCategory=(err?.message||'Unknown').slice(0,200);
            result.status='external_qbo_parse_gap_or_unsupported_dialect';
          }
        }else{
          result.status='external_download_not_qbo';
        }
      }else{
        const now=(await page.locator('body').innerText().catch(()=>'')).slice(0,3500);
        result.visibleErrorCategories={
          fileError:/unsupported|invalid file|could not|cannot|file too large/i.test(now),
          loginRequested:/sign in|log in|register/i.test(now),
          quotaError:/limit reached|quota|daily limit/i.test(now),
          uploadSuccess:/conver(sion|ted|ting)|download/i.test(now)
        };
        result.status='external_download_not_observed';
      }
    }
  }
  await page.screenshot({path:'competitor-synthetic-probe.png',fullPage:true,timeout:11000}).catch(()=>{});
}catch(err){
  result.status='external_site_probe_error';
  result.errorName=(err?.name||'Unknown').slice(0,80);
  result.errorMessage=(err?.message||'Unknown').split('\n')[0].slice(0,250);
}finally{
  await browser?.close().catch(()=>{});
  await writeFile('competitor-synthetic-probe.json',JSON.stringify(result,null,2)+'\n');
  console.log('ACCOUNTINGCONVERTER_SYNTHETIC_COMPARE '+JSON.stringify(result));
}