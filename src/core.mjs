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

/**
 * Re-parse the exact generic spreadsheet CSV wire and verify every source
 * field, boundary and row order before browser download. The report contains
 * only counts and flags, never bank payees, references, Memo or file names.
 * An apostrophe added for spreadsheet formula safety is the ONLY allowed
 * text difference between a source field and its CSV cell.
 */
export function validateGenericCSVExport(transactions,csvText,{includeMemo=false}={}){
  if(typeof includeMemo!=='boolean')fail('Invalid generic CSV Memo export option.');
  if(!Array.isArray(transactions)||!transactions.length)fail('No transactions to export.');
  const keys=['date','description','amount','id',...(includeMemo?['memo']:[])];
  let data;
  try{
    const encoded=new TextEncoder().encode(String(csvText));
    const decoded=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(encoded);
    if(decoded!==csvText)fail('CSV encoding changed invalid Unicode characters.');
    data=parseCSV(decoded);
  }catch{
    fail('CSV export preflight failed: output encoding or record structure is invalid.');
  }
  if(data.length!==transactions.length+1)fail('CSV export preflight failed: source and output row counts differ.');
  if(data[0].length!==keys.length||keys.some((k,j)=>data[0][j]!==k))
    fail('CSV export preflight failed: column names or order differ.');
  let guardedCells=0,memoRows=0;
  for(let i=0;i<transactions.length;i++){
    const tx=transactions[i],row=data[i+1];
    if(!Array.isArray(row)||row.length!==keys.length)
      fail('CSV export preflight failed at row '+(i+1)+': column count differs.');
    let date,amount;
    try{date=isoDate(tx.date);amount=fromMinorUnits(toMinorUnits(tx.amount));}
    catch{fail('CSV export preflight failed at row '+(i+1)+': invalid date or signed amount.');}
    if(!String(tx.description??'').trim())
      fail('CSV export preflight failed at row '+(i+1)+': missing description.');
    if(String(tx.memo??'').length) memoRows++;
    for(let j=0;j<keys.length;j++){
      const key=keys[j];
      const source=key==='date'?date:key==='amount'?amount:String(tx[key]??'');
      const guarded=needsCsvFormulaGuard(source);
      const expected=guarded?"'"+source:source;
      if(row[j]!==expected)
        fail('CSV export preflight failed at row '+(i+1)+': '+key+' changed or moved.');
      if(guarded)guardedCells++;
    }
  }
  return {reportType:'generic_csv_exact_rows_v1',rowCount:transactions.length,
    columnCount:keys.length,orderedRowsReconciled:true,exactTextReconciled:true,
    signedAmountsReconciled:true,memoIncluded:includeMemo,memoRowsWithContent:memoRows,
    memoRowsOmitted:includeMemo?0:memoRows,formulaGuardedCells:guardedCells};
}
export function genericCSVExportPlan(transactions,{includeMemo=false}={}){
  if(typeof includeMemo!=='boolean')fail('Invalid generic CSV Memo export option.');
  if(!Array.isArray(transactions)||!transactions.length)fail('No transactions to export.');
  const normalized=transactions.map((tx,i)=>{
    try{
      const date=isoDate(tx.date),amount=fromMinorUnits(toMinorUnits(tx.amount));
      if(!String(tx.description??'').trim())fail('Description is empty.');
      return {date,description:String(tx.description??''),amount,
        id:String(tx.id??''),memo:String(tx.memo??'')};
    }catch{fail('CSV export row '+(i+1)+': invalid date, description or amount.');}
  });
  const keys=['date','description','amount','id',...(includeMemo?['memo']:[])];
  const csv=toCSV(normalized,keys);
  const report=validateGenericCSVExport(normalized,csv,{includeMemo});
  return {csv,report};
}

