using Folio.Domain.Entities;
using Folio.Domain.Enums;

namespace Folio.Application.Common.Interfaces;

/// <summary>
/// Port for queueing background work and broadcasting activity state to UI components (FR-DAT-05, NFR-10).
/// </summary>
public interface IBackgroundJobQueue
{
    Task<Job> EnqueueAsync(Guid? bookId, JobType type, int priority = 5, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Job>> GetActiveJobsAsync(CancellationToken cancellationToken = default);
    event Action<Job>? JobUpdated;
}

