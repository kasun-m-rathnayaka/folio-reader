namespace Folio.Application.Common.Interfaces;

/// <summary>
/// Coordinates transactional persistence across repositories.
/// </summary>
public interface IUnitOfWork
{
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
