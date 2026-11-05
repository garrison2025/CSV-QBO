import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOFX,parseInput,auditTransactions,toQuickBooksCSV,parseCSV,totals} from '../src/core.mjs';
import {batchConvert} from '../src/batch.mjs';

/**
 * Synthetic account-scoped OFX examples. They are NOT authentic bank exports.
 * Source IDs and balances here must never be logged by production errors.
 */
const trn=({id='PRIVATE-TX-12345',date='20261104',amount='-12.50',description='Books',
           memo='Invoice one',type='DEBIT'}={})=>
  '<STMTTRN><TRNTYPE>'+type+'<DTPOSTED>'+date+'<TRNAMT>'+amount+
  '<FITID>'+id+'<NAME>'+description+'<MEMO>'+memo+'</STMTTRN>';
const wrap=(records,account='<BANKACCTFROM><BANKID>111222333<ACCTID>SECRET-ACCOUNT-1')=>
  '<OFX><CURDEF>USD<STMTRS>'+account+
  '<BANKTRANLIST><DTSTART>20261101<DTEND>20261201'+records+
  '</BANKTRANLIST></STMTRS></OFX>';
const xmlTrn=({id='PRIVATE-TX-12345',date='20261104',amount='-12.50',description='Books',
           memo='Invoice one',type='DEBIT'}={})=>
  '<STMTTRN><TRNTYPE>'+type+'</TRNTYPE><DTPOSTED>'+date+'</DTPOSTED>'+
  '<TRNAMT>'+amount+'</TRNAMT><FITID>'+id+'</FITID><NAME>'+description+'</NAME>'+
  '<MEMO>'+memo+'</MEMO></STMTTRN>';
const xmlWrap=(records,account='<BANKACCTFROM><BANKID>111222333</BANKID><ACCTID>SECRET-ACCOUNT-1</ACCTID></BANKACCTFROM>')=>
  '<?xml version="1.0"?><OFX><STMTRS><CURDEF>USD</CURDEF>'+account+
  '<BANKTRANLIST><DTSTART>20261101</DTSTART><DTEND>20261201</DTEND>'+records+
  '</BANKTRANLIST></STMTRS></OFX>';

test('identical repeated FITIDs are reported without data loss, silent deletion or leaked IDs',()=>{
  const input=wrap(trn()+trn());
  for(const ext of ['ofx','qbo','qfx']){
    const parsed=parseInput(input,ext);
    assert.equal(parsed.transactions.length,2);
    assert.equal(parsed.integrity.recordCount,2);
    assert.equal(parsed.integrity.repeatedFitidCount,1);
    assert.equal(auditTransactions(parsed.transactions).duplicateIds.length,1);
    assert.match(parsed.warnings.join(' '),/repeated FITID occurrence/);
    assert.match(parsed.warnings.join(' '),/NOT automatically deleted/);
    assert.ok(!JSON.stringify({integrity:parsed.integrity,warnings:parsed.warnings}).includes('PRIVATE-TX-12345'));
    const csv=toQuickBooksCSV(parsed.transactions);
    const rows=parseCSV(csv);
    assert.equal(rows.length,3,'source rows must be preserved');
    assert.deepEqual(rows.slice(1).map(row=>row[2]),['-12.50','-12.50']);
    assert.equal(totals(parsed.transactions).net,'-25.00');
  }
});

test('a repeated FITID whose date, amount, description, memo or type differs blocks whole file',()=>{
  const cases=[
    {date:'20261105'},
    {amount:'-12.51'},
    {amount:'12.50'},
    {description:'Other seller'},
    {memo:'Invoice two'},
    {type:'CREDIT'}
  ];
  for(const change of cases){
    const source=wrap(trn()+trn(change));
    assert.throws(()=>parseOFX(source),error=>{
      assert.match(error.message,/OFX transaction 2: Conflicting repeated FITID at rows 1 and 2/);
      assert.match(error.message,/No transactions were exported/);
      assert.ok(!error.message.includes('PRIVATE-TX-12345'),'no bank reference in error');
      assert.ok(!error.message.includes('Other seller'),'no merchant name in error');
      return true;
    });
  }
});

test('FITID date/amount comparisons use exact normalized financial values, not string formatting',()=>{
  const input=wrap(trn({amount:'-12.5'})+trn({amount:'-12.50'}));
  const parsed=parseOFX(input);
  assert.equal(parsed.integrity.repeatedFitidCount,1);
  assert.equal(parsed.transactions[0].amount,'-12.50');
  assert.equal(parsed.transactions[1].amount,'-12.50');
});

test('case-sensitive distinct FITIDs are not silently merged even when transaction fingerprints match',()=>{
  const input=wrap(trn({id:'ABC-123'})+trn({id:'abc-123'}));
  const parsed=parseOFX(input);
  assert.equal(parsed.integrity.repeatedFitidCount,0);
  assert.equal(parsed.transactions.length,2);
  assert.equal(auditTransactions(parsed.transactions).duplicateIds.length,0);
  assert.equal(auditTransactions(parsed.transactions).possibleDuplicates.length,1);
});

