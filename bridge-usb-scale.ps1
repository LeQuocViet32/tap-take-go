param(
  [string]$Port = "COM5",
  [string]$SlotId = "KH1_1",
  [string]$ServerUrl = "http://localhost:5000/api/shelves/sensor-reading",
  [int]$BaudRate = 115200
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$SlotId = $SlotId.Trim().ToUpper()

Write-Host "=============================================================" -ForegroundColor Cyan
Write-Host "  CAU NOI USB SERIAL -> TAP TAKE GO ($SlotId)" -ForegroundColor Cyan
Write-Host "=============================================================" -ForegroundColor Cyan
Write-Host "  Cong Serial : $Port ($BaudRate baud)"
Write-Host "  O can muc tieu: $SlotId"
Write-Host "  Server API  : $ServerUrl"
Write-Host "  (Nhan Ctrl + C de dung va giai phong cong COM)" -ForegroundColor DarkGray
Write-Host ""

$availablePorts = [System.IO.Ports.SerialPort]::GetPortNames()
if ($availablePorts -notcontains $Port) {
  Write-Host "[!] Khong tim thay $Port. Cac cong hien co: $($availablePorts -join ', ')" -ForegroundColor Yellow
  if ($availablePorts.Count -eq 0) { exit 1 }
}

$serial = New-Object System.IO.Ports.SerialPort($Port, $BaudRate, [System.IO.Ports.Parity]::None, 8, [System.IO.Ports.StopBits]::One)
$serial.NewLine = "`n"
$serial.ReadTimeout = 500
$serial.DtrEnable = $false
$serial.RtsEnable = $false

try {
  $serial.Open()
  Write-Host "[OK] Da mo cong $Port. Dang cho du lieu JSON tu ESP32..." -ForegroundColor Green

  $lastSentWeight = $null
  $lastSentStable = $null
  $lastSentTime = [DateTime]::MinValue

  while ($true) {
    try {
      $line = $serial.ReadLine().Trim()
    } catch [System.TimeoutException] {
      continue
    }

    if (-not ($line.StartsWith("{") -and $line.EndsWith("}"))) {
      continue
    }

    try {
      $data = $line | ConvertFrom-Json
    } catch {
      continue
    }

    if ($null -eq $data.weight) {
      Write-Host "[ESP32] $line" -ForegroundColor DarkGray
      continue
    }

    $w = [double]$data.weight
    $isStable = if ($null -ne $data.stable) { [bool]$data.stable } else { $true }
    $pcs = if ($null -ne $data.pcs) { [int]$data.pcs } else { $null }
    $now = Get-Date

    $weightChanged = ($null -eq $lastSentWeight) -or ([Math]::Abs($w - $lastSentWeight) -ge 0.2)
    $stableChanged = ($isStable -ne $lastSentStable)
    $heartbeatDue = (($now - $lastSentTime).TotalMilliseconds -ge 1500)

    if ($weightChanged -or $stableChanged -or $heartbeatDue) {
      $payloadObj = @{
        slot_id = $SlotId
        weight  = $w
        stable  = $isStable
      }
      if ($null -ne $pcs) { $payloadObj.pcs = $pcs }

      $jsonBody = $payloadObj | ConvertTo-Json -Compress
      try {
        $resp = Invoke-RestMethod -Uri $ServerUrl -Method Post -ContentType "application/json" -Body $jsonBody -TimeoutSec 2
        $lastSentWeight = $w
        $lastSentStable = $isStable
        $lastSentTime = $now

        $stableText = if ($isStable) { "On dinh" } else { "Dang can..." }
        $cartNote = if ($resp.cartUpdated) { " | +Cap nhat gio hang!" } else { "" }
        Write-Host ("[{0}] {1}: {2}g ({3} pcs) [{4}]{5}" -f $now.ToString("HH:mm:ss"), $SlotId, $w, $pcs, $stableText, $cartNote) -ForegroundColor Gray
      } catch {
        Write-Host ("[Loi Server] $($_.Exception.Message)") -ForegroundColor Red
      }
    }
  }
} catch {
  Write-Host "[LOI MO CONG $Port] $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Goi y: Hay dong Serial Monitor trong Arduino IDE (neu dang mo) roi chay lai." -ForegroundColor Yellow
  exit 1
} finally {
  if ($serial -and $serial.IsOpen) {
    $serial.Close()
  }
  if ($serial) {
    $serial.Dispose()
  }
}
