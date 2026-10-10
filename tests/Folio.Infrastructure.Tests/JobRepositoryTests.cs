using Folio.Domain.Entities;
using Folio.Domain.Enums;
using Folio.Infrastructure.Persistence;
using Folio.Infrastructure.Persistence.Repositories;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Folio.Infrastructure.Tests;

public class JobRepositoryTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly FolioDbContext _context;
    private readonly JobRepository _jobRepository;
    private readonly UnitOfWork _unitOfWork;

    public JobRepositoryTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<FolioDbContext>()
            .UseSqlite(_connection)
            .Options;

        _context = new FolioDbContext(options);
        _context.Database.EnsureCreated();

        _jobRepository = new JobRepository(_context);
        _unitOfWork = new UnitOfWork(_context);
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
    }

    [Fact]
    public async Task GetNextPendingJobAsync_ReturnsHigherPriorityFirst()
    {
        var lowJob = new Job
        {
            Type = JobType.IndexFts,
            Priority = 1,
            Status = JobStatus.Queued
        };

        var highJob = new Job
        {
            Type = JobType.Thumbnail,
            Priority = 10,
            Status = JobStatus.Queued
        };

        await _jobRepository.AddAsync(lowJob);
        await _jobRepository.AddAsync(highJob);
        await _unitOfWork.SaveChangesAsync();

        var next = await _jobRepository.GetNextPendingJobAsync();
        Assert.NotNull(next);
        Assert.Equal(highJob.Id, next.Id);
        Assert.Equal(10, next.Priority);
    }

    [Fact]
    public async Task GetNextPendingJobAsync_ReturnsEarliestCreatedWithinSamePriority()
    {
        var firstJob = new Job
        {
            Type = JobType.ExtractText,
            Priority = 5,
            Status = JobStatus.Queued,
            CreatedAt = DateTimeOffset.UtcNow.AddMinutes(-5)
        };

        var secondJob = new Job
        {
            Type = JobType.Thumbnail,
            Priority = 5,
            Status = JobStatus.Queued,
            CreatedAt = DateTimeOffset.UtcNow
        };

        await _jobRepository.AddAsync(firstJob);
        await _jobRepository.AddAsync(secondJob);
        await _unitOfWork.SaveChangesAsync();

        var next = await _jobRepository.GetNextPendingJobAsync();
        Assert.NotNull(next);
        Assert.Equal(firstJob.Id, next.Id);
    }
}
