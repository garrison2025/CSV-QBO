/** Separate, browser-local batch reader. Files are never merged across accounts. */
import {parseInput,auditTransactions,toCSV,MAX_FILE_BYTES} from './core.mjs';
import {toXLSX,toZIP} from './xlsx.mjs';

export const MAX_BATCH_FILES=10;
export const MAX_BATCH_BYTES=12*1024*1024;
export const MAX_BATCH_ROWS=20000;
const formats=new Set(['qbo','qfx','ofx','qif','iif']);
const encoder=new TextEncoder();

/** All-or-nothing conversion. A failing source blocks the archive; no partial output. */
export function batchConvert(inputs,{target='csv',source='any',dateFormat='us'}={}){
  if(!Array.isArray(inputs)||!inputs.length)throw Error('Choose at least one bank transaction file.');
  if(inputs.length>MAX_BATCH_FILES)throw Error('Choose at most '+MAX_BATCH_FILES+' files per batch.');
  if(!['csv','xlsx'].includes(target))throw Error('Batch mode exports CSV or Excel only. Select a supported format.');
  if(!['us','eu'].includes(dateFormat))throw Error('Unsupported date order.');
  if(source!=='any'&&!formats.has(source))throw Error('This page does not support batch mode.');
  let bytes=0,rows=0;
  const entries={},reports=[];
  const signatures=new Map();
  for(let i=0;i<inputs.length;i++){
    const item=inputs[i];
    if(!item||typeof item.name!=='string'||typeof item.text!=='string')throw Error('Batch file '+(i+1)+' is not readable.');
    const ext=item.name.split('.').pop().toLowerCase();
    if(!formats.has(ext))throw Error('Batch file '+(i+1)+': select QBO, QFX, OFX, QIF or IIF. CSV requires manual column mapping.');
    if(source!=='any'&&source!==ext)throw Error('Batch file '+(i+1)+': expected .'+source+' input.');
    const countBytes=encoder.encode(item.text).length;
    if(countBytes>MAX_FILE_BYTES)throw Error('Batch file '+(i+1)+' exceeds the 8 MB single-file limit.');
    bytes+=countBytes;
    if(bytes>MAX_BATCH_BYTES)throw Error('Batch exceeds the 12 MB total input limit.');
    let parsed,audit;
    try{
      parsed=parseInput(item.text,ext,{dateFormat});
      audit=auditTransactions(parsed.transactions);
    }catch(e){throw Error('Batch file '+(i+1)+': '+e.message);}
    rows+=audit.summary.count;
    if(rows>MAX_BATCH_ROWS)throw Error('Batch contains more than '+MAX_BATCH_ROWS.toLocaleString('en-US')+' transactions. Split your batch.');
    const name='converted-'+String(i+1).padStart(3,'0')+'.'+target;
    entries[name]=target==='xlsx'?toXLSX(parsed.transactions):toCSV(parsed.transactions);
    const duplicateFile=signatures.has(item.text)?signatures.get(item.text):null;
    if(!duplicateFile)signatures.set(item.text,i+1);
    const dates=parsed.transactions.map(transaction=>transaction.date).sort();
    const dateRange={first:dates[0],last:dates[dates.length-1]};
    const parserIntegrity=parsed.integrity||null;
    const warnings=[...parsed.warnings,...audit.warnings];
    if(duplicateFile)warnings.push('File content duplicates batch item '+duplicateFile+'. No data was removed.');
    reports.push({index:i+1,inputType:ext,outputFile:name,rows:audit.summary.count,
      totalIn:audit.summary.credit,totalOut:audit.summary.debit,net:audit.summary.net,
      duplicateReferenceCount:audit.duplicateIds.length,possibleDuplicateCount:audit.possibleDuplicates.length,
      dateRange,parserIntegrity,outputIsLedger:false,warnings});
  }
  const report={format:'Finance File Lab batch validation v2',localOnly:true,
    reportScope:'File-level transaction summary only. IIF journal allocations are not reconstructed.',
    autoMergedAccounts:false,autoDeletedTransactions:false,target,files:reports,
    totalFiles:inputs.length,totalTransactions:rows,
    sourceFileNamesIncluded:false,quickBooksImportTested:false};
  entries['batch-validation.json']=JSON.stringify(report,null,2);
  return {archive:toZIP(entries),report,warningCount:reports.reduce((n,x)=>n+x.warnings.length,0)};
}
