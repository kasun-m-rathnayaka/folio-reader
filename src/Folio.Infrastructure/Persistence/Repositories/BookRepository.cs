using Folio.Application.Common.Interfaces;
using Folio.Domain.Entities;
using Folio.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Folio.Infrastructure.Persistence.Repositories;

/// <summary>
/// EF Core implementation of IBookRepository.
/// </summary>
public class BookRepository : IBookRepository
{
    private readonly FolioDbContext _context;

    public BookRepository(FolioDbContext context)
    {
        _context = context;
    }

    public async Task<Book?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        return await _context.Books
            .Include(b => b.ReadingPosition)
            .Include(b => b.BookShelves)
                .ThenInclude(bs => bs.Shelf)
            .Include(b => b.BookTags)
                .ThenInclude(bt => bt.Tag)
            .FirstOrDefaultAsync(b => b.Id == id, cancellationToken);
    }

    public async Task<Book?> GetReadingBookAsync(Guid id, CancellationToken cancellationToken = default) =>
        await _context.Books.FirstOrDefaultAsync(b => b.Id == id, cancellationToken);

    public async Task<Book?> GetBySha256Async(string sha256, CancellationToken cancellationToken = default)
    {
        return await _context.Books
            .Include(b => b.ReadingPosition)
            .FirstOrDefaultAsync(b => b.Sha256 == sha256, cancellationToken);
    }

    public async Task<IReadOnlyList<Book>> GetAllAsync(
        ReadingStatus? statusFilter = null,
        CancellationToken cancellationToken = default)
    {
        var query = _context.Books.Where(b => b.TrashedAt == null);

        if (statusFilter.HasValue)
        {
            query = query.Where(b => b.Status == statusFilter.Value);
        }

        return await query
            .Include(b => b.ReadingPosition)
            .OrderBy(b => b.Title)
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<Book>> GetRecentlyReadAsync(
        int count = 5,
        CancellationToken cancellationToken = default)
    {
        return await _context.Books
            .Where(b => b.LastReadAt != null && b.TrashedAt == null)
            .OrderByDescending(b => b.LastReadAt)
            .Take(count)
            .Include(b => b.ReadingPosition)
            .ToListAsync(cancellationToken);
    }

    public async Task AddAsync(Book book, CancellationToken cancellationToken = default)
    {
        await _context.Books.AddAsync(book, cancellationToken);
    }

    public void Update(Book book)
    {
        book.UpdatedAt = DateTimeOffset.UtcNow;
        _context.Books.Update(book);
    }

    public void Remove(Book book)
    {
        _context.Books.Remove(book);
    }
}

