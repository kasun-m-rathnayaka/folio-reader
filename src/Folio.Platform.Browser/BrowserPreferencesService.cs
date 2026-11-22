using System.Text.Json;
using Folio.Application.Common.Interfaces;
using Microsoft.JSInterop;

namespace Folio.Platform.Browser;

/// <summary>Preferences in <c>localStorage</c>; WebAssembly's in-process runtime allows synchronous reads.</summary>
public sealed class BrowserPreferencesService(IJSRuntime js) : IAppPreferencesService
{
    private const string Key = "folio.preferences";
    private AppPreferences? _current;

    public AppPreferences Current => _current ??= Load();

    public void Save(AppPreferences preferences)
    {
        preferences = preferences with { FontScale = Math.Clamp(preferences.FontScale, 1, 2) };
        try { ((IJSInProcessRuntime)js).InvokeVoid("localStorage.setItem", Key, JsonSerializer.Serialize(preferences)); }
        catch (JSException) { /* Storage blocked (private mode): keep the choice for this session only. */ }
        _current = preferences;
    }

    private AppPreferences Load()
    {
        try
        {
            var json = ((IJSInProcessRuntime)js).Invoke<string?>("localStorage.getItem", Key);
            if (!string.IsNullOrWhiteSpace(json)) return JsonSerializer.Deserialize<AppPreferences>(json) ?? Defaults();
        }
        catch (JSException) { }
        catch (JsonException) { }
        return Defaults();
    }

    // Dark-first, as on desktop (SPEC: visual design system).
    private static AppPreferences Defaults() => new();
}
