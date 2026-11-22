using Folio.UI.Stage;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace Folio.UI.Services;

/// <summary>
/// Navigation between library views and the reader. Opening a book remembers where it was opened from so closing
/// returns there. With the 3D stage and full motion the book opens in 3D and hands off to the reader (OPN-1, OPN-2);
/// otherwise a View Transition morphs the 2D book into the reader (OPN-3).
/// </summary>
public sealed class FolioNavigator(NavigationManager navigation, IJSRuntime js, StageState stage)
{
    // Last resort only: the stage hands off in < 900 ms, and a reader error ends the transition at once (ReaderView).
    private const int HandoffTimeoutMs = 10_000;
    private string? _returnUrl;

    public string RelativePath => navigation.ToBaseRelativePath(navigation.Uri);

    public void Go(string url, bool replace = false) => navigation.NavigateTo(url, replace: replace);

    /// <param name="sourceElementId">The 2D element (cover or book) that morphs into the reader page.</param>
    public async Task OpenBookAsync(Guid bookId, int? pageIndex = null, string? sourceElementId = null)
    {
        if (!FolioRoutes.IsReader(RelativePath)) _returnUrl = RelativePath.Length == 0 ? FolioRoutes.Home : RelativePath;
        var url = FolioRoutes.Read(bookId, pageIndex);
        if (await stage.BeginOpenAsync(bookId))
        {
            navigation.NavigateTo(url);
            // If the reader never reports its page (missing PDF, password), finish the crossfade anyway.
            if (!stage.ReadingSpread) _ = Task.Delay(HandoffTimeoutMs).ContinueWith(_ => stage.CompleteHandoffAsync(), TaskScheduler.Default);
            return;
        }
        try { await js.InvokeVoidAsync("folioShell.navigateWithTransition", url, sourceElementId, ".folio-reader-viewport"); }
        catch (JSException) { navigation.NavigateTo(url); }
    }

    /// <summary>Leaves the reader for the view it was opened from (or the library home after a deep link).</summary>
    public async Task CloseBookAsync(Guid bookId)
    {
        var url = _returnUrl ?? FolioRoutes.Home;
        _returnUrl = null;
        if (stage.ReadingSpread && stage.Phase is StagePhase.Reading or StagePhase.Opening)
        {
            // 3D reading: the cover shuts and the book returns to its slot while the library appears (WP6).
            await stage.BeginCloseReadingAsync();
            navigation.NavigateTo(url);
            _ = Task.Delay(4000).ContinueWith(_ => stage.EndClose(), TaskScheduler.Default);   // safety net if the stage never reports
            return;
        }
        if (stage.CanAnimateClose)
        {
            var rect = await js.InvokeAsync<PageRect?>("folioReader.currentPageRect");
            if (rect != null)
            {
                await stage.BeginCloseAsync(bookId, rect);
                await Task.Delay(130); // the 3D spread fades in over the reader first (OPN-2)
                navigation.NavigateTo(url);
                _ = Task.Delay(1500).ContinueWith(_ => stage.EndClose(), TaskScheduler.Default);
                return;
            }
        }
        try { await js.InvokeVoidAsync("folioShell.navigateWithTransition", url, ".folio-reader-viewport", $"[data-book-id=\"{bookId}\"] .folio-cssbook"); }
        catch (JSException) { navigation.NavigateTo(url); }
    }
}
