using System.Text.Json;
using Folio.Application.Common.Interfaces;
using Folio.Application.OCR;
using Folio.Domain.Entities;
using Folio.Domain.OCR;
using Folio.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using OcrWord = Folio.Domain.OCR.OcrWord;

namespace Folio.Infrastructure.Extraction;

public sealed class DocumentTextService(IDbContextFactory<FolioDbContext> factory, IPdfTextExtractor extractor, IOcrService ocr) : IDocumentTextService
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
                if (saved != null) return Convert(saved);
                var book = await db.Books.SingleAsync(b => b.Id == bookId, ct);
                if (pageIndex < 0 || pageIndex >= book.PageCount) throw new ArgumentOutOfRangeException(nameof(pageIndex));
                var page = await extractor.ExtractPageAsync(book.FilePath, pageIndex, ct);
                var words = page.Lines.SelectMany(l => l.Words).Select(w => new OcrWord(w.Text, w.Bounds)).ToArray();
                var text = page.PlainText; var isOcr = false;
                if (words.Length < 5 && await ocr.IsScannedPageAsync(book.FilePath, pageIndex))
                {
                    var recognized = await ocr.RecognizePageAsync(book.FilePath, pageIndex, ct);
                    words = recognized.Words.ToArray(); text = recognized.FullText; isOcr = true;
                }
                saved = new DocumentPage { BookId = bookId, PageIndex = pageIndex, Text = text, IsOcr = isOcr, WordsJson = JsonSerializer.Serialize(words) };
                db.DocumentPages.Add(saved); await db.SaveChangesAsync(ct);
                return Convert(saved);
            }, ct);
        }
        finally { _gate.Release(); }
    }
    private static DocumentTextPage Convert(DocumentPage page) => new(page.PageIndex, page.Text, JsonSerializer.Deserialize<OcrWord[]>(page.WordsJson) ?? [], page.IsOcr);
    public async Task IndexBookAsync(Guid bookId, IProgress<TextIndexProgress>? progress = null, CancellationToken ct = default)
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        var book = await db.Books.AsNoTracking().SingleOrDefaultAsync(b => b.Id == bookId && b.TrashedAt == null, ct);
        if (book == null) return;
        var indexed = (await db.DocumentPages.Where(p => p.BookId == bookId).Select(p => p.PageIndex).ToListAsync(ct)).ToHashSet();
        for (var page = 0; page < book.PageCount; page++)
        {
            ct.ThrowIfCancellationRequested();
            if (!indexed.Contains(page)) await GetPageAsync(bookId, page, ct);
            progress?.Report(new(book.Title, page + 1, book.PageCount));
        }
    }
    public async Task IndexLibraryAsync(IProgress<TextIndexProgress>? progress = null, CancellationToken ct = default)
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        foreach (var book in await db.Books.AsNoTracking().Where(b => b.TrashedAt == null).ToListAsync(ct))
        {
            try { await IndexBookAsync(book.Id, progress, ct); }
            catch (OperationCanceledException) { throw; }
            catch (Exception ex) { progress?.Report(new($"{book.Title}: {ex.Message}", 0, 0)); }
        }
    }
}
