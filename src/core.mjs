/** Financial file parsing library. Browser-only, no API and no retained file data. */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const SAFE_FORMATS = Object.freeze(['csv','qbo','qfx','ofx','qif','iif']);

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function fail(message) { throw new Error(message); }

/** Strict decimal to integer cents, avoiding floating point math. USD-only normalized model. */
export function toMinorUnits(input) {
  const original = String(input ?? '').trim();
  if (/[€£¥₹]/.test(original)) fail('Non-USD currency symbols are unsupported. Convert currencies outside this tool.');
  let s = original;
  if (!s) fail('Amount is empty.');
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1); }
  else if (s.startsWith('+')) s = s.slice(1);
  s = s.trim();
  if (s.startsWith('$')) s = s.slice(1);
  if (/\s/.test(s)) fail('Invalid amount spacing: ' + input + '.');
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
  else if ((match = v.match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2})?)?(?:\.\d{1,3})?(?:\[[+-]?\d{1,2}(?::[A-Za-z0-9_.+-]+)?\])?$/))) {
    [,y,m,d] = match;
    if (match[4] != null && (Number(match[4]) > 23 || Number(match[5]) > 59 || (match[6] != null && Number(match[6]) > 59))) fail('Invalid OFX clock time: ' + v);
  }
  else if ((match = v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/))) {
    y = match[3]; m = format === 'eu' ? match[2] : match[1]; d = format === 'eu' ? match[1] : match[2];
  } else fail('Unsupported date: ' + v + '. Select the correct US or day-first format.');
  const nY = Number(y), nM = Number(m), nD = Number(d), date = new Date(Date.UTC(nY,nM - 1,nD));
  if (nY < 1900 || nY > 2100 || date.getUTCFullYear() !== nY || date.getUTCMonth() !== nM - 1 || date.getUTCDate() !== nD) fail('Invalid calendar date: ' + v);
  return [String(nY).padStart(4,'0'), String(nM).padStart(2,'0'), String(nD).padStart(2,'0')].join('-');
}

