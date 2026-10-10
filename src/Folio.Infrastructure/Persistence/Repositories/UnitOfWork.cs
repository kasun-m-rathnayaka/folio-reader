using Folio.Application.Common.Interfaces;

namespace Folio.Infrastructure.Persistence.Repositories;

/// <summary>
/// Coordinates atomic transactions and change persistence across repositories.
/// </summary>
public class UnitOfWork : IUnitOfWork
{
    private readonly FolioDbContext _context;

    public UnitOfWork(FolioDbContext context)
    {
        _context = context;
    }

    public async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        return await _context.SaveChangesAsync(cancellationToken);
    }
}

