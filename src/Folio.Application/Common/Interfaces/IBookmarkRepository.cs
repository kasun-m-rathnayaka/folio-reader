using Folio.Domain.Entities;

namespace Folio.Application.Common.Interfaces;

/// <summary>
/// Repository interface for Bookmark persistence and querying (FR-BKM-01..03).
/// </summary>
public interface IBookmarkRepository
{
    Task<Bookmark?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Bookmark?> GetDogEarAsync(Guid bookId, int pageIndex, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Bookmark>> GetByBookIdAsync(Guid bookId, CancellationToken cancellationToken = default);
    Task AddAsync(Bookmark bookmark, CancellationToken cancellationToken = default);
    void Update(Bookmark bookmark);
    void Remove(Bookmark bookmark);
}
