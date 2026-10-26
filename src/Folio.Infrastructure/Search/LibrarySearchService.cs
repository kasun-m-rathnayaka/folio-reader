using Folio.Application.Search;
using Folio.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Folio.Infrastructure.Search;

/// <summary>
/// Library-wide full-text and metadata search engine (FR-LIB-07, §8.6).
/// Cross-references books, author names, highlight contents, notes, and bookmarks.
/// </summary>
public class LibrarySearchService : ISearchService
{
    private readonly FolioDbContext _context;

    public LibrarySearchService(FolioDbContext context)
    {
        _context = context;
    }

    public async Task<IReadOnlyList<SearchResultDto>> SearchLibraryAsync(string query, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(query))
        {
            return Array.Empty<SearchResultDto>();
        }

        query = query.Trim();
        var results = new List<SearchResultDto>();

        // 1. Search Book Titles and Authors (Highest Rank)
        var matchedBooks = await _context.Books
            .Where(b => b.TrashedAt == null && (b.Title.ToLower().Contains(query.ToLower()) || (b.Author != null && b.Author.ToLower().Contains(query.ToLower()))))
            .Take(10)
            .ToListAsync(ct);

        foreach (var book in matchedBooks)
        {
            results.Add(new SearchResultDto(
                BookId: book.Id,
                BookTitle: book.Title,
                Author: book.Author ?? "Unknown",
                PageIndex: 0,
                Snippet: $"Title match: {book.Title} by {book.Author ?? "Unknown"}",
                Type: SearchResultType.BookTitle,
                Rank: 3.0
            ));
        }

        // 2. Search Annotations and Notes
        var matchedAnnotations = await _context.Annotations
            .Include(a => a.Book)
            .Where(a => a.Book != null && a.Book.TrashedAt == null && ((a.SelectedText != null && a.SelectedText.ToLower().Contains(query.ToLower())) ||
                        (a.Note != null && a.Note.ToLower().Contains(query.ToLower()))))
            .Take(25)
            .ToListAsync(ct);

        foreach (var ann in matchedAnnotations)
        {
            string snippet = !string.IsNullOrEmpty(ann.Note) && ann.Note.Contains(query, StringComparison.OrdinalIgnoreCase)
                ? $"Note: {ann.Note}"
                : $"\"{ann.SelectedText}\"";

            results.Add(new SearchResultDto(
                BookId: ann.BookId,
                BookTitle: ann.Book?.Title ?? "Unknown Book",
                Author: ann.Book?.Author ?? "Unknown",
                PageIndex: ann.PageIndex,
                Snippet: snippet,
                Type: SearchResultType.Annotation,
                Rank: 2.0
            ));
        }

        // 3. Search Bookmarks
        var matchedBookmarks = await _context.Bookmarks
            .Include(b => b.Book)
            .Where(b => b.Book != null && b.Book.TrashedAt == null && b.Label != null && b.Label.ToLower().Contains(query.ToLower()))
            .Take(10)
            .ToListAsync(ct);

        foreach (var bm in matchedBookmarks)
        {
            results.Add(new SearchResultDto(
                BookId: bm.BookId,
                BookTitle: bm.Book?.Title ?? "Unknown Book",
                Author: bm.Book?.Author ?? "Unknown",
                PageIndex: bm.PageIndex,
                Snippet: $"Bookmark: {bm.Label}",
                Type: SearchResultType.Bookmark,
                Rank: 1.5
            ));
        }

        var pages = await _context.DocumentPages.AsNoTracking().Include(p => p.Book)
            .Where(p => p.Book.TrashedAt == null && p.Text.ToLower().Contains(query.ToLower()))
            .OrderBy(p => p.Book.Title).ThenBy(p => p.PageIndex).Take(100).ToListAsync(ct);
        foreach (var page in pages)
        {
            var start = Math.Max(0, page.Text.IndexOf(query, StringComparison.OrdinalIgnoreCase) - 60);
            var snippet = page.Text.Substring(start, Math.Min(240, page.Text.Length - start));
            results.Add(new(page.BookId, page.Book.Title, page.Book.Author ?? "Unknown author", page.PageIndex, snippet, SearchResultType.PageText));
        }
        return results.OrderByDescending(r => r.Rank).ToList();
    }
}
