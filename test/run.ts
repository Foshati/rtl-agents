/**
 * Patch-layer test suite.
 *
 * Runs entirely against synthetic fixtures in a temp directory, so it is safe in
 * CI and never touches a real IDE installation.
 *
 *   pnpm test
 */

import type { IdeInstallation, WorkbenchTarget } from '../src/types'
import * as assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'

import {
  buildCss,
  buildJs,
  CSS_FILENAME,
  hasPatch,
  JS_FILENAME,
  MANIFEST_FILENAME,
  stripInjected,
} from '../src/content'
import { addRtl, getStatus, isFullyInstalled, reinjectAssets, removeRtl } from '../src/injector'
import { firstStrongDirection, PERSIAN_CORPUS } from './corpus'

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

const OPTIONS = { customSelectors: [], baseDirection: 'rtl' as const, extensionVersion: '2.1.0' }
const RTL = { customSelectors: [], baseDirection: 'rtl' as const }
const AUTO = { customSelectors: [], baseDirection: 'auto' as const }

/** The rule that carries the base direction for rendered message text. */
function messageTextRule(css: string): string {
  const start = css.indexOf('Message text')
  return css.slice(start, css.indexOf('Composer'))
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

  await test('CSS pins an RTL base and needs no JS in the direction path', () => {
    const css = buildCss(RTL)
    assert.match(messageTextRule(css), /direction: rtl !important/)
    assert.match(css, /html\.rtl-agents-on/)
    // The container Antigravity 2.5.5 renders each response paragraph into.
    assert.match(css, /\.animate-markdown/)
    assert.match(css, /rtl-agents-standalone/)
  })

  await test('CSS keeps code and table layout LTR', () => {
    const css = buildCss(RTL)
    const guard = css.slice(css.indexOf('Layout safety'))
    assert.match(guard, /\bpre\b/)
    assert.match(guard, /\bcode\b/)
    assert.match(guard, /html\.rtl-agents-on table \{\s*direction: ltr/)
  })

  await test('customSelectors reach the stylesheet', () => {
    assert.match(buildCss({ ...RTL, customSelectors: ['.my-chat'] }), /\.my-chat/)
  })

  await test('runtime is valid JS and avoids the v1 failure modes', () => {
    const js = buildJs(RTL)
    // eslint-disable-next-line no-new-func
    void new Function(js)
    assert.match(js, /\.statusbar-item/, 'must use the real VS Code status bar class')
    assert.doesNotMatch(js, /\.status-bar-item/, 'the hyphenated class matches nothing')
    assert.doesNotMatch(js, /command:rtl-agents/, 'command: hrefs do not work in the workbench')
    assert.doesNotMatch(js, /observe\(\s*(?:DOC|document)\.body/, 'no document-wide observer')
    assert.match(js, /selfDestruct/, 'must clean up when the extension goes away')
  })

  group('base direction')

  await test('the corpus still exercises the first-strong hazard', () => {
    const ltrFirst = PERSIAN_CORPUS.filter(l => firstStrongDirection(l) === 'ltr')
    assert.ok(
      ltrFirst.length >= 10,
      `only ${ltrFirst.length} corpus lines open with a strong LTR character — the corpus no longer covers the bug`,
    )
    // Every line is Persian prose; none should be genuinely left-to-right.
    for (const line of PERSIAN_CORPUS) {
      assert.ok(/[\u0600-\u06FF]/.test(line), `not Persian: ${line}`)
    }
  })

  await test('default mode does not resolve direction from the first character', () => {
    const rule = messageTextRule(buildCss(RTL))
    assert.match(rule, /direction: rtl !important/)
    assert.doesNotMatch(
      rule,
      /unicode-bidi: plaintext/,
      'first-strong resolution mis-aligns the ~40% of Persian lines that open with a Latin term',
    )
    assert.match(rule, /text-align: right !important/)
  })

  await test('lists carry the base direction, so markers and indent follow the text', () => {
    // ::marker sits on the side given by the list item's `direction`, and the UA
    // indent resolves against the list's — both stay left if only `li` is styled.
    const rule = messageTextRule(buildCss(RTL))
    assert.match(rule, /\bul\b/)
    assert.match(rule, /\bol\b/)
    assert.match(rule, /\bli\b/)
  })

  await test('inline code keeps LTR order without being force-aligned', () => {
    const css = buildCss(RTL)
    const isolation = css.slice(css.indexOf('Isolation keeps'), css.indexOf('Alignment is pinned'))
    assert.match(isolation, /\bcode\b/)
    assert.match(isolation, /direction: ltr !important/)
    assert.match(isolation, /unicode-bidi: isolate !important/)

    // text-align applies to block boxes only — never to a bare inline <code>.
    const alignment = css.slice(css.indexOf('Alignment is pinned'), css.indexOf('Column order'))
    assert.match(alignment, /text-align: left !important/)
    assert.doesNotMatch(alignment, /(?:^|[(,\s])code[),\s]/, 'inline <code> must not be force-aligned')
  })

  await test('the composer resolves per paragraph in both modes', () => {
    for (const opts of [RTL, AUTO]) {
      const css = buildCss(opts)
      const composer = css.slice(css.indexOf('Composer'), css.indexOf('Layout safety'))
      assert.match(composer, /textarea/)
      assert.match(composer, /unicode-bidi: plaintext !important/)
    }
  })

  await test('auto mode restores per-paragraph resolution as an opt-in', () => {
    const rule = messageTextRule(buildCss(AUTO))
    assert.match(rule, /unicode-bidi: plaintext !important/)
    assert.doesNotMatch(rule, /direction: rtl/)
    // Lists stay LTR in auto mode: a mostly-English chat wants left markers.
    assert.doesNotMatch(rule, /,\s*ul,\s*ol\)/)
  })

  await test('the two modes produce different stylesheets', () => {
    assert.notEqual(buildCss(RTL), buildCss(AUTO))
    assert.match(buildCss(RTL), /base direction: rtl/)
    assert.match(buildCss(AUTO), /base direction: auto/)
  })

  group('physical properties set by the host')

  /** The section that translates the host's physical indent/border into logical ones. */
  function physicalSection(css: string): string {
    const marker = css.indexOf('Physical properties set by the host')
    if (marker === -1) {
      return ''
    }
    // The marker sits inside a comment: back up to its opener, then strip every
    // comment so selector extraction never reads prose as CSS.
    const start = css.lastIndexOf('/*', marker)
    return css.slice(start).replace(/\/\*[\s\S]*?\*\//g, '')
  }

  await test('list indent moves to the logical start side', () => {
    const section = physicalSection(buildCss(RTL))
    assert.ok(section, 'physical-property section missing in rtl mode')
    // Antigravity indents with `[&_ol]:pl-10` / `[&>ol]:!pl-4` — physical, so it
    // stays on the left under an RTL base and the marker has nowhere to sit.
    assert.match(section, /:is\(ul, ol\)\s*\{\s*padding-left: 0 !important/)
    assert.match(section, /padding-inline-start: 2\.5rem !important/)
  })

  await test('task lists keep their zero indent', () => {
    const section = physicalSection(buildCss(RTL))
    assert.match(section, /:is\(ul, ol\):not\(\.contains-task-list\)[^{]*\{\s*padding-inline-start/)
  })

  await test('the quote bar moves to the logical start side', () => {
    const section = physicalSection(buildCss(RTL))
    // Antigravity draws it with an inline `borderLeft`; !important in a stylesheet still wins.
    assert.match(section, /blockquote[^{]*\{\s*border-left: none !important;\s*border-inline-start: 4px solid/)
  })

  await test('the specificity calculator agrees with known values', () => {
    assert.deepEqual(specificity('html.rtl-agents-on :is(.a, .b) :is(ul, ol)'), [0, 2, 2])
    assert.deepEqual(specificity('html :is(.a, .b) :is(ul, ol)'), [0, 1, 2])
    assert.deepEqual(specificity('.u > ol:not(.t)'), [0, 2, 1])
    assert.deepEqual(specificity(':where(.a, #b) p'), [0, 0, 1])
    assert.deepEqual(specificity('#x .y::before'), [1, 1, 1])
    // html + body + ul are three type selectors.
    assert.deepEqual(specificity('html.rtl-agents-on.rtl-agents-standalone body :is(ul, ol)'), [0, 2, 3])
  })

  await test('every physical-fix selector outranks the host rule it overrides', () => {
    // Antigravity's `[&>ol:not(.contains-task-list)]:!pl-4` compiles to
    // `.<utility> > ol:not(.contains-task-list)`: specificity (0,2,1), !important.
    // Both sides are !important, so specificity decides — and a selector list is
    // only as strong as its weakest member, so each one must win on its own.
    const section = physicalSection(buildCss(RTL))
    const group = section.match(/([^{}]+)\{\s*padding-left: 0 !important/)?.[1] ?? ''
    const selectors = splitTopLevel(group)
    assert.ok(selectors.length >= 2, `expected panel + standalone selectors, got: ${group.trim()}`)
    const host: Specificity = [0, 2, 1]
    for (const sel of selectors) {
      const ours = specificity(sel)
      assert.ok(
        compareSpecificity(ours, host) > 0,
        `(${ours}) does not beat the host's (${host}) for "${sel.trim()}"`,
      )
    }
  })

  await test('physical fixes are absent in auto mode, where lists stay LTR', () => {
    const css = buildCss(AUTO)
    assert.equal(physicalSection(css), '')
    assert.doesNotMatch(css, /padding-inline-start/)
    assert.doesNotMatch(css, /border-inline-start/)
  })

  await test('the physical section applies to the standalone agent window too', () => {
    const section = physicalSection(buildCss(RTL))
    assert.match(section, /html\.rtl-agents-on\.rtl-agents-standalone body :is\(ul, ol\)/)
    assert.match(section, /html\.rtl-agents-on\.rtl-agents-standalone body blockquote/)
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

  console.log(`\n${passed} passed, ${failed} failed\n`)
  await fs.rm(inst.appRoot, { recursive: true, force: true })
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
