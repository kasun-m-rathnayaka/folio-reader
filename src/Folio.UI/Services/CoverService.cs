using Folio.Domain.Entities;
using Microsoft.JSInterop;

namespace Folio.UI.Services;

/// <summary>The generated front cover and spine of a book as image URLs.</summary>
public sealed record CoverImages(string Front, string Spine);

/// <summary>
/// The 2D library and the no-WebGL fallback show the same generated covers as the 3D stage (WP5). The stage bundle paints them
/// (and caches them as images), so a 2D book is never the raw first page.
/// </summary>
public sealed class CoverService(IJSRuntime js)
{
    private IJSObjectReference? _module;
    private readonly Dictionary<string, Task<CoverImages?>> _cache = [];

    public Task<CoverImages?> GetAsync(Book book, string? coverUrl)
    {
        var key = $"{book.Id}|{book.Title}|{book.Author}|{coverUrl}";
        if (!_cache.TryGetValue(key, out var task)) _cache[key] = task = LoadAsync(book, coverUrl);
        return task;
    }

    private async Task<CoverImages?> LoadAsync(Book book, string? coverUrl)
    {
        try
        {
            _module ??= await js.InvokeAsync<IJSObjectReference>("import", "./_content/Folio.UI/js/stage.bundle.mjs");
            return await _module.InvokeAsync<CoverImages?>("bookImages", new
            {
                id = book.Id.ToString(), title = book.Title, author = book.Author, pages = book.PageCount, coverUrl, color = (string?)null, progress = 0,
            });
        }
        catch (Exception ex) when (ex is JSException or JSDisconnectedException or InvalidOperationException) { return null; }
    }
}
