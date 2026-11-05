/** Separate, browser-local batch reader. Files are never merged across accounts. */
import {parseInput,auditTransactions,toCSV,MAX_FILE_BYTES} from './core.mjs';
import {toXLSX,toZIP} from './xlsx.mjs';

export const MAX_BATCH_FILES=10;
export const MAX_BATCH_BYTES=12*1024*1024;
export const MAX_BATCH_ROWS=20000;
const formats=new Set(['qbo','qfx','ofx','qif','iif']);
const encoder=new TextEncoder();

/** All-or-nothing conversion. A failing source blocks the archive; no partial output. */
export function batchConvert(inputs,{target='csv',source='any',dateFormat='us',includeMemo=false}={}){
  if(!Array.isArray(inputs)||!inputs.length)throw Error('Choose at least one bank transaction file.');
  if(inputs.length>MAX_BATCH_FILES)throw Error('Choose at most '+MAX_BATCH_FILES+' files per batch.');
  if(!['csv','xlsx'].includes(target))throw Error('Batch mode exports CSV or Excel only. Select a supported format.');
  if(!['us','eu'].includes(dateFormat))throw Error('Unsupported date order.');
  if(typeof includeMemo!=='boolean')throw Error('Unsupported Memo-column export setting.');
  if(source!=='any'&&!formats.has(source))throw Error('This page does not support batch mode.');
  let bytes=0,rows=0;
  const entries={},reports=[];
  const signatures=new Map();
  const seenReferences=new Map(),seenFingerprints=new Map();
  let batchReferenceMatches=0,batchFingerprintMatches=0,memoRowsWithContent=0;
  for(let i=0;i<inputs.length;i++){
    const item=inputs[i];
    if(!item||typeof item.name!=='string'||typeof item.text!=='string')throw Error('Batch file '+(i+1)+' is not readable.');
    const ext=item.name.split('.').pop().toLowerCase();
    if(!formats.has(ext))throw Error('Batch file '+(i+1)+': select QBO, QFX, OFX, QIF or IIF. CSV requires manual column mapping.');
    if(source!=='any'&&source!==ext)throw Error('Batch file '+(i+1)+': expected .'+source+' input.');
    if(item.byteLength!==undefined&&(!Number.isSafeInteger(item.byteLength)||item.byteLength<0))throw Error('Batch file '+(i+1)+': invalid source byte length.');
    // Prefer original file bytes; re-encoding a Windows-1252 source as UTF-8
    // changes its size and can reject a valid file near the input limit.
    const countBytes=item.byteLength??encoder.encode(item.text).length;
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
    const sourceMemoRows=parsed.transactions.reduce((n,row)=>n+(String(row.memo??'').length>0?1:0),0);
    memoRowsWithContent+=sourceMemoRows;
    const name='converted-'+String(i+1).padStart(3,'0')+'.'+target;
    entries[name]=target==='xlsx'?toXLSX(parsed.transactions,{includeMemo}):toCSV(parsed.transactions,['date','description','amount','id',...(includeMemo?['memo']:[])]);
    const duplicateFile=signatures.has(item.text)?signatures.get(item.text):null;
    if(!duplicateFile)signatures.set(item.text,i+1);
    const dates=parsed.transactions.map(transaction=>transaction.date).sort();
    const dateRange={first:dates[0],last:dates[dates.length-1]};
    const parserIntegrity=parsed.integrity||null;
    const warnings=[...parsed.warnings,...audit.warnings];
    if(sourceMemoRows&&!includeMemo)warnings.push(sourceMemoRows+' transaction(s) have separate Memo values that are omitted from this default four-column output. Choose Include Memo and regenerate the batch to preserve them. No other transaction fields were removed.');
    let crossFileReferenceMatches=0,crossFileFingerprintMatches=0;
    const matchedEarlierFileNumbers=new Set();
    const ownReferences=new Set(),ownFingerprints=new Set();
    for(const tx of parsed.transactions){
      const id=String(tx.id??'').trim();
      const fingerprint=[tx.date,tx.amount,String(tx.description??'').trim().toLowerCase().replace(/\s+/g,' ')].join('|');
      if(id){
        const earlier=seenReferences.get(id);
        if(earlier){crossFileReferenceMatches++;matchedEarlierFileNumbers.add(earlier);}
        ownReferences.add(id);
      }
      const earlier=seenFingerprints.get(fingerprint);
      if(earlier){crossFileFingerprintMatches++;matchedEarlierFileNumbers.add(earlier);}
      ownFingerprints.add(fingerprint);
    }
    // Keep the first file occurrence; never compare a file to itself.
    for(const key of ownReferences)if(!seenReferences.has(key))seenReferences.set(key,i+1);
    for(const key of ownFingerprints)if(!seenFingerprints.has(key))seenFingerprints.set(key,i+1);
    batchReferenceMatches+=crossFileReferenceMatches;
    batchFingerprintMatches+=crossFileFingerprintMatches;
    if(crossFileReferenceMatches)warnings.push(crossFileReferenceMatches+' transaction reference match(es) against earlier batch files. Different bank accounts may legitimately reuse references; compare files before importing. No rows removed.');
    if(crossFileFingerprintMatches)warnings.push(crossFileFingerprintMatches+' same-date, same-amount and same-description match(es) against earlier batch files. These are possible overlaps, not confirmed duplicates. No rows removed.');
    if(item.encoding&&item.encoding!=='utf-8')warnings.push('Bank file decoded locally as '+item.encoding+'. Verify source text before importing.');
    if(duplicateFile)warnings.push('File content duplicates batch item '+duplicateFile+'. No data was removed.');
    reports.push({index:i+1,inputType:ext,outputFile:name,rows:audit.summary.count,
      totalIn:audit.summary.credit,totalOut:audit.summary.debit,net:audit.summary.net,
      duplicateReferenceCount:audit.duplicateIds.length,possibleDuplicateCount:audit.possibleDuplicates.length,
      crossFileReferenceMatches,crossFileFingerprintMatches,matchedEarlierFileNumbers:[...matchedEarlierFileNumbers].sort((a,b)=>a-b),
      dateRange,parserIntegrity,outputIsLedger:false,
      sourceMemoRows,memoRowsIncluded:includeMemo?sourceMemoRows:0,memoRowsOmitted:includeMemo?0:sourceMemoRows,warnings});
  }
  const report={format:'Finance File Lab batch validation v2',localOnly:true,
    reportScope:'File-level transaction summary only. IIF journal allocations are not reconstructed.',
    autoMergedAccounts:false,autoDeletedTransactions:false,target,files:reports,
    totalFiles:inputs.length,totalTransactions:rows,
    crossFileReferenceMatches:batchReferenceMatches,crossFileFingerprintMatches:batchFingerprintMatches,
    crossFileMatchesAreWarningsOnly:true,
    sourceFileNamesIncluded:false,quickBooksImportTested:false,
    memoIncluded:includeMemo,memoRowsWithContent,memoRowsOmitted:includeMemo?0:memoRowsWithContent};
  entries['batch-validation.json']=JSON.stringify(report,null,2);
  return {archive:toZIP(entries),report,warningCount:reports.reduce((n,x)=>n+x.warnings.length,0)};
}
