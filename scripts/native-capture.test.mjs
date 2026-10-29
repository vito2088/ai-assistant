import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';

const compile = async file => ts.transpileModule(await readFile(new URL(file, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const code = await compile('../src/tools.ts');
function fixture(handler) {
  const calls = [], notices = [];
  const api = {
    t: key => key, h: key => key, getLocale: () => 'zh-CN',
    invoke: async (command, args) => { calls.push({command,args}); return handler?.(command,args) ?? (command === 'list_capture_drafts' ? [] : undefined); },
    captureKinds: ['screenshot', 'recording'], captureIcon: () => '',
    NativeCaptureBridge: class { constructor(hooks) { this.hooks = hooks; } },
    TimeTools: class {}, CaptureShortcuts: class { values = {}; errors = {}; busy = false; },
  };
  const exports = {};
  vm.runInNewContext(code, {exports, require: () => api, window: {setTimeout}, document: {}, DOMException, URL, clearInterval});
  const tools = new exports.Tools(() => {}, text => notices.push(text));
  tools.native = true; tools.shortcutsReady = true; tools.displayId = 1;
  return {tools,calls,notices};
}

test('Windows UI starts Rust capture with no PNG source, WebView editor or JS window hiding', async () => {
  const f = fixture(); await f.tools.runShortcut('screenshot');
  assert.deepEqual(f.calls.map(c => c.command), ['configure_native_capture','start_native_capture']);
  assert.equal(f.calls[1].args.kind,'screenshot');
  assert.equal(f.tools.busy,true);
  await f.tools.runShortcut('screenshot');
  assert.equal(f.calls.length,2);
  await f.tools.nativeFinished({id:'a',kind:'screenshot',result:{action:'copied'}});
  assert.equal(f.tools.busy,false);
  assert.deepEqual(f.notices,['图片已复制']);
});
test('failed native launch releases UI and reports failure', async () => {
  const f=fixture(command=>{if(command==='start_native_capture')throw new Error('GPU unavailable');});
  await f.tools.runShortcut('screenshot');
  assert.equal(f.tools.busy,false); assert.match(f.tools.error,/GPU unavailable/);
});
test('late completion cannot clear a newer capture and recording stop waits for encoder flush', async () => {
  const f=fixture(command=>command==='screen_recording_status'?{active:false,path:'test.mp4',error:null}:undefined);
  f.tools.nativeSessionId='new'; f.tools.busy=true;
  await f.tools.nativeFinished({id:'old',kind:'screenshot',result:{action:'cancelled'}});
  assert.equal(f.tools.busy,true);
  f.tools.busy=false; f.tools.status.active=true;
  let stopped=false;
  const task=f.tools.stopRecording().then(()=>{stopped=true;});
  await new Promise(resolve=>setImmediate(resolve)); assert.equal(stopped,false);
  await f.tools.nativeFinished({id:'new',kind:'recording',result:{action:'recorded',path:'test.mp4'}});
  await task; assert.equal(stopped,true); assert.equal(f.tools.recording,false);
});
test('Windows shortcut registrations are delegated directly to Rust', async () => {
  const f=fixture();
  await f.tools.shortcuts; // Backend is separately verified by capture-shortcuts tests.
  const source=await readFile(new URL('../src/tools.ts',import.meta.url),'utf8');
  assert.match(source,/this.native \? invoke\('register_native_capture_shortcut'/);
  assert.doesNotMatch(source,/native_screenshot_prototype|tool-capture-engine|warm_capture_overlay/);
});

const bridgeCode=await compile('../src/native-capture-bridge.ts');
test('OCR bridge rehydrates pending requests and discards stale translations after a new request', async()=>{
  const listeners=new Map(), replies=[]; let resolveTranslation;
  const api={
    listen:async(name,callback)=>listeners.set(name,callback),
    invoke:async(command,args)=>{
      if(command==='native_capture_pending_ocr')return {id:'a',revision:1,text:'first',path:'',translate:true};
      if(command==='native_capture_ocr_result')replies.push(args.result);
    },
    translateCaptureText:async text=>text==='first'?new Promise(resolve=>{resolveTranslation=resolve;}):'translated',
  };
  const exports={};vm.runInNewContext(bridgeCode,{exports,require:()=>api,AbortController,Blob});
  const b=new exports.NativeCaptureBridge({started(){},finished(){},error(){},shortcut(){}});
  await b.initialize();await b.adopt('a');
  listeners.get('native-capture-ocr')({payload:{id:'a',revision:2,text:'second',path:'',translate:true}});
  resolveTranslation('stale'); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(replies.length,1);assert.equal(replies[0].revision,2);assert.equal(replies[0].translated,'translated');
  listeners.get('native-capture-finished')({payload:{id:'a',kind:'screenshot'}});
  listeners.get('native-capture-ocr')({payload:{id:'a',revision:3,text:'closed',path:'',translate:true}});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(replies.length,1);
});


test('native icons are generated from the current Web UI SVG source',async()=>{
  const source=await readFile(new URL('../src/capture-icons.ts',import.meta.url),'utf8');
  const native=await readFile(new URL('../src-tauri/src/native_icon_data.rs',import.meta.url),'utf8');
  assert.ok(native.includes(createHash('sha256').update(source.replace(/\r\n/g,'\n')).digest('hex')),'Regenerate native icons with python scripts/generate-native-icons.py');
});
