import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

// 务实门禁：typescript-eslint recommended（不含 type-checked，快）+ 关掉与 prettier 冲突的格式规则。
// no-explicit-any 设为 error，锁死「消除 28 处 any」的成果、防回潮；unused-vars 降为 warn，
// 不因巨组件里的零散未用变量阻断（与 justdoit 主库一致的取舍）。
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  prettier,
)
