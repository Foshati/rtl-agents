import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  dts: false,
  clean: true,
  minify: true,
  external: ['vscode'],
  outExtension: () => ({ js: '.js' }),
})
