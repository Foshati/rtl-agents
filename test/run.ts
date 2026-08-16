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
import { addRtl, getStatus, isFullyInstalled, removeRtl } from '../src/injector'

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

const OPTIONS = { customSelectors: [], extensionVersion: '2.0.0' }

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

  await test('CSS resolves direction natively, with no JS in the path', () => {
    const css = buildCss({ customSelectors: [] })
    assert.match(css, /unicode-bidi: plaintext/)
    assert.match(css, /html\.rtl-agents-on/)
    // The container Antigravity 2.5.5 renders each response paragraph into.
    assert.match(css, /\.animate-markdown/)
    assert.match(css, /rtl-agents-standalone/)
  })

  await test('CSS keeps code and table layout LTR', () => {
    const css = buildCss({ customSelectors: [] })
    const guard = css.slice(css.indexOf('Layout safety'))
    assert.match(guard, /\bpre\b/)
    assert.match(guard, /\bcode\b/)
    assert.match(guard, /html\.rtl-agents-on table \{\s*direction: ltr/)
  })

  await test('customSelectors reach the stylesheet', () => {
    assert.match(buildCss({ customSelectors: ['.my-chat'] }), /\.my-chat/)
  })

  await test('runtime is valid JS and avoids the v1 failure modes', () => {
    const js = buildJs({ customSelectors: [] })
    // eslint-disable-next-line no-new-func
    void new Function(js)
    assert.match(js, /\.statusbar-item/, 'must use the real VS Code status bar class')
    assert.doesNotMatch(js, /\.status-bar-item/, 'the hyphenated class matches nothing')
    assert.doesNotMatch(js, /command:rtl-agents/, 'command: hrefs do not work in the workbench')
    assert.doesNotMatch(js, /observe\(\s*(?:DOC|document)\.body/, 'no document-wide observer')
    assert.match(js, /selfDestruct/, 'must clean up when the extension goes away')
  })

  console.log(`\n${passed} passed, ${failed} failed\n`)
  await fs.rm(inst.appRoot, { recursive: true, force: true })
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
