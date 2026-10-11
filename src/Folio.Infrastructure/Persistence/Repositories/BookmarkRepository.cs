using Folio.Application.Common.Interfaces;
using Folio.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Folio.Infrastructure.Persistence.Repositories;

/// <summary>
/// EF Core implementation of IBookmarkRepository.
/// </summary>
public class BookmarkRepository : IBookmarkRepository
{
    private readonly FolioDbContext _context;

    public BookmarkRepository(FolioDbContext context)
    {
        _context = context;
    }

    public async Task<Bookmark?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return await _context.Bookmarks.FirstOrDefaultAsync(b => b.Id == id, cancellationToken);
    }

    public async Task<Bookmark?> GetDogEarAsync(Guid bookId, int pageIndex, CancellationToken cancellationToken = default)
    {
        return await _context.Bookmarks
            .FirstOrDefaultAsync(b => b.BookId == bookId && b.PageIndex == pageIndex && b.IsDogEar, cancellationToken);
    }

    public async Task<IReadOnlyList<Bookmark>> GetByBookIdAsync(Guid bookId, CancellationToken cancellationToken = default)
    {
        return await _context.Bookmarks
            .Where(b => b.BookId == bookId)
            .OrderBy(b => b.PageIndex)
            .ThenBy(b => b.CreatedAt)
            .ToListAsync(cancellationToken);
    }

    public async Task AddAsync(Bookmark bookmark, CancellationToken cancellationToken = default)
    {
        await _context.Bookmarks.AddAsync(bookmark, cancellationToken);
    }

    public void Update(Bookmark bookmark)
    {
        bookmark.UpdatedAt = DateTimeOffset.UtcNow;
        _context.Bookmarks.Update(bookmark);
    }

    public void Remove(Bookmark bookmark)
    {
        _context.Bookmarks.Remove(bookmark);
    }
}
