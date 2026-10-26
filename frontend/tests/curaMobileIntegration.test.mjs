import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'

const bridge = readFileSync(new URL('../public/cura-integration.js', import.meta.url), 'utf8')
const mobileCss = readFileSync(new URL('../public/cura-mobile.css', import.meta.url), 'utf8')
const shell = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')

function makeHarness() {
  const listeners = {}
  const received = []
  const windowListeners = {}
  const classes = new Set()
  let hasModel = false
  let sliced = 0
  let modelImports = 0
  let sheet
  const styleSheets = []
  const classList = {
    contains: value => classes.has(value),
    toggle: (value, force) => {
      if (force) classes.add(value)
      else classes.delete(value)
    },
  }
  const picker = {
    files: null,
    dispatchEvent(event) { hasModel = true; modelImports++; return event },
  }
  const closeButton = {focus() {}, addEventListener() {}}
  const dock = {
    setAttribute() {}, firstChild: null,
    insertBefore(node) { sheet = node },
  }
  const document = {
    head: {appendChild(node) { styleSheets.push(node.href) }},
    body: {classList, appendChild() {}},
    createElement(tag) {
      return {tag, style:{}, setAttribute() {}, addEventListener() {},
        querySelector: () => closeButton}
    },
    querySelector(selector) {
      if (selector === '.dock') return dock
      if (selector === '#ffadv4-sheet-head') return sheet
      if (selector === '.requires_objects:not([disabled])') return hasModel ? {} : null
      if (selector === '#ffadv4-sheet-close') return closeButton
      return null
    },
    querySelectorAll(selector) {
      if (selector === '.page_slice.footer button')
        return [{textContent: 'Slice', disabled: false, click() {sliced++}}]
      return []
    },
    getElementById(id) { return id === 'model_file' ? picker : null },
    addEventListener(name, callback) { listeners[name] = callback },
  }
  const parent = {postMessage(data, origin) {received.push({data, origin})}}
  const window = {
    parent, settings: {gotoPage() {}}, matchMedia: () => ({matches: true}), stage: {slice: () => 'handle'},
    slicer: {readFile: async () => 'G1 X5 Y4\nM104 S205\n'},
    addEventListener(name, callback) {windowListeners[name] = callback},
    dispatchEvent() {},
  }
  const localStorage = {
    values: new Map(),
    getItem(key) {return this.values.get(key)},
    setItem(key, value) {this.values.set(key, value)},
    removeItem(key) {this.values.delete(key)},
  }
  const intervals = []
  class FakeFile {
    constructor(name, size) {this.name=name; this.size=size}
  }
  class FakeDataTransfer {
    constructor() {
      this.files = []
      this.items = {add: file => this.files.push(file)}
    }
  }
  const globals = {window, document, location: {href:'https://example.test/cura/index.html',
      origin:'https://example.test'}, URL, localStorage, File: FakeFile,
    DataTransfer: FakeDataTransfer, Event: class {constructor(type) {this.type=type}},
    setInterval(fn) {intervals.push(fn); return intervals.length}, clearInterval() {},
    setTimeout() {},
  }
  vm.runInNewContext(bridge, globals, {filename:'cura-integration.js'})
  intervals[0]()
  function message(command, extra = {}, origin = 'https://example.test', source = parent) {
    windowListeners.message({origin, source, data: {source:'ffadv4-shell', command, ...extra}})
  }
  return {window, document, message, intervals, received, classes, styleSheets,
    get sliced() {return sliced}, get modelImports() {return modelImports}, FakeFile}
}

test('Cura is styled as a mobile, collapsible viewer-first bottom sheet', () => {
  assert.match(mobileCss, /@media\s*\(max-width:\s*767px\)/)
  assert.match(mobileCss, /body\.ffadv4-sheet-open \.dock/)
  assert.match(mobileCss, /#ffadv4-sheet-backdrop/)
  assert.match(mobileCss, /#settings \.parameter label/)
  assert.match(mobileCss, /env\(safe-area-inset-bottom\)/)
  assert.match(shell, /sendToCura\('load-model', \{file\}\)/)
  assert.match(shell, /sendToCura\('slice'\)/)
  assert.match(shell, /upload\(false\)/)
  assert.match(shell, /upload\(true\)/)
  assert.match(shell, /IS_PAGES_DEMO/)
})

test('Cura accepts only messages from same-origin embedding parent', () => {
  const ui = makeHarness()
  ui.message('open-settings', {}, 'https://evil.example')
  assert.equal(ui.classes.has('ffadv4-sheet-open'), false)
  ui.message('open-settings', {}, 'https://example.test', {})
  assert.equal(ui.classes.has('ffadv4-sheet-open'), false)
  ui.message('open-settings')
  assert.equal(ui.classes.has('ffadv4-sheet-open'), true)
  ui.message('close-settings')
  assert.equal(ui.classes.has('ffadv4-sheet-open'), false)
  assert.ok(ui.styleSheets.some(path => path.endsWith('/cura-mobile.css')))
  assert.ok(ui.received.every(msg => msg.origin === 'https://example.test'))
})

test('A selected model is passed into the actual Cura file input and sliced via its handler', async () => {
  const ui = makeHarness()
  ui.message('slice')
  assert.equal(ui.sliced, 0, 'no slice when model is missing')
  ui.message('load-model', {file: new ui.FakeFile('calibration.stl', 1024)})
  assert.equal(ui.modelImports, 1)
  ui.message('slice')
  assert.equal(ui.sliced, 1)
  await ui.window.slicer.readFile('handle')
  assert.match(ui.window.ffadv4LastGcode, /G1 X5/)
  const state = ui.received.filter(msg => msg.data.type === 'state').at(-1).data
  assert.equal(state.hasGcode, true)
  assert.equal(state.hasModel, true)
  assert.ok(ui.received.some(msg => msg.data.type === 'slicing'))
})

test('Unsupported/oversized model inputs cannot reach the slicer', () => {
  const ui = makeHarness()
  ui.message('load-model', {file: new ui.FakeFile('bad.exe', 100)})
  ui.message('load-model', {file: new ui.FakeFile('too-big.stl', 100 * 1024 * 1024 + 1)})
  assert.equal(ui.modelImports, 0)
  assert.ok(ui.received.filter(msg => msg.data.type === 'error').length >= 2)
})
