using Folio.Application.Books;
using Folio.Application.Common.Interfaces;
using Folio.Domain.Entities;
using Folio.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Folio.Infrastructure.Persistence;

public class LibraryService(IDbContextFactory<FolioDbContext> factory, IFileStore files) : ILibraryService
{
    private readonly SemaphoreSlim _shelfCreation = new(1, 1);
    public async Task<LibraryPage> QueryAsync(LibraryQuery query, CancellationToken ct = default)
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        var books = db.Books.AsNoTracking().Where(b => query.Trash ? b.TrashedAt != null : b.TrashedAt == null);
        if (query.Status.HasValue) books = books.Where(b => b.Status == query.Status.Value);
        if (query.ShelfId.HasValue) books = books.Where(b => b.BookShelves.Any(s => s.ShelfId == query.ShelfId.Value));
        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim().ToLower();
            books = books.Where(b => b.Title.ToLower().Contains(term) || (b.Author != null && b.Author.ToLower().Contains(term)));
        }
        var total = await books.CountAsync(ct);
        books = query.Sort switch
        {
            LibrarySort.Title => books.OrderBy(b => b.Title).ThenBy(b => b.Id),
            LibrarySort.Author => books.OrderBy(b => b.Author).ThenBy(b => b.Title).ThenBy(b => b.Id),
            LibrarySort.Added => books.OrderByDescending(b => b.CreatedAt).ThenBy(b => b.Id),
            LibrarySort.Progress => books.OrderByDescending(b => b.PageCount > 0 ? (double)b.FurthestPageIndex / b.PageCount : 0).ThenBy(b => b.Id),
            _ => books.OrderByDescending(b => b.LastReadAt ?? b.CreatedAt).ThenBy(b => b.Id)
        };
        var result = await books.Include(b => b.ReadingPosition).Skip(Math.Max(0, query.Start))
            .Take(Math.Clamp(query.Count, 1, 200)).ToListAsync(ct);
        return new(result, total);
    }

    public async Task<LibraryCounts> GetCountsAsync(CancellationToken ct = default)
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        var groups = await db.Books.GroupBy(b => new { Trash = b.TrashedAt != null, b.Status })
            .Select(g => new { g.Key.Trash, g.Key.Status, Count = g.Count() }).ToListAsync(ct);
        int Count(ReadingStatus s) => groups.Where(g => !g.Trash && g.Status == s).Sum(g => g.Count);
        return new(groups.Where(g => !g.Trash).Sum(g => g.Count), Count(ReadingStatus.Reading),
            Count(ReadingStatus.WantToRead), Count(ReadingStatus.Finished), groups.Where(g => g.Trash).Sum(g => g.Count));
    }

    public async Task<IReadOnlyList<Book>> GetRecentAsync(CancellationToken ct = default)
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        return await db.Books.AsNoTracking().Include(b => b.ReadingPosition)
            .Where(b => b.TrashedAt == null && b.LastReadAt != null && b.Status == ReadingStatus.Reading)
            .OrderByDescending(b => b.LastReadAt).Take(4).ToListAsync(ct);
    }

    public async Task<IReadOnlyList<Shelf>> GetShelvesAsync(CancellationToken ct = default)
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        return await db.Shelves.AsNoTracking().OrderBy(s => s.SortOrder).ThenBy(s => s.Name).ToListAsync(ct);
    }

    public async Task<Book?> GetBookAsync(Guid id, CancellationToken ct = default)
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        return await db.Books.AsNoTracking().Include(b => b.ReadingPosition).Include(b => b.BookShelves)
            .FirstOrDefaultAsync(b => b.Id == id && b.TrashedAt == null, ct);
    }

    public async Task SetStatusAsync(Guid id, ReadingStatus status, CancellationToken ct = default, bool manual = true)
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        var book = await db.Books.SingleAsync(b => b.Id == id, ct);
        book.Status = status; book.StatusIsManual = manual; book.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    public async Task SetPageCountAsync(Guid id, int pages, CancellationToken ct = default)
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        var book = await db.Books.SingleAsync(b => b.Id == id, ct);
        book.PageCount = Math.Max(1, pages);
        await db.SaveChangesAsync(ct);
    }

    public async Task SetTrashAsync(Guid id, bool trash, CancellationToken ct = default)
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        var book = await db.Books.SingleAsync(b => b.Id == id, ct);
        book.TrashedAt = trash ? DateTimeOffset.UtcNow : null; book.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    public async Task SaveMetadataAsync(Guid id, string title, string? author, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(title) || title.Trim().Length > 500) throw new ArgumentException("Enter a title of 1–500 characters.");
        if (author?.Trim().Length > 250) throw new ArgumentException("Author must be 250 characters or fewer.");
        await using var db = await factory.CreateDbContextAsync(ct);
        var book = await db.Books.SingleAsync(b => b.Id == id, ct);
        book.Title = title.Trim(); book.Author = string.IsNullOrWhiteSpace(author) ? null : author.Trim();
        book.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    public async Task<Shelf> CreateShelfAsync(string name, CancellationToken ct = default)
    {
        name = name.Trim();
        if (name.Length is 0 or > 100) throw new ArgumentException("Enter a shelf name of 1–100 characters.");
        await _shelfCreation.WaitAsync(ct);
        try
        {
            // SQLite executes synchronously even through its async APIs. Keep lock waits off the UI thread.
            return await Task.Run(async () =>
            {
                await using var db = await factory.CreateDbContextAsync(ct);
                db.Database.SetCommandTimeout(5);
                if (await db.Shelves.AnyAsync(s => s.Name.ToLower() == name.ToLower(), ct))
                    throw new ArgumentException("A shelf with this name already exists.");
                ct.ThrowIfCancellationRequested();
                var order = (await db.Shelves.Select(s => (int?)s.SortOrder).MaxAsync(ct) ?? -1) + 1;
                var shelf = new Shelf { Name = name, SortOrder = order };
                db.Shelves.Add(shelf);
                await db.SaveChangesAsync(ct);
                return shelf;
            }, ct);
        }
        finally { _shelfCreation.Release(); }
    }

    public async Task SetShelfAsync(Guid bookId, Guid shelfId, bool included, CancellationToken ct = default)
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        var entry = await db.BookShelves.FindAsync([bookId, shelfId], ct);
        if (included && entry == null) db.BookShelves.Add(new BookShelf { BookId = bookId, ShelfId = shelfId });
        if (!included && entry != null) db.BookShelves.Remove(entry);
        await db.SaveChangesAsync(ct);
    }

    public async Task RenameShelfAsync(Guid id, string name, CancellationToken ct = default)
    {
        name = name.Trim();
        if (name.Length is 0 or > 100) throw new ArgumentException("Enter a shelf name of 1–100 characters.");
        await _shelfCreation.WaitAsync(ct);
        try
        {
            await using var db = await factory.CreateDbContextAsync(ct);
            if (await db.Shelves.AnyAsync(s => s.Id != id && s.Name.ToLower() == name.ToLower(), ct)) throw new ArgumentException("A shelf with this name already exists.");
            var shelf = await db.Shelves.SingleAsync(s => s.Id == id, ct);
            shelf.Name = name; shelf.UpdatedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync(ct);
        }
        finally { _shelfCreation.Release(); }
    }

    public async Task DeleteShelfAsync(Guid id, CancellationToken ct = default)
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        var shelf = await db.Shelves.FindAsync([id], ct);
        if (shelf == null) return;
        db.BookShelves.RemoveRange(db.BookShelves.Where(s => s.ShelfId == id));
        db.Shelves.Remove(shelf);
        await db.SaveChangesAsync(ct);
    }

    public async Task MoveShelfAsync(Guid id, int direction, CancellationToken ct = default)
    {
        await _shelfCreation.WaitAsync(ct);
        try
        {
            await using var db = await factory.CreateDbContextAsync(ct);
            var shelves = await db.Shelves.OrderBy(s => s.SortOrder).ThenBy(s => s.Name).ToListAsync(ct);
            var index = shelves.FindIndex(s => s.Id == id);
            if (index < 0) return;
            var other = Math.Clamp(index + Math.Sign(direction), 0, shelves.Count - 1);
            (shelves[index], shelves[other]) = (shelves[other], shelves[index]);
            for (var i = 0; i < shelves.Count; i++) shelves[i].SortOrder = i;
            await db.SaveChangesAsync(ct);
        }
        finally { _shelfCreation.Release(); }
    }

    public async Task DeletePermanentlyAsync(Guid id, CancellationToken ct = default)
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        var book = await db.Books.SingleOrDefaultAsync(b => b.Id == id, ct);
        if (book == null) return;
        if (book.TrashedAt == null) throw new InvalidOperationException("Move the book to Trash before deleting it permanently.");
        // Only app-managed files are removed. Imported originals are never deleted.
        var managed = files.GetBookPath(book.Sha256);
        var cover = files.GetCoverPath(book.Sha256);
        db.ChapterSummaries.RemoveRange(db.ChapterSummaries.Where(s => s.BookId == id));
        db.Flashcards.RemoveRange(db.Flashcards.Where(s => s.BookId == id));
        db.VocabularyItems.RemoveRange(db.VocabularyItems.Where(s => s.BookId == id));
        db.Books.Remove(book);
        await db.SaveChangesAsync(ct);
        if (Path.GetFullPath(managed).StartsWith(Path.GetFullPath(files.BooksDirectory) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) File.Delete(managed);
        if (Path.GetFullPath(cover).StartsWith(Path.GetFullPath(files.CoversDirectory) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) File.Delete(cover);
    }

    public async Task EmptyTrashAsync(CancellationToken ct = default)
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        foreach (var id in await db.Books.Where(b => b.TrashedAt != null).Select(b => b.Id).ToListAsync(ct)) await DeletePermanentlyAsync(id, ct);
    }

    public async Task<IReadOnlyList<LibraryNote>> GetNotesAsync(string? search, CancellationToken ct = default)
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        var notes = db.Annotations.AsNoTracking().Include(a => a.Book).Where(a => a.Book != null && a.Book.TrashedAt == null);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            notes = notes.Where(a => (a.SelectedText != null && a.SelectedText.ToLower().Contains(term)) ||
                (a.Note != null && a.Note.ToLower().Contains(term)) || a.Book!.Title.ToLower().Contains(term));
        }
        return (await notes.OrderByDescending(a => a.CreatedAt).Take(200).ToListAsync(ct))
            .Select(a => new LibraryNote(a, a.Book!.Title, a.Book.Author)).ToList();
    }

    public async Task RelinkAsync(Guid id, string sourcePath, CancellationToken ct = default)
    {
        await using var db = await factory.CreateDbContextAsync(ct);
        var book = await db.Books.SingleAsync(b => b.Id == id, ct);
        if (!string.Equals(await files.ComputeSha256Async(sourcePath, ct), book.Sha256, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("This is a different PDF. Select the original document to keep your notes aligned.");
        book.FilePath = await files.StoreBookAsync(sourcePath, book.Sha256, ct);
        await db.SaveChangesAsync(ct);
    }
}
