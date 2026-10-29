param([switch]$WithPdfTools)
$ErrorActionPreference = 'Stop'
npm config set fetch-retries 5
npm config set fetch-retry-mintimeout 10000
npm config set fetch-retry-maxtimeout 120000

function Install-WithRetry([string[]]$Arguments) {
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    & npm @Arguments
    if ($LASTEXITCODE -eq 0) { return }
    if ($attempt -eq 3) {
      throw "npm $($Arguments -join ' ') falhou após três tentativas; revisar conectividade do runner."
    }
    Start-Sleep -Seconds (10 * $attempt)
  }
}
Install-WithRetry @('install','--no-audit','--no-fund')
if ($WithPdfTools) {
  Install-WithRetry @('install','--no-save','--no-audit','--no-fund','pdf-lib')
}
