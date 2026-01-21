# Ralph Loop - Run Ralph iterations for Biome migration
# Usage: .\ralph-loop.ps1 [iterations]
# Example: .\ralph-loop.ps1 50

param(
    [Parameter(Mandatory=$true)]
    [int]$Iterations
)

$ErrorActionPreference = "Stop"

Write-Host "=== Ralph Loop for Biome Migration ===" -ForegroundColor Cyan
Write-Host "Running up to $Iterations iterations..." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop at any time`n" -ForegroundColor Yellow

for ($i = 1; $i -le $Iterations; $i++) {
    Write-Host "`n=== Iteration $i / $Iterations ===" -ForegroundColor Green
    Write-Host "Time: $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Gray

    $result = claude --permission-mode acceptEdits -p "@PRD.md @progress.txt

1. Read PRD.md and progress.txt carefully.
2. Find the NEXT incomplete (unchecked) task from the PRD.
3. Implement ONLY that single task - do not attempt multiple tasks.
4. After implementing, run validation:
   - npm run build
   - npm run typecheck
   - npm test
5. If any validation fails, fix the issues before proceeding.
6. Update progress.txt by appending what you completed.
7. Check the corresponding checkbox in PRD.md.
8. Commit your changes with a descriptive message.

IMPORTANT CONSTRAINTS:
- DO NOT modify any test files (tests/**/*.test.ts)
- If a task would modify tests, note it in progress and skip to next task
- Only work on ONE task per iteration
- All builds, typechecks, and tests must pass before committing

If the PRD is complete (all checkboxes checked), output: <promise>COMPLETE</promise>"

    Write-Host "Result: $result"

    # Check for completion signal
    if ($result -like "*<promise>COMPLETE</promise>*") {
        Write-Host "`n=== MIGRATION COMPLETE after $i iterations ===" -ForegroundColor Green
        Write-Host "All PRD tasks have been completed!" -ForegroundColor Green
        exit 0
    }

    # Small delay between iterations to prevent rate limiting
    Start-Sleep -Seconds 2
}

Write-Host "`n=== Reached $Iterations iterations cap ===" -ForegroundColor Yellow
Write-Host "Migration may not be complete. Check PRD.md for remaining tasks." -ForegroundColor Yellow
