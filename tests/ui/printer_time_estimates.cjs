// Exercise the dashboard's actual time rendering with a minimal DOM, no network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('overlays/mosaic/public/ad4-printer-dashboard.js', 'utf8');
const begin = source.indexOf(' const fmt=');
const end = source.indexOf(' document.addEventListener("ad4:printer-state"', begin);
assert(begin > 0 && end > begin, 'Dashboard render function must remain testable');
const nodes = new Map();
const element = id => {
  if (!nodes.has(id)) nodes.set(id, {
    style: {}, dataset: {}, textContent: '', title: '',
    attrs: new Map(), setAttribute(key, value) { this.attrs.set(key, value); },
    removeAttribute(key) { this.attrs.delete(key); },
  });
  return nodes.get(id);
};
const page = {dataset: {}};
const context = {$: element, page};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source.slice(begin, end) + '\nthis.renderStatusForTest=renderStatus;', context);
const render = context.renderStatusForTest;
const state = (more={}) => ({machine_status:'BUILDING_FROM_SD', status_available:true,
  current_file:'/data/part.gx', progress_percent:24, elapsed_seconds_estimate:641.76,
  remaining_seconds_estimate:2032.24, ...more});
render(state());
assert.equal(element('ad4-printer-elapsed').textContent, '≈ 10m 42s');
assert.equal(element('ad4-printer-remaining').textContent, '≈ 33m 52s');
assert.match(element('ad4-printer-elapsed-label').textContent, /estimated/);
assert.match(element('ad4-printer-remaining-label').textContent, /estimated/);

render(state({elapsed_seconds:600,remaining_seconds:1900}));
assert.equal(element('ad4-printer-elapsed').textContent, '10m');
assert.equal(element('ad4-printer-remaining').textContent, '31m');
assert.equal(element('ad4-printer-elapsed-label').textContent, 'Elapsed');

for (const bad of [
  {elapsed_seconds_estimate:null,remaining_seconds_estimate:null},
  {elapsed_seconds_estimate:-3,remaining_seconds_estimate:NaN},
  {stale:true},
  {machine_status:'READY'},
  {machine_status:null,status_available:false}
]) {
  render(state(bad));
  assert.equal(element('ad4-printer-elapsed').textContent, '—');
  assert.equal(element('ad4-printer-remaining').textContent, '—');
  assert.equal(element('ad4-printer-elapsed-label').textContent, 'Elapsed');
}
console.log('Printer time labels, estimates, measured precedence, and missing/stale values passed');
