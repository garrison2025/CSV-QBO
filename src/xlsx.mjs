/** Dependency-free XLSX writer (Office Open XML, stored ZIP entries). */
const utf8 = new TextEncoder();
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
function crc32(bytes){let crc=-1;for(const n of bytes){crc^=n;for(let i=0;i<8;i++)crc=(crc>>>1)^(0xEDB88320&-(crc&1));}return (crc^(-1))>>>0;}
const put16=(a,v)=>{a.push(v&255,(v>>8)&255);};
const put32=(a,v)=>{a.push(v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255);};
function zip(files){
  const local=[],center=[];let offset=0;
  for(const [name,text] of Object.entries(files)){
    const nam=utf8.encode(name),raw=text instanceof Uint8Array?text:utf8.encode(text),crc=crc32(raw),entry=[];
    put32(entry,0x04034b50);put16(entry,20);put16(entry,0);put16(entry,0);put16(entry,0);put16(entry,0);put32(entry,crc);put32(entry,raw.length);put32(entry,raw.length);put16(entry,nam.length);put16(entry,0);entry.push(...nam);for(const byte of raw)entry.push(byte);for(const byte of entry)local.push(byte);
    const c=[];put32(c,0x02014b50);put16(c,20);put16(c,20);put16(c,0);put16(c,0);put16(c,0);put16(c,0);put32(c,crc);put32(c,raw.length);put32(c,raw.length);put16(c,nam.length);put16(c,0);put16(c,0);put16(c,0);put16(c,0);put32(c,0);put32(c,offset);c.push(...nam);center.push(...c);
    offset+=entry.length;
  }
  const out=[...local,...center],e=[];put32(e,0x06054b50);put16(e,0);put16(e,0);put16(e,Object.keys(files).length);put16(e,Object.keys(files).length);put32(e,center.length);put32(e,local.length);put16(e,0);out.push(...e);return new Uint8Array(out);
}
export function toXLSX(transactions){
  if(!transactions?.length)throw new Error('No transactions to export.');
  const header=['Date','Description','Amount','Reference'];
  const values=[header,...transactions.map(t=>[t.date,t.description,t.amount,t.id])];
  const cells=values.map((r,ri)=>'<row r="'+(ri+1)+'">'+r.map((v,ci)=>{
    const col=String.fromCharCode(65+ci),address=col+(ri+1);
    // Numeric amount uses Excel decimal cell only after strict validation; text never becomes a formula.
    if(ri>0&&ci===2&&/^-?\d+\.\d{2}$/.test(String(v)))return '<c r="'+address+'" s="1"><v>'+v+'</v></c>';
    return '<c r="'+address+'" t="inlineStr"><is><t xml:space="preserve">'+esc(v)+'</t></is></c>';
  }).join('')+'</row>').join('');
  const files={
    '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Transactions" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml':'<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" xfId="0"/><xf numFmtId="2" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml':'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:D'+values.length+'"/><cols><col min="1" max="1" width="16" customWidth="1"/><col min="2" max="2" width="50" customWidth="1"/><col min="3" max="3" width="18" customWidth="1"/><col min="4" max="4" width="30" customWidth="1"/></cols><sheetData>'+cells+'</sheetData></worksheet>'
  };
  return zip(files);
}

/** Bundle multiple locally generated outputs. Does not upload any data. */
export function toZIP(files){
  if(!files||Object.keys(files).length===0)throw new Error('No output files to archive.');
  for(const [name,content] of Object.entries(files)){
    if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,120}$/.test(name)||name.includes('..'))throw new Error('Unsafe ZIP filename.');
    if(!(typeof content==='string'||content instanceof Uint8Array))throw new Error('Unsupported ZIP file contents.');
  }
  return zip(files);
}
