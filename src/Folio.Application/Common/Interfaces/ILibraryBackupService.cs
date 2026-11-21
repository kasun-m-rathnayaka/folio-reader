namespace Folio.Application.Common.Interfaces;

public sealed record BackupResult(bool Completed, int Books, int Files, string? FileName = null, string? Message = null);
public sealed record StorageStatus(bool Persistent, long UsedBytes, long QuotaBytes);

/// <summary>
/// Exports the whole library (database, PDFs, covers) as one archive and restores it (WEB-4). The browser needs this:
/// its storage can be evicted and cannot be copied like a folder. Desktop libraries are plain folders.
/// </summary>
public interface ILibraryBackupService
{
    Task<BackupResult> ExportAsync(IProgress<double>? progress = null, CancellationToken cancellationToken = default);
    /// <summary>Lets the user pick an archive and replaces the current library with it.</summary>
    Task<BackupResult> ImportAsync(IProgress<double>? progress = null, CancellationToken cancellationToken = default);
    Task<StorageStatus> GetStorageStatusAsync();
}
