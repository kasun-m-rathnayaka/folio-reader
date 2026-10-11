namespace Folio.Application.Backup;

public record BackupMetadata(
    string AppVersion,
    DateTimeOffset CreatedAt,
    int BooksCount,
    int AnnotationsCount,
    int BookmarksCount);

public interface IBackupService
{
    Task<string> CreateBackupAsync(string destinationZipPath, CancellationToken ct = default);
    Task<bool> RestoreBackupAsync(string sourceZipPath, CancellationToken ct = default);
    Task<BackupMetadata?> InspectBackupAsync(string zipPath, CancellationToken ct = default);
}
