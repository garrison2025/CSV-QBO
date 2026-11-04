/**
 * Dependency-free simulated DOM integration tests for the real app module.
 * Covers event handlers, source changes, preview state and user-facing
 * financial export gating; there are no external browser/test dependencies.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

class Element {
  constructor(id=''){
    this.id=id;this.value='';this.checked=false;this.disabled=false;this.hidden=false;
    this.textContent='';this.files=[];this.children=[];this.options=[];this.dataset={};
    this.attrs={};this.listeners=new Map();
    this.classList={add(){},remove(){}};
  }
  addEventListener(type,fn){
    if(!this.listeners.has(type))this.listeners.set(type,[]);
    this.listeners.get(type).push(fn);
  }
  async fire(type,other={}){
    for(const fn of this.listeners.get(type)||[])await fn({type,target:this,preventDefault(){},dataTransfer:null,...other});
  }
  setAttribute(key,value){this.attrs[key]=value;}
  getAttribute(key){return this.attrs[key]??null;}
  replaceChildren(...items){this.children=items;this.options=[];}
  appendChild(item){this.children.push(item);return item;}
  append(item){this.children.push(item);}
  add(option){this.options.push(option);}
  remove(){}
  click(){}
}
const elements=new Map();
const get=id=>{
  if(!elements.has(id))elements.set(id,new Element(id));
  return elements.get(id);
};
globalThis.document={
  querySelector(selector){return selector.startsWith('#')?get(selector.slice(1)):null;},
  createElement(tag){return new Element(tag);},
  body:new Element('body')
};
globalThis.Option=class Option{
  constructor(text,value){this.text=text;this.value=value;}
};
const saved=new Map();
globalThis.localStorage={
  getItem(key){return saved.get(key)??null;},
  setItem(key,value){saved.set(key,String(value));}
};
get('drop-zone').dataset.source='csv';
get('drop-zone').dataset.output='qb-csv';
get('target-format').value='qb-csv';
get('date-format').value='us';
get('preview-panel').hidden=true;
get('mapping-panel').hidden=true;
get('warning-ack-label').hidden=true;
get('download-report').disabled=true;
await import('../src/app.mjs');

const fileInput=get('file-input');
const csv=[
  'Date,Description,Amount,Other Amount,Reference',
  '11/04/2026,Coffee,-12.50,25.25,ONE',
  '11/05/2026,Salary,100.00,55.25,TWO',
  ''
].join('\r\n');
const makeFile=(content,name='bank.csv')=>{
  const bytes=new TextEncoder().encode(content);
  return {name,size:bytes.length,arrayBuffer:async()=>bytes};
};
async function load(content=csv){
  await fileInput.fire('change',{target:{files:[makeFile(content)]}});
}
async function clear(){
  await get('clear-workspace').fire('click');
  get('date-format').value='us';
}
async function preview(){await get('preview-button').fire('click');}
async function setMapping(field,index){
  const el=get('map-'+field);el.value=String(index);await el.fire('change');
}

test('CSV mapping changes invalidate a successful preview, export and validation report',async()=>{
 await clear();await load();await preview();
 assert.equal(get('summary-net').textContent,'87.50');
 assert.equal(get('export-button').disabled,false);
 assert.equal(get('download-report').disabled,false);
 assert.equal(get('preview-panel').hidden,false);
 await setMapping('amount',3);
 assert.equal(get('summary-net').textContent,'0');
 assert.equal(get('export-button').disabled,true);
 assert.equal(get('download-report').disabled,true);
 assert.equal(get('preview-panel').hidden,true);
 assert.equal(get('preview-body').children.length,0);
 assert.match(get('work-status').textContent,/Preview transactions again/);
 await preview();
 assert.equal(get('summary-net').textContent,'80.50');
 assert.equal(get('export-button').disabled,false);
 assert.equal(get('download-report').disabled,false);
});
test('invalid changed mapping never allows export of the last successful CSV preview',async()=>{
 await clear();await load();await preview();
 assert.equal(get('export-button').disabled,false);
 await setMapping('amount',1); // Description and Amount now point to the same column.
 assert.equal(get('preview-panel').hidden,true);
 await preview();
 assert.equal(get('export-button').disabled,true);
 assert.equal(get('download-report').disabled,true);
 assert.equal(get('preview-panel').hidden,true);
 assert.equal(get('preview-body').children.length,0);
 assert.match(get('work-status').textContent,/assigned to both/);
});
test('changing source date order forces re-preview and updates parsed dates',async()=>{
 await clear();await load();await preview();
 const previous=get('preview-body').children[0].children[0].textContent;
 assert.equal(previous,'2026-11-04');
 get('date-format').value='eu';
 await get('date-format').fire('change');
 assert.equal(get('export-button').disabled,true);
 assert.equal(get('download-report').disabled,true);
 assert.equal(get('preview-panel').hidden,true);
 await preview();
 assert.equal(get('preview-body').children[0].children[0].textContent,'2026-04-11');
 assert.equal(get('export-button').disabled,false);
});
test('duplicate warnings need acknowledgement again after CSV remapping',async()=>{
 await clear();
 const duplicates='Date,Description,Amount,Other Amount,Reference\n'+
   '11/04/2026,Coffee,-3.00,8.00,REPEAT\n11/04/2026,Coffee,-3.00,8.00,REPEAT\n';
 await load(duplicates);await preview();
 assert.equal(get('warning-ack-label').hidden,false);
 assert.equal(get('export-button').disabled,true);
 get('warning-ack').checked=true;
 await get('warning-ack').fire('change');
 assert.equal(get('export-button').disabled,false);
 await setMapping('amount',3);
 assert.equal(get('warning-ack').checked,false);
 assert.equal(get('warning-ack-label').hidden,true);
 assert.equal(get('export-button').disabled,true);
 await preview();
 assert.equal(get('warning-ack-label').hidden,false);
 assert.equal(get('export-button').disabled,true);
});
test('clearing workspace prevents an unfinished file read from reinstating stale bank data',async()=>{
 await clear();
 const bytes=new TextEncoder().encode(csv);
 let resolveRead;
 const dataPromise=new Promise(resolve=>{resolveRead=resolve;});
 const delayed={name:'delayed.csv',size:bytes.byteLength,arrayBuffer:()=>dataPromise};
 const loadPromise=fileInput.fire('change',{target:{files:[delayed]}});
 await clear();
 resolveRead(bytes);
 await loadPromise;
 assert.equal(get('export-button').disabled,true);
 assert.equal(get('download-report').disabled,true);
 assert.equal(get('preview-panel').hidden,true);
 assert.equal(get('file-name').textContent,'');
 assert.equal(get('preview-body').children.length,0);
});


test('every input transaction remains reviewable with 25-row pagination, including final partial page',async()=>{
 await clear();
 const input=['Date,Description,Amount,Other Amount,Reference'];
 for(let i=0;i<56;i++)input.push('11/04/2026,Unique transaction '+i+','+(i+1)+'.00,0.00,REF-'+i);
 await load(input.join('\n')+'\n');await preview();
 assert.equal(get('summary-count').textContent,'56');
 assert.equal(get('preview-body').children.length,25);
 assert.equal(get('preview-navigation').hidden,false);
 assert.equal(get('preview-previous').disabled,true);
 assert.equal(get('preview-next').disabled,false);
 assert.equal(get('preview-page-status').textContent,'Page 1 of 3');
 assert.match(get('preview-caption').textContent,/downloads include all 56 transactions/);
 await get('preview-next').fire('click');
 assert.equal(get('preview-body').children.length,25);
 assert.equal(get('preview-page-status').textContent,'Page 2 of 3');
 await get('preview-next').fire('click');
 assert.equal(get('preview-body').children.length,6);
 assert.equal(get('preview-next').disabled,true);
 assert.equal(get('preview-page-status').textContent,'Page 3 of 3');
 assert.equal(get('preview-body').children[5].children[1].textContent,'Unique transaction 55');
 await get('preview-previous').fire('click');
 assert.equal(get('preview-page-status').textContent,'Page 2 of 3');
 assert.equal(get('export-button').disabled,false);
 assert.equal(get('summary-count').textContent,'56'); // Page controls never filter exports.
});
test('possible duplicates on later preview pages can be located by the review control',async()=>{
 await clear();
 const lines=['Date,Description,Amount,Other Amount,Reference'];
 for(let i=1;i<=54;i++){
   const desc=(i===27||i===51)?'Duplicate merchant':'Merchant '+i;
   const id=(i===27||i===51)?'REPEATED-ID':'ID-'+i;
   const amount=(i===27||i===51)?'-5.00':i+'.00';
   lines.push('11/04/2026,'+desc+','+amount+',0.00,'+id);
 }
 await load(lines.join('\n')+'\n');await preview();
 assert.equal(get('summary-count').textContent,'54');
 assert.equal(get('preview-review').hidden,false);
 assert.equal(get('export-button').disabled,true); // Duplicate risk still gates download.
 await get('preview-review').fire('click');
 assert.match(get('preview-page-status').textContent,/Review row 27 of 54/);
 assert.equal(get('preview-body').children[1].className,'is-review-row is-current-review-row');
 await get('preview-review').fire('click');
 assert.match(get('preview-page-status').textContent,/Review row 51 of 54/);
 assert.equal(get('preview-body').children.length,4);
 assert.equal(get('preview-body').children[0].children[1].children.length,1);
 assert.match(get('preview-body').children[0].children[1].children[0].textContent,/Possible duplicate/);
 get('warning-ack').checked=true;
 await get('warning-ack').fire('change');
 assert.equal(get('export-button').disabled,false);
 await get('clear-workspace').fire('click');
 assert.equal(get('preview-navigation').hidden,true);
 assert.equal(get('preview-page-status').textContent,'');
 assert.equal(get('preview-review').hidden,true);
 assert.equal(get('preview-body').children.length,0);
});
test('small transaction files do not show unnecessary page controls',async()=>{
 await clear();await load();await preview();
 assert.equal(get('preview-body').children.length,2);
 assert.equal(get('preview-navigation').hidden,true);
 assert.match(get('preview-caption').textContent,/Showing rows 1–2 of 2/);
});
