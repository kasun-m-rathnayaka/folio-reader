using Folio.Application.OCR;
using Folio.Application.Reflow;
using Folio.Domain.OCR;
using Folio.Infrastructure.OCR;
using Folio.Infrastructure.Reflow;
using Xunit;

namespace Folio.Infrastructure.Tests;

public class OcrAndReflowTests
{
    private static string GetFixturesDir()
    {
        string current = AppDomain.CurrentDomain.BaseDirectory;
        string root = Path.GetFullPath(Path.Combine(current, @"..\..\..\..\"));
        return Path.Combine(root, "fixtures", "pdf");
    }

    [Fact]
    public async Task ScanDetection_DistinguishesScannedFromNative()
    {
        string fixturesDir = GetFixturesDir();
        string scannedPdf = Path.Combine(fixturesDir, "04_scanned_book.pdf");
        string nativePdf = Path.Combine(fixturesDir, "01_single_column_book_300p.pdf");

        var ocrService = new WindowsOcrService();

        if (File.Exists(scannedPdf))
        {
            bool isScan = await ocrService.IsScannedPageAsync(scannedPdf, 0);
            Assert.True(isScan);
        }

        if (File.Exists(nativePdf))
        {
            bool isNative = await ocrService.IsScannedPageAsync(nativePdf, 0);
            Assert.False(isNative);
        }
    }

    [Fact]
    public async Task ReflowService_BuildsDocumentAndMapsOffsets()
    {
        string fixturesDir = GetFixturesDir();
        string nativePdf = Path.Combine(fixturesDir, "01_single_column_book_300p.pdf");
        if (!File.Exists(nativePdf)) return;

        var ocrService = new WindowsOcrService();
        var reflowService = new ReflowService(ocrService);

        var doc = await reflowService.BuildReflowDocumentAsync(Guid.NewGuid(), nativePdf);

        Assert.NotNull(doc);
        Assert.NotEmpty(doc.Blocks);
        Assert.True(doc.TotalWords > 0);

        // Test cross-mode offset mapping
        int mappedPage = reflowService.MapReflowOffsetToPageIndex(doc, 0);
        Assert.Equal(0, mappedPage);

        int reflowOffset = reflowService.MapPageToReflowOffset(doc, 0, 0.0);
        Assert.True(reflowOffset >= 0);
    }
}
