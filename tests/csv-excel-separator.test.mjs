import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCSV,parseInput,csvTransactions,toQuickBooksCSV,genericCSVExportPlan} from '../src/core.mjs';

const semi='sep=;\r\nDate;Description;Amount;Reference\r\n'+
 '11/04/2026;"Café, Books";-12.50;000123\r\n'+
 '11/05/2026;"Paycheck";125.25;000124\r\n';

test('Excel sep=; first-line directive is not a bank transaction; exact rows, money, reference and source line preserved',()=>{
 const rows=parseCSV(semi);
 assert.equal(rows.length,3);
 assert.deepEqual(rows[0],['Date','Description','Amount','Reference']);
 assert.equal(rows[0].sourceLine,2);
 assert.equal(rows[1].sourceLine,3);
 assert.equal(rows[2].sourceLine,4);
 assert.deepEqual(rows[0].sourceDialect,{delimiter:';',excelSepDirective:true,manualDelimiterSelected:false});
 assert.equal(JSON.stringify(rows).includes('sourceDialect'),false);
 const data=parseInput(semi,'csv');
 assert.equal(data.transactions.length,2);
 assert.equal(data.transactions[0].description,'Café, Books');
 assert.deepEqual(data.transactions.map(t=>t.amount),['-12.50','125.25']);
 assert.deepEqual(data.transactions.map(t=>t.id),['000123','000124']);
 assert.equal(data.sourceDialect.excelSepDirective,true);
 assert.equal(data.warnings.filter(w=>w.includes('sep= delimiter instruction')).length,1);
 assert.match(toQuickBooksCSV(data.transactions),/Café, Books/);
 const out=genericCSVExportPlan(data.transactions);
 assert.equal(out.report.rowCount,2);
 assert.equal(out.report.signedAmountsReconciled,true);
});
test('Excel sep=, declaration and tab declaration work without guessing or skipped transactions',()=>{
 const cases=[
  ['sep=,\nDate,Description,Amount\n11/04/2026,Cafe,-3.14\n',','],
  ['sep=\t\nDate\tDescription\tAmount\n11/04/2026\tCafé\t-3.14\n','\t'],
  ['SEP=;\rDate;Description;Amount\r11/04/2026;Café;-3.14\r',';']
 ];
 for(const [source,delimiter] of cases){
  const rows=parseCSV(source);
  assert.equal(rows[0].sourceLine,2);
  assert.equal(rows[1].sourceLine,3);
  assert.equal(rows[0].sourceDialect.delimiter,delimiter);
  assert.equal(rows[0].sourceDialect.excelSepDirective,true);
  assert.equal(parseInput(source,'csv').transactions[0].amount,'-3.14');
 }
});
test('a conflicting selected delimiter must fail closed without changing the declared CSV format',()=>{
 for(const manual of [',','\t']){
  assert.throws(()=>parseCSV(semi,manual),/sep= delimiter declaration conflicts/);
 }
 assert.throws(()=>parseInput(semi,'csv',{delimiter:'comma'}),/sep= delimiter declaration conflicts/);
 assert.throws(()=>parseInput(semi,'csv',{delimiter:'tab'}),/sep= delimiter declaration conflicts/);
 const correct=parseInput(semi,'csv',{delimiter:'semicolon'});
 assert.equal(correct.transactions[0].amount,'-12.50');
 assert.equal(correct.sourceDialect.manualDelimiterSelected,true);
 assert.ok(correct.warnings.some(w=>w.includes('explicitly selected as semicolon')));
 assert.equal(correct.transactions.length,2);
});
test('ambiguous separators must prompt manual choice, never silently select one based on a tie',()=>{
 const input='Date;Description,with,commas;Amount\n'+
  '11/04/2026;"Café";-12.50\n';
 assert.throws(()=>parseCSV(input),/ambiguous separators/);
 assert.throws(()=>parseInput(input,'csv'),/ambiguous separators/);
 const rows=parseCSV(input,';',{manualDelimiter:true});
 assert.deepEqual(rows[0],['Date','Description,with,commas','Amount']);
 assert.deepEqual(rows[1],['11/04/2026','Café','-12.50']);
 const selected=parseInput(input,'csv',{delimiter:'semicolon',mapping:{description:1}});
 assert.equal(selected.transactions.length,1);
 assert.equal(selected.transactions[0].amount,'-12.50');
 assert.equal(selected.transactions[0].description,'Café');
 assert.equal(selected.sourceDialect.manualDelimiterSelected,true);
 assert.match(selected.warnings.join(' '),/explicitly selected as semicolon/);
});
test('no general preamble-skipping: arbitrary bank metadata or a second sep= line fails safely',()=>{
 const fakePreamble='Account: PRIVATE-ID\nDate;Description;Amount\n11/04/2026;Café;-12.50\n';
 assert.throws(()=>parseCSV(fakePreamble),/header contains no supported separator/);
 const bogus='sep=|\nDate;Description;Amount\n11/04/2026;Café;-12.50\n';
 assert.throws(()=>parseCSV(bogus),/header contains no supported separator/);
 const double='sep=;\nsep=;\nDate;Description;Amount\n11/04/2026;Café;-12.50\n';
 assert.throws(()=>parseCSV(double),/expected 2 columns, found 3/);
});
test('a quoted literal sep= token is normal text and must not become a CSV declaration',()=>{
 const source='Date,Description,Amount\n11/04/2026,"sep=; is a memo",-10.03\n';
 const rows=parseCSV(source);
 assert.equal(rows[0].sourceDialect.excelSepDirective,false);
 assert.equal(parseInput(source,'csv').transactions[0].description,'sep=; is a memo');
});
test('a sep= source line does not hide malformed financial rows, quoted multiline errors or missing money',()=>{
 const bad='sep=;\r\nDate;Description;Amount\r\n'+
  '11/04/2026;"Two\r\nlines";-3.25\r\n'+
  '11/05/2026;Missing\r\n';
 assert.throws(()=>parseCSV(bad),/CSV line 5: expected 3 columns, found 2/);
 const badAmount='sep=;\nDate;Description;Amount\n11/04/2026;Merchant;CONFIDENTIAL-BAD-MONEY\n';
 const rows=parseCSV(badAmount);
 assert.equal(rows[1].sourceLine,3);
 assert.throws(()=>csvTransactions(rows),e=>{
  assert.match(e.message,/CSV row 2: Invalid amount format/);
  assert.match(e.message,/Source file line 3/);
  assert.ok(!e.message.includes('CONFIDENTIAL-BAD-MONEY'));
  return true;
 });
});
test('source validation reports contain only separator enum/booleans, no bank financial records',()=>{
 const result=parseInput(semi,'csv');
 const report=JSON.stringify({sourceDialect:result.sourceDialect,warnings:result.warnings});
 assert.match(report,/excelSepDirective/);
 for(const privateItem of ['Café, Books','000123','-12.50','125.25'])
  assert.ok(!report.includes(privateItem));
 assert.equal(result.sourceDialect.manualDelimiterSelected,false);
});
test('manual delimiter options are validated before any transaction parsing',()=>{
 assert.throws(()=>parseInput(semi,'csv',{delimiter:'pipe'}),/Unsupported CSV delimiter choice/);
 assert.throws(()=>parseInput(semi,'csv',{delimiter:'|'}),/Unsupported CSV delimiter choice/);
 assert.equal(parseInput('Date;Description;Amount\n11/04/2026;Store;-1.00\n','csv',
  {delimiter:'semicolon'}).transactions[0].amount,'-1.00');
 const tsv='Date\tDescription\tAmount\n11/04/2026\tSample\t-4.50\n';
 assert.equal(parseInput(tsv,'tsv').transactions[0].amount,'-4.50');
 assert.equal(parseInput(tsv,'tsv',{delimiter:'tab'}).sourceDialect.manualDelimiterSelected,true);
});
