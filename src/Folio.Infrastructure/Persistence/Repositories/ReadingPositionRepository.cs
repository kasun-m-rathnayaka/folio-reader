using Folio.Application.Common.Interfaces;
using Folio.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Folio.Infrastructure.Persistence.Repositories;

/// <summary>
/// EF Core implementation of IReadingPositionRepository.
/// </summary>
public class ReadingPositionRepository : IReadingPositionRepository
{
    private readonly FolioDbContext _context;

    public ReadingPositionRepository(FolioDbContext context)
    {
        _context = context;
    }

    public async Task<ReadingPosition?> GetByBookIdAsync(Guid bookId, CancellationToken cancellationToken = default)
    {
        return await _context.ReadingPositions
            .FirstOrDefaultAsync(p => p.BookId == bookId, cancellationToken);
    }

    public async Task AddAsync(ReadingPosition position, CancellationToken cancellationToken = default)
    {
        await _context.ReadingPositions.AddAsync(position, cancellationToken);
    }

    public void Update(ReadingPosition position)
    {
        position.UpdatedAt = DateTimeOffset.UtcNow;
        _context.ReadingPositions.Update(position);
    }
}
