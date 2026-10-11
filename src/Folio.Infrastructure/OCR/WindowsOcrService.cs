using Folio.Application.OCR;
using Folio.Domain.Geometry;
using Folio.Domain.OCR;
using UglyToad.PdfPig;
using Windows.Data.Pdf;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage;
using Windows.Storage.Streams;

namespace Folio.Infrastructure.OCR;

/// <summary>
/// Hardware-accelerated WinRT Windows.Media.Ocr implementation (FR-OCR-01..04, §8.3).
/// Detects scanned pages, rasterizes at 300 DPI, extracts text and normalized bounding boxes.
/// </summary>
public class WindowsOcrService : IOcrService
{
    public Task<bool> IsScannedPageAsync(string pdfPath, int pageIndex)
    {
        if (!File.Exists(pdfPath)) return Task.FromResult(false);

        try
        {
            using var pdfDoc = UglyToad.PdfPig.PdfDocument.Open(pdfPath);
            if (pageIndex < 0 || pageIndex >= pdfDoc.NumberOfPages) return Task.FromResult(false);

            var page = pdfDoc.GetPage(pageIndex + 1);
            int wordCount = page.GetWords().Count();
            int imageCount = page.GetImages().Count();

            // Scan heuristic: few/no vector words and at least one image (ADR-008)
            bool isScan = wordCount < 5 && imageCount > 0;
            return Task.FromResult(isScan);
        }
        catch
        {
            return Task.FromResult(false);
        }
    }

    public async Task<OcrPageResult> RecognizePageAsync(string pdfPath, int pageIndex, CancellationToken ct = default)
    {
        if (!File.Exists(pdfPath))
        {
            throw new FileNotFoundException($"PDF file not found at {pdfPath}");
        }

        string fullPath = Path.GetFullPath(pdfPath);
        var storageFile = await StorageFile.GetFileFromPathAsync(fullPath);
        var doc = await Windows.Data.Pdf.PdfDocument.LoadFromFileAsync(storageFile);

        if (pageIndex < 0 || pageIndex >= doc.PageCount)
        {
            throw new ArgumentOutOfRangeException(nameof(pageIndex), $"Page {pageIndex} is out of bounds.");
        }

        using var page = doc.GetPage((uint)pageIndex);

        // 300 DPI rasterization
        double dpiScale = 300.0 / 72.0;
        uint targetW = (uint)Math.Max(1, Math.Round(page.Size.Width * dpiScale));
        uint targetH = (uint)Math.Max(1, Math.Round(page.Size.Height * dpiScale));

        using var memoryStream = new InMemoryRandomAccessStream();
        var renderOptions = new PdfPageRenderOptions
        {
            DestinationWidth = targetW,
            DestinationHeight = targetH
        };

        await page.RenderToStreamAsync(memoryStream, renderOptions);

        // Decode into SoftwareBitmap for OCR
        memoryStream.Seek(0);
        var decoder = await BitmapDecoder.CreateAsync(memoryStream);
        using var softwareBitmap = await decoder.GetSoftwareBitmapAsync();

        var ocrEngine = OcrEngine.TryCreateFromUserProfileLanguages()
            ?? OcrEngine.TryCreateFromLanguage(new Windows.Globalization.Language("en-US"));

        if (ocrEngine == null)
        {
            throw new InvalidOperationException("Windows OCR engine could not be instantiated.");
        }

        var ocrResult = await ocrEngine.RecognizeAsync(softwareBitmap);

        var words = new List<Folio.Domain.OCR.OcrWord>();
        double imgWidth = softwareBitmap.PixelWidth;
        double imgHeight = softwareBitmap.PixelHeight;

        foreach (var line in ocrResult.Lines)
        {
            foreach (var word in line.Words)
            {
                var r = word.BoundingRect;
                var normRect = new NormalizedRect(
                    X: Math.Max(0, Math.Min(1, r.X / imgWidth)),
                    Y: Math.Max(0, Math.Min(1, r.Y / imgHeight)),
                    Width: Math.Min(1, r.Width / imgWidth),
                    Height: Math.Min(1, r.Height / imgHeight)
                );

                words.Add(new Folio.Domain.OCR.OcrWord(word.Text, normRect));
            }
        }

        return new OcrPageResult(
            PageIndex: pageIndex,
            FullText: ocrResult.Text,
            Words: words,
            IsScan: true
        );
    }
}
