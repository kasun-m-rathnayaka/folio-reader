namespace Folio.Application.Common.Interfaces;

/// <summary>
/// Port for hardware-accelerated PDF page rasterization (e.g. WinRT Windows.Data.Pdf).
/// </summary>
public interface IPdfRasterizer
{
    Task<string> RenderPageToImageAsync(
        string pdfPath,
        int pageIndex,
        string outputImagePath,
        uint targetDpi = 300,
        uint? maxDimensionPx = null,
        CancellationToken cancellationToken = default);
}
