using System.IO.Compression;
using System.Text.Json;
using Folio.Application.Common.Interfaces;
using Folio.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.JSInterop;
using SqliteWasmBlazor;

namespace Folio.Platform.Browser;

/// <summary>
/// One <c>.zip</c> holding <c>manifest.json</c>, the SQLite database and every stored PDF and cover, mirroring the data
/// folder layout (WEB-4). Restoring replaces the library, re-runs the versioned migrations (an older backup is upgraded),
/// and the app then reloads so every view starts from the restored data.
/// </summary>
public sealed class BrowserLibraryBackupService(BrowserJs js, OpfsFileStore files, ISqliteWasmDatabaseService database, IServiceScopeFactory scopes) : ILibraryBackupService
{
    private const string Manifest = "manifest.json", DatabaseEntry = "folio.db";
    private sealed record BackupManifest(string App, int Format, DateTimeOffset Created, int Books);

    public async Task<BackupResult> ExportAsync(IProgress<double>? progress = null, CancellationToken cancellationToken = default)
    {
        var books = await js.InvokeAsync<string[]>("listFiles", files.Relative(files.BooksDirectory));
        var covers = await js.InvokeAsync<string[]>("listFiles", files.Relative(files.CoversDirectory));
        var archive = new MemoryStream();
        using (var zip = new ZipArchive(archive, ZipArchiveMode.Create, leaveOpen: true))
        {
            await using (var manifest = zip.CreateEntry(Manifest, CompressionLevel.Optimal).Open())
                await JsonSerializer.SerializeAsync(manifest, new BackupManifest("Folio", 1, DateTimeOffset.UtcNow, books.Count(b => b.EndsWith(".pdf"))), cancellationToken: cancellationToken);
            await using (var db = zip.CreateEntry(DatabaseEntry, CompressionLevel.Optimal).Open())
                await database.ExportDatabaseToStreamAsync(BrowserPlatformServiceCollectionExtensions.DatabaseName, db, cancellationToken);
            var all = books.Select(b => Path.Combine(files.BooksDirectory, b)).Concat(covers.Select(c => Path.Combine(files.CoversDirectory, c))).ToList();
            for (var i = 0; i < all.Count; i++)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var bytes = await js.InvokeAsync<byte[]?>("readBytes", files.Relative(all[i]));
                if (bytes == null) continue;
                // PDFs and WebP covers are already compressed: store them as they are.
                await using var entry = zip.CreateEntry(files.Relative(all[i]), CompressionLevel.NoCompression).Open();
                await entry.WriteAsync(bytes, cancellationToken);
                progress?.Report((i + 1d) / all.Count);
            }
        }
        archive.Position = 0;
        var fileName = $"folio-library-{DateTime.Now:yyyy-MM-dd}.zip";
        using var reference = new DotNetStreamReference(archive);
        await js.InvokeVoidAsync("downloadStream", fileName, "application/zip", reference);
        return new(true, books.Length, books.Length + covers.Length, fileName);
    }

    public async Task<BackupResult> ImportAsync(IProgress<double>? progress = null, CancellationToken cancellationToken = default)
    {
        var picked = await js.InvokeAsync<PickedFile[]>("pickFile", ".zip,application/zip");
        if (picked.Length == 0) return new(false, 0, 0, Message: "No backup chosen.");
        var bytes = await js.InvokeAsync<byte[]?>("readPicked", picked[0].Id);
        if (bytes == null) return new(false, 0, 0, Message: "The backup could not be read.");

        using var zip = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read);
        var manifestEntry = zip.GetEntry(Manifest);
        var dbEntry = zip.GetEntry(DatabaseEntry);
        BackupManifest? manifest = null;
        if (manifestEntry != null)
            await using (var stream = manifestEntry.Open()) manifest = await JsonSerializer.DeserializeAsync<BackupManifest>(stream, cancellationToken: cancellationToken);
        if (manifest?.App != "Folio" || dbEntry == null)
            return new(false, 0, 0, Message: "This file is not a Folio library backup.");
        if (manifest.Format > 1)
            return new(false, 0, 0, Message: "This backup was made by a newer version of Folio.");

        var libraryFiles = zip.Entries.Where(e => e.FullName.StartsWith("library/books/", StringComparison.Ordinal) || e.FullName.StartsWith("library/covers/", StringComparison.Ordinal))
            .Where(e => e.Length > 0 && !e.FullName.Contains("..", StringComparison.Ordinal)).ToList();

        // Replace the database first: if it fails, the current library (and its files) stay as they were.
        var db = new MemoryStream();
        await using (var stream = dbEntry.Open()) await stream.CopyToAsync(db, cancellationToken);
        db.Position = 0;
        await database.ImportDatabaseFromStreamAsync(BrowserPlatformServiceCollectionExtensions.DatabaseName, db, db.Length, cancellationToken: cancellationToken);
        await new MigratingDatabaseSetup(scopes).InitializeAsync(cancellationToken);

        await js.InvokeVoidAsync("clearDirectory", files.Relative(files.BooksDirectory));
        await js.InvokeVoidAsync("clearDirectory", files.Relative(files.CoversDirectory));
        for (var i = 0; i < libraryFiles.Count; i++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var content = new MemoryStream();
            await using (var stream = libraryFiles[i].Open()) await stream.CopyToAsync(content, cancellationToken);
            content.Position = 0;
            using var reference = new DotNetStreamReference(content);
            await js.InvokeVoidAsync("writeFromStream", libraryFiles[i].FullName, reference);
            progress?.Report((i + 1d) / libraryFiles.Count);
        }
        return new(true, manifest.Books, libraryFiles.Count);
    }

    public async Task<StorageStatus> GetStorageStatusAsync()
    {
        var estimate = await js.InvokeAsync<JsonElement>("estimate");
        return new(estimate.GetProperty("persisted").GetBoolean(), (long)estimate.GetProperty("usage").GetDouble(), (long)estimate.GetProperty("quota").GetDouble());
    }
}
