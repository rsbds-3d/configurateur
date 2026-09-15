const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  const elements = new Map();
  const revoked = [], downloads = [], timers = [], messages = [];
  let nextUrl = 0, captureCount = 0, failCapture = false;
  function element() {
    return {
      open: false, attached: false, disabled: false,
      removeAttribute(key) { delete this[key]; },
      showModal() { this.open = true; },
      click() { assert.equal(this.attached, true); downloads.push(this.download); },
      remove() { this.attached = false; },
    };
  }
  for (const id of ['png-export-dialog', 'png-export-image', 'png-export-caption', 'png-export-open', 'png-export-save', 'download-view-png']) elements.set('#' + id, element());
  const context = vm.createContext({
    document: { querySelector: (id) => elements.get(id), createElement: element, body: { append(node) { node.attached = true; } } },
    URL: { createObjectURL: () => 'blob:test-' + ++nextUrl, revokeObjectURL: (url) => revoked.push(url) },
    window: { setTimeout(fn, ms) { timers.push({ fn, ms }); } },
    settings: { modelId: 'test-model' },
    renderCanvasToPngBlob: async () => { captureCount++; if (failCapture) throw Error('canvas failed'); return { type: 'image/png' }; },
    showAuxiliaryProgress() {},
    finishAuxiliaryProgress: (text) => messages.push(text),
    showNotice: (text) => messages.push(text),
  });
  vm.runInContext(source.slice(source.indexOf('function downloadBlob('), source.indexOf('async function shareCurrentView(')), context);
  await vm.runInContext('downloadCurrentView()', context);
  assert.equal(elements.get('#png-export-dialog').open, true);
  assert.equal(elements.get('#png-export-image').src, elements.get('#png-export-save').href);
  assert.equal(elements.get('#png-export-save').download, 'rosebuds-test-model.png');
  assert.deepEqual(downloads, ['rosebuds-test-model.png']);
  assert.ok(messages.includes('Image PNG prête'), 'Do not claim the browser saved a file');
  assert.equal(elements.get('#download-view-png').disabled, false);
  assert.equal(timers[0].ms, 60000, 'Give slower browsers time to consume the automatic download');
  const previewUrl = elements.get('#png-export-image').src;
  timers[0].fn();
  assert.ok(!revoked.includes(previewUrl), 'The preview keeps its own URL until closed');
  vm.runInContext('clearPngExport()', context);
  assert.ok(revoked.includes(previewUrl));
  assert.equal(elements.get('#png-export-save').href, undefined);
  elements.get('#download-view-png').disabled = true;
  await vm.runInContext('downloadCurrentView()', context);
  assert.equal(captureCount, 1, 'Concurrent clicks must not start multiple captures');
  elements.get('#download-view-png').disabled = false;
  failCapture = true;
  await vm.runInContext('downloadCurrentView()', context);
  assert.equal(elements.get('#download-view-png').disabled, false, 'Capture failure unlocks the button');
  assert.ok(messages.includes('Capture impossible'));
  console.log('PNG preview, download lifetime, cleanup and failure recovery OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
