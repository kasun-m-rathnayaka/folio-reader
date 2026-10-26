import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../../src/Folio.UI/wwwroot/js/folio-shell.js', import.meta.url), 'utf8');
function harness() {
  const events = {}, sent = [];
  const context = { window: { addEventListener(){}, chrome:{webview:{postMessageWithAdditionalObjects:(...args)=>sent.push(args)}} }, document:{addEventListener:(type,fn)=>events[type]=fn, body:{classList:{add(){},remove(){}}}} };
  vm.runInNewContext(source, context);
  return {events,sent};
}
test('folder drops preserve typed filesystem handles and prevent browser navigation', async()=>{
  const {events,sent}=harness(); const folder={kind:'directory',name:'Books'}; let prevented=false;
  await events.drop({preventDefault(){prevented=true;},dataTransfer:{types:['Files'],items:[{getAsFileSystemHandle:async()=>folder}],files:[]}});
  assert.equal(prevented,true); assert.equal(sent[0][0].kind,'import-drop'); assert.equal(sent[0][1][0],folder);
});
test('file drops fall back to typed File objects when handles are unavailable', async()=>{
  const {events,sent}=harness(); const file={name:'book.pdf'};
  await events.drop({preventDefault(){},dataTransfer:{types:['Files'],items:[{}],files:[file]}});
  assert.equal(sent[0][1][0],file);
});
test('text dragging is ignored',async()=>{
  const {events,sent}=harness();
  await events.drop({preventDefault(){throw Error('Should not intercept text');},dataTransfer:{types:['text/plain']}});
  assert.equal(sent.length,0);
});