test('FITID omitted in multiple records remains a visible uncertainty instead of fabricated identity',()=>{
  const input='<OFX><CURDEF>USD<BANKTRANLIST>'+
    '<STMTTRN><DTPOSTED>20261104<TRNAMT>-5.00<NAME>One</STMTTRN>'+
    '<STMTTRN><DTPOSTED>20261105<TRNAMT>-5.00<NAME>Two</STMTTRN>'+
    '</BANKTRANLIST></OFX>';
  const parsed=parseOFX(input);
  assert.equal(parsed.integrity.missingReferenceCount,2);
  assert.equal(parsed.integrity.repeatedFitidCount,0);
  assert.deepEqual(parsed.transactions.map(x=>x.id),['','']);
  assert.match(parsed.warnings.join(' '),/no FITID/);
});

test('OFX 2.x XML gets same account-scoped FITID handling, including CDATA and comments',()=>{
  const exact=xmlWrap(xmlTrn()+xmlTrn());
  assert.equal(parseOFX(exact).integrity.repeatedFitidCount,1);
  assert.throws(()=>parseOFX(xmlWrap(xmlTrn()+xmlTrn({date:'20261105'}))),/Conflicting repeated FITID/);
  const inert=xmlWrap(xmlTrn({description:'<![CDATA[Text <FITID>PRIVATE-ID</FITID>]]>'})+
    '<!-- <BANKACCTFROM><ACCTID>OTHER-ACCOUNT</ACCTID></BANKACCTFROM> -->');
  const parsed=parseOFX(inert);
  assert.equal(parsed.transactions.length,1);
  assert.match(parsed.transactions[0].description,/PRIVATE-ID/);
  assert.equal(parsed.integrity.repeatedFitidCount,0);
});

test('multiple account-from declarations are rejected even under one statement response',()=>{
  const extra=[
    '<BANKACCTFROM><BANKID>999999999<ACCTID>SECRET-ACCOUNT-2',
    '<CCACCTFROM><ACCTID>SECRET-CC-2',
    '<BANKACCTFROM><BANKID>111222333<ACCTID>SECRET-ACCOUNT-1'
  ];
  for(const second of extra){
    const source=wrap(trn(),'<BANKACCTFROM><ACCTID>SECRET-ACCOUNT-1'+second);
    assert.throws(()=>parseOFX(source),error=>{
      assert.match(error.message,/Multiple bank\/card account-from declarations/);
      assert.ok(!error.message.includes('SECRET-ACCOUNT-1'));
      assert.ok(!error.message.includes('SECRET-CC-2'));
      return true;
    });
  }
  assert.throws(()=>parseOFX(xmlWrap(xmlTrn(),
    '<BANKACCTFROM><ACCTID>SECRET-1</ACCTID></BANKACCTFROM>'+
    '<CCACCTFROM><ACCTID>SECRET-2</ACCTID></CCACCTFROM>')),
    /Multiple bank\/card account-from declarations/);
});

test('a single statement account and inert fake account tags must remain valid',()=>{
  const sgml=wrap(trn({description:'Bookshop<!-- <CCACCTFROM>FAKE -->'}));
  const parsed=parseOFX(sgml);
  assert.equal(parsed.transactions.length,1);
  assert.equal(parsed.transactions[0].description,'Bookshop');
  const xml=xmlWrap(xmlTrn({description:'<![CDATA[<CCACCTFROM>not an account]]>'}));
  assert.equal(parseOFX(xml).transactions.length,1);
});

test('batch rejects conflicting FITIDs atomically while cross-file same ID remains a non-merging warning',()=>{
  const conflicting=wrap(trn()+trn({amount:'-15.00'}));
  const good=wrap(trn({id:'FIRST-ACCOUNT',description:'First'}));
  assert.throws(()=>batchConvert([
    {name:'first.qbo',text:good},
    {name:'second.qfx',text:conflicting}
  ],{target:'csv'}),error=>{
    assert.match(error.message,/Batch file 2: OFX transaction 2: Conflicting repeated FITID/);
    assert.ok(!error.message.includes('PRIVATE-TX-12345'));
    return true;
  });
  const across=batchConvert([
    {name:'one.qbo',text:wrap(trn({id:'SHARED-ID',amount:'-12.50'}))},
    {name:'two.qfx',text:wrap(trn({id:'SHARED-ID',amount:'50.00',type:'CREDIT'}))}
  ],{target:'csv'});
  assert.equal(across.report.totalFiles,2);
  assert.equal(across.report.crossFileReferenceMatches,1);
  assert.equal(across.report.files[0].parserIntegrity.repeatedFitidCount,0);
  assert.equal(across.report.files[1].parserIntegrity.repeatedFitidCount,0);
  assert.equal(across.report.autoMergedAccounts,false);
  assert.equal(across.report.autoDeletedTransactions,false);
  assert.ok(!JSON.stringify(across.report).includes('SHARED-ID'));
});
