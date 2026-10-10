using System.Threading.Channels;
using Folio.Application.Common.Interfaces;
using Folio.Domain.Entities;
using Folio.Domain.Enums;
using Microsoft.Extensions.DependencyInjection;

namespace Folio.Infrastructure.Jobs;

/// <summary>
/// In-memory queue coordinator backed by persistent SQLite storage (FR-DAT-05, NFR-10).
/// Bridges UI enqueue commands with background execution workers.
/// </summary>
public class BackgroundJobQueue : IBackgroundJobQueue
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly Channel<Guid> _signalChannel;

    public event Action<Job>? JobUpdated;

    public BackgroundJobQueue(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
        _signalChannel = Channel.CreateUnbounded<Guid>(new UnboundedChannelOptions
        {
            SingleReader = true,
            SingleWriter = false
        });
    }

    public ChannelReader<Guid> SignalReader => _signalChannel.Reader;

    public async Task<Job> EnqueueAsync(
        Guid? bookId,
        JobType type,
        int priority = 5,
        CancellationToken cancellationToken = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var jobRepo = scope.ServiceProvider.GetRequiredService<IJobRepository>();
        var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

        var job = new Job
        {
            BookId = bookId,
            Type = type,
            Priority = priority,
            Status = JobStatus.Queued,
            Progress = 0.0
        };

        await jobRepo.AddAsync(job, cancellationToken);
        await uow.SaveChangesAsync(cancellationToken);

        _signalChannel.Writer.TryWrite(job.Id);
        JobUpdated?.Invoke(job);

        return job;
    }

    public async Task<IReadOnlyList<Job>> GetActiveJobsAsync(CancellationToken cancellationToken = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var jobRepo = scope.ServiceProvider.GetRequiredService<IJobRepository>();
        return await jobRepo.GetActiveJobsAsync(cancellationToken);
    }

    public void NotifyJobUpdated(Job job)
    {
        JobUpdated?.Invoke(job);
    }
}

