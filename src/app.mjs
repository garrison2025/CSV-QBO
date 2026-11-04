import {MAX_FILE_BYTES,decodeFinancialBytes,parseCSV,guessMapping,parseInput,toCSV,toQIF,toQuickBooksCSV,quickBooksCSVParts,quickBooksCSVExportPlan,auditTransactions,totals,escapeHtml} from './core.mjs';
import {toXLSX,toZIP} from './xlsx.mjs';
import {batchConvert,MAX_BATCH_FILES,MAX_BATCH_BYTES} from './batch.mjs';

const $ = s => document.querySelector(s);
const drop=$('#drop-zone'), fileInput=$('#file-input'), formatPicker=$('#target-format');
if(drop && fileInput){
  const source=drop.dataset.source||'any';
  const fixedOutput=drop.dataset.output||'csv';
  let file=null,parsed=null,table=null,fileText="",fileExt="",fileEncoding='utf-8',audit=null,selectionEpoch=0;
  let batchFiles=[],batchArchive=null,batchInfo=null,batchHasWarnings=false,batchEpoch=0;
  const say=(msg,kind='info')=>{const box=$('#work-status');box.textContent=msg;box.dataset.state=kind;box.hidden=false;};
  function setButton(on){const btn=$('#export-button');btn.disabled=!on;btn.setAttribute('aria-disabled',String(!on));}
  function updateMapping(headers){
    table=headers;const guess=guessMapping(headers);
    let stored=null;try{stored=JSON.parse(localStorage.getItem('finance-file-lab:column-mapping:v1')||'null');}catch{}
    const saved=stored&&JSON.stringify(stored.headers)===JSON.stringify(headers)?stored.mapping:null;
    for(const field of ['date','description','amount','debit','credit','id']){
      const el=$('#map-'+field);if(!el)continue;
      el.replaceChildren();el.add(new Option('— Not selected —','-1'));
      headers.forEach((name,i)=>el.add(new Option(name,String(i))));
      el.value=String(saved?.[field]??guess[field]??-1);
    }
    $('#mapping-panel').hidden=false;
  }
  function mapping(){return Object.fromEntries(['date','description','amount','debit','credit','id'].map(k=>[k,Number($('#map-'+k).value)]));}
  function renderResult(data){
    audit=auditTransactions(data.transactions);const t=audit.summary,tbody=$('#preview-body');tbody.replaceChildren();
    data.transactions.slice(0,8).forEach(item=>{const tr=document.createElement('tr');for(const key of ['date','description','amount','id']){const td=document.createElement('td');td.textContent=String(item[key]??'');if(key==='amount')td.className=String(item.amount).startsWith('-')?'negative':'positive';tr.appendChild(td);}tbody.appendChild(tr);});
    $('#preview-panel').hidden=false;$('#summary-count').textContent=t.count.toLocaleString('en-US');$('#summary-net').textContent=t.net;$('#summary-debit').textContent=t.debit;
    $('#summary-credit').textContent=t.credit;
    $('#preview-caption').textContent=data.transactions.length>8?'First 8 of '+data.transactions.length+' transactions are shown.':'All '+data.transactions.length+' transactions are shown.';
    $('#warning-list').replaceChildren();for(const note of [...data.warnings,...audit.warnings]){const li=document.createElement('li');li.textContent=note;$('#warning-list').append(li);}
    $('#warning-box').hidden=!(data.warnings.length+audit.warnings.length);
    const hasWarnings=data.warnings.length+audit.warnings.length>0;
    const ack=$('#warning-ack'),label=$('#warning-ack-label');
    if(ack)ack.checked=false;
    if(label)label.hidden=!hasWarnings;
    setButton(!hasWarnings);
    const integrityNote=data.integrity?.check==='iif_trns_split_balance'?` ${data.integrity.balancedGroups} IIF group(s) balanced; only TRNS summary rows are exported.`:'';
    say((hasWarnings?'Ready with format and duplicate warnings. Review before download.':'Ready. Review the transaction preview, then download.')+integrityNote,hasWarnings?'info':'success');
  }
  $('#warning-ack')?.addEventListener('change',()=>{
    const warnings=parsed&&audit ? parsed.warnings.length+audit.warnings.length : 0;
    setButton(Boolean(parsed?.transactions?.length)&&(!warnings||$('#warning-ack').checked));
  });
  function withEncodingWarning(data,encoding){
    if(encoding!=='utf-8')data.warnings.unshift('The source file was decoded locally as '+encoding+'. Verify accented names and transaction details.');
    return data;
  }
  async function prepare(chosen){
    const epoch=++selectionEpoch;
    file=chosen;parsed=null;audit=null;table=null;fileText='';fileExt='';fileEncoding='utf-8';setButton(false);$('#preview-panel').hidden=true;$('#mapping-panel').hidden=true;$('#warning-ack-label').hidden=true;$('#warning-ack').checked=false;$('#file-name').textContent='';
    if(!file)return;
    if(file.size>MAX_FILE_BYTES){say('The file is over the 8 MB limit. Try a smaller export.','error');return;}
    const ext=(file.name.split('.').pop()||'').toLowerCase();
    if(!['csv','tsv','ofx','qbo','qfx','qif','iif'].includes(ext)){say('Unsupported input file. Please choose CSV, QBO, QFX, OFX, QIF or IIF.','error');return;}
    if(source!=='any' && source!==ext && !(source==='csv'&&ext==='tsv')){say('This tool expects a .'+source+' input. Choose a matching file or browse another converter.','error');return;}
    $('#file-name').textContent=file.name+' • '+Math.ceil(file.size/1024)+' KB';
    try{
      const decoded=decodeFinancialBytes(new Uint8Array(await chosen.arrayBuffer()),ext);
      if(epoch!==selectionEpoch)return; // A superseded async read must not restore old bank data.
      const {text,encoding}=decoded;
      fileText=text;fileExt=ext;fileEncoding=encoding;
      if(ext==='csv'||ext==='tsv'){
        updateMapping(parseCSV(text,ext==='tsv'?'\t':undefined)[0]);
        say('Select column mappings, then choose Preview transactions.');
      }else{parsed=withEncodingWarning(parseInput(text,ext,{dateFormat:$('#date-format').value}),encoding);renderResult(parsed);}
    }catch(err){if(epoch===selectionEpoch)say(err.message||'Could not read file.','error');}
  }
  const batchPicker=$('#batch-input'),batchSelect=$('#batch-choose'),batchExport=$('#batch-export');
  function batchReset(){
    batchArchive=null;batchInfo=null;batchHasWarnings=false;
    if(batchExport)batchExport.disabled=true;
    if($('#batch-ack'))$('#batch-ack').checked=false;
    if($('#batch-ack-label'))$('#batch-ack-label').hidden=true;
  }
  function batchSay(message,isError=false){
    if(!$('#batch-status'))return;
    $('#batch-status').textContent=message;
    $('#batch-status').dataset.state=isError?'error':'info';
  }
  batchSelect?.addEventListener('click',()=>{batchPicker.value='';batchPicker.click();});
  batchPicker?.addEventListener('change',async()=>{
    const epoch=++batchEpoch;
    batchReset();
    batchFiles=Array.from(batchPicker.files||[]);
    const list=$('#batch-file-list');list.replaceChildren();
    batchFiles.forEach((selected,i)=>{const li=document.createElement('li');li.textContent=(i+1)+'. '+selected.name+' ('+Math.ceil(selected.size/1024)+' KB)';list.appendChild(li);});
    if(!batchFiles.length)return batchSay('No batch files selected.');
    if(batchFiles.length>MAX_BATCH_FILES)return batchSay('Select at most '+MAX_BATCH_FILES+' files.',true);
    const bytes=batchFiles.reduce((sum,selected)=>sum+selected.size,0);
    if(bytes>MAX_BATCH_BYTES)return batchSay('The batch exceeds the 12 MB input limit.',true);
    if(batchFiles.some(selected=>selected.size>MAX_FILE_BYTES))return batchSay('One of your files exceeds the 8 MB file limit.',true);
    const target=formatPicker?formatPicker.value:fixedOutput;
    if(!['csv','xlsx'].includes(target))return batchSay('Batch mode supports CSV/Excel output only. Use single-file conversion for this format.',true);
    batchSay('Checking '+batchFiles.length+' files locally. No transaction data is uploaded.');
    await Promise.resolve();
    try{
      const texts=await Promise.all(batchFiles.map(async selected=>({name:selected.name,...decodeFinancialBytes(new Uint8Array(await selected.arrayBuffer()),selected.name.split('.').pop().toLowerCase())})));
      if(epoch!==batchEpoch)return;
      batchInfo=batchConvert(texts,{target,source,dateFormat:$('#date-format').value});
      batchArchive=batchInfo.archive;batchHasWarnings=batchInfo.warningCount>0;
      const iifGroups=batchInfo.report.files.reduce((sum,item)=>sum+(item.parserIntegrity?.balancedGroups||0),0);
      batchSay(batchInfo.report.totalFiles+' separate outputs ready · '+batchInfo.report.totalTransactions+' transactions · '+batchInfo.warningCount+' warning(s).'+(iifGroups?' '+iifGroups+' balanced IIF group(s) checked.':'')+' No accounts merged.');
      if(batchHasWarnings){$('#batch-ack-label').hidden=false;batchExport.disabled=true;}
      else batchExport.disabled=false;
    }catch(err){if(epoch===batchEpoch){batchReset();batchSay(err.message||'Batch conversion failed; no files produced.',true);}}
  });
  $('#batch-ack')?.addEventListener('change',event=>{if(batchExport)batchExport.disabled=!batchArchive||(batchHasWarnings&&!event.target.checked);});
  batchExport?.addEventListener('click',()=>{
    if(!batchArchive)return batchSay('Choose a valid batch first.',true);
    if(batchHasWarnings&&!$('#batch-ack').checked)return batchSay('Acknowledge the warnings before downloading.',true);
    saveBlob(new Blob([batchArchive],{type:'application/zip'}),'finance-file-lab-separate-conversions.zip');
    batchSay('ZIP downloaded. Review each file and its validation report before import.');
  });
  formatPicker?.addEventListener('change',()=>{
    if(batchFiles.length){batchEpoch++;batchReset();batchFiles=[];if(batchPicker)batchPicker.value='';$('#batch-file-list').replaceChildren();batchSay('Output format changed. Select batch files again to regenerate results.');}
  });
  // Date ordering applies to QIF and IIF as well as CSV; changing it must
  // refresh the preview rather than silently leave the old interpretation.
  $('#date-format')?.addEventListener('change',()=>{
    if(batchFiles.length){batchEpoch++;batchReset();batchFiles=[];if(batchPicker)batchPicker.value='';$('#batch-file-list').replaceChildren();batchSay('Date order changed. Select batch files again to avoid stale exports.');}
    if(!file||!fileText)return;
    if(fileExt==='csv'||fileExt==='tsv'){
      parsed=null;setButton(false);$('#preview-panel').hidden=true;
      say('Date order changed. Select Preview transactions to validate again.');
    }else{
      try{parsed=withEncodingWarning(parseInput(fileText,fileExt,{dateFormat:$('#date-format').value}),fileEncoding);renderResult(parsed);}
      catch(err){parsed=null;setButton(false);$('#preview-panel').hidden=true;say(err.message||'Invalid date format.','error');}
    }
  });
  $('#clear-workspace')?.addEventListener('click',()=>{
    selectionEpoch++;batchEpoch++;
    batchFiles=[];batchReset();
    if(batchPicker)batchPicker.value='';
    if($('#batch-file-list'))$('#batch-file-list').replaceChildren();
    batchSay('Batch files and generated ZIP cleared from the workspace.');
    file=null;parsed=null;audit=null;table=null;fileText='';fileExt='';
    fileInput.value='';
    $('#file-name').textContent='';
    $('#preview-body').replaceChildren();
    $('#warning-list').replaceChildren();
    $('#mapping-panel').hidden=true;
    $('#preview-panel').hidden=true;
    $('#warning-box').hidden=true;
    $('#warning-ack-label').hidden=true;
    $('#warning-ack').checked=false;
    setButton(false);
    say('Workspace cleared, including source files, batch ZIP and previews. Previously downloaded files and saved mappings remain on your device.','success');
  });
  fileInput.addEventListener('change',event=>prepare(event.target.files[0]));
  drop.addEventListener('dragover',event=>{event.preventDefault();drop.classList.add('is-dragging');});
  drop.addEventListener('dragleave',()=>drop.classList.remove('is-dragging'));
  drop.addEventListener('drop',event=>{event.preventDefault();drop.classList.remove('is-dragging');if(event.dataTransfer.files.length)prepare(event.dataTransfer.files[0]);});
  $('#save-mapping-button')?.addEventListener('click',()=>{
    if(!table)return;
    try {localStorage.setItem('finance-file-lab:column-mapping:v1',JSON.stringify({headers:table,mapping:mapping()}));say('Column template saved only on this device. No transactions stored.','success');}
    catch {say('Could not save template in this browser.','error');}
  });
  $('#download-report')?.addEventListener('click',()=>{
    if(!parsed||!audit)return;
    const dates=parsed.transactions.map(transaction=>transaction.date).sort();
    const report={reportType:'Finance File Lab local validation summary v3',sourceFormat:parsed.source,transactionCount:audit.summary.count,totalIn:audit.summary.credit,totalOut:audit.summary.debit,net:audit.summary.net,dateRange:{first:dates[0],last:dates[dates.length-1]},parserIntegrity:parsed.integrity||null,outputIsLedger:false,csvEscapedDescriptionCount:audit.csvFormulaGuardCount,requiresUserWarningAcknowledgement:(parsed.warnings.length+audit.warnings.length)>0,repeatedReferences:audit.duplicateIds.map(x=>({row:x.row,firstRow:x.firstRow})),possibleDuplicates:audit.possibleDuplicates,notes:[...parsed.warnings,...audit.warnings],quickBooksImportTested:false,containsTransactionDescriptions:false};
    const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json;charset=utf-8'});
    saveBlob(blob,'validation-summary.json');
    say('Validation summary downloaded (no account numbers or transaction descriptions).','success');
  });
  $('#preview-button')?.addEventListener('click',()=>{
    if(!file)return;
    try{parsed=parseInput(fileText,fileExt,{mapping:mapping(),dateFormat:$('#date-format').value});renderResult(parsed);}
    catch(err){setButton(false);say(err.message,'error');}
  });
  function saveBlob(blob,filename){
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=filename;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  $('#export-button').addEventListener('click',()=>{
    if(!parsed?.transactions?.length){say('Preview a valid file first.','error');return;}
    if((parsed.warnings.length+audit.warnings.length)>0&&!$('#warning-ack').checked){say('Review and acknowledge the displayed warnings before exporting.','error');return;}
    const target=formatPicker?formatPicker.value:fixedOutput;
    let content,mime,ext;
    try{
      if(target==='csv'){content=toCSV(parsed.transactions);mime='text/csv;charset=utf-8';ext='csv';}
      else if(target==='qb-csv'){
        const {parts,report}=quickBooksCSVExportPlan(parsed.transactions);
        if(parts.length===1){content=parts[0];mime='text/csv;charset=utf-8';ext='csv';}
        else{
          const files=Object.fromEntries(parts.map((part,i)=>['quickbooks-online-part-'+String(i+1).padStart(3,'0')+'.csv',part]));
          files['quickbooks-csv-validation.json']=JSON.stringify(report,null,2);
          content=toZIP(files);mime='application/zip';ext='zip';
        }
      }
      else if(target==='xlsx'){content=toXLSX(parsed.transactions);mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';ext='xlsx';}
      else if(target==='qif'){content=toQIF(parsed.transactions);mime='application/x-qif';ext='qif';}
      else throw Error('Output format is not available in this release.');
      const data=new Blob([content],{type:mime});saveBlob(data,file.name.replace(/\.[^.]+$/,'')+'-converted.'+ext);
      say(target==='qb-csv'?'QuickBooks CSV downloaded after row and amount reconciliation. This is NOT a .qbo file; manual import success is unverified.':'File downloaded. Always review transactions and verify compatibility before importing into accounting software.','success');
    }catch(err){say(err.message||'Export failed.','error');}
  });
}

// Deliberately no analytics that contain account details, filenames or transaction data.
