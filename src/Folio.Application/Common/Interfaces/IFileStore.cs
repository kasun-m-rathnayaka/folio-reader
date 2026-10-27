namespace Folio.Application.Common.Interfaces;

/// <summary>
/// Manages physical storage under %LocalAppData%\Folio\ (books, covers, cache, backups, logs).
/// </summary>
public interface IFileStore
{
    string RootDirectory { get; }
    string DatabaseDirectory { get; }
    string BooksDirectory { get; }
    string CoversDirectory { get; }
    string CacheDirectory { get; }
    string BackupsDirectory { get; }
    string LogsDirectory { get; }

    void EnsureDirectories();
    Task<string> ComputeSha256Async(string filePath, CancellationToken cancellationToken = default);
    Task<string> StoreBookAsync(string sourceFilePath, string sha256, CancellationToken cancellationToken = default);
    string GetBookPath(string sha256);
    string GetCoverPath(string sha256);
    bool BookExists(string sha256);
}

