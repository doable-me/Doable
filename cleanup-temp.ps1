Set-Location c:\Users\gj\Documents\workspace\doable
$files = @("do-commit.cmd","do-commit.ps1","do-commit2.ps1","git-log-output.txt","commit-result.log")
foreach ($f in $files) {
    if (Test-Path $f) { Remove-Item $f -Force; Write-Host "Deleted: $f" }
    else { Write-Host "Not found: $f" }
}
Write-Host "`n--- Git Status ---"
git status --short
Write-Host "`n--- Pushing to origin main ---"
git push origin main 2>&1
Write-Host "`nDONE"
Remove-Item .\cleanup-temp.ps1 -Force
