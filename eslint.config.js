import antfu from '@antfu/eslint-config'

export default antfu(
  {},
  {
    // The test runner reports its results on stdout.
    files: ['test/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
)
