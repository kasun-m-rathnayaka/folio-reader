using System.IO.Compression;
using System.Text.Json;
using Folio.Application.Backup;
using Folio.Application.Common.Interfaces;
using Folio.Infrastructure.Persistence;
using Folio.Infrastructure.Persistence.Migrations;
using Folio.Infrastructure.Storage;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Folio.Infrastructure.Backup;

/// <summary>SQLite online snapshots include WAL data. Restores validate before excluding writers.</summary>
public class BackupService(FolioDbContext context, IFileStore files, LibraryMaintenanceGate? maintenance = null,
    IAppPreferencesService? preferences = null) : IBackupService
{
    private static SqliteConnection Connection(string path, bool readOnly = false) => new(new SqliteConnectionStringBuilder
        { DataSource = path, Mode = readOnly ? SqliteOpenMode.ReadOnly : SqliteOpenMode.ReadWriteCreate, Pooling = false, ForeignKeys = true }.ConnectionString);
    private string DatabasePath => Path.Combine(files.DatabaseDirectory, "folio.db");
    private static async Task Check(SqliteConnection connection, CancellationToken ct)
    {
        await using var command = connection.CreateCommand(); command.CommandText = "PRAGMA quick_check;";
        if (Convert.ToString(await command.ExecuteScalarAsync(ct)) != "ok") throw new InvalidDataException("The backup database failed its integrity check.");
    }
    private static async Task Snapshot(string sourcePath, string targetPath, CancellationToken ct)
    {
        await using var source = Connection(sourcePath, true); await source.OpenAsync(ct);
        await using var target = Connection(targetPath); await target.OpenAsync(ct);
        source.BackupDatabase(target); await Check(target, ct);
    }
    public async Task<string> CreateBackupAsync(string destinationZipPath, CancellationToken ct = default, bool includePdfFiles = false)
    {
        if (!File.Exists(DatabasePath)) throw new FileNotFoundException("The library database is missing.");
        var stage = Path.Combine(files.CacheDirectory, "backup-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(stage);
        var temporaryZip = destinationZipPath + ".tmp." + Guid.NewGuid().ToString("N");
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(destinationZipPath))!);
        try
        {
            var snapshot = Path.Combine(stage, "folio.db"); await Snapshot(DatabasePath, snapshot, ct);
            await using var db = new FolioDbContext(new DbContextOptionsBuilder<FolioDbContext>().UseSqlite($"Data Source={snapshot};Pooling=False").Options);
            var books = await db.Books.AsNoTracking().ToListAsync(ct);
            var metadata = new BackupMetadata("0.2.0", DateTimeOffset.UtcNow, books.Count, await db.Annotations.CountAsync(ct), await db.Bookmarks.CountAsync(ct), includePdfFiles);
            using (var archive = ZipFile.Open(temporaryZip, ZipArchiveMode.Create))
            {
                archive.CreateEntryFromFile(snapshot, "folio.db");
                await using (var stream = archive.CreateEntry("metadata.json").Open()) await JsonSerializer.SerializeAsync(stream, metadata, cancellationToken: ct);
                var settings = Path.Combine(files.RootDirectory, "settings.json");
                if (File.Exists(settings)) archive.CreateEntryFromFile(settings, "settings.json");
                if (includePdfFiles) foreach (var book in books)
                {
                    ct.ThrowIfCancellationRequested();
                    var pdfPath = files.GetBookPath(book.Sha256);
                    if (!File.Exists(pdfPath)) throw new FileNotFoundException("A managed PDF is missing. Locate it before making a backup that includes PDFs.");
                    await AddFile(archive, pdfPath, $"books/{book.Sha256}.pdf", ct);
                    var cover = files.GetCoverPath(book.Sha256);
                    if (File.Exists(cover)) await AddFile(archive, cover, $"covers/{Path.GetFileName(cover)}", ct);
                }
            }
            File.Move(temporaryZip, destinationZipPath, true); return destinationZipPath;
        }
        finally { if (File.Exists(temporaryZip)) File.Delete(temporaryZip); Directory.Delete(stage, true); }
    }
    private static async Task AddFile(ZipArchive archive, string path, string name, CancellationToken ct)
    {
        await using var input = File.OpenRead(path); await using var output = archive.CreateEntry(name, CompressionLevel.Optimal).Open();
        await input.CopyToAsync(output, ct);
    }
    public async Task<BackupMetadata?> InspectBackupAsync(string zipPath, CancellationToken ct = default)
    {
        if (!File.Exists(zipPath)) return null;
        try
        {
            using var archive = ZipFile.OpenRead(zipPath); var entry = archive.GetEntry("metadata.json");
            if (entry == null || entry.Length > 65536 || archive.GetEntry("folio.db") == null) return null;
            await using var input = entry.Open(); return await JsonSerializer.DeserializeAsync<BackupMetadata>(input, cancellationToken: ct);
        }
        catch (InvalidDataException) { return null; } catch (JsonException) { return null; } catch (IOException) { return null; }
    }
    public async Task<bool> RestoreBackupAsync(string sourceZipPath, CancellationToken ct = default)
    {
        if (!File.Exists(sourceZipPath)) return false;
        var stageRoot = Path.Combine(files.CacheDirectory, "restore-" + Guid.NewGuid().ToString("N"));
        var stagedFiles = new FileStore(new() { RootDirectory = stageRoot }); stagedFiles.EnsureDirectories();
        try
        {
            using var archive = ZipFile.OpenRead(sourceZipPath);
            var databaseEntry = archive.GetEntry("folio.db");
            if (databaseEntry == null || archive.Entries.Count(e => e.FullName == "folio.db") != 1) throw new InvalidDataException("This archive does not contain a unique library database.");
            var stagedDatabase = Path.Combine(stagedFiles.DatabaseDirectory, "folio.db");
            await using (var input = databaseEntry.Open()) await using (var output = File.Create(stagedDatabase)) await input.CopyToAsync(output, ct);
            await using (var checkConnection = Connection(stagedDatabase)) { await checkConnection.OpenAsync(ct); await Check(checkConnection, ct); }
            AppPreferences? settings = null;
            if (archive.GetEntry("settings.json") is { } settingsEntry)
            {
                if (settingsEntry.Length > 65536) throw new InvalidDataException("Backup settings are invalid.");
                await using var input = settingsEntry.Open(); settings = await JsonSerializer.DeserializeAsync<AppPreferences>(input, cancellationToken: ct);
            }
            var stagedOptions = new DbContextOptionsBuilder<FolioDbContext>().UseSqlite($"Data Source={stagedDatabase};Pooling=False").Options;
            await using (var db = new FolioDbContext(stagedOptions))
            {
                await db.Database.OpenConnectionAsync(ct);
                await using var schemaCommand = db.Database.GetDbConnection().CreateCommand();
                schemaCommand.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='_SchemaVersions';";
                if (Convert.ToInt32(await schemaCommand.ExecuteScalarAsync(ct)) > 0) await new DatabaseMigrator(db, stagedFiles).MigrateAsync(ct);
                // These real queries validate compatibility rather than trusting archive metadata.
                var books = await db.Books.ToListAsync(ct); await db.Annotations.CountAsync(ct); await db.Bookmarks.CountAsync(ct); await db.ReadingPositions.CountAsync(ct);
                await db.Shelves.CountAsync(ct); await db.Tags.CountAsync(ct); await db.ChapterSummaries.CountAsync(ct); await db.Flashcards.CountAsync(ct); await db.VocabularyItems.CountAsync(ct);
                foreach (var book in books)
                {
                    if (book.Sha256.Length != 64 || !book.Sha256.All(Uri.IsHexDigit)) throw new InvalidDataException("Backup contains an invalid document identity.");
                    var name = $"books/{book.Sha256}.pdf";
                    if (archive.GetEntry(name) is { } pdf)
                    {
                        var stagedPath = stagedFiles.GetBookPath(book.Sha256);
                        await using (var input = pdf.Open()) await using (var output = File.Create(stagedPath)) await input.CopyToAsync(output, ct);
                        if (!string.Equals(await stagedFiles.ComputeSha256Async(stagedPath, ct), book.Sha256, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("A PDF in the backup failed its checksum check.");
                    }
                    var coverName = Path.GetFileName(files.GetCoverPath(book.Sha256));
                    if (archive.GetEntry($"covers/{coverName}") is { } cover)
                    {
                        await using var input = cover.Open(); await using var output = File.Create(stagedFiles.GetCoverPath(book.Sha256)); await input.CopyToAsync(output, ct);
                    }
                    book.FilePath = files.GetBookPath(book.Sha256);
                    book.CoverPath = File.Exists(stagedFiles.GetCoverPath(book.Sha256)) || File.Exists(files.GetCoverPath(book.Sha256)) ? files.GetCoverPath(book.Sha256) : null;
                }
                await db.SaveChangesAsync(ct);
            }
            await using var lease = maintenance == null ? null : await maintenance.AcquireAsync(ct);
            var rollback = Path.Combine(files.BackupsDirectory, $"pre_restore_{DateTimeOffset.UtcNow:yyyyMMdd_HHmmss_fffffff}.db");
            await Snapshot(DatabasePath, rollback, ct);
            // All PDFs have been checked. Additional managed copies are harmless if a later database step fails.
            foreach (var pdf in Directory.EnumerateFiles(stagedFiles.BooksDirectory)) File.Move(pdf, Path.Combine(files.BooksDirectory, Path.GetFileName(pdf)), true);
            foreach (var cover in Directory.EnumerateFiles(stagedFiles.CoversDirectory)) File.Move(cover, Path.Combine(files.CoversDirectory, Path.GetFileName(cover)), true);
            try
            {
                await Snapshot(stagedDatabase, DatabasePath, ct);
                context.ChangeTracker.Clear(); maintenance?.CompleteRestore();
                if (settings != null) preferences?.Save(settings);
                return true;
            }
            catch { await Snapshot(rollback, DatabasePath, CancellationToken.None); throw; }
        }
        finally { Directory.Delete(stageRoot, true); }
    }
}
