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
            .Where(b => EF.Functions.Like(b.Title, $"%{query}%") || (b.Author != null && EF.Functions.Like(b.Author, $"%{query}%")))
            .Take(10)
            .ToListAsync(ct);

        foreach (var book in matchedBooks)
        {
            results.Add(new SearchResultDto(
                BookId: book.Id,
                BookTitle: book.Title,
                Author: book.Author ?? "Unknown",
                PageIndex: 0,
                Snippet: $"Title match: **{book.Title}** by {book.Author ?? "Unknown"}",
                Type: SearchResultType.BookTitle,
                Rank: 3.0
            ));
        }

        // 2. Search Annotations and Notes
        var matchedAnnotations = await _context.Annotations
            .Include(a => a.Book)
            .Where(a => (a.SelectedText != null && EF.Functions.Like(a.SelectedText, $"%{query}%")) ||
                        (a.Note != null && EF.Functions.Like(a.Note, $"%{query}%")))
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
            .Where(b => b.Label != null && EF.Functions.Like(b.Label, $"%{query}%"))
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

        return results.OrderByDescending(r => r.Rank).ToList();
    }
}
