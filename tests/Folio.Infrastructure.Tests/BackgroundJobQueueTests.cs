using Folio.Domain.Enums;
using Folio.Infrastructure.Jobs;
using Folio.Infrastructure.Persistence;
using Folio.Infrastructure.Persistence.Repositories;
using Folio.Application.Common.Interfaces;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Folio.Infrastructure.Tests;

public class BackgroundJobQueueTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly ServiceProvider _serviceProvider;
    private readonly BackgroundJobQueue _jobQueue;

    public BackgroundJobQueueTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var services = new ServiceCollection();
        services.AddDbContext<FolioDbContext>(opts =>
        {
            opts.UseSqlite(_connection);
        });

        services.AddScoped<IJobRepository, JobRepository>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        _serviceProvider = services.BuildServiceProvider();

        // Create tables
        using var scope = _serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<FolioDbContext>();
        context.Database.EnsureCreated();

        _jobQueue = new BackgroundJobQueue(_serviceProvider.GetRequiredService<IServiceScopeFactory>());
    }

    public void Dispose()
    {
        _serviceProvider.Dispose();
        _connection.Dispose();
    }

    [Fact]
    public async Task EnqueueAsync_CreatesJobAndFiresNotification()
    {
        bool notificationFired = false;
        _jobQueue.JobUpdated += job =>
        {
            notificationFired = true;
        };

        var job = await _jobQueue.EnqueueAsync(
            bookId: null,
            type: JobType.Thumbnail,
            priority: 8);

        Assert.NotNull(job);
        Assert.Equal(JobType.Thumbnail, job.Type);
        Assert.Equal(8, job.Priority);
        Assert.Equal(JobStatus.Queued, job.Status);
        Assert.True(notificationFired, "EnqueueAsync must fire JobUpdated event.");

        var activeJobs = await _jobQueue.GetActiveJobsAsync();
        Assert.Single(activeJobs);
        Assert.Equal(job.Id, activeJobs[0].Id);
    }
}
