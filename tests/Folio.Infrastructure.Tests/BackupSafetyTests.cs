using System.IO.Compression;
using Folio.Domain.Entities;
using Folio.Infrastructure.Backup;
using Folio.Infrastructure.Persistence;
using Folio.Infrastructure.Persistence.Migrations;
using Folio.Infrastructure.Storage;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Folio.Infrastructure.Tests;

public class BackupSafetyTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "FolioBackup_" + Guid.NewGuid().ToString("N"));
    private readonly FileStore _files;
    private readonly DbContextOptions<FolioDbContext> _options;
    public BackupSafetyTests()
    {
        _files = new(new() { RootDirectory = _root }); _files.EnsureDirectories();
        _options = new DbContextOptionsBuilder<FolioDbContext>().UseSqlite($"Data Source={Path.Combine(_files.DatabaseDirectory,"folio.db")};Pooling=False")
            .AddInterceptors(new SqliteConnectionInterceptor()).Options;
    }
    [Fact]
    public async Task Snapshot_IncludesWalChanges_AndRestoreReplacesLaterWritesWithOpenConnections()
    {
        await using var db = new FolioDbContext(_options); await new DatabaseMigrator(db,_files).MigrateAsync();
        db.Books.Add(new() { Title="Saved state", Sha256=new string('e',64), FilePath="test.pdf" }); await db.SaveChangesAsync();
        var backup = new BackupService(db,_files); var path=Path.Combine(_files.BackupsDirectory,"verified.zip");
        await backup.CreateBackupAsync(path);
        var book=await db.Books.SingleAsync(); book.Title="Later state"; await db.SaveChangesAsync();
        Assert.True(await backup.RestoreBackupAsync(path));
        Assert.Equal("Saved state", (await db.Books.SingleAsync()).Title);
        Assert.NotEmpty(Directory.GetFiles(_files.BackupsDirectory,"pre_restore_*.db"));
    }
    [Fact]
    public async Task InvalidArchive_CannotReplaceHealthyLibrary()
    {
        await using var db = new FolioDbContext(_options); await new DatabaseMigrator(db,_files).MigrateAsync();
        db.Books.Add(new() { Title="Keep me", Sha256=new string('f',64), FilePath="test.pdf" }); await db.SaveChangesAsync();
        var path=Path.Combine(_root,"invalid.zip");
        using (var archive=ZipFile.Open(path,ZipArchiveMode.Create))
        { using var writer=new StreamWriter(archive.CreateEntry("folio.db").Open()); writer.Write("not a database"); }
        await Assert.ThrowsAnyAsync<Exception>(()=>new BackupService(db,_files).RestoreBackupAsync(path));
        Assert.Equal("Keep me",(await db.Books.SingleAsync()).Title);
    }
    public void Dispose() { SqliteConnection.ClearAllPools(); if(Directory.Exists(_root)) Directory.Delete(_root,true); }
}
