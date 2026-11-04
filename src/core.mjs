/** Financial file parsing library. Browser-only, no API and no retained file data. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const SAFE_FORMATS = Object.freeze(['csv','qbo','qfx','ofx','qif','iif']);

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function fail(message) { throw new Error(message); }

/** Strict decimal to integer cents, avoiding floating point math. USD-only normalized model. */
export function toMinorUnits(input) {
  let s = String(input ?? '').trim().replace(/[$€£\s]/g, '');
  if (!s) fail('Amount is empty.');
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1); }
  else if (s.startsWith('+')) s = s.slice(1);
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) s = s.replaceAll(',', '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) fail('Invalid amount: ' + input + '. Use a period for decimals.');
  const parts = s.split('.');
  const cents = BigInt(parts[0]) * 100n + BigInt((parts[1] || '').padEnd(2, '0'));
  if (cents > 999999999999999n) fail('Amount is above the supported limit.');
  return negative && cents !== 0n ? -cents : cents;
}
export function fromMinorUnits(cents) {
  const n = BigInt(cents), abs = n < 0n ? -n : n;
  return (n < 0n ? '-' : '') + String(abs / 100n) + '.' + String(abs % 100n).padStart(2,'0');
}

export function isoDate(input, format='us') {
  const v = String(input ?? '').trim();
  let y, m, d, match;
  if ((match = v.match(/^(\d{4})-(\d{2})-(\d{2})$/))) { [,y,m,d] = match; }
  else if ((match = v.match(/^(\d{4})(\d{2})(\d{2})(?:\d.*)?$/))) { [,y,m,d] = match; }
  else if ((match = v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/))) {
    y = match[3]; m = format === 'eu' ? match[2] : match[1]; d = format === 'eu' ? match[1] : match[2];
  } else fail('Unsupported date: ' + v + '. Select the correct US or day-first format.');
  const nY = Number(y), nM = Number(m), nD = Number(d), date = new Date(Date.UTC(nY,nM - 1,nD));
  if (nY < 1900 || nY > 2100 || date.getUTCFullYear() !== nY || date.getUTCMonth() !== nM - 1 || date.getUTCDate() !== nD) fail('Invalid calendar date: ' + v);
  return [String(nY).padStart(4,'0'), String(nM).padStart(2,'0'), String(nD).padStart(2,'0')].join('-');
}

