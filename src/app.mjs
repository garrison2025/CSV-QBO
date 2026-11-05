import {MAX_FILE_BYTES,decodeFinancialBytes,parseCSV,guessMapping,csvColumnEvidence,suggestCSVDescriptionRemap,parseInput,genericCSVExportPlan,toQIF,toQuickBooksCSV,quickBooksCSVParts,quickBooksCSVExportPlan,auditTransactions,totals,escapeHtml} from './core.mjs';
import {toXLSX,toZIP} from './xlsx.mjs';
import {batchConvert,MAX_BATCH_FILES,MAX_BATCH_BYTES} from './batch.mjs';

const $ = s => document.querySelector(s);
const drop=$('#drop-zone'), fileInput=$('#file-input'), formatPicker=$('#target-format');
if(drop && fileInput){
  const source=drop.dataset.source||'any';
  const fixedOutput=drop.dataset.output||'csv';
  let file=null,parsed=null,table=null,csvEvidence=null,fileText="",fileExt="",fileEncoding='utf-8',audit=null,selectionEpoch=0;
  let batchFiles=[],batchArchive=null,batchInfo=null,batchHasWarnings=false,batchEpoch=0;
  const PREVIEW_PAGE_SIZE=25;
  let previewPage=0,reviewCursor=0,reviewRows=[];
  const say=(msg,kind='info')=>{const box=$('#work-status');box.textContent=msg;box.dataset.state=kind;box.hidden=false;};
  function setButton(on){const btn=$('#export-button');btn.disabled=!on;btn.setAttribute('aria-disabled',String(!on));}
  function updateMapping(headers){
    table=headers;const guess=guessMapping(headers);
    // Distinguish identically named columns in manual selectors. The bank's
    // source headings remain unchanged; positions are one-based UI labels.
    const normalized=headers.map(x=>String(x??'').trim().toLowerCase().replace(/[_-]+/g,' '));
    const labelCounts=new Map();
    for(const name of normalized)if(name)labelCounts.set(name,(labelCounts.get(name)||0)+1);
    let stored=null;try{stored=JSON.parse(localStorage.getItem('finance-file-lab:column-mapping:v1')||'null');}catch{}
    const saved=stored&&JSON.stringify(stored.headers)===JSON.stringify(headers)?stored.mapping:null;
    for(const field of ['date','description','amount','debit','credit','id','memo']){
      const el=$('#map-'+field);if(!el)continue;
      el.replaceChildren();el.add(new Option('— Not selected —','-1'));
      headers.forEach((name,i)=>{
        const label=labelCounts.get(normalized[i])>1?name+' (column '+(i+1)+')':name;
        el.add(new Option(label,String(i)));
      });
      el.value=String(saved?.[field]??guess[field]??-1);
    }
    $('#mapping-panel').hidden=false;
    updateMappingAdvice();
  }
  function mapping(){return Object.fromEntries(['date','description','amount','debit','credit','id','memo'].map(k=>[k,Number($('#map-'+k).value)]));}
  function updateMappingAdvice(){
    const hint=$('#mapping-advice'),action=$('#apply-memo-description'),dateHint=$('#mapping-date-advice');
    const candidate=csvEvidence?suggestCSVDescriptionRemap(csvEvidence,mapping()):null;
    if(hint) {
      hint.hidden=!candidate;
      hint.textContent=candidate
        ? 'In all '+candidate.rowsChecked+' transaction row(s), the selected Description column is blank while Memo has text. This may be a Memo-as-payee export. Review before applying: no bank data or amounts are changed automatically.'
        : '';
    }
    if(action)action.hidden=!candidate;
    if(dateHint){
      const cols=(csvEvidence?.headers||[]).map((h,i)=>({h:String(h).trim(),i}))
        .filter(x=>/^(date|transaction date|trans\.? date|posted date|post date|posting date)$/i.test(x.h));
      dateHint.hidden=cols.length<2;
      dateHint.textContent=cols.length<2?'':'Multiple date columns found (such as transaction and posted date). Confirm the intended Date column before preview; the date meaning will not be inferred from transaction amounts.';
    }
  }
  $('#apply-memo-description')?.addEventListener('click',()=>{
    if(!csvEvidence)return;
    const candidate=suggestCSVDescriptionRemap(csvEvidence,mapping());
    if(!candidate)return;
    $('#map-description').value=String(candidate.memoIndex);
    $('#map-memo').value='-1';
    invalidatePreview();
    updateMappingAdvice();
    say('Memo explicitly selected as Description and Memo duplicate mapping cleared. Verify dates and amount signs, then select Preview transactions.');
  });
  // A preview is valid only for the file, date order and exact column
  // mapping used to create it. Never leave previously reviewed bank data
  // exportable after a user changes any of those inputs.
  function invalidatePreview(){
    parsed=null;audit=null;setButton(false);
    $('#preview-panel').hidden=true;
    $('#warning-box').hidden=true;
    $('#warning-list').replaceChildren();
    $('#preview-body').replaceChildren();
    $('#preview-caption').textContent='';
    previewPage=0;reviewCursor=0;reviewRows=[];
    $('#preview-navigation').hidden=true;
    $('#preview-page-status').textContent='';
    $('#preview-previous').disabled=true;
    $('#preview-next').disabled=true;
    $('#preview-review').hidden=true;
    $('#preview-search').value='';
    $('#preview-only-flags').checked=false;
    $('#preview-filter-status').textContent='';
    $('#include-memo').checked=false;
    $('#memo-toggle-label').hidden=true;
    $('#memo-coverage').hidden=true;
    $('#memo-coverage').textContent='';
    $('#preview-memo-head').hidden=true;
    for(const key of ['count','net','debit','credit'])$('#summary-'+key).textContent='0';
    const statement=$('#statement-coverage');
    if(statement){statement.hidden=true;statement.textContent='';}
    const balance=$('#balance-coverage');
    if(balance){balance.hidden=true;balance.textContent='';}
    $('#warning-ack-label').hidden=true;
    $('#warning-ack').checked=false;
    const report=$('#download-report');
    if(report)report.disabled=true;
  }
  // Filtering only controls visibility. It never mutates parsed.transactions,
  // reconciliation totals, duplicate warnings, or what is downloaded.
  function matchingPreviewIndices(){
    if(!parsed?.transactions?.length)return [];
    const query=$('#preview-search').value.trim().toLowerCase();
    const flaggedOnly=$('#preview-only-flags').checked;
    const flagged=new Set(reviewRows);
    const matches=[];
    for(let i=0;i<parsed.transactions.length;i++){
      if(flaggedOnly&&!flagged.has(i+1))continue;
      const item=parsed.transactions[i];
      if(query&&![item.date,item.description,item.amount,item.id,item.memo].some(
        value=>String(value??'').toLowerCase().includes(query)))continue;
      matches.push(i);
    }
    return matches;
  }
  function hasMemoValues(){
    return Boolean(parsed?.transactions?.some(row=>String(row.memo??'').length>0));
  }
  function updateMemoCoverage(){
    const box=$('#memo-coverage'),toggle=$('#memo-toggle-label');
    if(!parsed?.transactions?.length){box.hidden=true;toggle.hidden=true;return;}
    const count=parsed.transactions.reduce((n,row)=>n+(String(row.memo??'').length>0?1:0),0);
    $('#preview-memo-head').hidden=count===0;
    box.hidden=count===0;
    const format=formatPicker?formatPicker.value:fixedOutput;
    toggle.hidden=count===0||!['csv','xlsx'].includes(format);
    if(!count)return;
    const suffix=count+' of '+parsed.transactions.length+' source transaction(s) contain a separate Memo field. ';
    if(format==='qb-csv')
      box.textContent=suffix+'QuickBooks Online requires exactly three CSV columns: separate Memo values will NOT be included. Use a general CSV/Excel export if you need the separate Memo column.';
    else if(format==='qif')
      box.textContent=suffix+'QIF Bank export retains supported Memo values as M records; multiline values are rejected rather than changed.';
    else if($('#include-memo').checked)
      box.textContent=suffix+'The additional Memo column WILL be included in this '+(format==='xlsx'?'Excel':'CSV')+' download; verify that the receiving application accepts the extra column.';
    else
      box.textContent=suffix+'The default four-column '+(format==='xlsx'?'Excel':'CSV')+' download EXCLUDES Memo. Select the checkbox below to preserve the separate Memo column.';
  }
  $('#include-memo')?.addEventListener('change',()=>{if(parsed)updateMemoCoverage();});
  function renderPreviewPage(){
    if(!parsed?.transactions?.length||!audit)return;
    const records=parsed.transactions,total=records.length;
    const matches=matchingPreviewIndices(),matchedTotal=matches.length;
    const flagged=new Set(reviewRows),matchedSet=new Set(matches);
    const activeFlags=reviewRows.filter(row=>matchedSet.has(row-1));
    const pageCount=Math.max(1,Math.ceil(matchedTotal/PREVIEW_PAGE_SIZE));
    previewPage=Math.max(0,Math.min(previewPage,pageCount-1));
    const start=previewPage*PREVIEW_PAGE_SIZE,end=Math.min(start+PREVIEW_PAGE_SIZE,matchedTotal);
    const tbody=$('#preview-body');tbody.replaceChildren();
    for(const index of matches.slice(start,end)){
      const item=records[index],tr=document.createElement('tr'),rowNumber=index+1;
      tr.setAttribute('data-row-number',String(rowNumber));
      tr.setAttribute('aria-label','Original source row '+rowNumber);
      if(flagged.has(rowNumber))tr.className='is-review-row';
      for(const key of ['date','description','amount','id',...(hasMemoValues()?['memo']:[])]){
        const td=document.createElement('td');
        td.textContent=String(item[key]??'');
        if(key==='amount')td.className=String(item.amount).startsWith('-')?'negative':'positive';
        if(key==='description'&&flagged.has(rowNumber)){
          const flag=document.createElement('span');
          flag.className='row-flag';
          flag.textContent='Possible duplicate';
          td.appendChild(flag);
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    const filtered=Boolean($('#preview-search').value.trim()||$('#preview-only-flags').checked);
    $('#preview-filter-status').textContent=filtered
      ?matchedTotal+' of '+total+' transactions match this local preview filter.'
      :'All '+total+' transactions available for review.';
    $('#preview-caption').textContent=matchedTotal
      ?(filtered?'Matching rows ':'Showing rows ')+(start+1)+'–'+end+' of '+matchedTotal+
        (filtered?' (filtered preview; source rows are unchanged).':'')+
        '. Preview only — downloads include all '+total+' transactions; no rows were removed.'
      :'No matching transactions. Clear the search or duplicate-only filter to review the full source. Downloads still include all '+total+' transactions.';
    $('#preview-navigation').hidden=(pageCount===1&&!activeFlags.length);
    $('#preview-previous').disabled=previewPage===0;
    $('#preview-next').disabled=previewPage>=pageCount-1;
    $('#preview-page-status').textContent='Page '+(previewPage+1)+' of '+pageCount;
    $('#preview-review').hidden=activeFlags.length===0;
    if(activeFlags.length)$('#preview-review').textContent='Next possible duplicate ('+activeFlags.length+' matching flagged rows)';
  }
  $('#preview-search')?.addEventListener('input',()=>{
    if(!parsed)return;
    previewPage=0;reviewCursor=0;renderPreviewPage();
  });
  $('#preview-only-flags')?.addEventListener('change',()=>{
    if(!parsed)return;
    previewPage=0;reviewCursor=0;renderPreviewPage();
  });
  $('#preview-previous')?.addEventListener('click',()=>{
    if(!parsed||previewPage<=0)return;
    previewPage--;renderPreviewPage();
  });
  $('#preview-next')?.addEventListener('click',()=>{
    if(!parsed||previewPage>=Math.ceil(matchingPreviewIndices().length/PREVIEW_PAGE_SIZE)-1)return;
    previewPage++;renderPreviewPage();
  });
  $('#preview-review')?.addEventListener('click',()=>{
    if(!parsed||!reviewRows.length)return;
    const matches=matchingPreviewIndices(),positions=new Map(matches.map((index,i)=>[index,i]));
    const candidates=reviewRows.filter(row=>positions.has(row-1));
    if(!candidates.length)return;
    const row=candidates[reviewCursor%candidates.length],position=positions.get(row-1);
    reviewCursor++;
    previewPage=Math.floor(position/PREVIEW_PAGE_SIZE);
    renderPreviewPage();
    const target=Array.from($('#preview-body').children).find(x=>x.getAttribute?.('data-row-number')===String(row));
    if(target){
      target.className='is-review-row is-current-review-row';
      target.scrollIntoView?.({block:'nearest',behavior:'smooth'});
    }
    $('#preview-page-status').textContent='Review row '+row+' of '+parsed.transactions.length+
      ' · Filtered page '+(previewPage+1)+' of '+Math.max(1,Math.ceil(matches.length/PREVIEW_PAGE_SIZE));
  });
  function renderResult(data){
    audit=auditTransactions(data.transactions);
    const t=audit.summary;
    previewPage=0;reviewCursor=0;
    reviewRows=[...new Set([...audit.duplicateIds,...audit.possibleDuplicates]
      .flatMap(pair=>[pair.firstRow,pair.row]))].sort((a,b)=>a-b);
    updateMemoCoverage();
    renderPreviewPage();
    $('#preview-panel').hidden=false;$('#download-report').disabled=false;$('#summary-count').textContent=t.count.toLocaleString('en-US');$('#summary-net').textContent=t.net;$('#summary-debit').textContent=t.debit;
    $('#summary-credit').textContent=t.credit;


    const statement=$('#statement-coverage'),window=data.integrity?.statementRange;
    if(statement) {
      const start=window?.startInclusive||'not supplied';
      const end=window?.endExclusive||'not supplied';
      const hasWindow=window&&(window.startInclusive||window.endExclusive);
      const outside=(data.integrity?.postedBeforeRangeCount||0)+(data.integrity?.postedAfterRangeCount||0);
      statement.hidden=!hasWindow;
      if(hasWindow)statement.textContent='Bank retrieval period: '+start+' to '+end+' (end exclusive; OFX bank search window, not a guarantee of posted-date coverage). '+outside+' transaction(s) posted outside the displayed dates; no rows were removed.';
      else statement.textContent='';
    }
    const balance=$('#balance-coverage'),bankBalance=data.integrity?.balanceReview;
    if(balance){
      const hasBalances=Boolean(bankBalance?.ledgerBalancePresent||bankBalance?.availableBalancePresent);
      balance.hidden=!hasBalances;
      if(hasBalances){
        const ledger=bankBalance.ledgerBalancePresent?
          'declared (as of '+bankBalance.ledgerAsOfDate+')':'not provided';
        const available=bankBalance.availableBalancePresent?
          'declared (as of '+bankBalance.availableAsOfDate+')':'not provided';
        const later=data.integrity?.postedAfterLedgerAsOfCount||0;
        balance.textContent='Bank-reported balances within this statement: ledger '+ledger+'; available '+available+
          '. Structure checked: '+(bankBalance.statementScoped?'yes':'no balance elements')+'. '+
          (later?later+' posted transaction(s) occur AFTER the ledger balance date. ':'')+
          'Balance amounts were checked locally but not stored in the validation report. '+
          'NOT reconciled to the exported transactions: an independently verified opening balance and complete bank posting history are unavailable.';
      }else balance.textContent='';
    }
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
  for(const field of ['date','description','amount','debit','credit','id','memo']){
    $('#map-'+field)?.addEventListener('change',()=>{
      if(!file||!['csv','tsv'].includes(fileExt))return;
      invalidatePreview();
      updateMappingAdvice();
      say('Column mapping changed. Preview transactions again before downloading; the previous results were cleared.');
    });
  }
  function withEncodingWarning(data,encoding){
    if(encoding!=='utf-8')data.warnings.unshift('The source file was decoded locally as '+encoding+'. Verify accented names and transaction details.');
    return data;
  }
  async function prepare(chosen){
    const epoch=++selectionEpoch;
    invalidatePreview();
    file=chosen;table=null;csvEvidence=null;fileText='';fileExt='';fileEncoding='utf-8';$('#mapping-panel').hidden=true;$('#file-name').textContent='';
    const encodingChoice=$('#encoding-choice');
    if(encodingChoice)encodingChoice.hidden=!chosen||!['csv','tsv'].includes((chosen.name.split('.').pop()||'').toLowerCase());
    const delimiterChoice=$('#delimiter-choice');
    if(delimiterChoice)delimiterChoice.hidden=!chosen||!['csv','tsv'].includes((chosen.name.split('.').pop()||'').toLowerCase());
    updateMappingAdvice();
    if(!file)return;
    if(file.size>MAX_FILE_BYTES){say('The file is over the 8 MB limit. Try a smaller export.','error');return;}
    const ext=(file.name.split('.').pop()||'').toLowerCase();
    if(!['csv','tsv','ofx','qbo','qfx','qif','iif'].includes(ext)){say('Unsupported input file. Please choose CSV, QBO, QFX, OFX, QIF or IIF.','error');return;}
    if(source!=='any' && source!==ext && !(source==='csv'&&ext==='tsv')){say('This tool expects a .'+source+' input. Choose a matching file or browse another converter.','error');return;}
    $('#file-name').textContent=file.name+' • '+Math.ceil(file.size/1024)+' KB';
    try{
      const decoded=decodeFinancialBytes(new Uint8Array(await chosen.arrayBuffer()),ext,
        {csvEncoding:['csv','tsv'].includes(ext)?($('#source-encoding')?.value||'auto'):'auto'});
      if(epoch!==selectionEpoch)return; // A superseded async read must not restore old bank data.
      const {text,encoding}=decoded;
      fileText=text;fileExt=ext;fileEncoding=encoding;
      if(ext==='csv'||ext==='tsv'){
        const choices={auto:null,comma:',',semicolon:';',tab:'\t'};
        const selected=$('#source-delimiter')?.value||'auto';
        const sep=selected==='auto'?(ext==='tsv'?'\t':undefined):choices[selected];
        const csvRows=parseCSV(text,sep,{manualDelimiter:selected!=='auto'});
        csvEvidence=csvColumnEvidence(csvRows);
        updateMapping(csvRows[0]);
        say((encoding==='windows-1252'?'Windows-1252 selected manually. Verify all accented names and transaction values. ':'')+'Select column mappings, then choose Preview transactions.');
      }else{parsed=withEncodingWarning(parseInput(text,ext,{dateFormat:$('#date-format').value}),encoding);renderResult(parsed);}
    }catch(err){if(epoch===selectionEpoch){invalidatePreview();say(err.message||'Could not read file.','error');}}
  }
  // Encoding changes must re-read the ORIGINAL bytes (not re-encode stale
  // decoded strings), clear mapping and invalidate any accepted preview.
  $('#source-encoding')?.addEventListener('change',()=>{
    if(!file){invalidatePreview();return;}
    if(!['csv','tsv'].includes((file.name.split('.').pop()||'').toLowerCase()))return;
    prepare(file);
  });
  // The delimiter changes what each source field means. Re-read the original
  // file and invalidate all prior preview, mapping and download permissions.
  $('#source-delimiter')?.addEventListener('change',()=>{
    if(!file){invalidatePreview();return;}
    if(!['csv','tsv'].includes((file.name.split('.').pop()||'').toLowerCase()))return;
    prepare(file);
  });
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
      const texts=await Promise.all(batchFiles.map(async selected=>({name:selected.name,byteLength:selected.size,...decodeFinancialBytes(new Uint8Array(await selected.arrayBuffer()),selected.name.split('.').pop().toLowerCase())})));
      if(epoch!==batchEpoch)return;
      batchInfo=batchConvert(texts,{target,source,dateFormat:$('#date-format').value,includeMemo:$('#batch-include-memo')?.checked===true});
      batchArchive=batchInfo.archive;batchHasWarnings=batchInfo.warningCount>0;
      const iifGroups=batchInfo.report.files.reduce((sum,item)=>sum+(item.parserIntegrity?.balancedGroups||0),0);
      const statementWindows=batchInfo.report.files.filter(item=>item.parserIntegrity?.statementRange).length;
      const dateExceptions=batchInfo.report.files.reduce((sum,item)=>sum+(item.parserIntegrity?.postedBeforeRangeCount||0)+(item.parserIntegrity?.postedAfterRangeCount||0),0);
      const overlaps=batchInfo.report.crossFileReferenceMatches+batchInfo.report.crossFileFingerprintMatches;
      const memoRows=batchInfo.report.memoRowsWithContent||0;
      const memoText=memoRows?' '+memoRows+' source transaction(s) have separate Memo: '+(batchInfo.report.memoIncluded?'extra column included.':'default four-column batch files exclude Memo; tick the option above and reselect files to include it.') : '';
      batchSay(batchInfo.report.totalFiles+' separate outputs ready · '+batchInfo.report.totalTransactions+' transactions · '+batchInfo.warningCount+' warning(s).'+(iifGroups?' '+iifGroups+' balanced IIF group(s) checked.':'')+(statementWindows?' '+statementWindows+' OFX retrieval window(s) noted; '+dateExceptions+' posted-date exceptions (no rows removed).':'')+(overlaps?' '+overlaps+' cross-file possible match(es) flagged for review.':'')+memoText+' No accounts merged.');
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
  $('#batch-include-memo')?.addEventListener('change',()=>{
    if(batchFiles.length){batchEpoch++;batchReset();batchFiles=[];if(batchPicker)batchPicker.value='';$('#batch-file-list').replaceChildren();batchSay('Memo column preference changed. Reselect batch files to regenerate an accurate ZIP.');}
  });
  formatPicker?.addEventListener('change',()=>{
    if(batchFiles.length){batchEpoch++;batchReset();batchFiles=[];if(batchPicker)batchPicker.value='';$('#batch-file-list').replaceChildren();batchSay('Output format changed. Select batch files again to regenerate results.');}
  });
  // Date ordering applies to QIF and IIF as well as CSV; changing it must
  // refresh the preview rather than silently leave the old interpretation.
  $('#date-format')?.addEventListener('change',()=>{
    if(batchFiles.length){batchEpoch++;batchReset();batchFiles=[];if(batchPicker)batchPicker.value='';$('#batch-file-list').replaceChildren();batchSay('Date order changed. Select batch files again to avoid stale exports.');}
    if(!file||!fileText)return;
    invalidatePreview();
    if(fileExt==='csv'||fileExt==='tsv'){
      say('Date order changed. Select Preview transactions to validate again.');
    }else{
      try{parsed=withEncodingWarning(parseInput(fileText,fileExt,{dateFormat:$('#date-format').value}),fileEncoding);renderResult(parsed);}
      catch(err){invalidatePreview();say(err.message||'Invalid date format.','error');}
    }
  });
  $('#clear-workspace')?.addEventListener('click',()=>{
    selectionEpoch++;batchEpoch++;
    batchFiles=[];batchReset();
    if($('#batch-include-memo'))$('#batch-include-memo').checked=false;
    if(batchPicker)batchPicker.value='';
    if($('#batch-file-list'))$('#batch-file-list').replaceChildren();
    batchSay('Batch files and generated ZIP cleared from the workspace.');
    invalidatePreview();
    file=null;table=null;csvEvidence=null;fileText='';fileExt='';fileEncoding='utf-8';
    if($('#source-encoding'))$('#source-encoding').value='auto';
    if($('#source-delimiter'))$('#source-delimiter').value='auto';
    if($('#delimiter-choice'))$('#delimiter-choice').hidden=source==='any';
    if($('#encoding-choice'))$('#encoding-choice').hidden=source==='any';
    updateMappingAdvice();
    fileInput.value='';
    $('#file-name').textContent='';
    $('#mapping-panel').hidden=true;
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
    const report={reportType:'Finance File Lab local validation summary v3',sourceFormat:parsed.source,transactionCount:audit.summary.count,totalIn:audit.summary.credit,totalOut:audit.summary.debit,net:audit.summary.net,dateRange:{first:dates[0],last:dates[dates.length-1]},parserIntegrity:parsed.integrity||null,dateReview:parsed.dateReview||null,headerReview:parsed.headerReview||null,sourceDialect:parsed.sourceDialect||null,outputIsLedger:false,csvEscapedDescriptionCount:audit.csvFormulaGuardCount,zeroAmountReviewCount:audit.zeroAmountCount,largeAmountReviewCount:audit.largeAmountCount,requiresUserWarningAcknowledgement:(parsed.warnings.length+audit.warnings.length)>0,repeatedReferences:audit.duplicateIds.map(x=>({row:x.row,firstRow:x.firstRow})),possibleDuplicates:audit.possibleDuplicates,notes:[...parsed.warnings,...audit.warnings],quickBooksImportTested:false,containsTransactionDescriptions:false};
    const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json;charset=utf-8'});
    saveBlob(blob,'validation-summary.json');
    say('Validation summary downloaded (no account numbers or transaction descriptions).','success');
  });
  $('#preview-button')?.addEventListener('click',()=>{
    if(!file||!fileText)return;
    invalidatePreview();
    try{
      const next=withEncodingWarning(parseInput(fileText,fileExt,{mapping:mapping(),dateFormat:$('#date-format').value,delimiter:$('#source-delimiter')?.value||'auto'}),fileEncoding);
      parsed=next;
      renderResult(next);
    }catch(err){
      invalidatePreview(); // Bad mapping must not retain the last successful audit.
      say(err.message||'Preview validation failed.','error');
    }
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
      if(target==='csv'){content=genericCSVExportPlan(parsed.transactions,{includeMemo:$('#include-memo').checked}).csv;mime='text/csv;charset=utf-8';ext='csv';}
      else if(target==='qb-csv'){
        const {parts,report}=quickBooksCSVExportPlan(parsed.transactions);
        if(parts.length===1){content=parts[0];mime='text/csv;charset=utf-8';ext='csv';}
        else{
          const files=Object.fromEntries(parts.map((part,i)=>['quickbooks-online-part-'+String(i+1).padStart(3,'0')+'.csv',part]));
          files['quickbooks-csv-validation.json']=JSON.stringify(report,null,2);
          content=toZIP(files);mime='application/zip';ext='zip';
        }
      }
      else if(target==='xlsx'){content=toXLSX(parsed.transactions,{includeMemo:$('#include-memo').checked});mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';ext='xlsx';}
      else if(target==='qif'){content=toQIF(parsed.transactions);mime='application/x-qif';ext='qif';}
      else throw Error('Output format is not available in this release.');
      const data=new Blob([content],{type:mime});saveBlob(data,file.name.replace(/\.[^.]+$/,'')+'-converted.'+ext);
      say(target==='qb-csv'?'QuickBooks CSV downloaded after row and amount reconciliation. This is NOT a .qbo file; manual import success is unverified.':'File downloaded. Always review transactions and verify compatibility before importing into accounting software.','success');
    }catch(err){say(err.message||'Export failed.','error');}
  });
}

// Deliberately no analytics that contain account details, filenames or transaction data.
