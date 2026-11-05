/**
 * Cross-checks against issuer-published DOCUMENTATION examples.
 *
 * These fixtures are newly assembled from public format descriptions. They
 * are not original files exported by a customer's account, and do not prove
 * issuer compatibility or QuickBooks's acceptance of the uploaded CSV.
 *
 * Intuit: https://quickbooks.intuit.com/learn-support/en-us/help-article/bank-transactions/format-csv-files-excel-bank-transactions-quickbooks/L4BjLWckq_US_en_US
 * Citi:   https://www.citibank.com/tts/docs/cbs36222-TTS-Comprehensive-Account-Statement-Report-A4-v3.pdf
 * Co-op:  https://www.test.developer.co-operativebank.co.uk/pdfs/bank/business/online-banking/Business-Online-Banking-User-Guide.pdf
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
 parseInput,parseCSV,csvTransactions,quickBooksCSVExportPlan,
 validateQuickBooksCSVParts,totals
} from '../src/core.mjs';

test('Intuit published US three-column example source passes byte-exact local preflight only',()=>{
 const csv='Date,Description,Amount\n'+
  '1/1/2018,Example of a payment,-100.00\n'+
  '1/1/2018,Example of a deposit,200.00\n';
 const rows=parseInput(csv,'csv');
 assert.equal(rows.transactions.length,2);
 assert.equal(totals(rows.transactions).net,'100.00');
 const {parts,report}=quickBooksCSVExportPlan(rows.transactions);
 assert.equal(parts.length,1);
 assert.equal(report.sourceRows,2);
 assert.equal(validateQuickBooksCSVParts(rows.transactions,parts).sourceAmountsReconciled,true);
 assert.match(parts[0],/Date,Description,Amount/);
 assert.match(parts[0],/01\/01\/2018,Example of a payment,-100.00/);
 assert.match(parts[0],/01\/01\/2018,Example of a deposit,200.00/);
 assert.equal(rows.currencyReview.allRecognizedCurrencyCellsUSD,false,
  'published example does not declare a bank account currency');
});

test('Citi-published comprehensive report heading and GBP account currency must never export as USD',()=>{
 // The guide shows a wide CSV/Excel statement with account currency GBP,
 // Value Date, Bank Reference and Transaction Description. The Amount field
 // is added from that guide's documented transaction amount elements.
 // This is a RECONSTRUCTED documentation layout, not a downloaded bank CSV.
 const source='Report Name,Customer Name,Branch Name,Account Number,Account Name,Account Currency,'+
  'Statement Date,Value Date,Customer Reference,Bank Reference,Transaction Description,Transaction Amount\n'+
  'Account Statement,Sample Customer,Sample Branch,EXAMPLE,Account,GBP,'+
  '01/22/2022,01/22/2022,SAMPLE-REF,SAMPLE-BANK-REF,Demo transfer,21020.67\n';
 const rows=parseCSV(source);
 assert.equal(rows[0].length,12);
 assert.throws(()=>csvTransactions(rows,{
  date:7,description:10,amount:11,debit:-1,credit:-1,id:9,memo:-1
 }),e=>{
  assert.match(e.message,/Non-USD or unsupported code/);
  assert.match(e.message,/CSV row 2/);
  assert.ok(!e.message.includes('GBP'));
  assert.ok(!e.message.includes('SAMPLE-REF'));
  return true;
 });
});

test('Co-operative Bank documented CSV preamble/header/footer shapes fail closed, not silently skipped',()=>{
 // The bank's publicly published CSV user guide instructs customers to
 // remove the first blank column, two report header lines and a final footer
 // before passing the export to third-party systems. The site does not assume
 // any such undocumented deletion from real bank exports.
 const untouchedStyle='Account summary;Business banking\n'+
  'Report period;Demo only\n'+
  'Transaction date;Account number;Bank reference;Amount;Additional information\n'+
  '04/11/2026;PRIVATE-ACCOUNT;REF-1;-11.25;Merchant\n'+
  'End of report;1 transaction\n';
 assert.throws(()=>parseInput(untouchedStyle,'csv'),/expected 2 columns, found 5/);
 const cleanedStyle='Transaction date;Account number;Bank reference;Amount;Additional information\n'+
  '04/11/2026;PRIVATE-ACCOUNT;REF-1;-11.25;Merchant\n';
 assert.throws(()=>parseInput(cleanedStyle,'csv'),
  /Choose Date and Description columns/,
  'unknown issuer mapping must not silently assume Additional information is description');
 const explicit=parseInput(cleanedStyle,'csv',{mapping:{
  date:0,description:4,amount:3,debit:-1,credit:-1,id:2,memo:-1
 }});
 assert.equal(explicit.transactions.length,1);
 assert.equal(explicit.transactions[0].amount,'-11.25');
 assert.equal(explicit.transactions[0].description,'Merchant');
 assert.equal(explicit.currencyReview.allRecognizedCurrencyCellsUSD,false);
 assert.deepEqual(explicit.transactions.map(t=>t.id),['REF-1']);
});
