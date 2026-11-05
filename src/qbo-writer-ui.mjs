/** Independent unindexed QBO writer pilot. Runs in the browser; no network calls. */
import {decodeFinancialBytes,parseCSV,guessMapping,parseInput,toMinorUnits,MAX_FILE_BYTES,auditTransactions} from './core.mjs';
import {readReferenceQBO,writeWebConnectQBO} from './qbo-writer.mjs';

const el=id=>document.getElementById(id);
const formatNet=cents=>{const n=BigInt(cents),a=n<0n?-n:n;return(n<0n?'-':'')+String(a/100n)+'.'+String(a%100n).padStart(2,'0');};
const inputCSV=el('lab-csv'),reference=el('lab-reference'),preview=el('lab-preview'),download=el('lab-download');
let csvText='',csvHeaders=[],epoch=0,generated=null;
const report=(message,kind='info')=>{el('lab-status').textContent=message;el('lab-status').dataset.kind=kind;};
function invalidate(){
 epoch++;generated=null;download.disabled=true;el('lab-ack').checked=false;
 el('lab-result').hidden=true;el('lab-rows').replaceChildren();
}
function values(){
 return Object.fromEntries([...document.querySelectorAll('[data-map]')].map(node=>[node.dataset.map,Number(node.value)]));
}
function updatePreviewAvailability(){preview.disabled=!(csvText&&reference.files?.length);}
function updateHeaders(rows){
 csvHeaders=rows[0];const mapping=guessMapping(csvHeaders);
 for(const element of document.querySelectorAll('[data-map]')){
   const field=element.dataset.map;element.replaceChildren();
   const none=document.createElement('option');none.value='-1';none.textContent='Not selected';element.appendChild(none);
   csvHeaders.forEach((name,i)=>{
     const opt=document.createElement('option');opt.value=String(i);
     opt.textContent='Column '+(i+1)+': '+name;element.appendChild(opt);
   });
   element.value=String(Number.isInteger(mapping[field])?mapping[field]:-1);
 }
 el('lab-mapping-tip').textContent='Detected '+csvHeaders.length+' columns. Review every selection. No bank account data is saved.';
}
async function loadSource(){
 invalidate();csvText='';csvHeaders=[];preview.disabled=true;
 if(!inputCSV.files.length){report('Choose a CSV to start.');return;}
 const file=inputCSV.files[0],mine=epoch;
 if(file.size>MAX_FILE_BYTES){report('CSV exceeds the 8 MB limit.','error');return;}
 if(!/\.(csv|tsv)$/i.test(file.name)){report('Choose an actual .csv or .tsv file.','error');return;}
 try{
   const {text}=decodeFinancialBytes(new Uint8Array(await file.arrayBuffer()),'csv');
   if(mine!==epoch)return;
   const sep={auto:undefined,comma:',',semicolon:';',tab:'\t'}[el('lab-delimiter').value];
   const rows=parseCSV(text,sep,{manualDelimiter:el('lab-delimiter').value!=='auto'});
   updateHeaders(rows);csvText=text;
   report('CSV loaded locally. Confirm date order, mapping, and the reference QBO from the same account.');
   updatePreviewAvailability();
 }catch(e){report(e.message,'error');}
}
inputCSV.addEventListener('change',loadSource);
el('lab-delimiter').addEventListener('change',loadSource);
el('lab-date').addEventListener('change',()=>{invalidate();report('Date order changed. Preview again.');updatePreviewAvailability();});
reference.addEventListener('change',()=>{invalidate();report('QBO reference changed. Preview again.');updatePreviewAvailability();});
for(const select of document.querySelectorAll('[data-map]'))
 select.addEventListener('change',()=>{invalidate();report('Column mapping changed. Preview again.');updatePreviewAvailability();});
