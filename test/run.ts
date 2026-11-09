/**
 * Patch-layer test suite.
 *
 * Runs entirely against synthetic fixtures in a temp directory, so it is safe in
 * CI and never touches a real IDE installation.
 *
 *   pnpm test
 */

import type { StandaloneApp } from '../src/standalone'
import type { IdeInstallation, WorkbenchTarget } from '../src/types'
import * as assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import * as crypto from 'node:crypto'
import * as nodeFs from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'

import * as vm from 'node:vm'
import { countStrong, decideDirection, firstStrongDirection, isSettled } from '../src/bidi'
import {
  buildCss,
  buildJs,
  CSS_FILENAME,
  hasPatch,
  JS_FILENAME,
  MANIFEST_FILENAME,
  messageRootSelectors,
  stripInjected,
} from '../src/content'
import { addRtl, assetsCurrent, getStatus, isFullyInstalled, reinjectAssets, removeRtl } from '../src/injector'
import { buildMainHook, MAIN_HOOK_FILENAME, mainEntryPath } from '../src/mainHook'
import {
  applyStandalone,
  buildLoader,
  findStandaloneApps,
  isStandalonePatched,
  quarantineUnopened,
  readAsarFile,
  removeStandalone,
  STANDALONE_HOOK_FILENAME,
  standaloneCurrent,
  syncStandalone,
} from '../src/standalone'
import { exists } from '../src/utils'
import { PERSIAN_CORPUS } from './corpus'

const FIXTURES = path.resolve(process.cwd(), 'test', 'fixtures')
const WB_REL = path.join('out', 'vs', 'code', 'electron-browser', 'workbench')

let passed = 0
let failed = 0

async function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn()
    passed++
    console.log(`  ok    ${name}`)
  }
  catch (e) {
    failed++
    console.log(`  FAIL  ${name}\n        ${(e as Error).message.split('\n')[0]}`)
  }
}

function group(name: string): void {
  console.log(`\n${name}`)
}

/** Build a throwaway IDE tree containing the given workbench documents. */
async function makeInstallation(docs: Record<string, string>): Promise<IdeInstallation> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rtl-agents-test-'))
  const wbDir = path.join(root, WB_REL)
  const assetDir = path.join(root, 'out', 'vs', 'workbench')
  await fs.mkdir(wbDir, { recursive: true })
  await fs.mkdir(assetDir, { recursive: true })

  const targets: WorkbenchTarget[] = []
  for (const [label, content] of Object.entries(docs)) {
    const htmlPath = path.join(wbDir, label)
    await fs.writeFile(htmlPath, content, 'utf-8')
    targets.push({
      label,
      htmlPath,
      checksumKey: `vs/code/electron-browser/workbench/${label}`,
      assetDir,
    })
  }

  const product = {
    nameLong: 'Test IDE',
    checksums: Object.fromEntries([
      ...targets.map(t => [t.checksumKey, 'AAAA']),
      ['vs/workbench/workbench.desktop.main.js', 'BBBB'],
    ]),
    version: '1.107.0',
  }
  const productJsonPath = path.join(root, 'product.json')
  await fs.writeFile(productJsonPath, JSON.stringify(product, null, '\t'), 'utf-8')

  return {
    ideName: 'Test IDE',
    appRoot: root,
    productJsonPath,
    targets,
    workbenchHtmlPath: targets[0].htmlPath,
    workbenchDir: assetDir,
  }
}

const OPTIONS = { customSelectors: [], baseDirection: 'smart' as const, extensionVersion: '2.3.0' }
const SMART = { customSelectors: [], baseDirection: 'smart' as const }
const RTL = { customSelectors: [], baseDirection: 'rtl' as const }
const AUTO = { customSelectors: [], baseDirection: 'auto' as const }

/** The section holding the direction rules for the chosen mode. */
function directionSection(css: string): string {
  return css.slice(css.indexOf('Message direction'), css.indexOf('Composer'))
}

/** Directions a message shows while it streams in, word by word. */
function streamDirections(text: string, prior: 'rtl' | 'ltr' | null): string[] {
  const seen: string[] = []
  let shown = ''
  let settled: string | null = null
  for (const word of text.split(' ')) {
    shown += `${word} `
    if (settled) {
      seen.push(settled)
      continue
    }
    const [rtl, ltr] = countStrong(shown)
    const last = seen.at(-1)
    const dir = decideDirection(rtl, ltr, last === 'rtl' || last === 'ltr' ? last : prior)
    if (dir && isSettled(dir, rtl, ltr)) {
      settled = dir
    }
    seen.push(dir ?? '-')
  }
  return seen
}

function flips(seen: string[]): number {
  return seen.filter((d, i) => i > 0 && d !== seen[i - 1] && seen[i - 1] !== '-').length
}

type Specificity = [ids: number, classes: number, types: number]

/**
 * CSS specificity, including the `:is()` / `:not()` rule that a functional
 * pseudo-class counts as its most specific argument — not the sum of them, and
 * not the number of class names that happen to appear inside it.
 */
