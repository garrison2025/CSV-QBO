import test from 'node:test';
import assert from 'node:assert/strict';
import {parseInput,parseCSV,csvTransactions,toQuickBooksCSV,genericCSVExportPlan,totals} from '../src/core.mjs';

// Synthetic bytes and files only. These are NOT authenticated bank exports.
test('recognized USD currency column is validated on every source row without remapping money',()=>{
 const csv='Date,Description,Amount,Currency,Reference\n'+
  '2026-11-04,Private café,-12.50,USD,000123\n'+
  '2026-11-05,Private refund,20.75, usd ,000124\n';
 const result=parseInput(csv,'csv');
 assert.deepEqual(result.currencyReview,{
  recognizedCurrencyColumnCount:1,checkedTransactionRows:2,
  allRecognizedCurrencyCellsUSD:true,currencyConversionPerformed:false
 });
 assert.deepEqual(result.transactions.map(r=>r.amount),['-12.50','20.75']);
 assert.deepEqual(result.transactions.map(r=>r.id),['000123','000124']);
 assert.equal(totals(result.transactions).net,'8.25');
 assert.match(result.warnings.join(' '),/explicitly declare USD/);
 assert.match(result.warnings.join(' '),/NOT independently verified/);
 assert.match(toQuickBooksCSV(result.transactions),/Private café,-12.50/);
 const output=genericCSVExportPlan(result.transactions);
 assert.equal(output.report.orderedRowsReconciled,true);
 assert.equal(output.report.signedAmountsReconciled,true);
 for(const secret of ['Private café','Private refund','000123','000124'])
  assert.ok(!JSON.stringify(result.currencyReview).includes(secret));
});

test('a non-USD source currency must block the WHOLE file, not partially export the earlier USD rows',()=>{
 const source='Date,Description,Amount,Currency\n'+
  '2026-11-04,USD account transaction,-12.50,USD\n'+
  '2026-11-05,Private customer,75.00,EUR\n';
 assert.throws(()=>parseInput(source,'csv'),err=>{
  assert.match(err.message,/CSV row 3:/);
  assert.match(err.message,/Source file line 3/);
  assert.match(err.message,/Non-USD or unsupported code/);
  assert.match(err.message,/no currency conversion/);
  assert.ok(!err.message.includes('EUR'));
  assert.ok(!err.message.includes('Private customer'));
  assert.ok(!err.message.includes('75.00'));
  return true;
 });
});

test('blank, malformed or surprising currency declarations fail closed, without echoing source details',()=>{
 for(const currency of ['', ' ', 'EUR', 'GBP', 'JPY','US$', '$','US DOLLAR','USD;EUR','PRIVATE-SECRET']){
  const source='Date,Description,Amount,Currency\n2026-11-04,Confidential,-4.00,"'+currency+'"\n';
  assert.throws(()=>parseInput(source,'csv'),e=>{
   assert.match(e.message,/CSV row 2: .*Currency column|CSV row 2: Non-USD/);
   assert.ok(!e.message.includes('PRIVATE-SECRET'));
   assert.ok(!e.message.includes('Confidential'));
   return true;
  },'should not accept '+JSON.stringify(currency));
 }
});

test('all recognized account, settlement, transaction and original currency cells are checked, even when unmapped',()=>{
 const csv='Date,Description,Amount,Account_Currency,Settlement Currency,Original Currency\n'+
  '2026-11-04,FX merchant,-10.00,USD,USD,EUR\n';
 assert.throws(()=>csvTransactions(parseCSV(csv)),/Non-USD or unsupported code/);
 const allUSD=csv.replace(',USD,USD,EUR',',USD,USD,USD');
 const result=csvTransactions(parseCSV(allUSD));
 assert.equal(result.currencyReview.recognizedCurrencyColumnCount,3);
 assert.equal(result.currencyReview.checkedTransactionRows,1);
 assert.equal(result.transactions[0].amount,'-10.00');
 assert.ok(!JSON.stringify(result.currencyReview).includes('FX merchant'));
});

test('CSV with no recognized currency column is NOT labeled as verified USD',()=>{
 const parsed=parseInput('Date,Description,Amount\n2026-11-04,Unknown currency,-12.50\n','csv');
 assert.deepEqual(parsed.currencyReview,{
  recognizedCurrencyColumnCount:0,checkedTransactionRows:0,
  allRecognizedCurrencyCellsUSD:false,currencyConversionPerformed:false
 });
 assert.equal(parsed.transactions.length,1);
 assert.match(parsed.warnings.join(' '),/no recognized Currency column/);
 assert.match(parsed.warnings.join(' '),/already USD before downloading/);
 assert.equal(parsed.transactions[0].amount,'-12.50');
});

test('currency validation runs after Excel sep=; and preserves the physical file-line number',()=>{
 const source='sep=;\r\nDate;Description;Amount;Transaction Currency\r\n'+
  '2026-11-04;"Two\r\nline payee";-1.05;USD\r\n'+
  '2026-11-05;"Private payee";20.45;JPY\r\n';
 assert.throws(()=>parseInput(source,'csv'),e=>{
  assert.match(e.message,/CSV row 3:/);
  assert.match(e.message,/Source file line 5/);
  assert.match(e.message,/Non-USD or unsupported code/);
  assert.ok(!e.message.includes('JPY'));
  assert.ok(!e.message.includes('Private payee'));
  return true;
 });
});

test('CSV distinct debit/credit fields cannot bypass recognized currency validation',()=>{
 const source='Date,Description,Debit,Credit,Ccy\n'+
  '2026-11-04,Expense,4.00,,EUR\n';
 assert.throws(()=>parseInput(source,'csv'),/Non-USD or unsupported code/);
 const valid=source.replace('EUR','USD');
 const parsed=parseInput(valid,'csv');
 assert.equal(parsed.transactions[0].amount,'-4.00');
 assert.equal(parsed.currencyReview.recognizedCurrencyColumnCount,1);
 assert.equal(parsed.currencyReview.currencyConversionPerformed,false);
});

test('currency labels that are NOT recognized must not be falsely claimed as checked',()=>{
 const parsed=parseInput('Date,Description,Amount,My Special Code\n'+
 '2026-11-04,Unverified,-2.00,EUR\n','csv');
 assert.equal(parsed.currencyReview.recognizedCurrencyColumnCount,0);
 assert.equal(parsed.currencyReview.allRecognizedCurrencyCellsUSD,false);
 assert.match(parsed.warnings.join(' '),/no recognized Currency column/);
});
