/**
 * One-time, non-authenticated, public Intuit Test Drive availability probe.
 *
 * NOT a QuickBooks bank-file acceptance test unless a synthetic CSV can be
 * uploaded and actual imported rows read from the public sample-company UI.
 * Never bypass CAPTCHA/login, create accounts, connect a bank or use secrets.
 */
import {chromium} from 'playwright-core';
import {writeFileSync} from 'node:fs';

const evidence={
  classification:'external_non_authenticated_public_demo_probe_only',
  source:'https://qbo.intuit.com/redir/testdrive',
  observed_utc:new Date().toISOString(),
  test_data:'fictional_synthetic_csv_only',
  captcha_or_auth_bypassed:false,
  bank_account_connected:false,
  paid_subscription_created:false,
  csv_upload_attempted:false,
  transaction_import_confirmed:false,
  qbo_real_account_uat_approved:false,
  status:'not_started'
};
let browser,page;
try{
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
  page=await browser.newPage({viewport:{width:1330,height:900},acceptDownloads:false});
  await page.goto(evidence.source,{waitUntil:'domcontentloaded',timeout:35000});
  await page.waitForTimeout(3500);
  evidence.final_host=new URL(page.url()).hostname;
  evidence.final_path=new URL(page.url()).pathname;
  evidence.title=(await page.title()).slice(0,140);
  const body=await page.locator('body').innerText({timeout:5000}).catch(()=>'');
  evidence.visible_page_type=/captcha|security verification|not a robot|verify you are human|security check/i.test(body)
    ?'human_verification_gate'
    : /sign in|log in|create an account/i.test(body) && !/Craig.s Design and Landscaping/i.test(body)
    ?'account_sign_in_gate'
    : /Craig.s Design and Landscaping|Sample Company/i.test(body)
    ?'sample_company_visible'
    :'unrecognized_or_redirect';
  if(evidence.visible_page_type==='human_verification_gate'){
    evidence.status='blocked_by_public_testdrive_human_verification';
  }else if(evidence.visible_page_type==='account_sign_in_gate'){
    evidence.status='blocked_by_testdrive_login';
  }else if(evidence.visible_page_type!=='sample_company_visible'){
    evidence.status='public_demo_not_observed';
  }else{
    const bank=page.getByText(/Bank transactions/i).first();
    const reachable=await bank.isVisible().catch(()=>false);
    if(reachable){
      await bank.click({timeout:5000}).catch(()=>{});
      await page.waitForTimeout(1600);
    }else{
      const menu=page.getByText(/Transactions/i).first();
      if(await menu.isVisible().catch(()=>false))await menu.click({timeout:4000}).catch(()=>{});
      await page.waitForTimeout(1200);
      const bankAfter=page.getByText(/Bank transactions/i).first();
      if(await bankAfter.isVisible().catch(()=>false))await bankAfter.click({timeout:4000}).catch(()=>{});
      await page.waitForTimeout(1500);
    }
    const upload=page.getByText(/Upload from file|upload transactions manually/i).first();
    if(await upload.isVisible().catch(()=>false)){
      await upload.click({timeout:4000}).catch(()=>{});
      await page.waitForTimeout(900);
    }
    const fileInput=page.locator('input[type="file"]').first();
    if(await fileInput.count()&&await fileInput.isVisible().catch(()=>false)){
      await fileInput.setInputFiles({
        name:'fictional-qbo-bank-upload.csv',
        mimeType:'text/csv',
        buffer:Buffer.from('Date,Description,Amount\n10/15/2026,Fictional test expense,-12.50\n10/16/2026,Fictional test refund,20.75\n','utf8')
      });
      evidence.csv_upload_attempted=true;
      await page.waitForTimeout(2500);
      evidence.status='synthetic_csv_chosen_in_public_demo_without_confirmed_import';
    }else{
      evidence.status='public_demo_bank_csv_upload_not_reached';
    }
  }
  await page.screenshot({path:'qbo-public-testdrive-probe.png',fullPage:true,timeout:8000}).catch(()=>{});
}catch(err){
  evidence.status='probe_technical_error_or_public_site_blocker';
  evidence.error_category=String(err?.name||'Error');
}finally{
  if(page){
    evidence.final_host??=new URL(page.url()).hostname;
    evidence.title??=(await page.title().catch(()=>'')).slice(0,140);
  }
  await browser?.close().catch(()=>{});
  writeFileSync('qbo-public-testdrive-evidence.json',JSON.stringify(evidence,null,2)+'\n');
  console.log('PUBLIC_INTUIT_TESTDRIVE_PROBE_RESULT '+JSON.stringify(evidence));
}
