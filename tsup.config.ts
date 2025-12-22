import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  outExtension: () => ({ js: '.js' }),
  dts: false,
  clean: true,
  minify: true,
  external: ['vscode'],
})