function specificity(selector: string): Specificity {
  let ids = 0
  let classes = 0
  let types = 0
  let i = 0

  while (i < selector.length) {
    const ch = selector[i]
    const rest = selector.slice(i)
    const fn = rest.match(/^:(is|not|where|has)\(/)
    if (fn) {
      // Find the matching close paren, honouring nesting.
      let depth = 0
      let j = i + fn[0].length - 1
      for (; j < selector.length; j++) {
        if (selector[j] === '(') {
          depth++
        }
        else if (selector[j] === ')') {
          depth--
          if (depth === 0) {
            break
          }
        }
      }
      const inner = selector.slice(i + fn[0].length, j)
      if (fn[1] !== 'where') {
        const best = splitTopLevel(inner).map(specificity).reduce((a, b) => (compareSpecificity(a, b) >= 0 ? a : b))
        ids += best[0]
        classes += best[1]
        types += best[2]
      }
      i = j + 1
      continue
    }
    if (ch === '#') {
      ids++
      i += 1 + (rest.slice(1).match(/^[\w-]+/)?.[0].length ?? 0)
      continue
    }
    // `::before` style pseudo-elements count as types.
    if (rest.startsWith('::')) {
      types++
      i += 2 + (rest.slice(2).match(/^[\w-]+/)?.[0].length ?? 0)
      continue
    }
    if (ch === '.' || ch === '[' || ch === ':') {
      if (ch === '[') {
        i = selector.indexOf(']', i) + 1
      }
      else {
        i += 1 + (rest.slice(1).match(/^[\w-]+/)?.[0].length ?? 0)
      }
      classes++
      continue
    }
    const type = rest.match(/^[a-z][\w-]*/i)
    if (type) {
      types++
      i += type[0].length
      continue
    }
    i++ // combinators, whitespace, commas, `*`
  }
  return [ids, classes, types]
}

/** Split on top-level commas only. */
function splitTopLevel(list: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < list.length; i++) {
    if (list[i] === '(') {
      depth++
    }
    else if (list[i] === ')') {
      depth--
    }
    else if (list[i] === ',' && depth === 0) {
      out.push(list.slice(start, i))
      start = i + 1
    }
  }
  out.push(list.slice(start))
  return out.map(s => s.trim()).filter(Boolean)
}

function compareSpecificity(a: Specificity, b: Specificity): number {
  for (let k = 0; k < 3; k++) {
    if (a[k] !== b[k]) {
      return a[k] - b[k]
    }
  }
  return 0
}

