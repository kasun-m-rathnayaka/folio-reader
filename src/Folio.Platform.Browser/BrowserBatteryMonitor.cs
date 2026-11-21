using Folio.Application.Common.Interfaces;
using Microsoft.JSInterop;

namespace Folio.Platform.Browser;

/// <summary>Battery Status API where the browser has it (Chromium); elsewhere reports "on mains, level unknown".</summary>
public sealed class BrowserBatteryMonitor(BrowserJs js) : IBatteryMonitor, IDisposable
{
    private DotNetObjectReference<BrowserBatteryMonitor>? _reference;
    public bool IsRunningOnBattery { get; private set; }
    public int? BatteryPercent { get; private set; }

    public async Task StartAsync()
    {
        _reference ??= DotNetObjectReference.Create(this);
        try { await js.InvokeAsync<bool>("watchBattery", _reference); } catch (JSException) { }
    }

    [JSInvokable] public void OnBattery(bool onBattery, int percent) { IsRunningOnBattery = onBattery; BatteryPercent = percent; }

    public void Dispose() => _reference?.Dispose();
}