const FIELD_SYNONYMS = {
 date:['date','transaction date','posted date','posting date','dtposted'],
 description:['description','payee','name','details','merchant','transaction description','memo'],
 amount:['amount','transaction amount','net amount','total'],
 debit:['debit','withdrawal','withdrawals','paid out','money out'],
 credit:['credit','deposit','deposits','paid in','money in'],
 id:['id','fitid','reference','transaction id','check number'],
 memo:['memo','memo text','transaction memo','notes','note','bank memo']
};
export function guessMapping(header) {
  const lowered=header.map(x=>String(x).trim().toLowerCase().replace(/[_-]+/g,' '));
  const guessed=Object.fromEntries(Object.entries(FIELD_SYNONYMS).map(([field,choices])=>[field, choices.map(c=>lowered.indexOf(c)).find(index=>index>=0) ?? -1]));
  // A bank file may have only a Memo column serving as its Description.
  // That single column cannot represent two independently mapped fields.
  if(guessed.memo===guessed.description)guessed.memo=-1;
  return guessed;
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
  const fields = map.amount >= 0 ? ['date','description','amount','id','memo'] : ['date','description','debit','credit','id','memo'];
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
    const getRaw=key=>map[key]>=0?String(r[map[key]]??''):'';
    const get=key=>getRaw(key).trim();
    try {
      const credit=map.credit>=0?toMinorUnits(get('credit')||'0'):0n;
      const debit=map.debit>=0?toMinorUnits(get('debit')||'0'):0n;
      if(map.amount<0&&(credit<0n||debit<0n))fail('Debit and Credit columns cannot contain negative values; choose a signed Amount column instead.');
      if(map.amount<0&&credit!==0n&&debit!==0n)fail('Both Debit and Credit are nonzero in the same row.');
      const amount=map.amount>=0?toMinorUnits(get('amount')):credit-debit;
      if(!get('description'))fail('Description is empty.');
      // Date/amount syntax may have outer whitespace, but quoted payees,
      // references and Memo are real source text and must never be trimmed.
      const memo=getRaw('memo');
      transactions.push({date:isoDate(get('date'),dateFormat),description:getRaw('description'),amount:fromMinorUnits(amount),id:getRaw('id'),memo});
    } catch (e) { fail('CSV row '+(i+1)+': '+e.message); }
  }
  if(!transactions.length) fail('No transactions found.');
  return {transactions,warnings:[],source:'CSV'};
}

/**
 * Financial text exports historically use CR, LF or CRLF (sometimes mixed).
 * Normalize record boundaries only: payee/amount field values are never
 * trimmed or rewritten as a consequence of a line-ending choice.
 */
