const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}

function element() {
  return {
    value: '', textContent: '', options: [], disabled: false,
    replaceChildren(...children) { this.options = children; },
    append(...children) { this.options.push(...children); },
  };
}

async function checkNavigation() {
  const nodes = new Map();
  const get = id => {
    if (!nodes.has(id)) nodes.set(id, element());
    return nodes.get(id);
  };
  const context = vm.createContext({
    document: {getElementById: get, createElement: element, addEventListener() {}},
    window: {addEventListener() {}}, localStorage: {setItem() {}},
  });
  const run = code => vm.runInContext(code, context);
  run(fs.readFileSync(require.resolve('../apps/api/app/annotation_static/app.js'), 'utf8'));
  context.replies = new Map();
  run("api=path=>replies.get(path)(); refreshBatch=async()=>{};");
  const demos = [
    {id:'a', map:'de_anubis', filename:'one.dem', players:[{id:'123',name:'One'}], provenance:{}},
    {id:'b', map:'de_ancient', filename:'two.dem', players:[{id:'234',name:'Two'}], provenance:{}},
  ];
  context.replies.set('/api/demos', () => demos);
  const list = deferred();
  let polls = 0;
  context.replies.set('/api/jobs', () => { polls++; return list.promise; });
  const first = run('poll()'), second = run('poll()');
  assert.equal(first, second);
  assert.equal(polls, 1);
  list.resolve([]);
  await first;
  const option = get('demo').options[1];
  await run('poll()');
  assert.equal(get('demo').options[1], option, 'polling must keep options and keyboard selection');

  run("state.demo='a'; state.player='123'; state.labeller='qa'; setDemo(); $('demo').value='a'; clearReview=()=>{};");
  const unsaved = deferred();
  context.unsaved = unsaved.promise;
  run('leave=()=>unsaved');
  get('demo').value = 'b';
  const switching = get('demo').onchange({target:get('demo')});
  assert.equal(get('demo').value, 'a');
  assert.equal(get('parse').disabled, true);
  await run('poll()');
  unsaved.reject(new Error('Could not save this note.'));
  await switching;
  assert.equal(run('state.demo'), 'a');
  assert.equal(get('demo').value, 'a');
  assert.equal(get('message').textContent, 'Could not save this note.');
  assert.equal(get('parse').disabled, false);

  run('leave=async()=>{};');
  get('demo').value = 'b';
  await get('demo').onchange({target:get('demo')});
  assert.equal(run('state.demo'), 'b');
  assert.equal(get('demo').value, 'b');
  assert.equal(run('state.player'), '');
  assert.equal(get('parse').disabled, true);

  let attempts = 0, resumed = 0;
  context.tryRounds = async () => {
    if (++attempts === 1) throw new Error('disconnected');
  };
  context.openClip = async () => { resumed++; };
  run("savedLocation={demo:'a',player:'123',labeller:'qa',round:2}; loadRounds=tryRounds; resumeClipLocation=openClip;");
  await assert.rejects(run('poll()'), /disconnected/);
  await run('poll()');
  assert.equal(run('state.demo'), 'a');
  assert.equal(resumed, 1);
  assert.equal(run('savedLocation'), null);
  console.log('Labeller polling, stable selects, unsaved navigation and reconnect checks passed.');
}

checkNavigation().catch(error => { console.error(error); process.exitCode = 1; });