export function parseCSV(text, delimiter) {
  const s = String(text ?? '').replace(/^\uFEFF/, '');
  if(s.includes('\u0000'))fail('CSV contains null bytes or an unsupported text encoding.');
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
function needsCsvFormulaGuard(value) {
  const s=String(value ?? '');
  return /^[\s]*[=+@\t\r]/.test(s) || (/^[\s]*-/.test(s) && !/^-?\d+(\.\d+)?$/.test(s.trim()));
}
export function toCSV(rows, keys=['date','description','amount','id']) {
  function safe(value) {
    let s=String(value ?? '');
    // Prefix spreadsheet-formula-like text without modifying validated numeric amount cells.
    if (needsCsvFormulaGuard(s)) s="'"+s;
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
  const lines=String(text).replace(/^\uFEFF/,'').split(/\r?\n/);
  const transactions=[];let entry={},kind='',splits=0,categories=0;
  const commit=()=>{
    if(!Object.keys(entry).length)return;
    if(!entry.date||!entry.amount)fail('QIF transaction missing D or T value.');
    transactions.push({date:isoDate(entry.date,dateFormat),description:entry.description||entry.memo||'',amount:fromMinorUnits(toMinorUnits(entry.amount)),id:entry.id||'',memo:entry.memo||''});
    entry={};
  };
  for(const line of lines) {
    if(!line)continue;
    if(line.startsWith('!Type:')) {
      if(Object.keys(entry).length)fail('QIF section changed before a terminating ^.');
      const next=line.slice(6).trim();
      if(/^Invst$/i.test(next))fail('Investment QIF transactions are unsupported. No transactions were exported.');
      if(!/^(Bank|CCard|Cash)$/i.test(next))fail('Unsupported QIF section type '+next+'. Only Bank, CCard and Cash transactions are supported.');
      if(kind&&kind.toLowerCase()!==next.toLowerCase())fail('Multiple QIF transaction section types found. Export one account/type at a time.');
      kind=next;
      continue;
    }
    if(line.startsWith('!Account'))fail('QIF account-list sections are not supported. Export transactions for one account at a time.');
    if(line.startsWith('!'))fail('Unsupported QIF directive. Export a single Bank, CCard or Cash transaction section.');
    if(!kind)fail('QIF file is missing a supported !Type:Bank, !Type:CCard or !Type:Cash header.');
    if(line==='^'){commit();continue;}
    const k=line[0],v=line.slice(1);
    if(k==='D')entry.date=v;
    else if(k==='T')entry.amount=v;
    else if(k==='P')entry.description=v;
    else if(k==='M')entry.memo=v;
    else if(k==='N')entry.id=v;
    else if(k==='L')categories++;
    else if(k==='S'||k==='E'||k==='$')splits++;
  }
  if(Object.keys(entry).length)fail('QIF final transaction lacks terminating ^.');
  if(!transactions.length)fail('No QIF transactions found.');
  const warnings=[];
  if(splits||categories)warnings.push('QIF category/split allocations are not preserved in this transaction export.');
  return {transactions,source:'QIF',warnings};
}

/** Decode bank files locally. OFX 1.x frequently declares the Windows-1252 code page. */
export function decodeFinancialBytes(input,format=''){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  if(bytes.byteLength>MAX_FILE_BYTES)fail('File exceeds the 8 MB browser processing limit.');
  let encoding='utf-8';
  if(bytes[0]===0xff&&bytes[1]===0xfe)encoding='utf-16le';
  else if(bytes[0]===0xfe&&bytes[1]===0xff)encoding='utf-16be';
  else if(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf)encoding='utf-8';
  else if(['ofx','qbo','qfx'].includes(String(format).toLowerCase())){
    const header=new TextDecoder('windows-1252').decode(bytes.subarray(0,Math.min(bytes.length,4096))).split(/<OFX\b/i)[0];
    if(/^\s*OFXHEADER\s*:/im.test(header)){
      const charset=header.match(/^CHARSET\s*:\s*([^\r\n]+)/im)?.[1].trim().toUpperCase();
      if(charset&&/^(1252|CP1252|WINDOWS-1252|ISO-8859-1|8859-1)$/.test(charset))encoding='windows-1252';
      else if(charset&&/^(65001|UTF-8|UTF8|UNICODE|NONE)$/.test(charset))encoding='utf-8';
      else if(charset)fail('Unsupported OFX character set: '+charset+'. Re-export in UTF-8 or Windows-1252.');
    }
  }
  let text;
  try{text=new TextDecoder(encoding,{fatal:true}).decode(bytes);}
  catch{fail('Cannot decode '+encoding+' financial file safely. Export as UTF-8 before retrying.');}
  if(text.includes('\uFFFD'))fail('File contains undecodable replacement characters. Re-export in a supported encoding.');
  if(text.includes('\u0000'))fail('Unsupported null byte in financial file.');
  return {text,encoding};
}
function decodeEntities(s){
  return s.replace(/&(?:(amp|lt|gt|quot|apos)|#(x[0-9a-f]+|[0-9]+));/gi,(raw,named,numeric)=>{
    if(named)return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[named.toLowerCase()];
    const num=numeric[0].toLowerCase()==='x'?parseInt(numeric.slice(1),16):parseInt(numeric,10);
    if(!Number.isSafeInteger(num)||num<1||num>0x10ffff||(num>=0xd800&&num<=0xdfff))fail('Invalid OFX character entity.');
    return String.fromCodePoint(num);
  });
}
function ofxField(block,key){
  const matches=[...block.matchAll(new RegExp('<'+key+'\\b[^>]*>','gi'))];
  if(matches.length>1)fail('Duplicate OFX '+key+' fields in one record.');
  if(!matches.length)return '';
  const match=matches[0],rest=block.slice(match.index+match[0].length);
  const trimmed=rest.trimStart();
  if(trimmed.startsWith('<![CDATA[')){
    const close=trimmed.indexOf(']]>');
    if(close<0)fail('Unclosed OFX CDATA in '+key+'.');
    const after=trimmed.slice(close+3).trimStart();
    if(after&&!new RegExp('^</'+key+'\\s*>','i').test(after))fail('Malformed OFX CDATA field '+key+'.');
    return trimmed.slice(9,close).trim();
  }
  const end=rest.indexOf('<');
  const raw=(end<0?rest:rest.slice(0,end)).trim();
  if(end>=0){
    const next=rest.slice(end).match(/^<\/([a-zA-Z][a-zA-Z0-9_.-]*)\s*>/);
    if(next&&next[1].toUpperCase()!==key.toUpperCase())fail('Malformed OFX '+key+' closing tag.');
  }
  return decodeEntities(raw);
}
export function parseOFX(text) {
  const original=String(text);
  if(/<!DOCTYPE|<!ENTITY|<script/i.test(original))fail('Unsupported or unsafe XML declarations.');
  const raw=original.replace(/<!--[\s\S]*?-->/g,'');
  if(raw.includes('<!--')||raw.includes('-->'))fail('Malformed OFX comment. No transactions were exported.');
  if(/<(?:CURRENCY|ORIGCURRENCY)\b/i.test(raw))fail('OFX per-transaction currency conversion is unsupported.');
  const currencyTags=[...raw.matchAll(/<CURDEF\b[^>]*>\s*([^<\s]+)/gi)].map(m=>m[1].toUpperCase());
  if(/<CURDEF\b/i.test(raw)&&!currencyTags.length)fail('Invalid OFX currency declaration.');
  if(currencyTags.some(c=>c!=='USD'))fail('Only USD OFX statement currency is supported. No currency conversion is performed.');
  const accountSections=[...raw.matchAll(/<(?:STMTRS|CCSTMTRS)\b/gi)].length;
  if(accountSections>1)fail('Multiple bank or card accounts detected in this OFX file. Export one account at a time to avoid mixing transactions.');
  if(/<INVSTMTMSGSRSV1\b|<INVSTMTRS\b/i.test(raw))fail('Investment OFX feeds are not supported. No transactions were exported.');

  // BANKTRANLIST is a single bank statement aggregate, not an arbitrary
  // concatenation of transactions from independent source windows.
  const listTags=[...raw.matchAll(/<\/?BANKTRANLIST\b[^>]*>/gi)];
  let bankList=null,bankBounds=null,reportedStartDate=null,reportedEndDate=null;
  if(listTags.length){
    if(listTags.length!==2||/^<\//.test(listTags[0][0])||!/^<\//.test(listTags[1][0]))
      fail('Multiple or incomplete BANKTRANLIST statement groups. Export one complete bank statement at a time.');
    const opening=listTags[0],closing=listTags[1];
    const begin=opening.index+opening[0].length,end=closing.index;
    if(begin>end)fail('Invalid BANKTRANLIST boundaries.');
    bankList=raw.slice(begin,end);
    bankBounds={begin,end};
    const beginRaw=ofxField(bankList,'DTSTART'),endRaw=ofxField(bankList,'DTEND');
    if(beginRaw)reportedStartDate=isoDate(beginRaw);
    if(endRaw)reportedEndDate=isoDate(endRaw);
    if(reportedStartDate&&reportedEndDate&&reportedStartDate>reportedEndDate)
      fail('OFX statement range is invalid: DTSTART is after DTEND.');
  }
  for(const status of raw.matchAll(/<STATUS\b[^>]*>([\s\S]*?)<\/STATUS\s*>/gi)){
    const code=ofxField(status[1],'CODE'),severity=ofxField(status[1],'SEVERITY');
    if((code&&code!=='0')||/^ERROR$/i.test(severity))fail('OFX bank response reports an unsuccessful status. No transactions were exported.');
  }
  let open=false,recordCount=0;
  for(const token of raw.matchAll(/<\/?STMTTRN\b[^>]*>/gi)){
    const closing=/^<\//.test(token[0]);
    if(closing) {
      if(!open)fail('Unexpected closing STMTTRN tag. Check the source file.');
      open=false;
    } else {
      if(open)fail('Nested or unclosed STMTTRN transaction. Check the source file.');
      open=true;recordCount++;
    }
  }
  if(open)fail('Incomplete STMTTRN transaction at end of file.');
  if(!recordCount)fail('No bank STMTTRN entries found. Investment feeds are not supported.');
  const blocks=[...raw.matchAll(/<STMTTRN\b[^>]*>([\s\S]*?)<\/STMTTRN\s*>/gi)];
  if(blocks.length!==recordCount)fail('One or more OFX transaction records could not be read safely.');
  if(bankBounds&&blocks.some(block=>block.index<bankBounds.begin||block.index+block[0].length>bankBounds.end))
    fail('OFX contains transactions outside the declared BANKTRANLIST. No data was exported.');
  let missingReferenceCount=0,missingTypeCount=0,postedBeforeRangeCount=0,postedAfterRangeCount=0;
  const transactions=blocks.map((m,i)=>{
    const b=m[1];
    try{
      const date=ofxField(b,'DTPOSTED'),amount=ofxField(b,'TRNAMT');
      const description=ofxField(b,'NAME')||ofxField(b,'MEMO');
      if(!description)fail('Transaction NAME and MEMO are both empty.');
      const id=ofxField(b,'FITID'),type=ofxField(b,'TRNTYPE');
      if(!id)missingReferenceCount++;
      if(!type)missingTypeCount++;
      // OFX search ranges track bank system-add time, not necessarily DTPOSTED.
      // Warn about surprises, never drop rows or treat the difference as an error.
      const postedDate=isoDate(date);
      if(reportedStartDate&&postedDate<reportedStartDate)postedBeforeRangeCount++;
      if(reportedEndDate&&postedDate>reportedEndDate)postedAfterRangeCount++;
      // OFX TRNAMT is already signed. TRNTYPE does not redefine its sign.
      return {date:postedDate,amount:fromMinorUnits(toMinorUnits(amount)),
        description,memo:ofxField(b,'MEMO'),id};
    }catch(e){fail('OFX transaction '+(i+1)+': '+e.message);}
  });
  return {transactions,source:'OFX / QBO / QFX',
    integrity:{check:'ofx_statement_records',status:'passed',recordCount,missingReferenceCount,missingTypeCount,
      declaredCurrency:currencyTags.length?'USD':null,
      statementRange:reportedStartDate||reportedEndDate?{startInclusive:reportedStartDate,endExclusive:reportedEndDate}:null,
      postedBeforeRangeCount,postedAfterRangeCount},
    warnings:[
      'Read-only transaction extraction. This does not validate bank institution identities or QuickBooks imports.',
      ...(!currencyTags.length?['This source does not declare its currency. Verify currency before using exported amounts.']:[]),
      ...(missingReferenceCount?[missingReferenceCount+' OFX transaction(s) have no FITID; duplicate/reference checks may be incomplete.']:[]),
      ...(missingTypeCount?[missingTypeCount+' OFX transaction(s) have no TRNTYPE; signed amounts remain unchanged.']:[]),
      ...(bankList&&(reportedStartDate==null||reportedEndDate==null)?['BANKTRANLIST has incomplete DTSTART/DTEND date coverage metadata. Verify the selected statement period.']:[]),
      ...(postedBeforeRangeCount||postedAfterRangeCount?[(postedBeforeRangeCount+postedAfterRangeCount)+' OFX posted date(s) lie outside the reported retrieval dates. This can be legitimate because OFX search uses bank system-add time; review without dropping any rows.']:[])
    ]};
}
export function parseIIF(text,dateFormat='us'){
  const lines=String(text).replace(/^\uFEFF/,'').split(/\r?\n/);
  let trnsHeader=null,splHeader=null,active=null,balancedGroups=0,splitRows=0,ignoredRows=0;
  const transactions=[];
  const parseHeader=(row,required,atLine)=>{
    const names=row.slice(1).map(name=>name.trim().toUpperCase());
    if(new Set(names).size!==names.length)fail('IIF line '+atLine+': duplicate column names.');
    for(const key of required){
      if(key==='AMOUNT'){if(!names.includes('AMOUNT')&&!names.includes('AMT'))fail('IIF line '+atLine+': missing AMOUNT/AMT column.');}
      else if(!names.includes(key))fail('IIF line '+atLine+': missing '+key+' column.');
    }
    return names;
  };
  const fields=(row,header)=>{
    const values={};
    for(let i=0;i<header.length;i++)values[header[i]]=String(row[i+1]??'');
    return values;
  };
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(!line.trim())continue;
    const row=line.split('\t'),tag=String(row[0]??'').trim().toUpperCase(),number=i+1;
    if(tag==='!TRNS'||tag==='!SPL'){
      if(active)fail('IIF line '+number+': a header occurred before ENDTRNS.');
      if(tag==='!TRNS')trnsHeader=parseHeader(row,['DATE','AMOUNT'],number);
      else splHeader=parseHeader(row,['AMOUNT'],number);
      continue;
    }
    if(tag==='!ENDTRNS')continue;
    if(tag==='TRNS'){
      if(!trnsHeader)fail('IIF line '+number+': TRNS is missing a !TRNS header.');
      if(active)fail('IIF line '+number+': previous TRNS is missing ENDTRNS.');
      const record=fields(row,trnsHeader);
      try{
        const date=isoDate(record.DATE,dateFormat);
        const value=toMinorUnits(record.AMOUNT||record.AMT);
        const description=(record.MEMO||record.NAME||record.ACCNT||'').trim();
        if(!description)fail('TRNS has no memo, name or account label.');
        active={line:number,amount:value,splitSum:0n,splits:0,
          transaction:{date,amount:fromMinorUnits(value),description,id:record.DOCNUM||'',memo:record.MEMO||''}};
      }catch(e){fail('IIF TRNS line '+number+': '+e.message);}
      continue;
    }
    if(tag==='SPL'){
      if(!active)fail('IIF line '+number+': orphan SPL without a TRNS.');
      if(!splHeader)fail('IIF line '+number+': SPL is missing a !SPL header.');
      const record=fields(row,splHeader);
      try{active.splitSum+=toMinorUnits(record.AMOUNT||record.AMT);}
      catch(e){fail('IIF SPL line '+number+': '+e.message);}
      active.splits++;splitRows++;
      continue;
    }
    if(tag==='ENDTRNS'){
      if(!active)fail('IIF line '+number+': ENDTRNS without TRNS.');
      if(!active.splits)fail('IIF TRNS line '+active.line+': no SPL entries before ENDTRNS.');
      if(active.amount+active.splitSum!==0n)fail('IIF TRNS line '+active.line+': TRNS and SPL amounts do not balance to zero.');
      transactions.push(active.transaction);
      balancedGroups++;active=null;
      continue;
    }
    if(active)fail('IIF line '+number+': unexpected row type inside TRNS/SPL group.');
    ignoredRows++;
  }
  if(active)fail('IIF TRNS line '+active.line+': missing ENDTRNS at end of file.');
  if(!transactions.length)fail('No complete, balanced IIF TRNS groups found.');
  const warnings=[
    'Checked '+balancedGroups+' IIF TRNS group(s) and '+splitRows+' SPL row(s) for zero-sum consistency. The CSV/Excel output contains TRNS summaries ONLY, not SPL allocations or a reconstructed accounting ledger.',
    'TRNS amounts are account-side accounting entries, not necessarily bank transactions. Do not import this summary as a bank statement or an accounting migration.'
  ];
  if(ignoredRows)warnings.push(ignoredRows+' non-transaction IIF row(s) were ignored; only checked TRNS groups are exported.');
  return {transactions,source:'IIF',
    integrity:{check:'iif_trns_split_balance',status:'passed',balancedGroups,splitRows,ignoredRows},
    warnings};
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
    return 'D'+d+'\r\nT'+fromMinorUnits(toMinorUnits(t.amount))+'\r\nP'+String(t.description||'').replace(/[\r\n^]/g,' ')+'\r\n'+(t.id?'N'+String(t.id).replace(/[\r\n^]/g,' ')+'\r\n':'')+(t.memo?'M'+String(t.memo).replace(/[\r\n^]/g,' ')+'\r\n':'')+'^\r\n';
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
/**
 * Reparse every QuickBooks-compatible CSV part and reconcile exact integer
 * cents and row counts before allowing a download. This verifies the exported
 * CSV syntax and totals, NOT acceptance by QuickBooks Online.
 */
export function quickBooksCSVExportPlan(transactions,limits={}){
  const parts=quickBooksCSVParts(transactions,limits);
  const sourceAudit=auditTransactions(transactions);
  const summaries=[];
  let totalCount=0,totalIn=0n,totalOut=0n;
  const encoder=new TextEncoder();
  for(let i=0;i<parts.length;i++){
    const csv=parts[i],rows=parseCSV(csv);
    if(rows[0].join(',')!=='Date,Description,Amount')fail('QuickBooks CSV export header does not match the expected 3-column format.');
    const records=rows.slice(1);
    if(!records.length)fail('QuickBooks CSV export contains an empty part.');
    const dates=[];
    let inCents=0n,outCents=0n;
    for(const record of records){
      const date=isoDate(record[0],'us'),amount=toMinorUnits(record[2]);
      if(!record[1].trim())fail('QuickBooks CSV export contains an empty Description.');
      dates.push(date);
      if(amount>=0n)inCents+=amount;else outCents-=amount;
    }
    dates.sort();
    const bytes=encoder.encode(csv).length;
    if(records.length>(limits.maxRows??1000)||bytes>(limits.maxBytes??350000)){
      fail('QuickBooks CSV export exceeded its row or byte limit after serialization.');
    }
    totalCount+=records.length;totalIn+=inCents;totalOut+=outCents;
    summaries.push({file:'quickbooks-online-part-'+String(i+1).padStart(3,'0')+'.csv',
      rows:records.length,bytes,
      dateRange:{first:dates[0],last:dates[dates.length-1]},
      totalIn:fromMinorUnits(inCents),totalOut:fromMinorUnits(outCents),net:fromMinorUnits(inCents-outCents)});
  }
  if(totalCount!==sourceAudit.summary.count||
    fromMinorUnits(totalIn)!==sourceAudit.summary.credit||
    fromMinorUnits(totalOut)!==sourceAudit.summary.debit){
    fail('QuickBooks CSV export reconciliation failed: source and output totals differ.');
  }
  const warnings=[
    'This is QuickBooks Online manual-upload CSV, NOT a .qbo Web Connect file; actual software import has not been tested.',
    'The three-column QuickBooks CSV omits transaction reference IDs; review duplicates before any import.'
  ];
  if(sourceAudit.duplicateIds.length||sourceAudit.possibleDuplicates.length){
    warnings.push('Potential duplicates were detected in the source; no transactions have been deleted.');
  }
  if(sourceAudit.csvFormulaGuardCount){
    warnings.push(sourceAudit.csvFormulaGuardCount+' formula-like description(s) were prefixed with an apostrophe to reduce spreadsheet injection risk.');
  }
  return {parts,report:{
    reportType:'Finance File Lab QuickBooks CSV preflight v1',
    outputFormat:'QuickBooks Online manual-upload 3-column CSV',
    localOnly:true,quickBooksImportTested:false,isQBOWebConnect:false,
    generatedCSVReparsed:true,totalsReconciled:true,
    autoDeletedTransactions:false,containsTransactionDescriptions:false,
    containsTransactionReferences:false,sourceFileNamesIncluded:false,
    sourceRows:sourceAudit.summary.count,
    sourceTotals:sourceAudit.summary,
    duplicateReferenceCount:sourceAudit.duplicateIds.length,
    possibleDuplicateCount:sourceAudit.possibleDuplicates.length,
    csvEscapedDescriptionCount:sourceAudit.csvFormulaGuardCount,
    partCount:summaries.length,parts:summaries,warnings
  }};
}

/** Duplicate checks warn; they never mutate or drop the user's records. */
export function auditTransactions(transactions){
  if(!Array.isArray(transactions)||!transactions.length)fail('No transactions to audit.');
  const idIndex=new Map(),fingerprints=new Map(),duplicateIds=[],possibleDuplicates=[];
  let csvFormulaGuardCount=0;
  const normalized=transactions.map((t,i)=>{
    const date=isoDate(t.date),amount=fromMinorUnits(toMinorUnits(t.amount));
    const description=String(t.description??'').trim();
    if(!description)fail('Transaction '+(i+1)+' has no description.');
    if(needsCsvFormulaGuard(description))csvFormulaGuardCount++;
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
  if(csvFormulaGuardCount)warnings.push(csvFormulaGuardCount+' spreadsheet formula-like description(s) will be prefixed with an apostrophe in CSV exports. Review the descriptions before import.');
  return {summary,duplicateIds,possibleDuplicates,csvFormulaGuardCount,warnings};
}
export function totals(transactions){
  let debit=0n,credit=0n;
  for(const row of transactions){const n=toMinorUnits(row.amount);if(n<0n)debit+=-n;else credit+=n;}
  return {count:transactions.length,debit:fromMinorUnits(debit),credit:fromMinorUnits(credit),net:fromMinorUnits(credit-debit)};
}
