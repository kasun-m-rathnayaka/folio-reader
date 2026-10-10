using Folio.Infrastructure.Extraction;

namespace Folio.Infrastructure.Tests;

public class PdfPigTextExtractorTests
{
    private readonly string _fixturesDir;
    private readonly PdfPigTextExtractor _extractor;

    public PdfPigTextExtractorTests()
    {
        _fixturesDir = FindFixturesDirectory();
        _extractor = new PdfPigTextExtractor();
    }

    private static string FindFixturesDirectory()
    {
        var dir = new DirectoryInfo(AppDomain.CurrentDomain.BaseDirectory);
        while (dir != null)
        {
            string candidate = Path.Combine(dir.FullName, "fixtures", "pdf");
            if (Directory.Exists(candidate))
            {
                return candidate;
            }
            dir = dir.Parent;
        }
        throw new DirectoryNotFoundException("Could not find fixtures/pdf directory.");
    }

    [Fact]
    public async Task ExtractMetadataAsync_ExtractsTitleAndPageCount()
    {
        string pdfPath = Path.Combine(_fixturesDir, "01_single_column_book_300p.pdf");
        Assert.True(File.Exists(pdfPath), $"Fixture not found: {pdfPath}");

        var meta = await _extractor.ExtractMetadataAsync(pdfPath);

        Assert.NotNull(meta);
        Assert.Equal(300, meta.PageCount);
        Assert.False(string.IsNullOrWhiteSpace(meta.Title));
    }

    [Fact]
    public async Task ExtractPageAsync_ExtractsNormalizedLinesAndWords()
    {
        string pdfPath = Path.Combine(_fixturesDir, "01_single_column_book_300p.pdf");
        var page = await _extractor.ExtractPageAsync(pdfPath, pageIndex: 0);

        Assert.NotNull(page);
        Assert.Equal(0, page.PageIndex);
        Assert.NotEmpty(page.Lines);
        Assert.False(string.IsNullOrWhiteSpace(page.PlainText));

        // Verify normalized coordinates [0.0, 1.0]
        foreach (var line in page.Lines)
        {
            Assert.True(line.Bounds.X >= 0.0 && line.Bounds.X <= 1.0, $"Line X out of bounds: {line.Bounds.X}");
            Assert.True(line.Bounds.Y >= 0.0 && line.Bounds.Y <= 1.0, $"Line Y out of bounds: {line.Bounds.Y}");
            Assert.True(line.Bounds.Width >= 0.0 && line.Bounds.Width <= 1.0);
            Assert.True(line.Bounds.Height >= 0.0 && line.Bounds.Height <= 1.0);
        }
    }
}
