using Folio.Domain.Geometry;
using Microsoft.JSInterop;

namespace Folio.UI.Services;

/// <summary>
/// Strongly-typed Blazor-to-JavaScript interop bridge controlling the pdf.js viewer engine (ADR-005).
/// </summary>
public class ReaderJsBridge : IAsyncDisposable
{
    private readonly IJSRuntime _jsRuntime;

    public ReaderJsBridge(IJSRuntime jsRuntime)
    {
        _jsRuntime = jsRuntime;
    }

    public async ValueTask InitAsync(string containerId, object dotNetHelper)
    {
        await _jsRuntime.InvokeVoidAsync("folioReader.init", containerId, dotNetHelper);
    }

    public async ValueTask GoToPageAsync(int pageIndex, double offsetPercent = 0.0)
    {
        await _jsRuntime.InvokeVoidAsync("folioReader.goToPage", pageIndex, offsetPercent);
    }

    public async ValueTask SetZoomAsync(double zoom)
    {
        await _jsRuntime.InvokeVoidAsync("folioReader.setZoom", zoom);
    }

    public async ValueTask SetFitWidthAsync()
    {
        await _jsRuntime.InvokeVoidAsync("folioReader.setFitWidth");
    }

    public async ValueTask SetFitPageAsync()
    {
        await _jsRuntime.InvokeVoidAsync("folioReader.setFitPage");
    }

    public async ValueTask SetLayoutModeAsync(string mode)
    {
        await _jsRuntime.InvokeVoidAsync("folioReader.setLayoutMode", mode);
    }

    public async ValueTask SetRotationAsync(int degrees)
    {
        await _jsRuntime.InvokeVoidAsync("folioReader.setRotation", degrees);
    }

    public async ValueTask SearchAsync(string query, bool forward = true)
    {
        await _jsRuntime.InvokeVoidAsync("folioReader.search", query, forward);
    }

    public async ValueTask ClearSearchAsync()
    {
        await _jsRuntime.InvokeVoidAsync("folioReader.clearSearch");
    }

    public async ValueTask<PageTextPayload?> GetPageTextAsync(int pageIndex)
    {
        return await _jsRuntime.InvokeAsync<PageTextPayload?>("folioReader.getPageText", pageIndex);
    }

    public async ValueTask DrawAnnotationsAsync(int pageIndex, object annotations)
    {
        await _jsRuntime.InvokeVoidAsync("folioReader.drawAnnotations", pageIndex, annotations);
    }

    public async ValueTask PulseAnnotationAsync(Guid annotationId)
    {
        await _jsRuntime.InvokeVoidAsync("folioReader.pulseAnnotation", annotationId.ToString());
    }

    public async ValueTask SetDogEarAsync(int pageIndex, bool isFolded)
    {
        await _jsRuntime.InvokeVoidAsync("folioReader.setDogEar", pageIndex, isFolded);
    }

    public async ValueTask ClearSelectionBoxAsync()
    {
        await _jsRuntime.InvokeVoidAsync("folioReader.clearSelectionBox");
    }

    public async ValueTask ApplyThemeAsync(object themeConfig)
    {
        await _jsRuntime.InvokeVoidAsync("folioReader.applyTheme", themeConfig);
    }

    public async ValueTask DisposeAsync()
    {
        try
        {
            await _jsRuntime.InvokeVoidAsync("folioReader.dispose");
        }
        catch
        {
            // Ignore disposal errors on teardown
        }
    }
}

public record PageTextItem(string Str, NormalizedRect Rect);
public record PageTextPayload(string Text, List<PageTextItem> Items);


