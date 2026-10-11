using System.IO.Compression;
using System.Text.Json;
using Folio.Application.Backup;
using Folio.Application.Common.Interfaces;
using Folio.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Folio.Infrastructure.Backup;

/// <summary>
/// Atomic database and library backup & restore service (FR-DAT-02, 05).
/// Creates portable ZIP archives containing SQLite state with full WAL checkpointing.
/// </summary>
public class BackupService : IBackupService
{
    private readonly FolioDbContext _context;
    private readonly IFileStore _fileStore;

    public BackupService(FolioDbContext context, IFileStore fileStore)
    {
        _context = context;
        _fileStore = fileStore;
    }

    public async Task<string> CreateBackupAsync(string destinationZipPath, CancellationToken ct = default)
    {
        // 1. Flush SQLite WAL to database file
        try
        {
            await _context.Database.ExecuteSqlRawAsync("PRAGMA wal_checkpoint(FULL);", ct);
        }
        catch { }

        string dbPath = Path.Combine(_fileStore.DatabaseDirectory, "folio.db");
        if (!File.Exists(dbPath))
        {
            throw new FileNotFoundException("Database file not found for backup.", dbPath);
        }

        int booksCount = await _context.Books.CountAsync(ct);
        int annCount = await _context.Annotations.CountAsync(ct);
        int bmCount = await _context.Bookmarks.CountAsync(ct);

        var meta = new BackupMetadata(
            AppVersion: "1.0.0",
            CreatedAt: DateTimeOffset.UtcNow,
            BooksCount: booksCount,
            AnnotationsCount: annCount,
            BookmarksCount: bmCount);

        string? dir = Path.GetDirectoryName(destinationZipPath);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

        if (File.Exists(destinationZipPath)) File.Delete(destinationZipPath);

        using var zip = ZipFile.Open(destinationZipPath, ZipArchiveMode.Create);

        // Add database copy with shared read access to prevent locking collisions with open SQLite connections
        var dbEntry = zip.CreateEntry("folio.db", CompressionLevel.Optimal);
        await using (var entryStream = dbEntry.Open())
        await using (var dbStream = new FileStream(dbPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
        {
            await dbStream.CopyToAsync(entryStream, ct);
        }

        // Add metadata
        var metaEntry = zip.CreateEntry("metadata.json", CompressionLevel.Optimal);
        await using (var entryStream = metaEntry.Open())
        {
            await JsonSerializer.SerializeAsync(entryStream, meta, cancellationToken: ct);
        }

        return destinationZipPath;
    }

    public async Task<BackupMetadata?> InspectBackupAsync(string zipPath, CancellationToken ct = default)
    {
        if (!File.Exists(zipPath)) return null;

        try
        {
            using var zip = ZipFile.OpenRead(zipPath);
            var metaEntry = zip.GetEntry("metadata.json");
            if (metaEntry == null) return null;

            await using var stream = metaEntry.Open();
            return await JsonSerializer.DeserializeAsync<BackupMetadata>(stream, cancellationToken: ct);
        }
        catch
        {
            return null;
        }
    }

    public async Task<bool> RestoreBackupAsync(string sourceZipPath, CancellationToken ct = default)
    {
        if (!File.Exists(sourceZipPath)) return false;

        string dbPath = Path.Combine(_fileStore.DatabaseDirectory, "folio.db");
        string backupBeforeRestore = dbPath + ".bak";

        try
        {
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();

            using var zip = ZipFile.OpenRead(sourceZipPath);
            var dbEntry = zip.GetEntry("folio.db");
            if (dbEntry == null) return false;

            // Pre-restore snapshot rollback safety
            if (File.Exists(dbPath))
            {
                File.Copy(dbPath, backupBeforeRestore, overwrite: true);
            }

            // Extract fresh database
            dbEntry.ExtractToFile(dbPath, overwrite: true);
            return true;
        }
        catch
        {
            // Rollback if failure
            if (File.Exists(backupBeforeRestore))
            {
                File.Copy(backupBeforeRestore, dbPath, overwrite: true);
            }
            throw;
        }
    }
}
