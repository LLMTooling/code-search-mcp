# Biome Migration PRD

## Overview
Migrate the codebase from ESLint + TypeScript ESLint to Biome for linting and formatting. Biome is faster and provides comparable functionality with better performance.

## Constraints
- **DO NOT modify any existing test files** (`tests/**/*.test.ts`)
- All tests must pass after migration
- Type checking must pass (`npm run typecheck`)
- Zero Biome issues/diagnostics
- Work in the `biome-migration` branch

## Current State Analysis
- Using `eslint.config.js` with TypeScript ESLint
- ESLint uses: `strictTypeChecked`, `stylisticTypeChecked` configs
- Key rules: no-unused-vars, no-explicit-any, prefer-optional-chain, etc.
- Lint scripts in package.json: `lint`, `lint:fix`

## Migration Tasks

### Phase 1: Setup & Installation
- [ ] Install `@biomejs/biome` as dev dependency
- [ ] Initialize Biome configuration (`npx @biomejs/biome init`)
- [ ] Create `biome.json` configuration that matches ESLint rules

### Phase 2: Configuration Mapping
Map ESLint rules to Biome equivalent rules:
- [ ] `no-unused-vars` → Biome's unused variables
- [ ] `no-explicit-any` → Biome's explicit any restriction
- [ ] `prefer-nullish-coalescing` → Biome's style
- [ ] `prefer-optional-chain` → Biome's suggested style
- [ ] `require-await` → Biome lint rules
- [ ] `no-unnecessary-condition` → Biome lint rules
- [ ] `restrict-template-expressions` → Configure appropriately
- [ ] `no-non-null-assertion` → Biome lint rules
- [ ] Configure ignores (dist, node_modules, coverage)

### Phase 3: Source File Migration (NON-TEST FILES ONLY)
Apply Biome fixes to all TypeScript files in `src/` directory:
- [ ] Run Biome check to see all issues: `npx @biomejs/biome check src/`
- [ ] Run Biome with --write to auto-fix: `npx @biomejs/biome check --write src/`
- [ ] For any remaining manual fixes, address them one file at a time
- [ ] Verify no Biome errors remain in source files

### Phase 4: Package.json Updates
- [ ] Update `lint` script to use Biome
- [ ] Update `lint:fix` script to use Biome
- [ ] Consider adding `biome check --write` to pre-commit hooks if desired

### Phase 5: Cleanup
- [ ] Remove ESLint-related dependencies from package.json devDependencies:
  - `@eslint/js`
  - `@typescript-eslint/eslint-plugin`
  - `@typescript-eslint/parser`
  - `eslint`
  - `typescript-eslint`
- [ ] Delete `eslint.config.js`
- [ ] Run `npm install` to clean up

### Phase 6: Validation
- [ ] Run `npm run build` - must succeed
- [ ] Run `npm run typecheck` - must succeed with no errors
- [ ] Run `npm test` - all tests must pass
- [ ] Run Biome check - zero issues

## Completion Criteria
The migration is complete when:
1. `npm run build` succeeds
2. `npm run typecheck` succeeds (no TypeScript errors)
3. `npm test` passes all tests
4. `npx @biomejs/biome check .` reports zero diagnostics
5. ESLint is completely removed from the project
6. All commits are made to the `biome-migration` branch

## Notes
- When implementing, work on ONE task at a time
- Commit after each completed task
- **DO NOT add "Co-Authored-By" lines to commit messages**
- If tests fail, fix before proceeding
- If typecheck fails, fix before proceeding
- If Biome reports issues, fix before marking task complete
