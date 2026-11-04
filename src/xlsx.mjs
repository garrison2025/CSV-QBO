/** Dependency-free XLSX writer (Office Open XML, stored ZIP entries). */
const utf8 = new TextEncoder();
function esc(s){const text=String(s??'');if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text))throw new Error('Unsupported control character in Excel cell.');return text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
// Build ZIP archives with bounded typed arrays rather than three copies of
// millions of boxed JavaScript numbers. This matters for 8-12 MB bank batches.
const CRC_TABLE=Uint32Array.from({length:256},(_,index)=>{
  let value=index;
  for(let bit=0;bit<8;bit++)value=(value>>>1)^(0xEDB88320&-(value&1));
  return value>>>0;
});
function crc32(bytes){
  let crc=0xffffffff;
  for(const byte of bytes)crc=CRC_TABLE[(crc^byte)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
function zip(files){
  const entries=[];
  let localBytes=0,centralBytes=0;
  for(const [name,content] of Object.entries(files)){
    const encodedName=utf8.encode(name);
    const raw=content instanceof Uint8Array?content:utf8.encode(content);
    if(!encodedName.length||encodedName.length>65535||raw.byteLength>0xffffffff)
      throw new Error('ZIP entry exceeds supported name or byte limits.');
    const offset=localBytes;
    localBytes+=30+encodedName.length+raw.byteLength;
    centralBytes+=46+encodedName.length;
    entries.push({name:encodedName,raw,crc:crc32(raw),offset});
  }
  if(entries.length>65535||localBytes+centralBytes+22>0xffffffff)
    throw new Error('ZIP archive exceeds supported size or entry count.');
  const output=new Uint8Array(localBytes+centralBytes+22);
  const view=new DataView(output.buffer);
  let cursor=0;
  const u16=value=>{view.setUint16(cursor,value,true);cursor+=2;};
  const u32=value=>{view.setUint32(cursor,value,true);cursor+=4;};
  const bytes=value=>{output.set(value,cursor);cursor+=value.length;};

  for(const part of entries){
    u32(0x04034b50);u16(20);u16(0);u16(0);u16(0);u16(0);
    u32(part.crc);u32(part.raw.length);u32(part.raw.length);
    u16(part.name.length);u16(0);bytes(part.name);bytes(part.raw);
  }
  if(cursor!==localBytes)throw new Error('ZIP local directory length mismatch.');
  for(const part of entries){
    u32(0x02014b50);u16(20);u16(20);u16(0);u16(0);u16(0);u16(0);
    u32(part.crc);u32(part.raw.length);u32(part.raw.length);
    u16(part.name.length);u16(0);u16(0);u16(0);u16(0);
    u32(0);u32(part.offset);bytes(part.name);
  }
  if(cursor!==localBytes+centralBytes)throw new Error('ZIP central directory length mismatch.');
  u32(0x06054b50);u16(0);u16(0);u16(entries.length);u16(entries.length);
  u32(centralBytes);u32(localBytes);u16(0);
  if(cursor!==output.byteLength)throw new Error('ZIP end-of-directory length mismatch.');
  return output;
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
