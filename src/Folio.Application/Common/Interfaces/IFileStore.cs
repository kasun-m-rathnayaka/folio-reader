namespace Folio.Application.Common.Interfaces;

/// <summary>
/// Manages app storage: on desktop a folder under %LocalAppData%\Folio\; in the browser, private file storage (OPFS).
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

    /// <summary>Deletes the app-managed PDF copy and cover for a book. Imported originals are never touched.</summary>
    Task DeleteManagedFilesAsync(string sha256, CancellationToken cancellationToken = default);
}

