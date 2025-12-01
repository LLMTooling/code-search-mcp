# GitHub Actions Workflows

## test.yml

Comprehensive test workflow for the code-search-mcp project.

### Triggers

This workflow runs automatically on:
- **Pull Requests** to `main` or `master` branches
- **Pushes** to `main` or `master` branches
- **Manual trigger** via GitHub UI (workflow_dispatch)

### Jobs

#### 1. `test` - Full Test Suite
Runs the complete test suite across multiple Node.js versions.

**Matrix Strategy:**
- Node.js 18.x
- Node.js 20.x

**Steps:**
1. Checkout code
2. Setup Node.js
3. Configure npm for GitHub Packages (for @LLMTooling scope)
4. Install dependencies
5. Build project
6. Run all tests
7. Upload test results (coverage, results)

#### 2. `test-ast-specific` - AST Search Tests
Dedicated job for testing AST search functionality.

**Steps:**
1. Checkout code
2. Setup Node.js 20.x
3. Configure npm for GitHub Packages
4. Install dependencies
5. Build project
6. Run AST unit tests
7. Run AST integration tests
8. Run AST MCP integration tests
9. Generate test summary

### Authentication

The workflow uses `GITHUB_TOKEN` to authenticate with GitHub Packages for:
- `@LLMTooling/universal-ctags-node`
- Other private GitHub packages in the `@LLMTooling` scope

This token is automatically provided by GitHub Actions.

### Manual Trigger

To manually run tests:

1. Go to the **Actions** tab in GitHub
2. Select **Tests** workflow
3. Click **Run workflow** button
4. Select branch
5. Click **Run workflow**

### Viewing Results

Test results are available in:
1. **Actions tab** - View workflow run logs
2. **Artifacts** - Download test results and coverage reports
3. **Summary** - View AST test summary in workflow output

### Test Coverage

The workflow tests:
- ✅ Symbol search (universal-ctags)
- ✅ Text search (ripgrep)
- ✅ File search
- ✅ Stack detection
- ✅ Dependency analysis
- ✅ AST search (ast-grep) - **NEW!**
  - Pattern matching
  - Rule-based search
  - Metavariable extraction
  - MCP integration

### Expected Behavior

**On Success:**
- ✅ All jobs complete with green checkmarks
- ✅ Test summary shows all tests passing
- ✅ PR can be merged

**On Failure:**
- ❌ Failed jobs show red X
- 📋 Click on failed job to see error logs
- 🔍 Review test output to identify issue
- 🛠️ Fix issue and push again

### Artifacts

Test results are uploaded and retained for 7 days:
- `test-results-node-18.x/` - Node 18.x results
- `test-results-node-20.x/` - Node 20.x results
- Coverage reports (if generated)

### Troubleshooting

#### Authentication Errors
If you see `401 Unauthorized` errors:
- Verify `GITHUB_TOKEN` has package read permissions
- Check that `.npmrc` is configured correctly
- Ensure `@LLMTooling` scope points to GitHub Packages

#### Test Failures
If tests fail:
1. Check the job logs for error messages
2. Look for specific test file that failed
3. Review error stack traces
4. Run tests locally to reproduce
5. Fix and push updated code

#### Dependency Issues
If `npm ci` fails:
- Check `package-lock.json` is up to date
- Verify all dependencies are available
- Check for platform-specific binary issues

### Local Testing

Before pushing, test locally:

```bash
# Install dependencies
npm install

# Build project
npm run build

# Run all tests
npm test

# Run specific AST tests
npm test -- tests/unit/ast-search.test.ts
npm test -- tests/integration/ast-search.test.ts
npm test -- tests/integration/ast-mcp-integration.test.ts
```

### Configuration

The workflow uses:
- `ubuntu-latest` runner (Linux)
- `npm ci` for reproducible installs
- `actions/checkout@v4`
- `actions/setup-node@v4`
- `actions/upload-artifact@v4`

### Status Badge

Add this badge to README.md to show test status:

```markdown
[![Tests](https://github.com/LLMTooling/code-search-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/LLMTooling/code-search-mcp/actions/workflows/test.yml)
```
