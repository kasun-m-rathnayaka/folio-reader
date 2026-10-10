using Folio.Application.Common.Interfaces;
using Windows.Data.Pdf;
using Windows.Storage;
using Windows.Storage.Streams;

namespace Folio.Infrastructure.Rasterization;

/// <summary>
/// Hardware-accelerated PDF page rasterization using Windows.Data.Pdf (WinRT).
/// Produces page thumbnails and OCR bitmap targets within performance budgets (FR-LIB-03, FR-OCR-02).
/// </summary>
public class WinRtPdfRasterizer : IPdfRasterizer
{
    public async Task<string> RenderPageToImageAsync(
        string pdfPath,
        int pageIndex,
        string outputImagePath,
        uint targetDpi = 300,
        uint? maxDimensionPx = null,
        CancellationToken cancellationToken = default)
    {
        if (!File.Exists(pdfPath))
        {
            throw new FileNotFoundException($"PDF file not found: {pdfPath}", pdfPath);
        }

        string fullPdfPath = Path.GetFullPath(pdfPath);
        var storageFile = await StorageFile.GetFileFromPathAsync(fullPdfPath);
        var doc = await PdfDocument.LoadFromFileAsync(storageFile);

        if (pageIndex < 0 || pageIndex >= doc.PageCount)
        {
            throw new ArgumentOutOfRangeException(
                nameof(pageIndex),
                $"Page index {pageIndex} is out of bounds [0, {doc.PageCount - 1}].");
        }

        using var page = doc.GetPage((uint)pageIndex);

        double dpiScale = targetDpi / 72.0;
        uint targetWidth = (uint)Math.Max(1, Math.Round(page.Size.Width * dpiScale));
        uint targetHeight = (uint)Math.Max(1, Math.Round(page.Size.Height * dpiScale));

        if (maxDimensionPx.HasValue && (targetWidth > maxDimensionPx.Value || targetHeight > maxDimensionPx.Value))
        {
            double scale = (double)maxDimensionPx.Value / Math.Max(targetWidth, targetHeight);
            targetWidth = (uint)Math.Max(1, Math.Round(targetWidth * scale));
            targetHeight = (uint)Math.Max(1, Math.Round(targetHeight * scale));
        }

        using var memoryStream = new InMemoryRandomAccessStream();
        var renderOptions = new PdfPageRenderOptions
        {
            DestinationWidth = targetWidth,
            DestinationHeight = targetHeight
        };

        await page.RenderToStreamAsync(memoryStream, renderOptions);

        string? dir = Path.GetDirectoryName(outputImagePath);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }

        await using var outputStream = new FileStream(
            outputImagePath,
            FileMode.Create,
            FileAccess.Write,
            FileShare.None,
            bufferSize: 81920,
            useAsync: true);

        memoryStream.Seek(0);
        using var readStream = memoryStream.AsStreamForRead();
        await readStream.CopyToAsync(outputStream, cancellationToken);

        return outputImagePath;
    }
}
