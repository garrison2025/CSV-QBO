/** Dependency-free XLSX writer (Office Open XML, stored ZIP entries). */
import {isoDate,toMinorUnits,fromMinorUnits} from './core.mjs';
const utf8 = new TextEncoder();
function esc(s){
  const text=String(s??'');
  if(text.length>32767)throw new Error('Excel text exceeds the 32,767-character cell limit.');
  // XML 1.0 disallows these controls, surrogates and noncharacters.
  if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/.test(text)||
     [...text].some(c=>{const n=c.codePointAt(0);return n>=0xD800&&n<=0xDFFF;}))
    throw new Error('Unsupported XML character in Excel cell.');
  return text.replace(/[&<>"'\r]/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;','\r':'&#13;'
  }[c]));
}
function excelDateSerial(value){
  const iso=isoDate(value);
  const [year,month,day]=iso.split('-').map(Number);
  const days=(Date.UTC(year,month-1,day)-Date.UTC(1899,11,31))/86400000;
  // Excel's default 1900 calendar includes the nonexistent 1900-02-29.
  return days+(iso>='1900-03-01'?1:0);
}
function exactExcelAmount(value){
  const cents=toMinorUnits(value),canonical=fromMinorUnits(cents);
  const numeric=Number(canonical);
  if(!Number.isFinite(numeric)||!Number.isSafeInteger(Math.round(numeric*100))||
     BigInt(Math.round(numeric*100))!==cents)
    throw new Error('Excel amount cannot be represented at the supported two-decimal precision.');
  return canonical;
}
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
export function toXLSX(transactions,{includeMemo=false}={}){
  if(!Array.isArray(transactions)||!transactions.length)throw new Error('No transactions to export.');
  if(transactions.length>1048575)throw new Error('Excel worksheet exceeds the 1,048,576-row limit.');
  if(typeof includeMemo!=='boolean')throw new Error('Invalid Excel Memo export option.');
  const header=['Date','Description','Amount','Reference',...(includeMemo?['Memo']:[])];
  const cells=['<row r="1">'+header.map((value,ci)=>{
    const address=String.fromCharCode(65+ci)+'1';
    return '<c r="'+address+'" t="inlineStr"><is><t>'+esc(value)+'</t></is></c>';
  }).join('')+'</row>'];
  for(let i=0;i<transactions.length;i++){
    const t=transactions[i],row=i+2;
    let serial,amount;
    try{serial=excelDateSerial(t.date);}
    catch{throw new Error('Excel export transaction '+(i+1)+': invalid transaction date.');}
    try{amount=exactExcelAmount(t.amount);}
    catch{throw new Error('Excel export transaction '+(i+1)+': invalid amount or unsupported cent precision.');}
    const description=String(t.description??''),reference=String(t.id??''),memo=String(t.memo??'');
    if(!description.trim())throw new Error('Excel export transaction '+(i+1)+': Description is empty.');
    const textCell=(column,value)=>{
      try{return '<c r="'+column+row+'" t="inlineStr"><is><t xml:space="preserve">'+esc(value)+'</t></is></c>';}
      catch{throw new Error('Excel export transaction '+(i+1)+': unsupported control character or invalid text in '+({B:'Description',D:'Reference',E:'Memo'}[column]||'Text')+'.');}
    };
    cells.push('<row r="'+row+'">'+
      '<c r="A'+row+'" s="2"><v>'+serial+'</v></c>'+
      textCell('B',description)+
      '<c r="C'+row+'" s="1"><v>'+amount+'</v></c>'+
      textCell('D',reference)+
      (includeMemo?textCell('E',memo):'')+
      '</row>');
  }
  const lastRow=transactions.length+1;
  const files={
    '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr date1904="0"/><sheets><sheet name="Transactions" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml':'<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" xfId="0"/><xf numFmtId="2" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml':'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:'+ (includeMemo?'E':'D')+lastRow+'"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="16" customWidth="1"/><col min="2" max="2" width="50" customWidth="1"/><col min="3" max="3" width="18" customWidth="1"/><col min="4" max="4" width="30" customWidth="1"/>'+(includeMemo?'<col min="5" max="5" width="60" customWidth="1"/>':'')+'</cols><sheetData>'+cells.join('')+'</sheetData><autoFilter ref="A1:'+(includeMemo?'E':'D')+lastRow+'"/></worksheet>'
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
