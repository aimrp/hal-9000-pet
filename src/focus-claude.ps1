# Bring the running Claude desktop app window to the foreground.
# If it isn't running (no window), launch it via its Start-menu AppID.
$ErrorActionPreference = 'SilentlyContinue'

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinApi {
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr h, bool alt);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
}
"@

# The Claude desktop app runs as process "claude"; only its main window has a
# non-zero MainWindowHandle (helper processes and the claude-code CLI have 0).
$p = Get-Process claude -ErrorAction SilentlyContinue |
     Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } |
     Select-Object -First 1

if ($p) {
  $h = $p.MainWindowHandle
  if ([WinApi]::IsIconic($h)) { [WinApi]::ShowWindowAsync($h, 9) | Out-Null } # SW_RESTORE
  [WinApi]::SwitchToThisWindow($h, $true)
  [WinApi]::SetForegroundWindow($h) | Out-Null
  Write-Output "focused $($p.Id)"
} else {
  # not running with a window -> launch the Store app
  Start-Process "shell:AppsFolder\Claude_pzs8sxrjxfjjc!Claude"
  Write-Output "launched"
}