function financialLines(text){
  return String(text).replace(/^\uFEFF/,'').split(/\r\n|\n|\r/);
}
export function parseQIF(text, dateFormat='us') {
  const lines=financialLines(text);
  const transactions=[];
  let entry={},kind='',splits=0,categories=0,ignoredMetadata=0,redundantAmounts=0;
  let recordLine=0,recordSeen=false;
  const commit=()=>{
    if(!Object.keys(entry).length){
      if(recordSeen)fail('QIF transaction has metadata but no D/T financial values.');
      return;
    }
    if(!entry.date||!entry.amount)fail('QIF transaction near line '+recordLine+' missing D or T value.');
    if(entry.uAmount!=null){
      if(toMinorUnits(entry.amount)!==toMinorUnits(entry.uAmount))
        fail('QIF transaction near line '+recordLine+': T and U amount fields disagree.');
      redundantAmounts++;
    }
    const description=entry.description||entry.memo||'';
    if(!description.trim())fail('QIF transaction near line '+recordLine+' has no payee or memo.');
    transactions.push({date:isoDate(entry.date,dateFormat),description,
      amount:fromMinorUnits(toMinorUnits(entry.amount)),id:entry.id||'',memo:entry.memo||''});
    entry={};recordLine=0;recordSeen=false;
  };
  const fieldName={D:'date',T:'amount',U:'uAmount',P:'description',M:'memo',N:'id'};
  for(let i=0;i<lines.length;i++){
    const line=lines[i],lineNumber=i+1;
    if(!line)continue;
    if(line.startsWith('!Type:')){
      if(Object.keys(entry).length)fail('QIF section changed before a terminating ^.');
      const next=line.slice(6).trim();
      if(/^Invst$/i.test(next))fail('Investment QIF transactions are unsupported. No transactions were exported.');
      if(!/^(Bank|CCard|Cash)$/i.test(next))fail('Unsupported QIF section type '+next+'. Only Bank, CCard and Cash transactions are supported.');
      if(kind&&kind.toLowerCase()!==next.toLowerCase())fail('Multiple QIF transaction section types found. Export one account/type at a time.');
      if(kind)fail('Repeated QIF transaction type header could contain multiple accounts. Export one account at a time.');
      kind=next;continue;
    }
    if(line.startsWith('!Account'))fail('QIF account-list sections are not supported. Export transactions for one account at a time.');
    if(line.startsWith('!'))fail('Unsupported QIF directive. Export a single Bank, CCard or Cash transaction section.');
    if(!kind)fail('QIF file is missing a supported !Type:Bank, !Type:CCard or !Type:Cash header.');
    if(line==='^'){commit();continue;}
    const k=line[0],v=line.slice(1);
    recordSeen=true;
    if(k in fieldName){
      const key=fieldName[k];
      if(Object.hasOwn(entry,key))fail('QIF line '+lineNumber+': duplicate '+k+' field would overwrite financial data.');
      if(!recordLine)recordLine=lineNumber;
      entry[key]=v;
    }else if(k==='L'){
      categories++;
    }else if(k==='S'||k==='E'||k==='$'){
      splits++;
    }else if(k==='C'||k==='F'||k==='A'){
      ignoredMetadata++;
    }else{
      fail('Unsupported QIF field '+JSON.stringify(k)+' at line '+lineNumber+'. No rows were exported.');
    }
  }
  if(recordSeen)fail('QIF final transaction lacks terminating ^.');
  if(!transactions.length)fail('No QIF transactions found.');
  const warnings=[];
  if(splits||categories)warnings.push('QIF category/split allocations are not preserved in this transaction export.');
  if(ignoredMetadata)warnings.push(ignoredMetadata+' QIF cleared-state, flag or address metadata field(s) were not preserved in the transaction summary.');
  if(redundantAmounts)warnings.push(redundantAmounts+' QIF redundant U amount field(s) agreed with T and were not duplicated.');
  return {transactions,source:'QIF',
    integrity:{check:'qif_bank_records',status:'passed',recordCount:transactions.length,
      ignoredCategorySplitFields:splits+categories,ignoredMetadataFields:ignoredMetadata,
      consistentRedundantAmounts:redundantAmounts},
    warnings};
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
// Produce equal-length views so <STMTTRN>, <STATUS> and <BANKTRANLIST>
// token searches cannot mistake tags inside XML comments or CDATA for real
// OFX elements. Preserve CDATA verbatim for later decoding of NAME/MEMO text.
function ofxViews(source){
  const input=String(source);
  let clean='',structure='',last=0,offset=0;
  while(offset<input.length){
    const comment=input.indexOf('<!--',offset),cdata=input.indexOf('<![CDATA[',offset);
    if(comment<0&&cdata<0)break;
    const isComment=comment>=0&&(cdata<0||comment<cdata);
    const begin=isComment?comment:cdata;
    const close=isComment?'-->':']]>';
    const end=input.indexOf(close,begin+(isComment?4:9));
    if(end<0)fail(isComment?'Unclosed OFX XML comment.':'Unclosed OFX CDATA section.');
    const until=end+close.length,spaces=' '.repeat(until-begin);
    clean+=input.slice(last,begin)+(isComment?spaces:input.slice(begin,until));
    structure+=input.slice(last,begin)+spaces;
    offset=until;last=until;
  }
  clean+=input.slice(last);
  structure+=input.slice(last);
  if(structure.includes('-->'))fail('Malformed OFX comment terminator.');
  if(structure.includes(']]>'))fail('Malformed OFX CDATA terminator.');
  return {clean,structure};
}
// XML entity resolution is strict only for XML-declared OFX 2.x. Legacy
// OFX 1.x SGML often contains literal ampersands in NAME/MEMO.
function xmlCharacter(codePoint){
  return codePoint===9||codePoint===10||codePoint===13||
    (codePoint>=32&&codePoint<=0xD7FF)||
    (codePoint>=0xE000&&codePoint<=0xFFFD)||
    (codePoint>=0x10000&&codePoint<=0x10FFFF);
}
function decodeEntities(value,xml=false){
  const s=String(value);
  if(xml){
    // Unknown, incomplete, or bare ampersands are invalid XML text, not
    // harmless literal payee characters. Never silently export them.
    if(/&(?!(?:amp|lt|gt|quot|apos|#(?:x[0-9a-fA-F]+|[0-9]+));)/.test(s))
      fail('Malformed or unsupported OFX XML character entity.');
    for(const character of s)if(!xmlCharacter(character.codePointAt(0)))
      fail('Invalid XML character in OFX transaction field.');
  }
  return s.replace(/&(?:(amp|lt|gt|quot|apos)|#(x[0-9a-f]+|[0-9]+));/gi,(_raw,named,numeric)=>{
    if(named)return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[named.toLowerCase()];
    const num=numeric[0].toLowerCase()==='x'?parseInt(numeric.slice(1),16):parseInt(numeric,10);
    if(!Number.isSafeInteger(num)||num<1||num>0x10ffff||
       (num>=0xd800&&num<=0xdfff)||(xml&&!xmlCharacter(num)))
      fail('Invalid OFX character entity.');
    return String.fromCodePoint(num);
  });
}
/**
 * XML leaf fields may contain normal entity-escaped text, CDATA and comments
 * in any order. Concatenate text segments and CDATA literally, but remove
 * comments. Otherwise the extracted payee/memo may silently lose content.
 */
function ofxTextSegments(fragment,xml=false){
  let content='',cursor=0;
  while(cursor<fragment.length){
    const comment=fragment.indexOf('<!--',cursor),cdata=fragment.indexOf('<![CDATA[',cursor);
    const isComment=comment>=0&&(cdata<0||comment<cdata);
    const begin=isComment?comment:cdata;
    const stop=begin<0?fragment.length:begin;
    const plain=fragment.slice(cursor,stop);
    if(plain.includes('<'))fail('Unexpected markup inside OFX leaf field.');
    content+=decodeEntities(plain,xml);
    if(begin<0)break;
    const opener=isComment?'<!--':'<![CDATA[',closer=isComment?'-->':']]>';
    const ending=fragment.indexOf(closer,begin+opener.length);
    if(ending<0)fail('Unclosed OFX XML comment or CDATA section.');
    if(!isComment){
      const literal=fragment.slice(begin+opener.length,ending);
      if(xml)for(const character of literal)if(!xmlCharacter(character.codePointAt(0)))
        fail('Invalid XML character in OFX CDATA field.');
      content+=literal;
    }
    cursor=ending+closer.length;
  }
  return content.trim();
}
function ofxField(block,key,xml=false){
  const source=String(block),structure=ofxViews(source).structure;
  const matches=[...structure.matchAll(new RegExp('<'+key+'\\b[^>]*>','gi'))];
  if(matches.length>1)fail('Duplicate OFX '+key+' fields in one record.');
  if(!matches.length)return '';
  const match=matches[0],offset=match.index+match[0].length;
  // The structural view masks comments and CDATA at identical offsets, so
  // only a real tag can terminate a leaf and mixed text is not discarded.
  const rest=structure.slice(offset),end=rest.indexOf('<');
  const next=end<0?null:rest.slice(end).match(/^<\/([a-zA-Z][a-zA-Z0-9_.-]*)\s*>/);
  if(next&&next[1].toUpperCase()!==key.toUpperCase()&&!xml)
    fail('Malformed OFX '+key+' closing tag.');
  if(xml&&(!next||next[1].toUpperCase()!==key.toUpperCase()))
    fail('Missing XML closing tag for OFX '+key+'.');
  const raw=source.slice(offset,end<0?source.length:offset+end);
  return ofxTextSegments(raw,xml);
}
export function parseOFX(text) {
  const original=String(text);
  const {structure}=ofxViews(original);
  // Comments/CDATA are data, not XML/OFX elements. For safety checks and
  // aggregate boundaries, inspect only actual markup at matching offsets.
  if(/<!DOCTYPE|<!ENTITY|<script\b/i.test(structure))fail('Unsupported or unsafe XML declarations.');
  const xml=/^\s*<\?xml\b/i.test(structure)||/^\s*OFXHEADER\s*:\s*200\b/im.test(structure);
  if(/<(?:CURRENCY|ORIGCURRENCY)\b/i.test(structure))fail('OFX per-transaction currency conversion is unsupported.');
  const currencyTags=[...structure.matchAll(/<CURDEF\b[^>]*>\s*([^<\s]+)/gi)].map(m=>m[1].toUpperCase());
  if(/<CURDEF\b/i.test(structure)&&!currencyTags.length)fail('Invalid OFX currency declaration.');
  if(currencyTags.some(c=>c!=='USD'))fail('Only USD OFX statement currency is supported. No currency conversion is performed.');
  const accountSections=[...structure.matchAll(/<(?:STMTRS|CCSTMTRS)\b/gi)].length;
  if(accountSections>1)fail('Multiple bank or card accounts detected in this OFX file. Export one account at a time to avoid mixing transactions.');
  if(/<INVSTMTMSGSRSV1\b|<INVSTMTRS\b/i.test(structure))fail('Investment OFX feeds are not supported. No transactions were exported.');

  // BANKTRANLIST is a single bank statement aggregate, not an arbitrary
  // concatenation of transactions from independent source windows.
  const listTags=[...structure.matchAll(/<\/?BANKTRANLIST\b[^>]*>/gi)];
  let bankList=null,bankBounds=null,reportedStartDate=null,reportedEndDate=null;
  if(listTags.length){
    if(listTags.length!==2||/^<\//.test(listTags[0][0])||!/^<\//.test(listTags[1][0]))
      fail('Multiple or incomplete BANKTRANLIST statement groups. Export one complete bank statement at a time.');
    const opening=listTags[0],closing=listTags[1];
    const begin=opening.index+opening[0].length,end=closing.index;
    if(begin>end)fail('Invalid BANKTRANLIST boundaries.');
    bankList=original.slice(begin,end);
    bankBounds={begin,end};
    const beginRaw=ofxField(bankList,'DTSTART',xml),endRaw=ofxField(bankList,'DTEND',xml);
    if(beginRaw)reportedStartDate=isoDate(beginRaw);
    if(endRaw)reportedEndDate=isoDate(endRaw);
    if(reportedStartDate&&reportedEndDate&&reportedStartDate>reportedEndDate)
      fail('OFX statement range is invalid: DTSTART is after DTEND.');
  }
  let activeStatus=null;
  for(const token of structure.matchAll(/<\/?STATUS\b[^>]*>/gi)){
    const closing=/^<\//.test(token[0]);
    if(!closing){
      if(activeStatus)fail('Nested STATUS block in OFX bank response.');
      activeStatus=token;
      continue;
    }
    if(!activeStatus)fail('Unexpected closing STATUS in OFX bank response.');
    const body=original.slice(activeStatus.index+activeStatus[0].length,token.index);
    const code=ofxField(body,'CODE',xml),severity=ofxField(body,'SEVERITY',xml);
    if(!code)fail('OFX bank STATUS is missing a required CODE; no transactions were exported.');
    if(!/^0+$/.test(code)||/^ERROR$/i.test(severity))
      fail('OFX bank response reports an unsuccessful status. No transactions were exported.');
    activeStatus=null;
  }
  if(activeStatus)fail('Unclosed OFX bank STATUS; cannot verify server response.');
  let open=false,recordCount=0;
  for(const token of structure.matchAll(/<\/?STMTTRN\b[^>]*>/gi)){
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
  const blocks=[...structure.matchAll(/<STMTTRN\b[^>]*>([\s\S]*?)<\/STMTTRN\s*>/gi)];
  if(blocks.length!==recordCount)fail('One or more OFX transaction records could not be read safely.');
  if(bankBounds&&blocks.some(block=>block.index<bankBounds.begin||block.index+block[0].length>bankBounds.end))
    fail('OFX contains transactions outside the declared BANKTRANLIST. No data was exported.');
  let missingReferenceCount=0,missingTypeCount=0,postedBeforeRangeCount=0,postedAfterRangeCount=0;
  const transactions=blocks.map((m,i)=>{
    const openTag=m[0].match(/^<STMTTRN\b[^>]*>/i)?.[0];
    const closeTag=m[0].match(/<\/STMTTRN\s*>$/i)?.[0];
    if(!openTag||!closeTag)fail('Invalid OFX transaction boundary.');
    const b=original.slice(m.index+openTag.length,m.index+m[0].length-closeTag.length);
    try{
      const date=ofxField(b,'DTPOSTED',xml),amount=ofxField(b,'TRNAMT',xml);
      const description=ofxField(b,'NAME',xml)||ofxField(b,'MEMO',xml);
      if(!description)fail('Transaction NAME and MEMO are both empty.');
      const id=ofxField(b,'FITID',xml),type=ofxField(b,'TRNTYPE',xml);
      if(!id)missingReferenceCount++;
      if(!type)missingTypeCount++;
      // OFX search ranges track bank system-add time, not necessarily DTPOSTED.
      // Warn about surprises, never drop rows or treat the difference as an error.
      const postedDate=isoDate(date);
      if(reportedStartDate&&postedDate<reportedStartDate)postedBeforeRangeCount++;
      if(reportedEndDate&&postedDate>reportedEndDate)postedAfterRangeCount++;
      // OFX TRNAMT is already signed. TRNTYPE does not redefine its sign.
      return {date:postedDate,amount:fromMinorUnits(toMinorUnits(amount)),
        description,memo:ofxField(b,'MEMO',xml),id};
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
  const lines=financialLines(text);
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
/**
 * QIF has line-oriented D/T/P/N/M records and a bare ^ terminator.
 * Newlines or control bytes within source fields cannot be represented
 * losslessly. Reject them; never silently flatten payees or references.
 * A literal caret inside a P/N/M value is safe (only a whole "^" line ends
 * a transaction) and must not be removed from the original description.
 */
export function toQIF(transactions){
  if(!Array.isArray(transactions)||!transactions.length)fail('No transactions.');
  const expected=[];
  const output=transactions.map((t,i)=>{
    const row=i+1;
    const safeField=(value,key)=>{
      const s=String(value??'');
      if(/[\u0000-\u001f\u007f]/.test(s))
        fail('QIF export row '+row+': '+key+' contains a line break or control character. QIF cannot preserve it exactly; change the source or choose CSV/XLSX.');
      return s;
    };
    let date,amount;
    try{
      date=isoDate(t.date);
      amount=fromMinorUnits(toMinorUnits(t.amount));
    }catch(error){fail('QIF export row '+row+': '+error.message);}
    const description=safeField(t.description,'Description'),
      id=safeField(t.id,'Reference'),
      memo=safeField(t.memo,'Memo');
    if(!description.trim())fail('QIF export row '+row+': Description is empty.');
    const [year,month,day]=date.split('-');
    expected.push({date,amount,description,id,memo});
    return 'D'+month+'/'+day+'/'+year+'\r\n'+
      'T'+amount+'\r\n'+
      'P'+description+'\r\n'+
      (id?'N'+id+'\r\n':'')+
      (memo?'M'+memo+'\r\n':'')+
      '^\r\n';
  });
  const wire='!Type:Bank\r\n'+output.join('');
  let check;
  try{check=parseQIF(wire,'us');}
  catch(error){fail('QIF export self-check failed: '+error.message);}
  if(check.transactions.length!==expected.length)
    fail('QIF export self-check failed: source and output transaction counts differ.');
  for(let i=0;i<expected.length;i++){
    const source=expected[i],record=check.transactions[i];
    for(const key of ['date','amount','description','id','memo']){
      if(record[key]!==source[key])
        fail('QIF export self-check failed at row '+(i+1)+': '+key+' did not round-trip exactly.');
    }
  }
  return wire;
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
 * Validate each emitted 3-column QuickBooks CSV row against the corresponding
 * source row, including date formatting, protected description and exact cents.
 * Totals alone cannot catch swapped, duplicated or altered descriptions.
 *
 * This checks a manual-upload CSV, NOT QuickBooks import acceptance.
 * Neither the report nor any mismatch error contains source descriptions/IDs.
 */
export function validateQuickBooksCSVParts(transactions,parts,limits={}){
  const sourceAudit=auditTransactions(transactions);
  if(!Array.isArray(parts)||!parts.length||parts.some(x=>typeof x!=='string')){
    fail('QuickBooks CSV validation requires one or more generated CSV parts.');
  }
  const maxRows=limits.maxRows??1000,maxBytes=limits.maxBytes??350000;
  if(!Number.isInteger(maxRows)||maxRows<1||maxRows>1000||
     !Number.isInteger(maxBytes)||maxBytes<64||maxBytes>350000){
    fail('Invalid QuickBooks CSV validation limits.');
  }
  const summaries=[];
  const encoder=new TextEncoder();
  let cursor=0,inTotal=0n,outTotal=0n;
  for(let partIndex=0;partIndex<parts.length;partIndex++){
    const csv=parts[partIndex],rows=parseCSV(csv);
    if(rows[0].length!==3||rows[0].some((value,index)=>value!==['Date','Description','Amount'][index])){
      fail('QuickBooks CSV export header does not match the expected 3-column format.');
    }
    const records=rows.slice(1);
    if(!records.length)fail('QuickBooks CSV export contains an empty part.');
    const bytes=encoder.encode(csv).length;
    if(records.length>maxRows||bytes>maxBytes){
      fail('QuickBooks CSV export exceeded its row or byte limit after serialization.');
    }
    const firstSourceRow=cursor+1;
    const dates=[];
    let inCents=0n,outCents=0n;
    for(let rowIndex=0;rowIndex<records.length;rowIndex++){
      const record=records[rowIndex],original=transactions[cursor];
      if(!original)fail('QuickBooks CSV export has more rows than the source.');
      // Compare the *actual serialized strings*, not merely arithmetic totals.
      const iso=isoDate(original.date);
      const [year,month,day]=iso.split('-');
      const expectedDate=month+'/'+day+'/'+year;
      const rawDescription=String(original.description??'');
      const expectedDescription=needsCsvFormulaGuard(rawDescription)?"'"+rawDescription:rawDescription;
      const expectedAmount=fromMinorUnits(toMinorUnits(original.amount));
      if(record[0]!==expectedDate||record[1]!==expectedDescription||record[2]!==expectedAmount){
        fail('QuickBooks CSV source-row mismatch in part '+(partIndex+1)+', row '+(rowIndex+1)+'. Check date, description, amount and row order.');
      }
      const amount=toMinorUnits(record[2]);
      dates.push(iso);
      if(amount>=0n)inCents+=amount;else outCents-=amount;
      cursor++;
    }
    dates.sort();
    inTotal+=inCents;outTotal+=outCents;
    summaries.push({
      file:'quickbooks-online-part-'+String(partIndex+1).padStart(3,'0')+'.csv',
      rows:records.length,bytes,
      sourceRowRange:{first:firstSourceRow,last:cursor},
      orderedRowsReconciled:true,
      dateRange:{first:dates[0],last:dates[dates.length-1]},
      totalIn:fromMinorUnits(inCents),totalOut:fromMinorUnits(outCents),
      net:fromMinorUnits(inCents-outCents)
    });
  }
  if(cursor!==sourceAudit.summary.count||
     fromMinorUnits(inTotal)!==sourceAudit.summary.credit||
     fromMinorUnits(outTotal)!==sourceAudit.summary.debit){
    fail('QuickBooks CSV export reconciliation failed: source and output totals or row counts differ.');
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
  return {
    reportType:'Finance File Lab QuickBooks CSV preflight v2',
    outputFormat:'QuickBooks Online manual-upload 3-column CSV',
    localOnly:true,quickBooksImportTested:false,isQBOWebConnect:false,
    generatedCSVReparsed:true,totalsReconciled:true,orderedRowsReconciled:true,
    sourceDescriptionsReconciled:true,sourceAmountsReconciled:true,
    autoDeletedTransactions:false,containsTransactionDescriptions:false,
    containsTransactionReferences:false,sourceFileNamesIncluded:false,
    sourceRows:sourceAudit.summary.count,sourceTotals:sourceAudit.summary,
    duplicateReferenceCount:sourceAudit.duplicateIds.length,
    possibleDuplicateCount:sourceAudit.possibleDuplicates.length,
    csvEscapedDescriptionCount:sourceAudit.csvFormulaGuardCount,
    partCount:summaries.length,parts:summaries,warnings
  };
}
export function quickBooksCSVExportPlan(transactions,limits={}){
  const parts=quickBooksCSVParts(transactions,limits);
  const report=validateQuickBooksCSVParts(transactions,parts,limits);
  return {parts,report};
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
