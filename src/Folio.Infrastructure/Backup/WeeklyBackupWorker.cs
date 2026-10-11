using Folio.Application.Backup;
using Folio.Application.Common.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Folio.Infrastructure.Backup;

public class WeeklyBackupWorker(IServiceScopeFactory scopes, IFileStore files, IAppPreferencesService preferences,
    ILogger<WeeklyBackupWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Let the window finish opening before doing maintenance work.
        try { await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken); }
        catch (OperationCanceledException) { return; }
        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        do
        {
            try
            {
                if (!preferences.Current.WeeklyBackup) continue;
                var latest = Directory.EnumerateFiles(files.BackupsDirectory, "weekly_*.zip")
                    .Select(File.GetLastWriteTimeUtc).DefaultIfEmpty(DateTime.MinValue).Max();
                if (DateTime.UtcNow - latest < TimeSpan.FromDays(7)) continue;
                await using var scope = scopes.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<IBackupService>().CreateBackupAsync(
                    Path.Combine(files.BackupsDirectory, $"weekly_{DateTime.UtcNow:yyyyMMdd_HHmmss}.zip"), stoppingToken);
                logger.LogInformation("Weekly library backup completed.");
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { return; }
            catch (Exception ex) { logger.LogWarning(ex, "Weekly library backup did not complete; it will be retried."); }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
