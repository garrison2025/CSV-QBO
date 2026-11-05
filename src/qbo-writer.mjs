/**
 * Experimental, browser-local OFX 1.02 / QBO Web Connect writer.
 * Syntax-only: not certified by Intuit, QuickBooks or any bank.
 * No default borrowed FI/BID; metadata must come from an existing user-provided QBO.
 */
import {parseInput,isoDate,toMinorUnits,fromMinorUnits,MAX_FILE_BYTES} from './core.mjs';

const fail=message=>{throw Error(message);};
const safe=(value,label,max=255)=>{
  const s=String(value??'');
  if(!s.trim()||s.length>max||/[^\x20-\x7e]/.test(s))
    fail(label+' requires printable ASCII, 1–'+max+' characters. No bank text was silently changed.');
  return s;
};
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const compactDate=s=>s.replaceAll('-','');
async function hash(value){
  if(!globalThis.crypto?.subtle)fail('Secure SHA-256 is unavailable; cannot generate stable bank FITIDs.');
  const binary=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return [...new Uint8Array(binary)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

export function readReferenceQBO(input){
  const source=String(input??'');
  if(!source||new TextEncoder().encode(source).length>MAX_FILE_BYTES)fail('QBO reference missing or exceeds 8 MB.');
  if(!/^OFXHEADER:100\r?\n/.test(source)||!/\bVERSION:10[12]\b/.test(source))
    fail('Only OFX 1.x bank QBO reference files are supported in this pilot.');
  if(/<!|<\?|<\s*SCRIPT\b/i.test(source))fail('Unsupported markup in QBO reference.');
  const parsed=parseInput(source,'qbo');
  if(parsed.integrity.declaredCurrency!=='USD')fail('Reference must explicitly declare USD.');
  const block=name=>{
    const matches=[...source.matchAll(new RegExp('<'+name+'\\s*>([\\s\\S]*?)<\\/'+name+'\\s*>','gi'))];
    if(matches.length!==1)fail('Reference needs exactly one '+name+' block.');
    return matches[0][1];
  };
  const field=(scope,name,max=40)=>{
    const matches=[...scope.matchAll(new RegExp('<'+name.replace('.','\\.')+'\\s*>([^<\\r\\n]*)','gi'))];
    if(matches.length!==1)fail('Reference needs exactly one '+name+' metadata field.');
    return safe(matches[0][1].trim(),name,max);
  };
  if(/<CCACCTFROM\b/i.test(source))fail('Credit-card QBO is not supported in this pilot.');
  const account=block('BANKACCTFROM'),fi=block('FI');
  const profile={
    org:field(fi,'ORG',32),fid:field(fi,'FID',16),intuBid:field(source,'INTU.BID',16),
    bankId:field(account,'BANKID',16),accountId:field(account,'ACCTID',40),
    accountType:field(account,'ACCTTYPE',20).toUpperCase()
  };
  validateProfile(profile);
  return Object.freeze(profile);
}
function validateProfile(profile){
  if(!profile||!/^\d{1,16}$/.test(String(profile.fid??''))||
    !/^\d{1,16}$/.test(String(profile.intuBid??''))||
    !/^\d{9}$/.test(String(profile.bankId??''))||
    !/^[A-Z0-9_-]{1,40}$/i.test(String(profile.accountId??''))||
    !['CHECKING','SAVINGS','MONEYMRKT'].includes(profile.accountType))
    fail('Complete bank-specific FI, BID and account metadata must come from a supported QBO reference.');
  safe(profile.org,'Financial institution ORG',32);
}
export async function writeWebConnectQBO(transactions,profile,{serverTime}={}){
  validateProfile(profile);
  if(!Array.isArray(transactions)||!transactions.length)fail('Preview at least one CSV transaction first.');
  if(transactions.length>1000)fail('This pilot supports up to 1,000 transactions in one QBO.');
  const rows=[],identities=new Set(),fitids=new Set();
  for(const [i,tx] of transactions.entries()){
    const date=isoDate(tx.date),cents=toMinorUnits(tx.amount);
    if(cents===0n)fail('Row '+(i+1)+': zero-amount transaction is not supported.');
    const name=safe(tx.description,'Row '+(i+1)+' description');
    const memo=tx.memo?safe(tx.memo,'Row '+(i+1)+' memo'):'';
    const reference=tx.id?safe(tx.id,'Row '+(i+1)+' reference',128):'';
    const identity=JSON.stringify([date,fromMinorUnits(cents),name,memo,reference]);
    if(identities.has(identity))fail('Row '+(i+1)+': indistinguishable duplicate; supply separate source references.');
    identities.add(identity);
    const digest=await hash(JSON.stringify([profile.fid,profile.intuBid,profile.bankId,profile.accountId,identity]));
    const fitid='FFL'+digest.slice(0,28).toUpperCase();
    if(fitids.has(fitid))fail('Duplicate generated FITID. No QBO was exported.');
    fitids.add(fitid);rows.push({date,cents,name,memo,fitid});
  }
  const sorted=rows.map(r=>r.date).sort(),first=sorted[0],last=sorted.at(-1);
  const endDate=new Date(Date.UTC(+last.slice(0,4),+last.slice(5,7)-1,+last.slice(8,10)+1));
  const end=[endDate.getUTCFullYear(),String(endDate.getUTCMonth()+1).padStart(2,'0'),String(endDate.getUTCDate()).padStart(2,'0')].join('');
  const timestamp=serverTime??new Date().toISOString().replace(/[-:T.Z]/g,'').slice(0,14);
  if(!/^\d{14}$/.test(timestamp))fail('Invalid Web Connect timestamp.');
  const wire=[
    'OFXHEADER:100','DATA:OFXSGML','VERSION:102','SECURITY:NONE','ENCODING:USASCII','CHARSET:1252',
    'COMPRESSION:NONE','OLDFILEUID:NONE','NEWFILEUID:NONE','',
    '<OFX>','<SIGNONMSGSRSV1>','<SONRS>','<STATUS>','<CODE>0','<SEVERITY>INFO','</STATUS>',
    '<DTSERVER>'+timestamp,'<LANGUAGE>ENG','<FI>','<ORG>'+esc(profile.org),
    '<FID>'+profile.fid,'</FI>','<INTU.BID>'+profile.intuBid,
    '</SONRS>','</SIGNONMSGSRSV1>','<BANKMSGSRSV1>','<STMTTRNRS>','<TRNUID>1',
    '<STATUS>','<CODE>0','<SEVERITY>INFO','</STATUS>','<STMTRS>','<CURDEF>USD',
    '<BANKACCTFROM>','<BANKID>'+profile.bankId,'<ACCTID>'+profile.accountId,
    '<ACCTTYPE>'+profile.accountType,'</BANKACCTFROM>','<BANKTRANLIST>',
    '<DTSTART>'+compactDate(first),'<DTEND>'+end
  ];
  for(const r of rows){
    wire.push('<STMTTRN>','<TRNTYPE>'+(r.cents<0n?'DEBIT':'CREDIT'),
      '<DTPOSTED>'+compactDate(r.date),'<TRNAMT>'+fromMinorUnits(r.cents),
      '<FITID>'+r.fitid,'<NAME>'+esc(r.name));
    if(r.memo)wire.push('<MEMO>'+esc(r.memo));
    wire.push('</STMTTRN>');
  }
  wire.push('</BANKTRANLIST>','</STMTRS>','</STMTTRNRS>','</BANKMSGSRSV1>','</OFX>','');
  const output=wire.join('\r\n');
  const check=parseInput(output,'qbo');
  if(check.transactions.length!==rows.length)fail('QBO self-check failed: row count differs.');
  for(let i=0;i<rows.length;i++){
    const a=rows[i],b=check.transactions[i];
    if(b.date!==a.date||toMinorUnits(b.amount)!==a.cents||b.description!==a.name||
      b.memo!==a.memo||b.id!==a.fitid)fail('QBO self-check failed at row '+(i+1)+'.');
  }
  return {wire:output,report:{
    status:'syntax_valid_only',targetQuickBooksImportVerified:false,
    outputFormat:'OFX 1.02 Web Connect QBO',referenceMetadataCopiedFromUserFile:true,
    transactionCount:rows.length,netCents:rows.reduce((s,r)=>s+r.cents,0n).toString(),
    firstPostedDate:first,lastPostedDate:last,stableUniqueFitids:true,orderedRowRoundTrip:true,
    nonAsciiBankDescriptionsSupported:false,containsSourceAccountDetails:false
  }};
}
