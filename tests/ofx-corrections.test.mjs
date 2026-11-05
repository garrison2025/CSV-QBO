import test from 'node:test';
import assert from 'node:assert/strict';
import {isoDate,parseOFX,parseInput,auditTransactions,toQuickBooksCSV,parseCSV} from '../src/core.mjs';

/**
 * Synthetic statement-shaped material, NOT an authentic bank export.
 * These tests check cash-flow integrity and safe refusal before download.
 */
function sgml({type='DEBIT',amount='-20.00',date='20261104120000[-5:EST]',other='',memo='Reference memo',rows=1}={}){
  const transaction=(i)=>'<STMTTRN><TRNTYPE>'+type+'<DTPOSTED>'+date+
    '<TRNAMT>'+amount+'<FITID>FAKE-ID-'+i+'<NAME>Synthetic merchant'+
    '<MEMO>'+memo+other+'</STMTTRN>';
  return 'OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>'+
    '<CURDEF>USD<BANKTRANLIST><DTSTART>20261101<DTEND>20261130'+
    Array.from({length:rows},(_,i)=>transaction(i+1)).join('')+
    '</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>';
}
function xml({correction='',amount='-20.00',type='DEBIT',memo='Note'}={}){
  return '<?xml version="1.0" encoding="UTF-8"?>'+
    '<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>USD</CURDEF>'+
    '<BANKTRANLIST><DTSTART>20261101</DTSTART><DTEND>20261130</DTEND>'+
    '<STMTTRN><TRNTYPE>'+type+'</TRNTYPE><DTPOSTED>20261104</DTPOSTED>'+
    '<TRNAMT>'+amount+'</TRNAMT><FITID>FAKE-ID-1</FITID>'+
    '<NAME>Synthetic merchant</NAME><MEMO>'+memo+'</MEMO>'+
    correction+'</STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>';
}
test('OFX correction metadata cannot be flattened into ordinary CSV bank transactions (SGML)',()=>{
  for(const action of ['DELETE','REPLACE']){
    const source=sgml({other:'<CORRECTFITID>PRIVATE-HISTORICAL-ID<CORRECTACTION>'+action,rows:2});
    for(const format of ['ofx','qfx','qbo']){
      assert.throws(()=>parseInput(source,format),error=>{
        assert.match(error.message,/OFX transaction 1: OFX correction action detected/);
        assert.match(error.message,/DELETE\/REPLACE cannot be safely applied/);
        assert.ok(!error.message.includes('PRIVATE-HISTORICAL-ID'),'error must never leak corrected bank reference');
        return true;
      });
    }
  }
});
test('OFX correction also blocks when one field is missing, empty or unknown',()=>{
  for(const other of [
    '<CORRECTFITID>PRIVATE-REF',
    '<CORRECTACTION>DELETE',
    '<CORRECTACTION>',
    '<CORRECTACTION>UNKNOWN',
    '<CORRECTFITID>PRIVATE-REF<CORRECTACTION>REPLACE'
  ])assert.throws(()=>parseOFX(sgml({other})),/correction action detected/);
});
test('OFX 2.x XML correction metadata rejects DELETE/REPLACE but CDATA/comment literals are safe',()=>{
  for(const action of ['DELETE','REPLACE']){
    const source=xml({correction:'<CORRECTFITID>OLD-ID</CORRECTFITID><CORRECTACTION>'+action+'</CORRECTACTION>'});
    assert.throws(()=>parseOFX(source),/correction action detected/);
  }
  const harmless=xml({memo:'<![CDATA[<CORRECTACTION>DELETE]]> reference <!-- <CORRECTFITID>not real -->'});
  const result=parseOFX(harmless);
  assert.equal(result.transactions.length,1);
  assert.match(result.transactions[0].memo,/<CORRECTACTION>DELETE reference/);
});
test('contradictory OFX DEBIT/CREDIT TRNTYPE vs signed TRNAMT adds warning, never changes cents',()=>{
  for(const sample of [
    {type:'DEBIT',amount:'20.00',shouldWarn:true},
    {type:'CREDIT',amount:'-20.00',shouldWarn:true},
    {type:'DEBIT',amount:'-20.00',shouldWarn:false},
    {type:'CREDIT',amount:'20.00',shouldWarn:false},
    {type:'INT',amount:'-20.00',shouldWarn:false}
  ]){
    const parsed=parseOFX(sgml(sample));
    assert.equal(parsed.transactions.length,1);
    assert.equal(parsed.transactions[0].amount,sample.amount==='20.00'?'20.00':'-20.00');
    assert.equal(parsed.integrity.inconsistentTypeSignCount,sample.shouldWarn?1:0);
    assert.equal(parsed.warnings.some(x=>x.includes('DEBIT/CREDIT types that disagree')),sample.shouldWarn);
    assert.equal(auditTransactions(parsed.transactions).summary.net,parsed.transactions[0].amount);
    const qb=toQuickBooksCSV(parsed.transactions);
    assert.equal(parseCSV(qb)[1][2],parsed.transactions[0].amount);
  }
});
test('OFX GMT timezone offsets enforce specification bounds and preserve source local calendar date',()=>{
  for(const suffix of ['[-5:EST]','[+5.5:IST]','[-12:UTC]','[+12.00:UTC]','[0:UTC]','[-0.5:TZ]']){
    assert.equal(isoDate('20261104235959.124'+suffix),'2026-11-04');
    assert.equal(parseOFX(sgml({date:'20261104235959.124'+suffix})).transactions[0].date,'2026-11-04');
  }
  for(const suffix of ['[-13:UTC]','[+13:UTC]','[+99:UTC]','[-12.01:UTC]','[+12.1:UTC]']){
    assert.throws(()=>isoDate('20261104235959'+suffix),/Invalid OFX GMT offset/);
    assert.throws(()=>parseOFX(sgml({date:'20261104235959'+suffix})),/OFX transaction 1: Invalid OFX GMT offset/);
  }
  assert.equal(parseOFX(sgml({date:'20261104235959[-5:EST]'})).transactions[0].date,'2026-11-04',
    'date is the bank-supplied local posting calendar date, not a guessed UTC conversion');
});