export function parseCSV(text, delimiter) {
  const s = String(text ?? '').replace(/^\uFEFF/, '');
  if (delimiter == null) {
    // Count separators in the first logical record only, excluding quoted fields.
    const counts = {',': 0, ';': 0, '\t': 0};
    let inQuotes = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '"') {
        if (inQuotes && s[i + 1] === '"') { i++; continue; }
        inQuotes = !inQuotes;
      } else if (!inQuotes && (c === '\n' || c === '\r')) break;
      else if (!inQuotes && Object.hasOwn(counts, c)) counts[c]++;
    }
    delimiter = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  }
  if (![',', ';', '\t'].includes(delimiter)) fail('Unsupported CSV delimiter.');
  const records = [];
  let row = [], cell = '', quoted = false, closed = false, line = 1, recordLine = 1;
  const commit = () => {
    row.push(cell);
    if (row.some(value => value.trim() !== '')) records.push({fields: row, line: recordLine});
    row = []; cell = ''; closed = false; recordLine = line + 1;
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else { cell += c; if (c === '\n') line++; }
    } else if (c === '"') {
      if (cell !== '' || closed) fail('Unexpected CSV quote at line ' + line + '.');
      quoted = true;
    } else if (c === delimiter) {
      row.push(cell); cell = ''; closed = false;
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      commit(); line++;
    } else if (closed) {
      if (c !== ' ' && c !== '\t') fail('Unexpected text after CSV quote at line ' + line + '.');
    } else cell += c;
  }
  if (quoted) fail('Unclosed quote in CSV at line ' + line + '.');
  if (cell !== '' || row.length || closed) commit();
  if (!records.length) fail('This CSV is empty.');
  const width = records[0].fields.length;
  if (width < 2) fail('CSV needs at least two columns.');
  for (const record of records.slice(1)) {
    if (record.fields.length !== width) {
      fail('CSV line ' + record.line + ': expected ' + width + ' columns, found ' + record.fields.length + '. Fix the source file before converting.');
    }
  }
  return records.map(record => record.fields);
}
export function toCSV(rows, keys=['date','description','amount','id']) {
  function safe(value) {
    let s=String(value ?? '');
    // Prevent spreadsheet formula injection in text cells without altering exact amount values.
    if (/^[\s]*[=+@\t\r]/.test(s) || (/^[\s]*-/.test(s) && !/^-?\d+(\.\d+)?$/.test(s.trim()))) s="'"+s;
    return /[",\n\r]/.test(s) ? '"'+s.replaceAll('"','""')+'"' : s;
  }
  return '\uFEFF' + keys.join(',') + '\r\n' + rows.map(row => keys.map(key => safe(row[key])).join(',')).join('\r\n') + '\r\n';
}

const FIELD_SYNONYMS = {
 date:['date','transaction date','posted date','posting date','dtposted'],
 description:['description','payee','name','details','merchant','transaction description','memo'],
 amount:['amount','transaction amount','net amount','total'],
 debit:['debit','withdrawal','withdrawals','paid out','money out'],
 credit:['credit','deposit','deposits','paid in','money in'],
 id:['id','fitid','reference','transaction id','check number']
};
export function guessMapping(header) {
  const lowered=header.map(x=>String(x).trim().toLowerCase().replace(/[_-]+/g,' '));
  return Object.fromEntries(Object.entries(FIELD_SYNONYMS).map(([field,choices])=>[field, choices.map(c=>lowered.indexOf(c)).find(index=>index>=0) ?? -1]));
}
export function csvTransactions(data, mapping={}, dateFormat='us') {
  const rows=typeof data==='string' ? parseCSV(data) : data;
  if (rows.length<2) fail('CSV has no transaction rows.');
  const guesses=guessMapping(rows[0]);
  const map={...guesses,...mapping};
  if (map.date<0 || map.description<0) fail('Choose Date and Description columns.');
  if (map.amount<0 && (map.debit<0 || map.credit<0)) fail('Choose Amount or both Debit and Credit columns.');
  // Never silently discard signed Amount or independent debit/credit information.
  if (map.amount >= 0 && (map.debit >= 0 || map.credit >= 0)) {
    fail('Choose either the signed Amount column or the Debit and Credit columns, not both. Deselect unused columns before previewing.');
  }
  const fields = map.amount >= 0 ? ['date','description','amount','id'] : ['date','description','debit','credit','id'];
  const used = new Map();
  for (const field of fields) {
    const index = map[field];
    if (!Number.isInteger(index) || index < -1 || index >= rows[0].length) fail('Invalid mapping for ' + field + '.');
    if (index < 0) continue;
    if (used.has(index)) fail('Column "' + rows[0][index] + '" is assigned to both ' + used.get(index) + ' and ' + field + '.');
    used.set(index, field);
  }

  const transactions=[];
  for(let i=1;i<rows.length;i++) {
    const r=rows[i]; if(r.every(c=>!String(c??'').trim())) continue;
    const get=key=>map[key]>=0?String(r[map[key]]??'').trim():'';
    try {
      const credit=map.credit>=0?toMinorUnits(get('credit')||'0'):0n;
      const debit=map.debit>=0?toMinorUnits(get('debit')||'0'):0n;
      if(map.amount<0&&(credit<0n||debit<0n))fail('Debit and Credit columns cannot contain negative values; choose a signed Amount column instead.');
      if(map.amount<0&&credit!==0n&&debit!==0n)fail('Both Debit and Credit are nonzero in the same row.');
      const amount=map.amount>=0?toMinorUnits(get('amount')):credit-debit;
      if(!get('description'))fail('Description is empty.');
      transactions.push({date:isoDate(get('date'),dateFormat),description:get('description'),amount:fromMinorUnits(amount),id:get('id'),memo:''});
    } catch (e) { fail('CSV row '+(i+1)+': '+e.message); }
  }
  if(!transactions.length) fail('No transactions found.');
  return {transactions,warnings:[],source:'CSV'};
}

export function parseQIF(text, dateFormat='us') {
  const lines=String(text).replace(/^\uFEFF/,'').split(/\r?\n/);const transactions=[];let entry={},kind='';let splits=0;
  const commit=()=>{
    if (!Object.keys(entry).length) return;
    if (!entry.date||!entry.amount) fail('QIF transaction missing D or T value.');
    transactions.push({date:isoDate(entry.date,dateFormat),description:entry.description||entry.memo||'',amount:fromMinorUnits(toMinorUnits(entry.amount)),id:entry.id||'',memo:entry.memo||''}); entry={};
  };
  for(const line of lines){
    if(!line)continue;
    if(line.startsWith('!Type:')) {kind=line.slice(6).trim();if(/^Invst$/i.test(kind))fail('Investment QIF transactions are unsupported. No transactions were exported.');continue;}
    if(line.startsWith('!'))continue;
    if(line==='^'){commit();continue;}
    const k=line[0],v=line.slice(1);
    if(k==='D')entry.date=v;
    else if(k==='T')entry.amount=v;
    else if(k==='P')entry.description=v;
    else if(k==='M')entry.memo=v;
    else if(k==='N')entry.id=v;
    else if(k==='S'||k==='E'||k==='$')splits++;
  }
  if(Object.keys(entry).length) fail('QIF final transaction lacks terminating ^.');
  if(!transactions.length)fail('No QIF transactions found.');
  return {transactions,source:'QIF',warnings:[kind!=='Bank'?'Only bank-style transactions were read; source QIF type: '+(kind||'unknown')+'.':'',splits?'Split/category details are not preserved in this transaction export.':''].filter(Boolean)};
}

function decodeEntities(s){return s.replace(/&(amp|lt|gt|quot|apos);/g,(a,k)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[k]));}
function ofxField(block,key){ const m=block.match(new RegExp('<'+key+'\\b[^>]*>\\s*([^<\\r\\n]+)','i'));return m?decodeEntities(m[1].trim()):''; }
export function parseOFX(text) {
  const raw=String(text);
  if(/<!DOCTYPE|<!ENTITY|<script/i.test(raw))fail('Unsupported or unsafe XML declarations.');
  // One export may include multiple accounts. Do not merge them implicitly.
  const accountSections=[...raw.matchAll(/<(?:STMTRS|CCSTMTRS)\b/gi)].length;
  if(accountSections>1)fail('Multiple bank or card accounts detected in this OFX file. Export one account at a time to avoid mixing transactions.');
  if(/<INVSTMTMSGSRSV1\b|<INVSTMTRS\b/i.test(raw))fail('Investment OFX feeds are not supported. No transactions were exported.');
  const blocks=[...raw.matchAll(/<STMTTRN\b[^>]*>([\s\S]*?)(?=<\/STMTTRN\s*>|<STMTTRN\b|<\/BANKTRANLIST\b|$)/gi)];
  if(!blocks.length)fail('No bank STMTTRN entries found. Investment feeds are not supported.');
  const transactions=blocks.map((m,i)=>{
    const b=m[1],date=ofxField(b,'DTPOSTED'),amount=ofxField(b,'TRNAMT');
    try{return {date:isoDate(date),amount:fromMinorUnits(toMinorUnits(amount)),description:ofxField(b,'NAME')||ofxField(b,'MEMO')||'Transaction',memo:ofxField(b,'MEMO'),id:ofxField(b,'FITID')};}
    catch(e){fail('OFX transaction '+(i+1)+': '+e.message);}
  });
  return {transactions,source:'OFX / QBO / QFX',warnings:['Read-only transaction extraction. This does not validate bank institution identities or QuickBooks imports.']};
}
export function parseIIF(text,dateFormat='us'){
  const rows=String(text).replace(/^\uFEFF/,'').split(/\r?\n/).map(r=>r.split('\t'));
  let header=null;const transactions=[];
  for(const row of rows){const type=(row[0]||'').trim();if(type==='!TRNS'){header=row.slice(1).map(s=>s.toUpperCase());continue;}
    if(type!=='TRNS'||!header)continue;
    const data=Object.fromEntries(header.map((h,i)=>[h,row[i+1]||'']));
    try{transactions.push({date:isoDate(data.DATE,dateFormat),amount:fromMinorUnits(toMinorUnits(data.AMOUNT||data.AMT)),description:data.MEMO||data.NAME||data.ACCNT||'Transaction',id:data.DOCNUM||'',memo:data.MEMO||''});}
    catch(e){fail('IIF TRNS '+(transactions.length+1)+': '+e.message);}
  }
  if(!transactions.length)fail('No supported IIF TRNS rows found.');
  return {transactions,source:'IIF',warnings:['TRNS summary rows only. SPL entries, account allocations and double-entry relationships are not preserved. Do not use for accounting migration.']};
}
export function parseInput(text,format,opts={}) {
  if(String(text).length>MAX_FILE_BYTES)fail('File exceeds the 8 MB browser processing limit.');
  const f=String(format).replace(/^\./,'').toLowerCase();
  if(f==='csv'||f==='tsv')return csvTransactions(typeof text==='string'?parseCSV(text,f==='tsv'?'\t':undefined):text,opts.mapping,opts.dateFormat||'us');
  if(f==='qif')return parseQIF(text,opts.dateFormat||'us');
  if(['qbo','qfx','ofx'].includes(f))return parseOFX(text);
  if(f==='iif')return parseIIF(text,opts.dateFormat||'us');
  fail('Unsupported input format: '+f);
}
export function toQIF(transactions){
  if(!transactions.length)fail('No transactions.');
  return '!Type:Bank\r\n'+transactions.map(t=>{
    const date=isoDate(t.date).split('-');const d=date[1]+'/'+date[2]+'/'+date[0];
    return 'D'+d+'\r\nT'+fromMinorUnits(toMinorUnits(t.amount))+'\r\nP'+String(t.description||'').replace(/[\r\n^]/g,' ')+'\r\n'+(t.memo?'M'+String(t.memo).replace(/[\r\n^]/g,' ')+'\r\n':'')+'^\r\n';
  }).join('');
}
/** QuickBooks Online 3-column manual-upload CSV, not .qbo Web Connect. */
export function toQuickBooksCSV(transactions){
  if(!Array.isArray(transactions)||!transactions.length) fail('No transactions to export.');
  const formatted=transactions.map((t,i)=>{
    try {
      const iso=isoDate(t.date);
      const [year,month,day]=iso.split('-');
      if(!String(t.description??'').trim())fail('Description is required.');
      return {Date:`${month}/${day}/${year}`,Description:t.description,Amount:fromMinorUnits(toMinorUnits(t.amount))};
    } catch(e){fail('QuickBooks CSV row '+(i+1)+': '+e.message);}
  });
  return toCSV(formatted,['Date','Description','Amount']);
}
/** Split QuickBooks Online CSVs by 1,000 rows / 350 KB on row boundaries. */
export function quickBooksCSVParts(transactions,{maxRows=1000,maxBytes=350000}={}){
  if(!Array.isArray(transactions)||!transactions.length)fail('No transactions to export.');
  if(!Number.isInteger(maxRows)||maxRows<1||maxRows>1000)fail('Invalid QuickBooks row limit.');
  if(!Number.isInteger(maxBytes)||maxBytes<64||maxBytes>350000)fail('Invalid QuickBooks file-size limit.');
  const parts=[];let batch=[];let usedBytes=0;
  const size=s=>new TextEncoder().encode(s).length;
  const headerSize=size(toQuickBooksCSV([{date:'2026-01-01',description:'x',amount:'1.00'}]).split('\r\n')[0]+'\r\n');
  const fixedBytes=headerSize;
  for(const tx of transactions){
    const single=toQuickBooksCSV([tx]);
    const rowText=single.slice(single.indexOf('\r\n')+2);
    const rowBytes=size(rowText);
    if(rowBytes+fixedBytes>maxBytes)fail('One transaction is too large for the selected QuickBooks CSV limit.');
    if(batch.length&&(batch.length>=maxRows||usedBytes+rowBytes>maxBytes)){
      parts.push(toQuickBooksCSV(batch));batch=[];usedBytes=0;
    }
    if(!batch.length)usedBytes=fixedBytes;
    batch.push(tx);usedBytes+=rowBytes;
  }
  if(batch.length)parts.push(toQuickBooksCSV(batch));
  return parts;
}
/** Duplicate checks warn; they never mutate or drop the user's records. */
export function auditTransactions(transactions){
  if(!Array.isArray(transactions)||!transactions.length)fail('No transactions to audit.');
  const idIndex=new Map(),fingerprints=new Map(),duplicateIds=[],possibleDuplicates=[];
  const normalized=transactions.map((t,i)=>{
    const date=isoDate(t.date),amount=fromMinorUnits(toMinorUnits(t.amount));
    const description=String(t.description??'').trim();
    if(!description)fail('Transaction '+(i+1)+' has no description.');
    const id=String(t.id??'').trim();
    if(id){
      if(idIndex.has(id))duplicateIds.push({firstRow:idIndex.get(id)+1,row:i+1,reference:id});
      else idIndex.set(id,i);
    }
    const key=[date,amount,description.toLowerCase().replace(/\s+/g,' ')].join('|');
    if(fingerprints.has(key))possibleDuplicates.push({firstRow:fingerprints.get(key)+1,row:i+1});
    else fingerprints.set(key,i);
    return {date,amount,description,id};
  });
  const summary=totals(normalized);
  const warnings=[];
  if(duplicateIds.length)warnings.push(duplicateIds.length+' repeated transaction reference(s) found. Review before importing; no rows were deleted.');
  if(possibleDuplicates.length)warnings.push(possibleDuplicates.length+' possible same-date, same-amount and same-description duplicate(s). Review; no rows were deleted.');
  return {summary,duplicateIds,possibleDuplicates,warnings};
}
export function totals(transactions){
  let debit=0n,credit=0n;
  for(const row of transactions){const n=toMinorUnits(row.amount);if(n<0n)debit+=-n;else credit+=n;}
  return {count:transactions.length,debit:fromMinorUnits(debit),credit:fromMinorUnits(credit),net:fromMinorUnits(credit-debit)};
}
