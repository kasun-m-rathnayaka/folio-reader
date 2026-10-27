using Folio.Infrastructure.OCR;
using Xunit;

namespace Folio.Infrastructure.Tests;

public class OcrTests
{
    private static string GetFixturesDir()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory != null; directory = directory.Parent)
        {
            var fixtures = Path.Combine(directory.FullName, "fixtures", "pdf");
            if (Directory.Exists(fixtures)) return fixtures;
        }
        throw new DirectoryNotFoundException("The PDF regression fixtures were not found.");
    }

    [Fact]
    public async Task ScanDetection_DistinguishesScannedFromNative()
    {
        string fixturesDir = GetFixturesDir();
        string scannedPdf = Path.Combine(fixturesDir, "04_scanned_book.pdf");
        string nativePdf = Path.Combine(fixturesDir, "01_single_column_book_300p.pdf");

        var ocrService = new WindowsOcrService();

        Assert.True(File.Exists(scannedPdf));
        Assert.True(File.Exists(nativePdf));
        Assert.True(await ocrService.IsScannedPageAsync(scannedPdf, 0));
        Assert.False(await ocrService.IsScannedPageAsync(nativePdf, 0));
    }

}
