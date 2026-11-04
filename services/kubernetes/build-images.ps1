[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Registry,

    [Parameter(Mandatory = $true)]
    [string]$Tag,

    [switch]$Push
)

$ErrorActionPreference = "Stop"

if ($Registry -notmatch '^[a-zA-Z0-9.-]+(?::[0-9]+)?(?:/[a-zA-Z0-9._-]+)*$') {
    throw "Registry must be a hostname with an optional namespace path and no scheme or trailing slash."
}

if ($Tag -notmatch '^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$' -or $Tag -eq "latest") {
    throw "Tag must be a versioned, non-latest Docker tag (for example, a release version or commit SHA)."
}

$servicesRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$images = @(
    @{ Name = "ledger-service";       Context = "ledger-service";       Dockerfile = "Dockerfile" },
    @{ Name = "ip-whitelist-service"; Context = "ip-whitelist-service"; Dockerfile = "Dockerfile" },
    @{ Name = "auth-service";         Context = "auth-service";         Dockerfile = "Dockerfile" },
    @{ Name = "terminal-service";     Context = ".";                    Dockerfile = "terminal-service/Dockerfile" },
    @{ Name = "transfer-service";     Context = "transfer-service";     Dockerfile = "Dockerfile" },
    @{ Name = "risk-service";         Context = "risk-service";         Dockerfile = "Dockerfile" },
    @{ Name = "audit-service";        Context = "audit-service";        Dockerfile = "Dockerfile" },
    @{ Name = "api-gateway";          Context = "api-gateway-service";  Dockerfile = "Dockerfile" },
    @{ Name = "settlement-service";   Context = "settlement-service";   Dockerfile = "Dockerfile" },
    @{ Name = "notification-service"; Context = "notification-service"; Dockerfile = "Dockerfile" },
    @{ Name = "switch-core";          Context = "switch-core";          Dockerfile = "Dockerfile" },
    @{ Name = "security-service";     Context = "security-service";     Dockerfile = "Dockerfile" },
    @{ Name = "routing-service";      Context = "routing-service";      Dockerfile = "Dockerfile" },
    @{ Name = "iso8583-gateway";      Context = ".";                    Dockerfile = "iso8583-gateway/Dockerfile" }
)

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker CLI was not found. Install Docker and ensure it is available on PATH."
}

foreach ($service in $images) {
    $contextPath = Join-Path $servicesRoot $service.Context
    $dockerfilePath = Join-Path $servicesRoot (Join-Path $service.Context $service.Dockerfile)
    $image = "$($Registry.TrimEnd('/'))/primestack/$($service.Name):$Tag"

    Write-Host "Building $image"
    & docker build --file $dockerfilePath --tag $image $contextPath
    if ($LASTEXITCODE -ne 0) {
        throw "Docker build failed for $($service.Name) with exit code $LASTEXITCODE."
    }

    if ($Push) {
        Write-Host "Pushing $image"
        & docker push $image
        if ($LASTEXITCODE -ne 0) {
            throw "Docker push failed for $($service.Name) with exit code $LASTEXITCODE."
        }
    }
}

Write-Host "Built $($images.Count) images with tag '$Tag'."
if (-not $Push) {
    Write-Host "Images remain local. Re-run with -Push to publish them."
}
