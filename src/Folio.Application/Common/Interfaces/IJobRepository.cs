using Folio.Domain.Entities;
using Folio.Domain.Enums;

namespace Folio.Application.Common.Interfaces;

/// <summary>
/// Repository interface for background job queuing and monitoring.
/// </summary>
public interface IJobRepository
{
    Task<Job?> GetNextPendingJobAsync(CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Job>> GetActiveJobsAsync(CancellationToken cancellationToken = default);
    Task AddAsync(Job job, CancellationToken cancellationToken = default);
    void Update(Job job);
}
