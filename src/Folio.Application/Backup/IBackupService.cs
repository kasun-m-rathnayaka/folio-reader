namespace Folio.Application.Backup;

public record BackupMetadata(
    string AppVersion,
    DateTimeOffset CreatedAt,
    int BooksCount,
    int AnnotationsCount,
    int BookmarksCount,
    bool IncludesPdfFiles = false);

public interface IBackupService
{
    Task<string> CreateBackupAsync(string destinationZipPath, CancellationToken ct = default, bool includePdfFiles = false);
    Task<bool> RestoreBackupAsync(string sourceZipPath, CancellationToken ct = default);
    Task<BackupMetadata?> InspectBackupAsync(string zipPath, CancellationToken ct = default);
}
