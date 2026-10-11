using Folio.Domain.Entities;

namespace Folio.Application.Common.Interfaces;

/// <summary>
/// Repository interface for ReadingPosition persistence and querying.
/// </summary>
public interface IReadingPositionRepository
{
    Task<ReadingPosition?> GetByBookIdAsync(Guid bookId, CancellationToken cancellationToken = default);
    Task AddAsync(ReadingPosition position, CancellationToken cancellationToken = default);
    void Update(ReadingPosition position);
}

