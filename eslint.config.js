import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/*.d.ts', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': 'error',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },
  {
    files: ['**/test/**/*.ts', '**/test/**/*.tsx'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  {
    // Probes are measurement scripts and the scripts directory is operator
    // tooling run from a terminal. Printing to it is the whole job.
    files: ['**/*.probe.ts', '**/scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
);
