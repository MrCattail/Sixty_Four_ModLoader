Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ModLoaderModifierKeys {
    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int virtualKey);
}
'@

$states = @{ Alt = $false; Control = $false; Shift = $false }
$keys = @(
    @{ Name = 'Alt'; Code = 'AltLeft'; KeyCode = 18; VirtualKey = 0x12 },
    @{ Name = 'Control'; Code = 'ControlLeft'; KeyCode = 17; VirtualKey = 0x11 },
    @{ Name = 'Shift'; Code = 'ShiftLeft'; KeyCode = 16; VirtualKey = 0x10 }
)

while ($true) {
    foreach ($key in $keys) {
        $pressed = ([ModLoaderModifierKeys]::GetAsyncKeyState($key.VirtualKey) -band 0x8000) -ne 0
        if ($pressed -eq $states[$key.Name]) { continue }
        $states[$key.Name] = $pressed
        $eventType = if ($pressed) { 'keydown' } else { 'keyup' }
        $line = '{0}|{1}|{2}|{3}|{4}|{5}|{6}' -f $eventType, $key.Name, $key.Code, $key.KeyCode, ([int]$states.Alt), ([int]$states.Control), ([int]$states.Shift)
        [Console]::Out.WriteLine($line)
        [Console]::Out.Flush()
    }
    Start-Sleep -Milliseconds 16
}
