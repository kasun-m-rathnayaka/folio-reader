using Folio.Domain.Entities;
using Folio.Domain.Enums;

namespace Folio.Application.Common.Interfaces;

/// <summary>
/// Repository interface for Book persistence and querying.
/// </summary>
public interface IBookRepository
{
    Task<Book?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<Book?> GetBySha256Async(string sha256, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Book>> GetAllAsync(ReadingStatus? statusFilter = null, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Book>> GetRecentlyReadAsync(int count = 5, CancellationToken cancellationToken = default);
    Task AddAsync(Book book, CancellationToken cancellationToken = default);
    void Update(Book book);
    void Remove(Book book);
}
