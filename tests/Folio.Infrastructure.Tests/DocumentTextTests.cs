using Folio.Application.Common.Interfaces;
using Folio.Application.OCR;
using Folio.Domain.Entities;
using Folio.Domain.Geometry;
using Folio.Domain.OCR;
using Folio.Infrastructure.Extraction;
using Folio.Infrastructure.Persistence;
using Folio.Infrastructure.Search;
using Microsoft.EntityFrameworkCore;

namespace Folio.Infrastructure.Tests;

public class DocumentTextTests
{
    private sealed class Factory(DbContextOptions<FolioDbContext> options) : IDbContextFactory<FolioDbContext> { public FolioDbContext CreateDbContext() => new(options); }
    private sealed class Extractor : IPdfTextExtractor
    {
        public int Calls;
        public Task<ExtractedMetadata> ExtractMetadataAsync(string path, CancellationToken ct = default) => Task.FromResult(new ExtractedMetadata(null, null, 2, null));
        public Task<ExtractedPage> ExtractPageAsync(string path, int page, CancellationToken ct = default)
        {
            Calls++;
            return Task.FromResult(new ExtractedPage(page, new PageDimensions(600, 800), [], page == 0 ? "Native needle in a haystack" : ""));
        }
        public Task<IReadOnlyList<ExtractedPage>> ExtractAllPagesAsync(string path, IProgress<double>? progress = null, CancellationToken ct = default) => throw new NotSupportedException();
    }
    private sealed class Ocr : IOcrService
    {
        public int Calls;
        public Task<bool> IsScannedPageAsync(string path, int page) => Task.FromResult(page == 1);
        public Task<OcrPageResult> RecognizePageAsync(string path, int page, CancellationToken ct = default)
        {
            Calls++;
            return Task.FromResult(new OcrPageResult(page, "Scanned needle", [new Folio.Domain.OCR.OcrWord("needle", new NormalizedRect(.1, .2, .3, .04))], true));
        }
    }
    [Fact]
    public async Task NativeAndScannedText_IsCachedSearchableAndExcludedWhenTrashed()
    {
        var path = Path.Combine(Path.GetTempPath(), $"folio-text-{Guid.NewGuid():N}.db");
        var options = new DbContextOptionsBuilder<FolioDbContext>().UseSqlite($"Data Source={path};Pooling=False").Options;
        try
        {
            var book = new Book { Sha256 = new string('e',64), Title = "Cache test", PageCount = 2, FilePath = "fixture.pdf" };
            await using (var db = new FolioDbContext(options)) { await db.Database.EnsureCreatedAsync(); db.Books.Add(book); await db.SaveChangesAsync(); }
            var extractor = new Extractor(); var ocr = new Ocr();
            var text = new DocumentTextService(new Factory(options), extractor, ocr);
            await text.IndexLibraryAsync();
            var scanned = await text.GetPageAsync(book.Id, 1);
            Assert.True(scanned.IsOcr); Assert.Equal("needle", scanned.Words.Single().Text);
            Assert.Equal(2, extractor.Calls); Assert.Equal(1, ocr.Calls);
            await using var searchDb = new FolioDbContext(options);
            var search = new LibrarySearchService(searchDb);
            var matches = await search.SearchLibraryAsync("NEEDLE");
            Assert.Equal(new[] { 0, 1 }, matches.Select(m => m.PageIndex).Order().ToArray());
            var stored = await searchDb.Books.SingleAsync(); stored.TrashedAt = DateTimeOffset.UtcNow; await searchDb.SaveChangesAsync();
            Assert.Empty(await search.SearchLibraryAsync("needle"));
        }
        finally { File.Delete(path); }
    }
}
