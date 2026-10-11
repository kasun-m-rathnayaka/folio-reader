using System.Security.Cryptography;
using Folio.Application.Common.Interfaces;

namespace Folio.Infrastructure.Storage;

/// <summary>
/// Physical file storage management for books, covers, caches, models, and logs.
/// Defaults to %LocalAppData%\Folio\ (configurable via FileStoreOptions).
/// </summary>
public class FileStore : IFileStore
{
    public string RootDirectory { get; }
    public string DatabaseDirectory => Path.Combine(RootDirectory, "db");
    public string BooksDirectory => Path.Combine(RootDirectory, "library", "books");
    public string CoversDirectory => Path.Combine(RootDirectory, "library", "covers");
    public string CacheDirectory => Path.Combine(RootDirectory, "cache");
    public string ModelsDirectory => Path.Combine(RootDirectory, "models");
    public string BackupsDirectory => Path.Combine(RootDirectory, "backups");
    public string LogsDirectory => Path.Combine(RootDirectory, "logs");

    public FileStore(FileStoreOptions? options = null)
    {
        RootDirectory = string.IsNullOrWhiteSpace(options?.RootDirectory)
            ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Folio")
            : Path.GetFullPath(options.RootDirectory);
    }

    public void EnsureDirectories()
    {
        Directory.CreateDirectory(RootDirectory);
        Directory.CreateDirectory(DatabaseDirectory);
        Directory.CreateDirectory(BooksDirectory);
        Directory.CreateDirectory(CoversDirectory);
        Directory.CreateDirectory(CacheDirectory);
        Directory.CreateDirectory(ModelsDirectory);
        Directory.CreateDirectory(BackupsDirectory);
        Directory.CreateDirectory(LogsDirectory);
    }

    public async Task<string> ComputeSha256Async(string filePath, CancellationToken cancellationToken = default)
    {
        if (!File.Exists(filePath))
        {
            throw new FileNotFoundException($"Cannot compute SHA-256 for non-existent file: {filePath}", filePath);
        }

        await using var stream = new FileStream(
            filePath,
            FileMode.Open,
            FileAccess.Read,
            FileShare.Read,
            bufferSize: 81920,
            useAsync: true);

        byte[] hash = await SHA256.HashDataAsync(stream, cancellationToken);
        return Convert.ToHexStringLower(hash);
    }

    public async Task<string> StoreBookAsync(
        string sourceFilePath,
        string sha256,
        CancellationToken cancellationToken = default)
    {
        if (!File.Exists(sourceFilePath))
        {
            throw new FileNotFoundException($"Source book not found at: {sourceFilePath}", sourceFilePath);
        }

        EnsureDirectories();

        string destination = GetBookPath(sha256);

        // Deduplication: if target book already exists and is not empty, preserve it
        if (File.Exists(destination) && new FileInfo(destination).Length > 0 &&
            string.Equals(await ComputeSha256Async(destination, cancellationToken), sha256, StringComparison.OrdinalIgnoreCase))
        {
            return destination;
        }

        // Atomic write pattern: copy to temporary file in the same directory, then rename
        string tempDestination = Path.Combine(BooksDirectory, $"{sha256.ToLowerInvariant()}.tmp.{Guid.NewGuid():N}");

        try
        {
            await using (var sourceStream = new FileStream(sourceFilePath, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, true))
            await using (var targetStream = new FileStream(tempDestination, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, true))
            {
                await sourceStream.CopyToAsync(targetStream, cancellationToken);
            }

            File.Move(tempDestination, destination, overwrite: true);
        }
        catch
        {
            if (File.Exists(tempDestination))
            {
                try { File.Delete(tempDestination); } catch { /* best effort cleanup */ }
            }
            throw;
        }

        return destination;
    }

    public string GetBookPath(string sha256)
    {
        return Path.Combine(BooksDirectory, $"{sha256.ToLowerInvariant()}.pdf");
    }

    public string GetCoverPath(string sha256)
    {
        return Path.Combine(CoversDirectory, $"{sha256.ToLowerInvariant()}.webp");
    }

    public bool BookExists(string sha256)
    {
        string path = GetBookPath(sha256);
        return File.Exists(path) && new FileInfo(path).Length > 0;
    }
}

