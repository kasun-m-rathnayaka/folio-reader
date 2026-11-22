using Folio.Application.Common.Interfaces;
using Folio.Domain.Entities;
using Folio.Domain.Geometry;
using Folio.Infrastructure.Extraction;
using Folio.Infrastructure.Persistence;
using Folio.Infrastructure.Search;
using Microsoft.EntityFrameworkCore;

namespace Folio.Infrastructure.Tests;

public class DocumentTextTests
{
    private sealed class Factory(DbContextOptions<FolioDbContext> options) : IDbContextFactory<FolioDbContext> { public FolioDbContext CreateDbContext() => new(options); }
    private sealed class Extractor(Func<string, int, string> text) : IPdfTextExtractor
    {
        public int Calls;
        public Task<ExtractedMetadata> ExtractMetadataAsync(string path, CancellationToken ct = default) => Task.FromResult(new ExtractedMetadata(null, null, 2, null));
        public Task<ExtractedPage> ExtractPageAsync(string path, int page, CancellationToken ct = default)
        {
            Calls++;
            return Task.FromResult(new ExtractedPage(page, new PageDimensions(600, 800), [], text(path, page)));
        }
        public Task<IReadOnlyList<ExtractedPage>> ExtractAllPagesAsync(string path, IProgress<double>? progress = null, CancellationToken ct = default) => throw new NotSupportedException();
    }

    [Fact]
    public async Task NativeText_IsCachedSearchableAndExcludedWhenTrashed()
    {
        var path = Path.Combine(Path.GetTempPath(), $"folio-text-{Guid.NewGuid():N}.db");
        var options = new DbContextOptionsBuilder<FolioDbContext>().UseSqlite($"Data Source={path};Pooling=False").Options;
        try
        {
            var book = new Book { Sha256 = new string('e', 64), Title = "Cache test", PageCount = 2, FilePath = "fixture.pdf" };
            await using (var db = new FolioDbContext(options)) { await db.Database.EnsureCreatedAsync(); db.Books.Add(book); await db.SaveChangesAsync(); }
            var extractor = new Extractor((_, page) => page == 0 ? "Native needle in a haystack" : "Another needle");
            var text = new DocumentTextService(new Factory(options), extractor);
            await text.IndexLibraryAsync();
            Assert.Equal("Another needle", (await text.GetPageAsync(book.Id, 1)).Text);
            Assert.Equal(2, extractor.Calls);
            await using var searchDb = new FolioDbContext(options);
            var search = new LibrarySearchService(searchDb);
            var matches = await search.SearchLibraryAsync("NEEDLE");
            Assert.Equal(new[] { 0, 1 }, matches.Select(m => m.PageIndex).Order().ToArray());
            var stored = await searchDb.Books.SingleAsync(); stored.TrashedAt = DateTimeOffset.UtcNow; await searchDb.SaveChangesAsync();
            Assert.Empty(await search.SearchLibraryAsync("needle"));
        }
        finally { File.Delete(path); }
    }

    [Fact]
    public async Task BookWithoutTextLayer_IsReportedAsNotIndexable()
    {
        var path = Path.Combine(Path.GetTempPath(), $"folio-text-{Guid.NewGuid():N}.db");
        var options = new DbContextOptionsBuilder<FolioDbContext>().UseSqlite($"Data Source={path};Pooling=False").Options;
        try
        {
            var scanned = new Book { Sha256 = new string('a', 64), Title = "Scanned", PageCount = 2, FilePath = "scan.pdf" };
            var native = new Book { Sha256 = new string('b', 64), Title = "Native", PageCount = 1, FilePath = "native.pdf" };
            await using (var db = new FolioDbContext(options)) { await db.Database.EnsureCreatedAsync(); db.Books.AddRange(scanned, native); await db.SaveChangesAsync(); }
            var text = new DocumentTextService(new Factory(options), new Extractor((file, _) => file == "scan.pdf" ? "" : "words"));
            var warnings = new List<string>();
            await text.IndexLibraryAsync(new SynchronousProgress(p => { if (p.Total == 0) warnings.Add(p.BookTitle); }));
            Assert.Single(warnings);
            Assert.StartsWith("Scanned", warnings[0]);
        }
        finally { File.Delete(path); }
    }

    private sealed class SynchronousProgress(Action<TextIndexProgress> report) : IProgress<TextIndexProgress>
    {
        public void Report(TextIndexProgress value) => report(value);
    }
}