async function main(): Promise<void> {
  const base = await fs.readFile(path.join(FIXTURES, 'workbench.html'), 'utf-8')
  const agent = base.replace('workbench.js', 'jetskiAgent.js')

  group('patch / unpatch round trip')

  const inst = await makeInstallation({
    'workbench.html': base,
    'workbench-jetski-agent.html': agent,
  })
  const [main1, agent1] = inst.targets

  await test('addRtl patches every workbench document', async () => {
    const result = await addRtl(inst, OPTIONS)
    assert.equal(result.changed, true)
    assert.equal(result.permissionError, false)
    assert.equal(await isFullyInstalled(inst), true)
    const status = (await getStatus([inst]))[0]
    assert.equal(status.patchedTargets, 2)
    assert.equal(status.totalTargets, 2)
  })

  await test('assets land in the shared workbench directory', async () => {
    await fs.access(path.join(inst.workbenchDir, CSS_FILENAME))
    await fs.access(path.join(inst.workbenchDir, JS_FILENAME))
    await fs.access(path.join(inst.workbenchDir, MANIFEST_FILENAME))
  })

  await test('the script is injected into <head> so it runs before first paint', async () => {
    for (const target of inst.targets) {
      const html = await fs.readFile(target.htmlPath, 'utf-8')
      assert.ok(hasPatch(html), `${target.label} is not patched`)
      assert.ok(
        html.indexOf(JS_FILENAME) < html.indexOf('</head>'),
        `${target.label} injects the script after </head>`,
      )
    }
  })

  await test('relative asset hrefs resolve to real files', async () => {
    for (const target of inst.targets) {
      const html = await fs.readFile(target.htmlPath, 'utf-8')
      const hrefs = [...html.matchAll(/(?:href|src)="([^"]*rtl-agents\.(?:css|js))"/g)].map(m => m[1])
      assert.equal(hrefs.length, 2, `${target.label} should reference both assets`)
      for (const href of hrefs) {
        await fs.access(path.resolve(path.dirname(target.htmlPath), href))
      }
    }
  })

  await test('checksums for patched documents are stripped, others kept', async () => {
    const product = JSON.parse(await fs.readFile(inst.productJsonPath, 'utf-8'))
    assert.ok(!(main1.checksumKey in product.checksums))
    assert.ok(!(agent1.checksumKey in product.checksums))
    assert.ok('vs/workbench/workbench.desktop.main.js' in product.checksums)
  })

  await test('patching twice changes nothing', async () => {
    const again = await addRtl(inst, OPTIONS)
    assert.equal(again.changed, false, again.messages.join(' | '))
    const html = await fs.readFile(main1.htmlPath, 'utf-8')
    assert.equal((html.match(/RTL-AGENTS-BEGIN/g) || []).length, 1)
  })

  await test('removeRtl restores every document byte for byte', async () => {
    const productBefore = JSON.parse(await fs.readFile(`${inst.productJsonPath}.bak`, 'utf-8'))
    const result = await removeRtl(inst)
    assert.equal(result.changed, true)
    assert.equal(await fs.readFile(main1.htmlPath, 'utf-8'), base)
    assert.equal(await fs.readFile(agent1.htmlPath, 'utf-8'), agent)
    const product = JSON.parse(await fs.readFile(inst.productJsonPath, 'utf-8'))
    assert.deepEqual(product, productBefore)
  })

  await test('removeRtl leaves no assets or backups behind', async () => {
    for (const name of [CSS_FILENAME, JS_FILENAME, MANIFEST_FILENAME]) {
      await assert.rejects(fs.access(path.join(inst.workbenchDir, name)))
    }
    for (const target of inst.targets) {
      await assert.rejects(fs.access(`${target.htmlPath}.bak`))
    }
  })

  group('recovery')

  await test('a backup from an older IDE build never overwrites a newer file', async () => {
    const fresh = await makeInstallation({ 'workbench.html': base })
    const target = fresh.targets[0]
    await addRtl(fresh, OPTIONS)

    // Simulate an IDE update replacing the HTML while our backup is still around.
    const updated = `${base}\n<!-- build 2 -->`
    await fs.writeFile(target.htmlPath, updated, 'utf-8')

    await removeRtl(fresh)
    assert.equal(await fs.readFile(target.htmlPath, 'utf-8'), updated)
    await assert.rejects(fs.access(`${target.htmlPath}.bak`), 'the stale backup should be discarded')
    await fs.rm(fresh.appRoot, { recursive: true, force: true })
  })

  await test('v1 markup is recognised and cleaned up', () => {
    const v1 = base.replace(
      '<link rel="stylesheet" href="../../../../vs/workbench/workbench.desktop.main.css">',
      '<link rel="stylesheet" href="../../../../vs/workbench/workbench.desktop.main.css">'
      + '\n\t<!-- RTL Agents Support -->\n\t<link rel="stylesheet" href="../../../workbench/rtl-agents.css">',
    ).replace(
      '</html>',
      '\t<!-- RTL Agents Support -->\n\t<script src="../../../workbench/rtl-agents.js"></script>\n</html>',
    )
    assert.ok(hasPatch(v1), 'a v1 install should be detected as patched')
    assert.equal(stripInjected(v1), base, 'stripping v1 markup should restore the original')
  })

  group('generated assets')

  await test('the stylesheet announces its version and mode to a running window', () => {
    const css = buildCss({ ...SMART, extensionVersion: '9.9.9' })
    assert.match(css, /--rtl-agents-version: "9\.9\.9"/)
    assert.match(css, /--rtl-agents-mode: "smart"/)
  })

  await test('everything is gated behind the root class', () => {
    for (const opts of [SMART, RTL, AUTO]) {
      const css = buildCss(opts)
      const body = css.slice(css.indexOf('Message direction'))
      for (const rule of body.split('}').map(r => r.split('{')[0]).filter(r => r.trim() && !r.includes('*/') && /[.#[:a-z]/i.test(r))) {
        assert.match(rule, /html\.rtl-agents-on/, `ungated rule in ${opts.baseDirection} mode: ${rule.trim().slice(0, 80)}`)
      }
    }
  })

  await test('customSelectors reach the stylesheet', () => {
    assert.match(buildCss({ ...RTL, customSelectors: ['.my-chat'] }), /\.my-chat/)
  })

  await test('runtime is valid JS and avoids the v1 failure modes', () => {
    for (const opts of [SMART, RTL, AUTO]) {
      const js = buildJs(opts)
      // eslint-disable-next-line no-new-func
      void new Function(js)
      assert.match(js, /\.statusbar-item/, 'must use the real VS Code status bar class')
      assert.doesNotMatch(js, /\.status-bar-item/, 'the hyphenated class matches nothing')
      assert.doesNotMatch(js, /command:rtl-agents/, 'command: hrefs do not work in the workbench')
      assert.match(js, /selfDestruct/, 'must clean up when the extension goes away')
      assert.match(js, /__rtlAgents/, 'must expose the diagnostics API')
    }
  })

  await test('the runtime ships the same decision functions the tests exercise', () => {
    const js = buildJs(SMART)
    assert.match(js, /var decideDirection = \(/)
    assert.match(js, /var isSettled = \(/)
    // Serialised from src/bidi.ts, so the code under test is the code that ships.
    assert.ok(js.includes(decideDirection.toString()))
    assert.ok(js.includes(isSettled.toString()))
  })

  await test('the status bar bridge is not gated on the shell file name', () => {
    // Gating on `workbench.html` would silently disable toggling the day the host
    // renames its main shell; a window without a status bar just finds nothing.
    const js = buildJs(SMART)
    const tick = js.slice(js.indexOf('function tick()'), js.indexOf('function start()'))
    assert.doesNotMatch(tick, /isStandalone/)
    assert.match(tick, /attachStatus\(\)/)
  })

  await test('the toggle button anchors to a visible New Conversation button', () => {
    const js = buildJs(SMART)
    // Antigravity 2.6.0 renders three; the first in DOM order is hidden.
    assert.match(js, /data-testid="extension-new-conversation"/)
    const find = js.slice(js.indexOf('function findAnchor()'), js.indexOf('function onToggle('))
    assert.match(find, /isVisible\(/, 'the anchor must be chosen by visibility, not DOM order')
  })

  group('message roots')

  await test('the markdown root and the user bubble identify themselves', () => {
    const roots = messageRootSelectors(SMART)
    assert.ok(roots.includes('.md-divider-spacing'))
    assert.ok(roots.some(r => r.startsWith('[data-testid="user-message-bubble"]')))
  })

  await test('the user bubble flips its text column, not the bubble', () => {
    // The bubble is a flex row of icons; flipping it would move them.
    for (const root of messageRootSelectors(SMART).filter(r => r.includes('user-message-bubble'))) {
      assert.match(root, /user-message-bubble"\] (?:> )?\./, `bubble root must target a child: ${root}`)
    }
  })

  await test('generic markdown classes only count inside a chat panel', () => {
    // The editor renders hovers, settings and extension pages with these.
    for (const root of messageRootSelectors(SMART)) {
      if (/\.(?:rendered-markdown|markdown-body|markdown)\b/.test(root)) {
        assert.match(root, /^\.(?:antigravity-agent-side-panel|rtl-agents-root|interactive-session|chat-container) /, `unscoped: ${root}`)
      }
    }
  })

  await test('no message root depends on a panel class that 2.6.0 removed', () => {
    for (const root of messageRootSelectors(SMART).filter(r => r.includes('md-divider-spacing'))) {
      assert.doesNotMatch(root, /antigravity-agent-side-panel/)
    }
  })

  group('smart direction')

  await test('every corpus line settles RTL', () => {
    for (const line of PERSIAN_CORPUS) {
      const [rtl, ltr] = countStrong(line)
      const dir = decideDirection(rtl, ltr, null)
      assert.equal(dir, 'rtl', `resolved ${dir}: ${line}`)
    }
  })

  await test('an English reply resolves LTR, even quoting a Persian word', () => {
    for (const line of [
      'Here is the updated release workflow with idempotent publishing.',
      'The word «سلام» means hello, and it is the most common greeting in Persian.',
    ]) {
      const [rtl, ltr] = countStrong(line)
      assert.equal(decideDirection(rtl, ltr, null), 'ltr', line)
    }
  })

  await test('a Persian reply never flips while it streams in a Persian conversation', () => {
    // Replays each corpus line word by word, the way the 2.6.0 renderer appends
    // spans. 12 of these open with a Latin term — the case first-strong broke.
    for (const line of PERSIAN_CORPUS) {
      const seen = streamDirections(line, 'rtl')
      assert.ok(seen.every(d => d === 'rtl'), `flipped: ${seen.join(' ')} — ${line}`)
    }
  })

  await test('switching language mid-conversation flips at most once, early', () => {
    const english = streamDirections('Here is the updated release workflow with idempotent publishing and manual dispatch.', 'rtl')
    assert.ok(flips(english) <= 1, english.join(' '))
    assert.equal(english.at(-1), 'ltr')
    assert.ok(english.indexOf('ltr') <= 4, `switched too late: ${english.join(' ')}`)

    const persian = streamDirections('PackPost یک مارکت‌پلیس نظیربه‌نظیر برای فروش ظرفیت خالی چمدان است.', 'ltr')
    assert.ok(flips(persian) <= 1, persian.join(' '))
    assert.equal(persian.at(-1), 'rtl')
  })

  await test('an English reply quoting a Persian word does not flip back', () => {
    const seen = streamDirections('Here is the fix. The word «سلام» means hello and it is used as a greeting in every Persian conversation we tested.', 'rtl')
    assert.ok(flips(seen) <= 1, seen.join(' '))
    assert.equal(seen.at(-1), 'ltr')
  })

  await test('a Persian greeting opening an English reply does not lock it RTL', () => {
    const seen = streamDirections('سلام دوست عزیز! Here is the complete explanation of the release workflow and why publishing is idempotent now across every registry we support.', null)
    assert.equal(seen.at(-1), 'ltr', seen.join(' '))
  })

  await test('a settled RTL message never reverts, however much English it quotes', () => {
    assert.equal(isSettled('rtl', 30, 10), true)
    // Once settled the runtime stops re-evaluating, so a long English code
    // explanation further down cannot flip the message back.
    assert.equal(isSettled('rtl', 12, 8), false, 'a short Persian greeting must not lock an English reply')
    assert.equal(isSettled('rtl', 3, 4), false)
    assert.equal(isSettled('ltr', 0, 120), true)
    assert.equal(isSettled('ltr', 1, 500), false, 'one RTL letter keeps an LTR message open')
  })

  await test('digits and punctuation carry no direction', () => {
    assert.deepEqual(countStrong('۱۴۰۳/۰۸/۱۵ — 1,250,000 ٪ ، ؟ 2.6.0'), [0, 0])
    assert.equal(decideDirection(0, 0, null), null)
    assert.equal(decideDirection(0, 0, 'rtl'), 'rtl')
  })

  await test('the detector agrees with the corpus expectations', () => {
    const ltrFirst = PERSIAN_CORPUS.filter(l => firstStrongDirection(l) === 'ltr')
    assert.ok(ltrFirst.length >= 10, `only ${ltrFirst.length} lines exercise the first-strong hazard`)
  })

  group('direction modes')

  await test('smart mode flips by decided attribute, not by first character', () => {
    const css = buildCss(SMART)
    const section = directionSection(css)
    assert.match(section, /\[data-rtl-agents-dir="rtl"\] \{\s*direction: rtl !important;\s*text-align: start !important/)
    assert.match(section, /\[data-rtl-agents-dir="ltr"\] \{\s*direction: ltr !important/)
    assert.doesNotMatch(section, /unicode-bidi: plaintext/)
  })

  await test('pinned mode flips every message root', () => {
    const section = directionSection(buildCss(RTL))
    assert.match(section, /:is\([^)]*\.md-divider-spacing[^{]*\{\s*direction: rtl !important/)
    assert.doesNotMatch(section, /unicode-bidi: plaintext/)
  })

  await test('auto mode keeps per-paragraph resolution as an opt-in', () => {
    const section = directionSection(buildCss(AUTO))
    assert.match(section, /unicode-bidi: plaintext !important/)
    assert.doesNotMatch(section, /direction: rtl/)
    assert.doesNotMatch(section, /padding-inline-start/)
    assert.doesNotMatch(section, /border-inline-start/)
  })

  await test('the composer resolves per paragraph in every mode', () => {
    for (const opts of [SMART, RTL, AUTO]) {
      const css = buildCss(opts)
      const composer = css.slice(css.indexOf('Composer'), css.indexOf('Layout safety'))
      assert.match(composer, /agent-input-box/)
      // Lexical renders paragraphs inside the editable; unicode-bidi does not inherit.
      assert.match(composer, /contenteditable="true"\] :is\(p, div\)/)
      assert.match(composer, /unicode-bidi: plaintext !important/)
    }
  })

  group('layout inside an RTL message')

  for (const [label, opts] of [['smart', SMART], ['pinned', RTL]] as const) {
    await test(`${label}: list indent moves to the logical start side`, () => {
      const section = directionSection(buildCss(opts))
      // Antigravity indents with `[&_ol]:pl-10` / `[&>ol]:!pl-4` — physical.
      assert.match(section, /:is\(ul, ol\) \{\s*padding-left: 0 !important;\s*padding-inline-start: 2\.5rem !important/)
      assert.match(section, /> :is\(ul, ol\):not\(\.contains-task-list\) \{\s*padding-inline-start: 1\.25rem/)
      assert.match(section, /> :is\(ul, ol\)\.contains-task-list \{\s*padding-inline-start: 0/)
    })

    await test(`${label}: table cells and headers follow the direction`, () => {
      // Antigravity gives <th> a physical `text-left`.
      assert.match(directionSection(buildCss(opts)), /:is\(th, td, \.text-left\) \{\s*text-align: start !important/)
    })

    await test(`${label}: the quote bar moves to the logical start side`, () => {
      const section = directionSection(buildCss(opts))
      assert.match(section, /blockquote \{\s*border-left: none !important;\s*border-inline-start: 4px solid var\(--border,/)
    })

    await test(`${label}: every list fix outranks the host's !important indent`, () => {
      // `[&>ol:not(.contains-task-list)]:!pl-4` compiles to `.<utility> > ol:not(…)`,
      // specificity (0,2,1). Ours is !important too, so specificity decides.
      const section = directionSection(buildCss(opts))
      const group = section.match(/([^{}]+)\{\s*padding-left: 0 !important/)?.[1] ?? ''
      const host: Specificity = [0, 2, 1]
      for (const sel of splitTopLevel(group.replace(/\/\*[\s\S]*?\*\//g, ''))) {
        const ours = specificity(sel)
        assert.ok(compareSpecificity(ours, host) > 0, `(${ours}) does not beat (${host}) for "${sel.trim()}"`)
      }
    })
  }

  await test('the specificity calculator agrees with known values', () => {
    assert.deepEqual(specificity('html.rtl-agents-on :is(.a, .b) :is(ul, ol)'), [0, 2, 2])
    assert.deepEqual(specificity('html :is(.a, .b) :is(ul, ol)'), [0, 1, 2])
    assert.deepEqual(specificity('.u > ol:not(.t)'), [0, 2, 1])
    assert.deepEqual(specificity(':where(.a, #b) p'), [0, 0, 1])
    assert.deepEqual(specificity('#x .y::before'), [1, 1, 1])
    assert.deepEqual(specificity('html.rtl-agents-on [data-rtl-agents-dir="rtl"] :is(ul, ol)'), [0, 2, 2])
  })

  group('layout safety')

  await test('code keeps LTR order in every mode, isolated from the sentence', () => {
    for (const opts of [SMART, RTL, AUTO]) {
      const css = buildCss(opts)
      const guard = css.slice(css.indexOf('Isolation keeps'), css.indexOf('Alignment is pinned'))
      for (const sel of ['pre', 'code', 'kbd', '.monaco-editor', '.katex', '.mermaid']) {
        assert.ok(guard.includes(sel), `${sel} missing from the LTR guard`)
      }
      assert.match(guard, /direction: ltr !important;\s*unicode-bidi: isolate !important/)
    }
  })

  await test('inline code is never force-aligned', () => {
    const css = buildCss(SMART)
    const alignment = css.slice(css.indexOf('Alignment is pinned'), css.indexOf('RTL-AGENTS-CSS-END'))
    assert.match(alignment, /text-align: left !important/)
    assert.doesNotMatch(alignment, /(?:^|[(,\s])code[),\s]/)
  })

  await test('the LTR guard follows the direction rules so it wins the cascade', () => {
    const css = buildCss(SMART)
    assert.ok(css.indexOf('Layout safety') > css.indexOf('Message direction'))
  })

  await test('tables are no longer pinned LTR', () => {
    // A Persian table reads right to left; an English one inside a Persian
    // reply is judged on its own by the runtime.
    for (const opts of [SMART, RTL]) {
      assert.doesNotMatch(buildCss(opts), /html\.rtl-agents-on table \{\s*direction: ltr/)
    }
  })

  group('manifest')

  await test('reinjecting assets after an extension update refreshes the recorded version', async () => {
    const fresh = await makeInstallation({ 'workbench.html': base })
    await addRtl(fresh, { ...OPTIONS, extensionVersion: '2.1.0' })
    const manifestPath = path.join(fresh.workbenchDir, MANIFEST_FILENAME)
    assert.equal(JSON.parse(await fs.readFile(manifestPath, 'utf-8')).extensionVersion, '2.1.0')

    // The update path never touches workbench HTML, only the assets.
    const result = await reinjectAssets(fresh, { ...OPTIONS, extensionVersion: '2.1.1' })
    assert.equal(JSON.parse(await fs.readFile(manifestPath, 'utf-8')).extensionVersion, '2.1.1')
    assert.ok(result.messages.some(m => m.includes('Manifest')), result.messages.join(' | '))

    // Same version again: nothing to report.
    const again = await reinjectAssets(fresh, { ...OPTIONS, extensionVersion: '2.1.1' })
    assert.ok(!again.messages.some(m => m.includes('Manifest')), again.messages.join(' | '))
    await fs.rm(fresh.appRoot, { recursive: true, force: true })
  })

  await test('assets written by another build are detected and replaced even when the manifest version matches', async () => {
    // The 2.3.0 field report: the manifest already said 2.3.0, but the assets on
    // disk were generated with other options, and nothing keyed on the version
    // ever rewrote them.
    const fresh = await makeInstallation({ 'workbench.html': base })
    await addRtl(fresh, OPTIONS)
    assert.ok(await assetsCurrent(fresh, OPTIONS))

    await fs.writeFile(path.join(fresh.workbenchDir, CSS_FILENAME), buildCss(RTL), 'utf-8')
    await fs.writeFile(path.join(fresh.workbenchDir, JS_FILENAME), buildJs(RTL), 'utf-8')
    assert.equal(await assetsCurrent(fresh, OPTIONS), false)

    const healed = await reinjectAssets(fresh, OPTIONS)
    assert.equal(healed.changed, true)
    assert.ok(await assetsCurrent(fresh, OPTIONS))
    assert.match(await fs.readFile(path.join(fresh.workbenchDir, CSS_FILENAME), 'utf-8'), /--rtl-agents-mode: "smart"/)

    // Nothing stale: a start writes nothing.
    assert.equal((await reinjectAssets(fresh, OPTIONS)).changed, false)
    await fs.rm(fresh.appRoot, { recursive: true, force: true })
  })

  group('agent frame hook (Antigravity IDE)')

  const MAIN_ORIGINAL = '/*!---\n * Copyright (C) Microsoft Corporation.\n *---*/var a=1;export{a};\n'

  async function makeAgyInstallation(): Promise<IdeInstallation> {
    const agy = await makeInstallation({ 'workbench.html': base })
    await fs.mkdir(path.join(agy.appRoot, 'extensions', 'agy'), { recursive: true })
    await fs.writeFile(mainEntryPath(agy), MAIN_ORIGINAL, 'utf-8')
    return agy
  }

  await test('hosts without the agy extension never get main.js touched', async () => {
    const plain = await makeInstallation({ 'workbench.html': base })
    await fs.writeFile(mainEntryPath(plain), MAIN_ORIGINAL, 'utf-8')
    await addRtl(plain, OPTIONS)
    assert.equal(await fs.readFile(mainEntryPath(plain), 'utf-8'), MAIN_ORIGINAL)
    assert.equal(await exists(path.join(plain.workbenchDir, MAIN_HOOK_FILENAME)), false)
    await fs.rm(plain.appRoot, { recursive: true, force: true })
  })

  await test('addRtl hooks main.js with one failure-safe dynamic import, and removeRtl restores it byte for byte', async () => {
    const agy = await makeAgyInstallation()
    const result = await addRtl(agy, OPTIONS)
    assert.ok(result.changed)
    const patched = await fs.readFile(mainEntryPath(agy), 'utf-8')
    assert.equal(patched, `/* RTL-AGENTS-MAIN */import("./vs/workbench/rtl-agents-main.js").catch(function () {});\n${MAIN_ORIGINAL}`)
    assert.ok(await exists(path.join(agy.workbenchDir, MAIN_HOOK_FILENAME)))
    assert.ok(await isFullyInstalled(agy))
    assert.ok(await assetsCurrent(agy, OPTIONS))

    // Idempotent: a second run adds nothing.
    assert.equal((await addRtl(agy, OPTIONS)).changed, false)
    assert.equal(await fs.readFile(mainEntryPath(agy), 'utf-8'), patched)

    await removeRtl(agy)
    assert.equal(await fs.readFile(mainEntryPath(agy), 'utf-8'), MAIN_ORIGINAL)
    assert.equal(await exists(path.join(agy.workbenchDir, MAIN_HOOK_FILENAME)), false)
    await fs.rm(agy.appRoot, { recursive: true, force: true })
  })

  await test('an IDE update that replaces main.js is detected and re-hooked', async () => {
    const agy = await makeAgyInstallation()
    await addRtl(agy, OPTIONS)
    await fs.writeFile(mainEntryPath(agy), MAIN_ORIGINAL, 'utf-8')
    assert.equal(await isFullyInstalled(agy), false)
    assert.equal(await assetsCurrent(agy, OPTIONS), false)
    assert.ok((await reinjectAssets(agy, OPTIONS)).changed)
    assert.ok(await isFullyInstalled(agy))
    await fs.rm(agy.appRoot, { recursive: true, force: true })
  })

  await test('the hook module parses as ESM, targets only loopback pages that identify as the agent, and survives missing assets', () => {
    const hook = buildMainHook()
    assert.match(hook, /import \{ app, webFrameMain \} from 'electron'/)
    assert.match(hook, /extensionView=true/)
    assert.match(hook, /'127\.0\.0\.1'/)
    assert.match(hook, /return; \/\/ assets gone/)
    assert.match(hook, /data-rtl-agents-frame/)
    // Strip the imports and compile (without running) the rest.
    const body = hook.replace(/^import .*$/gm, '').replace(/import\.meta\.url/g, '"file:///x/y.js"')
    assert.doesNotThrow(() => new vm.Script(body))
  })

  await test('the runtime bridges a frame to the workbench over postMessage', () => {
    const js = buildJs(SMART)
    assert.match(js, /var IS_TOP = window\.top === window;/)
    assert.match(js, /post\(window\.top, 'hello'\)/)
    assert.match(js, /post\(window\.top, 'toggle'\)/)
    assert.match(js, /e\.source === window\.top && d\.type === 'state'/)
  })

  await test('inline <style> and <script> text is left out of the letter count', () => {
    const js = buildJs(SMART)
    const nonProse = js.match(/var NON_PROSE_SELECTOR = ("[^"]*");/)
    assert.ok(nonProse)
    const selectors = (JSON.parse(nonProse[1]) as string).split(/,\s*/)
    for (const s of ['style', 'script', 'svg', 'pre', 'code']) {
      assert.ok(selectors.includes(s), `${s} missing from ${nonProse[1]}`)
    }
  })

  group('standalone Antigravity app')

  /** A real-format asar archive, built in memory. */
  function makeAsar(files: Record<string, string>): Buffer {
    interface Node { files: Record<string, Node | { size: number, offset: string }> }
    const tree: Node = { files: {} }
    const chunks: Buffer[] = []
    let offset = 0
    for (const [file, content] of Object.entries(files)) {
      const parts = file.split('/')
      let node = tree
      for (const part of parts.slice(0, -1)) {
        node = (node.files[part] ??= { files: {} }) as Node
      }
      const data = Buffer.from(content)
      node.files[parts[parts.length - 1]] = { size: data.length, offset: String(offset) }
      chunks.push(data)
      offset += data.length
    }
    const json = Buffer.from(JSON.stringify(tree))
    const padded = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4)])
    const head = Buffer.alloc(16)
    head.writeUInt32LE(4, 0)
    head.writeUInt32LE(padded.length + 8, 4)
    head.writeUInt32LE(padded.length + 4, 8)
    head.writeUInt32LE(json.length, 12)
    return Buffer.concat([head, padded, ...chunks])
  }

  const RTL_OPTIONS = { ...RTL, extensionVersion: '2.3.0' }
  const APP_PACKAGE = JSON.stringify({ name: 'antigravity', productName: 'Antigravity', version: '2.29.1', main: 'dist/main.js' })

  async function makeStandalone(pkg = APP_PACKAGE): Promise<{ root: string, resources: string }> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rtl-agents-app-'))
    const resources = path.join(root, 'Antigravity.app', 'Contents', 'Resources')
    await fs.mkdir(resources, { recursive: true })
    await fs.writeFile(path.join(resources, 'app.asar'), makeAsar({ 'package.json': pkg, 'dist/main.js': '"use strict";' }))
    return { root, resources }
  }

  const sha = async (file: string): Promise<string> =>
    crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex')

  async function appOf(app: { root: string, resources: string }): Promise<StandaloneApp> {
    const [found] = await findStandaloneApps([app.resources], path.join(app.root, 'userData', 'rtl-agents'))
    return found
  }

  await test('files are read out of an asar archive, nested paths included', async () => {
    const app = await makeStandalone()
    const asar = path.join(app.resources, 'app.asar')
    assert.equal((await readAsarFile(asar, 'dist/main.js'))?.toString(), '"use strict";')
    assert.equal(JSON.parse((await readAsarFile(asar, 'package.json'))!.toString()).version, '2.29.1')
    assert.equal(await readAsarFile(asar, 'dist/missing.js'), undefined)
    assert.equal(await readAsarFile(path.join(app.resources, 'nope.asar'), 'package.json'), undefined)
    await fs.rm(app.root, { recursive: true, force: true })
  })

  await test('only the standalone app is recognised — not the IDE, not other Electron apps', async () => {
    const app = await makeStandalone()
    const other = await makeStandalone(JSON.stringify({ name: 'some-other-app', main: 'index.js' }))
    const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'rtl-agents-app-'))
    const found = await findStandaloneApps([app.resources, other.resources, empty, path.join(empty, 'missing')], '/x')
    assert.equal(found.length, 1)
    assert.equal(found[0].name, 'Antigravity')
    assert.equal(found[0].asarPath, path.join(app.resources, 'app.asar'))
    for (const dir of [app.root, other.root, empty]) {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  await test('the archive starts a loader that runs RTL Agents first and then the app, with every original file intact', async () => {
    const app = await makeStandalone()
    const target = await appOf(app)
    const original = await fs.readFile(target.asarPath)

    assert.equal(await applyStandalone(target, OPTIONS, []), true)
    assert.ok(await isStandalonePatched(target))
    assert.ok(await standaloneCurrent(target, OPTIONS))

    // The app's files read back unchanged; only package.json's entry point moved.
    assert.equal((await readAsarFile(target.asarPath, 'dist/main.js'))?.toString(), '"use strict";')
    const pkg = JSON.parse((await readAsarFile(target.asarPath, 'package.json'))!.toString())
    assert.deepEqual(pkg, { ...JSON.parse(APP_PACKAGE), main: 'rtl-agents/index.js' })

    const loader = (await readAsarFile(target.asarPath, 'rtl-agents/index.js'))!.toString()
    assert.equal(loader, buildLoader(path.join(target.dataDir, STANDALONE_HOOK_FILENAME), 'dist/main.js'))
    assert.match(loader, /try \{ require\(".*rtl-agents-main\.cjs"\); \} catch/)
    assert.match(loader, /require\("\.\.\/dist\/main\.js"\);/)
    assert.doesNotThrow(() => new vm.Script(loader))

    // The original data is a prefix of the new data section: nothing moved.
    const patched = await fs.readFile(target.asarPath)
    const dataOf = (b: Buffer): Buffer => b.subarray(8 + b.readUInt32LE(4))
    assert.ok(dataOf(patched).subarray(0, dataOf(original).length).equals(dataOf(original)))

    // Hook, assets and backup live outside the app.
    for (const name of [STANDALONE_HOOK_FILENAME, CSS_FILENAME, JS_FILENAME, 'app.asar.original']) {
      assert.ok(await exists(path.join(target.dataDir, name)), name)
    }
    assert.ok((await fs.readFile(path.join(target.dataDir, 'app.asar.original'))).equals(original))

    // Nothing stale: a second pass writes nothing.
    assert.equal(await applyStandalone(target, OPTIONS, []), false)
    await fs.rm(app.root, { recursive: true, force: true })
  })

  await test('a settings change rewrites only the hook folder; an app update is re-patched', async () => {
    const app = await makeStandalone()
    const target = await appOf(app)
    await applyStandalone(target, OPTIONS, [])
    const patchedOnce = await sha(target.asarPath)

    assert.equal(await standaloneCurrent(target, RTL_OPTIONS), false)
    assert.equal(await applyStandalone(target, RTL_OPTIONS, []), true)
    assert.ok(await standaloneCurrent(target, RTL_OPTIONS))
    assert.equal(await sha(target.asarPath), patchedOnce)

    // The app updates: a fresh, unpatched archive appears.
    const updated = makeAsar({
      'package.json': JSON.stringify({ name: 'antigravity', productName: 'Antigravity', version: '2.30.0', main: 'dist/main.js' }),
      'dist/main.js': '"use strict"; /* 2.30 */',
    })
    await fs.writeFile(target.asarPath, updated)
    assert.equal(await isStandalonePatched(target), false)
    assert.equal(await standaloneCurrent(target, RTL_OPTIONS), false)
    assert.equal(await applyStandalone(target, RTL_OPTIONS, []), true)
    assert.equal(JSON.parse((await readAsarFile(target.asarPath, 'package.json'))!.toString()).version, '2.30.0')
    assert.ok((await fs.readFile(path.join(target.dataDir, 'app.asar.original'))).equals(updated))
    await fs.rm(app.root, { recursive: true, force: true })
  })

  await test('removal restores the original archive byte for byte, with or without the backup', async () => {
    for (const keepBackup of [true, false]) {
      const app = await makeStandalone()
      const target = await appOf(app)
      const before = await sha(target.asarPath)
      await applyStandalone(target, OPTIONS, [])
      if (!keepBackup) {
        await fs.rm(path.join(target.dataDir, 'app.asar.original'))
      }
      assert.equal(await removeStandalone(target, []), true)
      assert.equal(await sha(target.asarPath), before, keepBackup ? 'from backup' : 'rebuilt')
      assert.equal(await exists(target.dataDir), false)
      assert.equal(await isStandalonePatched(target), false)
      assert.equal(await removeStandalone(target, []), false)
      await fs.rm(app.root, { recursive: true, force: true })
    }
  })

  await test('the app/ folder left by the first 2.4.0 builds is cleaned up, and a foreign one is not', async () => {
    const app = await makeStandalone()
    const target = await appOf(app)
    const legacy = path.join(app.resources, 'app')
    await fs.mkdir(legacy)
    await fs.writeFile(path.join(legacy, 'package.json'), '{"rtlAgents":{}}', 'utf-8')
    await applyStandalone(target, OPTIONS, [])
    assert.equal(await exists(legacy), false)

    await fs.mkdir(legacy)
    await fs.writeFile(path.join(legacy, 'package.json'), '{"name":"somebody-elses"}', 'utf-8')
    await removeStandalone(target, [])
    assert.ok(await exists(path.join(legacy, 'package.json')))
    await fs.rm(app.root, { recursive: true, force: true })
  })

  await test('an app macOS has not approved yet is left alone, and an approved one is patched', async () => {
    assert.equal(quarantineUnopened(undefined), false)
    assert.equal(quarantineUnopened('0081;6af1a50a;Chrome;UUID'), true)
    assert.equal(quarantineUnopened('0381;6af1a50a;Chrome;UUID'), true)
    assert.equal(quarantineUnopened('0083;6af1a50a;Chrome;UUID'), false)
    assert.equal(quarantineUnopened('0383;6af1a50a;Chrome;UUID'), false)
    assert.equal(quarantineUnopened('garbage'), false)

    const app = await makeStandalone()
    const target = await appOf(app)
    const before = await sha(target.asarPath)

    const messages: string[] = []
    const blocked = await syncStandalone([target], OPTIONS, messages, async () => '0381;6af1a50a;Chrome;UUID')
    assert.deepEqual({ changed: blocked.changed, blocked: blocked.blocked }, { changed: false, blocked: true })
    assert.equal(await sha(target.asarPath), before)
    assert.match(messages.join('\n'), /Skipped/)

    const approved = await syncStandalone([target], OPTIONS, [], async () => '0383;6af1a50a;Chrome;UUID')
    assert.equal(approved.changed, true)
    assert.ok(await isStandalonePatched(target))

    // A patch that is already there keeps being maintained whatever the flag says.
    const refreshed = await syncStandalone([target], RTL_OPTIONS, [], async () => '0381;6af1a50a;Chrome;UUID')
    assert.equal(refreshed.changed, true)
    assert.ok(await standaloneCurrent(target, RTL_OPTIONS))
    await fs.rm(app.root, { recursive: true, force: true })
  })

  /** Run the standalone hook against a fake Electron and fake pages. */
  async function runHook(): Promise<{ inject: (url: string, page: Record<string, unknown>) => { ran: boolean, marked: boolean } }> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'rtl-agents-hook-'))
    await fs.writeFile(path.join(dir, CSS_FILENAME), '.x{}', 'utf-8')
    await fs.writeFile(path.join(dir, JS_FILENAME), 'window.__ran = true;', 'utf-8')

    type Listener = (...args: unknown[]) => void
    const listeners: Record<string, Listener> = {}
    const frames = new Map<string, { url: string, isDestroyed: () => boolean, executeJavaScript: (code: string) => Promise<void> }>()
    const contents = {
      on: (name: string, cb: Listener): void => {
        listeners[name] = cb
      },
    }
    const electron = {
      app: { on: (_event: string, fn: Listener): void => { fn(null, contents) } },
      webFrameMain: { fromId: (processId: number, routingId: number) => frames.get(`${processId}:${routingId}`) },
    }
    const modules: Record<string, unknown> = { 'electron': electron, 'node:fs': nodeFs, 'node:path': path }
    const wrapped = `(function (require, __dirname) {${buildMainHook('cjs')}\n})`
    const load = new vm.Script(wrapped).runInThisContext() as (r: unknown, d: string) => void
    load((id: string) => modules[id], dir)

    return {
      inject(url, page) {
        const marks = new Set<string>()
        const window: Record<string, unknown> = { ...page }
        const sandbox = {
          window,
          location: { search: new URL(url).search },
          document: {
            documentElement: { hasAttribute: (n: string) => marks.has(n), setAttribute: (n: string) => marks.add(n) },
            head: { appendChild: () => {} },
            createElement: () => ({}),
          },
        }
        let code = ''
        const run = (c: string): Promise<void> => {
          code = c
          return Promise.resolve()
        }
        frames.set('1:1', { url, isDestroyed: () => false, executeJavaScript: run })
        listeners['did-frame-navigate']?.(null, url, 200, 'OK', true, 1, 1)
        if (code) {
          vm.createContext(sandbox)
          vm.runInContext(code, sandbox)
        }
        return { ran: window.__ran === true, marked: marks.has('data-rtl-agents-frame') }
      },
    }
  }

  await test('the hook injects into the app window and the IDE chat frame, and nowhere else', async () => {
    const hook = await runHook()
    const app = { nativeStorage: {}, electronNative: {} }

    // Standalone app: loopback page whose preload exposes the app's own APIs.
    assert.deepEqual(hook.inject('https://127.0.0.1:57526/c/abc?project=1', app), { ran: true, marked: true })
    // IDE: loopback page opened as an extension view.
    assert.deepEqual(hook.inject('http://127.0.0.1:55863/c/abc?extensionView=true&x=1', {}), { ran: true, marked: true })
    // A developer's own app on localhost, shown in an embedded browser.
    assert.deepEqual(hook.inject('http://localhost:3000/', {}), { ran: false, marked: false })
    // A remote site never reaches the page at all.
    assert.deepEqual(hook.inject('https://example.com/?extensionView=true', app), { ran: false, marked: false })
    // The agent flag must be exact, not a substring.
    assert.deepEqual(hook.inject('http://127.0.0.1:1/?notextensionView=true', {}), { ran: false, marked: false })
  })

  await test('the standalone hook module is CommonJS and parses', () => {
    const hook = buildMainHook('cjs')
    assert.match(hook, /const \{ app, webFrameMain \} = require\('electron'\)/)
    assert.match(hook, /const DIR = __dirname;/)
    assert.doesNotMatch(hook, /import\.meta|^import /m)
    assert.doesNotThrow(() => new vm.Script(`(function (require, __dirname) {${hook}\n})`))
  })

  await test('the runtime puts the toggle in the title bar, and keeps the choice in the app storage', () => {
    const js = buildJs(SMART)
    assert.doesNotThrow(() => new vm.Script(js))
    assert.match(js, /\[data-testid="pane-titlebar-toolbar"\] \[data-testid="titlebar-more-actions"\]/)
    assert.match(js, /anchor\.parentNode\.insertBefore\(btn, bar \? anchor : anchor\.nextSibling\)/)
    assert.match(js, /window\.nativeStorage && window\.electronNative/)
    assert.match(js, /var HUB_KEY = "rtl-agents\.active"/)
    // Off by default only where there is a status bar to say otherwise.
    assert.match(js, /hubStore \? readStored\(\) !== 'false' : readStored\(\) === 'true'/)
  })

  console.log(`\n${passed} passed, ${failed} failed\n`)
  await fs.rm(inst.appRoot, { recursive: true, force: true })
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
