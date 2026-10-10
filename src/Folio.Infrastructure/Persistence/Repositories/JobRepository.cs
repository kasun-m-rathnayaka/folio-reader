using Folio.Application.Common.Interfaces;
using Folio.Domain.Entities;
using Folio.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Folio.Infrastructure.Persistence.Repositories;

/// <summary>
/// EF Core implementation of IJobRepository.
/// Supports prioritized FIFO scheduling of background tasks.
/// </summary>
public class JobRepository : IJobRepository
{
    private readonly FolioDbContext _context;

    public JobRepository(FolioDbContext context)
    {
        _context = context;
    }

    public async Task<Job?> GetNextPendingJobAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Jobs
            .Where(j => j.Status == JobStatus.Queued)
            .OrderByDescending(j => j.Priority)
            .ThenBy(j => j.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<Job>> GetActiveJobsAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Jobs
            .Where(j => j.Status == JobStatus.Running || j.Status == JobStatus.Queued)
            .OrderByDescending(j => j.Priority)
            .ThenBy(j => j.CreatedAt)
            .ToListAsync(cancellationToken);
    }

    public async Task AddAsync(Job job, CancellationToken cancellationToken = default)
    {
        await _context.Jobs.AddAsync(job, cancellationToken);
    }

    public void Update(Job job)
    {
        job.UpdatedAt = DateTimeOffset.UtcNow;
        _context.Jobs.Update(job);
    }
}

