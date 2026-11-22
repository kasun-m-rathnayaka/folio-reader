using Folio.Application.Common.Interfaces;
using Folio.Domain.Entities;
using Folio.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Folio.Infrastructure.Extraction;

/// <summary>
/// Caches the native text layer of each page for library search. Pages without a text layer are cached as empty text;
/// a book whose pages are all empty is reported as not indexable. The legacy WordsJson and IsOcr columns are left
/// untouched for compatibility and always written as empty / false.
/// </summary>
public sealed class DocumentTextService(IDbContextFactory<FolioDbContext> factory, IPdfTextExtractor extractor) : IDocumentTextService
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    public async Task<DocumentTextPage> GetPageAsync(Guid bookId, int pageIndex, CancellationToken ct = default)
    {
        await _gate.WaitAsync(ct);
        try
        {
            return await Task.Run(async () =>
            {
                await using var db = await factory.CreateDbContextAsync(ct);
                var saved = await db.DocumentPages.FindAsync([bookId, pageIndex], ct);
                if (saved != null) return new DocumentTextPage(saved.PageIndex, saved.Text);
                var book = await db.Books.SingleAsync(b => b.Id == bookId, ct);
                if (pageIndex < 0 || pageIndex >= book.PageCount) throw new ArgumentOutOfRangeException(nameof(pageIndex));
                var page = await extractor.ExtractPageAsync(book.FilePath, pageIndex, ct);
                saved = new DocumentPage { BookId = bookId, PageIndex = pageIndex, Text = page.PlainText, IsOcr = false, WordsJson = "[]" };
                db.DocumentPages.Add(saved); await db.SaveChangesAsync(ct);
                return new DocumentTextPage(saved.PageIndex, saved.Text);
            }, ct);
        }
        finally { _gate.Release(); }
    }
    public async Task<bool> IndexBookAsync(Guid bookId, IProgress<TextIndexProgress>? progress = null, CancellationToken ct = default)
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        var book = await db.Books.AsNoTracking().SingleOrDefaultAsync(b => b.Id == bookId && b.TrashedAt == null, ct);
        if (book == null) return true;
        var indexed = (await db.DocumentPages.Where(p => p.BookId == bookId).Select(p => p.PageIndex).ToListAsync(ct)).ToHashSet();
        for (var page = 0; page < book.PageCount; page++)
        {
            ct.ThrowIfCancellationRequested();
            if (!indexed.Contains(page)) await GetPageAsync(bookId, page, ct);
            progress?.Report(new(book.Title, page + 1, book.PageCount));
        }
        return book.PageCount == 0 || await db.DocumentPages.AnyAsync(p => p.BookId == bookId && p.Text != "", ct);
    }
    public async Task IndexLibraryAsync(IProgress<TextIndexProgress>? progress = null, CancellationToken ct = default)
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        foreach (var book in await db.Books.AsNoTracking().Where(b => b.TrashedAt == null).ToListAsync(ct))
        {
            try
            {
                if (!await IndexBookAsync(book.Id, progress, ct))
                    progress?.Report(new($"{book.Title}: no text layer (scanned PDF)", 0, 0));
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception ex) { progress?.Report(new($"{book.Title}: {ex.Message}", 0, 0)); }
        }
    }
}
