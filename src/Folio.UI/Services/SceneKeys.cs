using Microsoft.JSInterop;

namespace Folio.UI.Services;

/// <summary>
/// Library keyboard shortcuts (SPEC: interactions). One window listener in folio-shell.js forwards keys that are not
/// typed into a field, a dialog or a focused button's native activation; the active page handles them.
/// </summary>
public sealed class SceneKeys(IJSRuntime js) : IAsyncDisposable
{
    private DotNetObjectReference<SceneKeys>? _reference;
    private Func<string, bool, Task>? _handler;

    /// <summary>Makes <paramref name="handler"/> (key, shift) the receiver until the returned lease is disposed.</summary>
    public async Task<IAsyncDisposable> AttachAsync(Func<string, bool, Task> handler)
    {
        _handler = handler;
        _reference ??= DotNetObjectReference.Create(this);
        await js.InvokeVoidAsync("folioShell.setSceneKeyTarget", _reference);
        return new Lease(this, handler);
    }

    [JSInvokable] public Task OnSceneKey(string key, bool shift) => _handler?.Invoke(key, shift) ?? Task.CompletedTask;

    private async Task DetachAsync(Func<string, bool, Task> handler)
    {
        if (_handler != handler) return;
        _handler = null;
        try { await js.InvokeVoidAsync("folioShell.setSceneKeyTarget", null); } catch (JSDisconnectedException) { }
    }

    public ValueTask DisposeAsync() { _reference?.Dispose(); return ValueTask.CompletedTask; }

    private sealed class Lease(SceneKeys owner, Func<string, bool, Task> handler) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync() => await owner.DetachAsync(handler);
    }
}
