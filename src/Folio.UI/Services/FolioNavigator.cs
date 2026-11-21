using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace Folio.UI.Services;

/// <summary>
/// Navigation between library views and the reader. Opening a book remembers where it was opened from so closing
/// returns there, and uses a View Transition from the book to the reader where the browser supports it (OPN-3).
/// </summary>
public sealed class FolioNavigator(NavigationManager navigation, IJSRuntime js)
{
    private string? _returnUrl;

    public string RelativePath => navigation.ToBaseRelativePath(navigation.Uri);

    public void Go(string url, bool replace = false) => navigation.NavigateTo(url, replace: replace);

    /// <param name="sourceElementId">The element (cover or book) that morphs into the reader page.</param>
    public async Task OpenBookAsync(Guid bookId, int? pageIndex = null, string? sourceElementId = null)
    {
        if (!FolioRoutes.IsReader(RelativePath)) _returnUrl = "/" + RelativePath;
        var url = FolioRoutes.Read(bookId, pageIndex);
        try { await js.InvokeVoidAsync("folioShell.navigateWithTransition", url, sourceElementId, ".folio-reader-viewport"); }
        catch (JSException) { navigation.NavigateTo(url); }
    }

    /// <summary>Leaves the reader for the view it was opened from (or the library home after a deep link).</summary>
    public async Task CloseBookAsync(Guid bookId)
    {
        var url = _returnUrl ?? FolioRoutes.Home;
        _returnUrl = null;
        try { await js.InvokeVoidAsync("folioShell.navigateWithTransition", url, ".folio-reader-viewport", $"[data-book-id=\"{bookId}\"] .folio-cssbook"); }
        catch (JSException) { navigation.NavigateTo(url); }
    }
}
