using Microsoft.JSInterop;

namespace Folio.UI.Stage;

/// <summary>Payload for one book on the stage (SPEC: bridge contract).</summary>
public sealed record StageBook(string Id, string Title, string? Author, int Pages, string? CoverUrl, string? Color, double Progress, string[] ShelfIds);
public sealed record StageShelf(string Id, string Name);
public sealed record StageInitResult(bool Ok, string? Reason, string? Renderer, string? Detail);

/// <summary>
/// C# side of the stage bridge, the same module-import pattern as <see cref="Services.ReaderJsBridge"/>. Only state
/// changes cross it; the frame loop stays in JavaScript.
/// </summary>
public sealed class StageJsBridge(IJSRuntime js) : IAsyncDisposable
{
    private IJSObjectReference? _module;

    private async ValueTask<IJSObjectReference> Module() =>
        _module ??= await js.InvokeAsync<IJSObjectReference>("import", "./_content/Folio.UI/js/stage.bundle.mjs");

    public async ValueTask<StageInitResult> InitAsync(string canvasId, object options, object dotNetRef) =>
        await (await Module()).InvokeAsync<StageInitResult>("init", canvasId, options, dotNetRef);

    public async ValueTask SetLibraryAsync(IReadOnlyList<StageBook> books, IReadOnlyList<StageShelf> shelves, IReadOnlyList<string>? visibleIds) =>
        await (await Module()).InvokeVoidAsync("setLibrary", books, shelves, visibleIds);

    public async ValueTask SetSceneAsync(StageScene scene) =>
        await (await Module()).InvokeVoidAsync("setScene", new { kind = scene.Kind, bookId = scene.BookId?.ToString(), shelfId = scene.ShelfId?.ToString(), page = scene.Page });

    public async ValueTask<bool> BeginOpenAsync(Guid id) => await (await Module()).InvokeAsync<bool>("beginOpen", id.ToString());
    public async ValueTask AlignToAsync(PageRect rect) => await (await Module()).InvokeVoidAsync("alignTo", new { x = rect.X, y = rect.Y, width = rect.Width, height = rect.Height });
    public async ValueTask BeginCloseAsync(Guid id, PageRect rect, StageScene scene) =>
        await (await Module()).InvokeVoidAsync("beginClose", id.ToString(), new { x = rect.X, y = rect.Y, width = rect.Width, height = rect.Height },
            new { kind = scene.Kind, bookId = scene.BookId?.ToString(), shelfId = scene.ShelfId?.ToString() });

    public async ValueTask FocusBookAsync(Guid? id) => await (await Module()).InvokeVoidAsync("focusBook", id?.ToString());
    public async ValueTask SetMotionAsync(string level) => await (await Module()).InvokeVoidAsync("setMotion", level);
    public async ValueTask SetQualityAsync(string level) => await (await Module()).InvokeVoidAsync("setQuality", level);
    public async ValueTask SetThemeAsync(string theme) => await (await Module()).InvokeVoidAsync("setTheme", theme);
    public async ValueTask SetPausedAsync(bool paused) => await (await Module()).InvokeVoidAsync("setPaused", paused);

    public async ValueTask DisposeAsync()
    {
        if (_module == null) return;
        try { await _module.InvokeVoidAsync("dispose"); await _module.DisposeAsync(); }
        catch (JSDisconnectedException) { }
        catch (JSException) { }
        _module = null;
    }
}
