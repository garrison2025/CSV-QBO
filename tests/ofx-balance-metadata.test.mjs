import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOFX,parseInput,auditTransactions,totals,toQuickBooksCSV} from '../src/core.mjs';
import {batchConvert} from '../src/batch.mjs';

const fakeTx='<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261104<TRNAMT>-12.50'+
  '<FITID>PRIVATE-TX-00017<NAME>Private merchant</STMTTRN>';
const sgml=(suffix='',tx=fakeTx)=>'OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\n'+
  '<OFX><STMTRS><CURDEF>USD<BANKTRANLIST><DTSTART>20261101<DTEND>20261201'+
  tx+'</BANKTRANLIST>'+suffix+'</STMTRS></OFX>';
const ledger='<LEDGERBAL><BALAMT>1234.56<DTASOF>20261105010101[-5:EST]</LEDGERBAL>';
const available='<AVAILBAL><BALAMT>1000.50<DTASOF>20261105010101[-5:EST]</AVAILBAL>';
const xmlTx='<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261104</DTPOSTED>'+
  '<TRNAMT>-12.50</TRNAMT><FITID>PRIVATE-TX-00017</FITID>'+
  '<NAME>Private merchant</NAME></STMTTRN>';
const xmlLedger='<LEDGERBAL><BALAMT>1234.56</BALAMT><DTASOF>20261105010101[-5:EST]</DTASOF></LEDGERBAL>';
const xmlAvailable='<AVAILBAL><BALAMT>1000.50</BALAMT><DTASOF>20261105010101[-5:EST]</DTASOF></AVAILBAL>';
const xml=(suffix='',tx=xmlTx)=>'<?xml version="1.0"?><OFX><STMTRS><CURDEF>USD</CURDEF>'+
  '<BANKTRANLIST><DTSTART>20261101</DTSTART><DTEND>20261201</DTEND>'+tx+
  '</BANKTRANLIST>'+suffix+'</STMTRS></OFX>';
const review={ledgerBalancePresent:true,availableBalancePresent:true,
  ledgerAsOfDate:'2026-11-05',availableAsOfDate:'2026-11-05',
  independentReconciliationPerformed:false};

