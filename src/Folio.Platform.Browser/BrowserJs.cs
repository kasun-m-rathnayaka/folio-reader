using Microsoft.JSInterop;

namespace Folio.Platform.Browser;

/// <summary>Lazily imports <c>folio-browser.js</c> once and forwards calls to it.</summary>
public sealed class BrowserJs(IJSRuntime js) : IAsyncDisposable
{
    private Task<IJSObjectReference>? _module;
    private Task<IJSObjectReference> Module => _module ??= js.InvokeAsync<IJSObjectReference>("import", "./_content/Folio.Platform.Browser/folio-browser.js").AsTask();

    public async ValueTask<T> InvokeAsync<T>(string identifier, params object?[] args) => await (await Module).InvokeAsync<T>(identifier, args);
    public async ValueTask InvokeVoidAsync(string identifier, params object?[] args) => await (await Module).InvokeVoidAsync(identifier, args);

    public async ValueTask DisposeAsync()
    {
        if (_module is { IsCompletedSuccessfully: true }) await _module.Result.DisposeAsync();
    }
}
