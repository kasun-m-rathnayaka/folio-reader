using Folio.Application.Common.Interfaces;
using Folio.Domain.Entities;
using Folio.Domain.Enums;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Folio.Infrastructure.Jobs;

/// <summary>
/// Hosted worker executing queued background operations with battery awareness and priority scheduling (FR-DAT-05, NFR-10).
/// </summary>
public class BackgroundJobWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly BackgroundJobQueue _jobQueue;
    private readonly IBatteryMonitor _batteryMonitor;
    private readonly IPdfTextExtractor _textExtractor;
    private readonly IPdfRasterizer? _rasterizer;
    private readonly IFileStore _fileStore;
    private readonly ILogger<BackgroundJobWorker> _logger;

    public BackgroundJobWorker(
        IServiceScopeFactory scopeFactory,
        BackgroundJobQueue jobQueue,
        IBatteryMonitor batteryMonitor,
        IPdfTextExtractor textExtractor,
        IFileStore fileStore,
        ILogger<BackgroundJobWorker> logger,
        IPdfRasterizer? rasterizer = null)
    {
        _scopeFactory = scopeFactory;
        _jobQueue = jobQueue;
        _batteryMonitor = batteryMonitor;
        _textExtractor = textExtractor;
        _fileStore = fileStore;
        _logger = logger;
        _rasterizer = rasterizer;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Folio background job worker started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Battery throttle check (NFR-10): pause/throttle if running on DC battery power
                bool onBattery = _batteryMonitor.IsRunningOnBattery;

                using var scope = _scopeFactory.CreateScope();
                var jobRepo = scope.ServiceProvider.GetRequiredService<IJobRepository>();
                var bookRepo = scope.ServiceProvider.GetRequiredService<IBookRepository>();
                var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

                var job = await jobRepo.GetNextPendingJobAsync(stoppingToken);

                if (job == null)
                {
                    // Wait for next channel signal or poll interval
                    await Task.WhenAny(
                        _jobQueue.SignalReader.WaitToReadAsync(stoppingToken).AsTask(),
                        Task.Delay(TimeSpan.FromSeconds(onBattery ? 8 : 3), stoppingToken));
                    continue;
                }

                // If running on battery, postpone low-priority idle jobs (priority < 5)
                if (onBattery && job.Priority < 5)
                {
                    _logger.LogDebug("Throttling low-priority background job {JobId} while on battery power.", job.Id);
                    await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
                    continue;
                }

                // Transition to Running
                job.Status = JobStatus.Running;
                job.StartedAt = DateTimeOffset.UtcNow;
                job.Progress = 0.05;
                jobRepo.Update(job);
                await uow.SaveChangesAsync(stoppingToken);
                _jobQueue.NotifyJobUpdated(job);

                try
                {
                    await ProcessJobAsync(job, bookRepo, jobRepo, uow, stoppingToken);

                    job.Status = JobStatus.Completed;
                    job.Progress = 1.0;
                    job.CompletedAt = DateTimeOffset.UtcNow;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Background job {JobId} ({Type}) failed: {Message}", job.Id, job.Type, ex.Message);
                    job.Status = JobStatus.Failed;
                    job.ErrorMessage = ex.Message;
                    job.CompletedAt = DateTimeOffset.UtcNow;
                }

                jobRepo.Update(job);
                await uow.SaveChangesAsync(stoppingToken);
                _jobQueue.NotifyJobUpdated(job);

                // Throttle pacing between jobs to avoid CPU spikes
                if (onBattery)
                {
                    await Task.Delay(TimeSpan.FromSeconds(2), stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error in background job loop: {Message}", ex.Message);
                await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);
            }
        }

        _logger.LogInformation("Folio background job worker terminated.");
    }

    private async Task ProcessJobAsync(
        Job job,
        IBookRepository bookRepo,
        IJobRepository jobRepo,
        IUnitOfWork uow,
        CancellationToken cancellationToken)
    {
        if (!job.BookId.HasValue)
        {
            return;
        }

        var book = await bookRepo.GetByIdAsync(job.BookId.Value, cancellationToken);
        if (book == null || !File.Exists(book.FilePath))
        {
            return;
        }

        switch (job.Type)
        {
            case JobType.Thumbnail:
                if (_rasterizer != null && string.IsNullOrEmpty(book.CoverPath))
                {
                    string coverTarget = _fileStore.GetCoverPath(book.Sha256);
                    await _rasterizer.RenderPageToImageAsync(
                        book.FilePath,
                        pageIndex: 0,
                        outputImagePath: coverTarget,
                        targetDpi: 150,
                        maxDimensionPx: 600,
                        cancellationToken: cancellationToken);

                    if (File.Exists(coverTarget))
                    {
                        book.CoverPath = coverTarget;
                        bookRepo.Update(book);
                        await uow.SaveChangesAsync(cancellationToken);
                    }
                }
                break;

            case JobType.ExtractText:
                var progress = new Progress<double>(async p =>
                {
                    job.Progress = p;
                    jobRepo.Update(job);
                    await uow.SaveChangesAsync(cancellationToken);
                    _jobQueue.NotifyJobUpdated(job);
                });

                await _textExtractor.ExtractAllPagesAsync(book.FilePath, progress, cancellationToken);
                break;

            case JobType.IndexFts:
            case JobType.OcrScan:
                // Marked as completed in initial pipeline
                job.Progress = 1.0;
                break;
        }
    }
}