test('OFX 1.x ledger/available balance metadata checked without leaking amounts or faking reconciliation',()=>{
  const source=sgml(ledger+available);
  for(const ext of ['ofx','qfx','qbo']){
    const parsed=parseInput(source,ext);
    assert.deepEqual(parsed.integrity.balanceReview,review);
    assert.equal(parsed.transactions.length,1);
    assert.equal(parsed.transactions[0].amount,'-12.50');
    assert.equal(totals(parsed.transactions).net,'-12.50');
    assert.equal(auditTransactions(parsed.transactions).summary.count,1);
    assert.match(parsed.warnings.join(' '),/NOT independently reconciled/);
    assert.match(parsed.warnings.join(' '),/no verified opening balance/);
    assert.ok(!JSON.stringify({integrity:parsed.integrity,warnings:parsed.warnings}).includes('1234.56'));
    assert.ok(!JSON.stringify({integrity:parsed.integrity,warnings:parsed.warnings}).includes('1000.50'));
    assert.ok(!JSON.stringify({integrity:parsed.integrity,warnings:parsed.warnings}).includes('PRIVATE-TX-00017'));
    assert.match(toQuickBooksCSV(parsed.transactions),/Private merchant,-12\.50/);
  }
});
test('OFX 2.x XML balance groups work with strict leaf elements',()=>{
  const parsed=parseOFX(xml(xmlLedger+xmlAvailable));
  assert.deepEqual(parsed.integrity.balanceReview,review);
  assert.equal(parsed.transactions[0].date,'2026-11-04');
  assert.equal(parsed.transactions[0].amount,'-12.50');
});
test('absence or partial presence of source balance blocks is explicitly distinguished',()=>{
  const absent=parseOFX(sgml());
  assert.deepEqual(absent.integrity.balanceReview,{
    ledgerBalancePresent:false,availableBalancePresent:false,
    ledgerAsOfDate:null,availableAsOfDate:null,
    independentReconciliationPerformed:false
  });
  assert.ok(!absent.warnings.some(x=>x.includes('bank-reported balance metadata')));
  const ledgerOnly=parseOFX(sgml(ledger)).integrity.balanceReview;
  assert.equal(ledgerOnly.ledgerBalancePresent,true);
  assert.equal(ledgerOnly.availableBalancePresent,false);
  assert.equal(ledgerOnly.independentReconciliationPerformed,false);
  const availOnly=parseOFX(xml(xmlAvailable)).integrity.balanceReview;
  assert.equal(availOnly.ledgerBalancePresent,false);
  assert.equal(availOnly.availableBalancePresent,true);
});
test('duplicate balance groups, reversed boundaries or truncated balances reject whole source',()=>{
  for(const balance of [
    ledger+ledger,available+available,ledger+available+ledger,
    '<LEDGERBAL><BALAMT>123.45<DTASOF>20261105',
    '</LEDGERBAL>'+ledger,
    '<LEDGERBAL><BALAMT>10<DTASOF>20261105<AVAILBAL><BALAMT>12<DTASOF>20261105</AVAILBAL></LEDGERBAL>'
  ]){
    assert.throws(()=>parseOFX(sgml(balance)),error=>{
      assert.match(error.message,/balance groups|balance group/);
      assert.ok(!error.message.includes('1234.56'));
      assert.ok(!error.message.includes('PRIVATE-TX-00017'));
      return true;
    });
  }
});
test('invalid amount, missing fields or malformed date never pass OFX balance metadata preflight',()=>{
  for(const balance of [
    '<LEDGERBAL><BALAMT>secret123<DTASOF>20261105</LEDGERBAL>',
    '<LEDGERBAL><BALAMT>10.999<DTASOF>20261105</LEDGERBAL>',
    '<LEDGERBAL><BALAMT>10.00<DTASOF>20260230</LEDGERBAL>',
    '<LEDGERBAL><BALAMT>10.00</LEDGERBAL>',
    '<AVAILBAL><DTASOF>20261105</AVAILBAL>',
    '<LEDGERBAL><BALAMT>10.00<DTASOF>20261105<DTASOF>20261106</LEDGERBAL>',
    '<LEDGERBAL><BALAMT>10.00<BALAMT>11.00<DTASOF>20261105</LEDGERBAL>',
    '<LEDGERBAL><BALAMT>(-10.00)<DTASOF>20261105</LEDGERBAL>'
  ]){
    assert.throws(()=>parseOFX(sgml(balance)),error=>{
      assert.match(error.message,/Invalid OFX (?:LEDGERBAL|AVAILBAL) balance amount/);
      assert.ok(!error.message.includes('secret123'),'balance raw data must never appear in error');
      return true;
    });
  }
});
test('negative bank-provided ledger balance is VALID but is not inferred as missing or reconciled',()=>{
  const negative='<LEDGERBAL><BALAMT>-100.25<DTASOF>20261105</LEDGERBAL>';
  const parsed=parseOFX(sgml(negative));
  assert.equal(parsed.integrity.balanceReview.ledgerBalancePresent,true);
  assert.equal(parsed.integrity.balanceReview.independentReconciliationPerformed,false);
  assert.equal(parsed.transactions[0].amount,'-12.50');
  assert.ok(!JSON.stringify(parsed.integrity).includes('-100.25'));
});
test('inert markup in XML CDATA/comments does not create or remove balance groups',()=>{
  const inert=xml('<!-- '+xmlLedger+' -->',
    xmlTx.replace('<NAME>Private merchant</NAME>',
      '<NAME><![CDATA[Shop '+xmlAvailable+']]></NAME>'));
  const parsed=parseOFX(inert);
  assert.equal(parsed.integrity.balanceReview.ledgerBalancePresent,false);
  assert.equal(parsed.integrity.balanceReview.availableBalancePresent,false);
  assert.match(parsed.transactions[0].description,/AVAILBAL/);
  const real=xml(xmlLedger+'<!-- '+xmlLedger+' -->'+xmlAvailable);
  assert.deepEqual(parseOFX(real).integrity.balanceReview,review);
});
test('batch report contains only presence and as-of dates, never raw bank balances or identifiers',()=>{
  const first=sgml(ledger+available);
  const second=sgml('<LEDGERBAL><BALAMT>-9999.99<DTASOF>20261106</LEDGERBAL>',
    fakeTx.replace('PRIVATE-TX-00017','PRIVATE-TX-00018'));
  const result=batchConvert([{name:'account-one.qbo',text:first},{name:'account-two.qfx',text:second}],
    {target:'csv'});
  assert.equal(result.report.totalFiles,2);
  assert.equal(result.report.files[0].parserIntegrity.balanceReview.ledgerBalancePresent,true);
  assert.equal(result.report.files[1].parserIntegrity.balanceReview.availableBalancePresent,false);
  const summary=JSON.stringify(result.report);
  for(const secret of ['1234.56','1000.50','-9999.99','PRIVATE-TX-00017','PRIVATE-TX-00018','account-one.qbo'])
    assert.ok(!summary.includes(secret),'private data absent in report');
  assert.match(result.report.files[0].warnings.join(' '),/NOT independently reconciled/);
  assert.equal(result.report.autoMergedAccounts,false);
  assert.equal(result.report.autoDeletedTransactions,false);
});
