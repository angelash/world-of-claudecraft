# Windows stack helper

Use `windows_stack.ps1` when an old Windows service owns ports `5173` and `8787`
and blocks normal repo-managed restarts.

```powershell
# inspect the current owners
powershell -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 status

# one-time cleanup, run from an elevated PowerShell window
powershell -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 unregister-service

# then close that elevated window and run this from a normal PowerShell window
powershell -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 start
powershell -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 restart
powershell -ExecutionPolicy Bypass -File .\scripts\windows_stack.ps1 stop
```

The script launches `node scripts/online_lan.mjs --restart` in the background,
stores PID metadata under `tmp/stack/launcher.json`, and writes stdout/stderr
logs into `tmp/stack/`. Because it delegates to `online_lan.mjs`, it must keep
LAN/IP binding and printed LAN URLs working for other devices on the network.

Add `-RemoveWrapperDirectory` if you also want to delete the old
`C:\Services\WorldOfClaudeCraftStack` wrapper files after the SCM entry is gone.

Do not start the stack from the same elevated window that removed the service.
That produces high-integrity `node` processes that a normal Codex session cannot
stop or restart later.