preview.addEventListener('click',async()=>{
 const mine=epoch;generated=null;download.disabled=true;el('lab-result').hidden=true;
 if(!csvText||!reference.files.length){report('Choose both files first.','error');return;}
 const file=reference.files[0];
 if(file.size>MAX_FILE_BYTES||!/\.qbo$/i.test(file.name)){report('Use an existing .qbo reference smaller than 8 MB.','error');return;}
 preview.disabled=true;
 try{
   const {text}=decodeFinancialBytes(new Uint8Array(await file.arrayBuffer()),'qbo');
   if(mine!==epoch)return;
   const profile=readReferenceQBO(text);
   const parsed=parseInput(csvText,'csv',{
     mapping:values(),dateFormat:el('lab-date').value,delimiter:el('lab-delimiter').value
   });
   const output=await writeWebConnectQBO(parsed.transactions,profile);
   if(mine!==epoch)return;
   // Independently call the read path and compare normalized row values;
   // the writer already performs its own exact wire verification.
   const back=parseInput(output.wire,'qbo').transactions;
   if(back.length!==parsed.transactions.length)throw Error('Independent output count check failed.');
   for(let i=0;i<back.length;i++){
     const a=parsed.transactions[i],b=back[i];
     if(a.date!==b.date||toMinorUnits(a.amount)!==toMinorUnits(b.amount)||
        a.description!==b.description||String(a.memo||'')!==b.memo)
       throw Error('Independent row check failed at transaction '+(i+1)+'.');
   }
   const audit=auditTransactions(parsed.transactions);
   generated=output;
   const rows=el('lab-rows');rows.replaceChildren();
   for(const tx of parsed.transactions.slice(0,25)){
     const tr=document.createElement('tr');
     for(const content of [tx.date,tx.description,tx.amount,tx.id?'Yes':'No']){
       const td=document.createElement('td');td.textContent=content;tr.appendChild(td);
     }
     rows.appendChild(tr);
   }
   el('lab-result-summary').textContent=output.report.transactionCount+' transaction(s), net '+formatNet(output.report.netCents)+' USD; '+output.wire.length+' ASCII bytes generated. First '+Math.min(25,back.length)+' rows previewed (all rows written and checked).';
   const notes=[...parsed.warnings,...audit.warnings,
     'QBO institution metadata was copied from your local reference; bank authenticity and account matching are NOT independently verified.',
     'No real QuickBooks Desktop/Online import test has been performed. Syntax-only output.'];
   if(output.report.referenceHasPlaceholderMetadata)
     notes.unshift('TEST REFERENCE DETECTED: this QBO contains a placeholder bank or account identifier. It is for structural testing ONLY; do not import it into a real QuickBooks company file.');
   el('lab-warnings').textContent=notes.join(' ');
   el('lab-ack').checked=false;
   el('lab-result').hidden=false;
   report('QBO serialized and every output row matched the CSV source on read-back. Target software import remains unverified.','success');
 }catch(e){if(mine===epoch)report(e.message||'Could not produce QBO safely.','error');}
 finally{if(mine===epoch)preview.disabled=false;}
});
el('lab-ack').addEventListener('change',()=>download.disabled=!(generated&&el('lab-ack').checked));
download.addEventListener('click',()=>{
 if(!generated||!el('lab-ack').checked){report('Preview and acknowledge first.','error');return;}
 const blob=new Blob([generated.wire],{type:'application/x-ofx'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='bank-transactions-experimental.qbo';document.body.appendChild(a);
 a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
 report('Experimental QBO saved locally. Syntax and row reconciliation passed; QuickBooks import has NOT been tested.','success');
});
updatePreviewAvailability();

el('lab-clear').addEventListener('click',()=>{
 invalidate();csvText='';csvHeaders=[];inputCSV.value='';reference.value='';
 for(const select of document.querySelectorAll('[data-map]'))select.replaceChildren();
 el('lab-mapping-tip').textContent='Choose a CSV to load its column names.';
 report('Local workspace cleared. Previously downloaded files remain on your device.');
 updatePreviewAvailability();
});
