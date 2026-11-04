import {MAX_FILE_BYTES,parseCSV,guessMapping,parseInput,toCSV,toQIF,toQuickBooksCSV,totals,escapeHtml} from './core.mjs';
import {toXLSX} from './xlsx.mjs';

const $ = s => document.querySelector(s);
const drop=$('#drop-zone'), fileInput=$('#file-input'), formatPicker=$('#target-format');
if(drop && fileInput){
  const source=drop.dataset.source||'any';
  const fixedOutput=drop.dataset.output||'csv';
  let file=null,parsed=null,table=null,fileText="",fileExt="";
  const say=(msg,kind='info')=>{const box=$('#work-status');box.textContent=msg;box.dataset.state=kind;box.hidden=false;};
  function setButton(on){const btn=$('#export-button');btn.disabled=!on;btn.setAttribute('aria-disabled',String(!on));}
  function updateMapping(headers){
    table=headers;const guess=guessMapping(headers);
    for(const field of ['date','description','amount','debit','credit','id']){
      const el=$('#map-'+field);if(!el)continue;
      el.replaceChildren();el.add(new Option('— Not selected —','-1'));
      headers.forEach((name,i)=>el.add(new Option(name,String(i))));
      el.value=String(guess[field]??-1);
    }
    $('#mapping-panel').hidden=false;
  }
  function mapping(){return Object.fromEntries(['date','description','amount','debit','credit','id'].map(k=>[k,Number($('#map-'+k).value)]));}
  function renderResult(data){
    const t=totals(data.transactions),tbody=$('#preview-body');tbody.replaceChildren();
    data.transactions.slice(0,8).forEach(item=>{const tr=document.createElement('tr');for(const key of ['date','description','amount','id']){const td=document.createElement('td');td.textContent=String(item[key]??'');if(key==='amount')td.className=String(item.amount).startsWith('-')?'negative':'positive';tr.appendChild(td);}tbody.appendChild(tr);});
    $('#preview-panel').hidden=false;$('#summary-count').textContent=t.count.toLocaleString('en-US');$('#summary-net').textContent=t.net;$('#summary-debit').textContent=t.debit;
    $('#summary-credit').textContent=t.credit;
    $('#preview-caption').textContent=data.transactions.length>8?'First 8 of '+data.transactions.length+' transactions are shown.':'All '+data.transactions.length+' transactions are shown.';
    $('#warning-list').replaceChildren();for(const note of data.warnings){const li=document.createElement('li');li.textContent=note;$('#warning-list').append(li);}
    $('#warning-box').hidden=!data.warnings.length;setButton(true);say('Ready. Review the transaction preview, then download.', 'success');
  }
  async function prepare(chosen){
    file=chosen;parsed=null;table=null;setButton(false);$('#preview-panel').hidden=true;$('#mapping-panel').hidden=true;
    if(!file)return;
    if(file.size>MAX_FILE_BYTES){say('The file is over the 8 MB limit. Try a smaller export.','error');return;}
    const ext=(file.name.split('.').pop()||'').toLowerCase();
    if(!['csv','tsv','ofx','qbo','qfx','qif','iif'].includes(ext)){say('Unsupported input file. Please choose CSV, QBO, QFX, OFX, QIF or IIF.','error');return;}
    if(source!=='any' && source!==ext && !(source==='csv'&&ext==='tsv')){say('This tool expects a .'+source+' input. Choose a matching file or browse another converter.','error');return;}
    $('#file-name').textContent=file.name+' • '+Math.ceil(file.size/1024)+' KB';
    try{
      const text=await file.text();fileText=text;fileExt=ext;
      if(ext==='csv'||ext==='tsv'){
        updateMapping(parseCSV(text,ext==='tsv'?'\t':undefined)[0]);
        say('Select column mappings, then choose Preview transactions.');
      }else{parsed=parseInput(text,ext,{dateFormat:$('#date-format').value});renderResult(parsed);}
    }catch(err){say(err.message||'Could not read file.','error');}
  }
  fileInput.addEventListener('change',event=>prepare(event.target.files[0]));
  drop.addEventListener('dragover',event=>{event.preventDefault();drop.classList.add('is-dragging');});
  drop.addEventListener('dragleave',()=>drop.classList.remove('is-dragging'));
  drop.addEventListener('drop',event=>{event.preventDefault();drop.classList.remove('is-dragging');if(event.dataTransfer.files.length)prepare(event.dataTransfer.files[0]);});
  $('#preview-button')?.addEventListener('click',()=>{
    if(!file)return;
    try{parsed=parseInput(fileText,fileExt,{mapping:mapping(),dateFormat:$('#date-format').value});renderResult(parsed);}
    catch(err){setButton(false);say(err.message,'error');}
  });
  $('#export-button').addEventListener('click',()=>{
    if(!parsed?.transactions?.length){say('Preview a valid file first.','error');return;}
    const target=formatPicker?formatPicker.value:fixedOutput;
    let content,mime,ext;
    try{
      if(target==='csv'){content=toCSV(parsed.transactions);mime='text/csv;charset=utf-8';ext='csv';}
      else if(target==='qb-csv'){content=toQuickBooksCSV(parsed.transactions);mime='text/csv;charset=utf-8';ext='csv';}
      else if(target==='xlsx'){content=toXLSX(parsed.transactions);mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';ext='xlsx';}
      else if(target==='qif'){content=toQIF(parsed.transactions);mime='application/x-qif';ext='qif';}
      else throw Error('Output format is not available in this release.');
      const data=new Blob([content],{type:mime}),url=URL.createObjectURL(data),anchor=document.createElement('a');anchor.href=url;anchor.download=file.name.replace(/\.[^.]+$/,'')+'-converted.'+ext;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      say('File downloaded. Always review transactions and verify compatibility before importing into accounting software.','success');
    }catch(err){say(err.message||'Export failed.','error');}
  });
}

// Deliberately no analytics that contain account details, filenames or transaction data.
