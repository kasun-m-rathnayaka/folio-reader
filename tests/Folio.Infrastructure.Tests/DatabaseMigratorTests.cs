using Folio.Infrastructure.Persistence;
using Folio.Infrastructure.Persistence.Migrations;
using Folio.Infrastructure.Storage;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Folio.Infrastructure.Tests;

public class DatabaseMigratorTests : IDisposable
{
    private readonly string _tempDir;
    private readonly FileStore _fileStore;
    private readonly string _dbPath;

    public DatabaseMigratorTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "Folio_MigratorTests_" + Guid.NewGuid().ToString("N"));
        _fileStore = new FileStore(new FileStoreOptions { RootDirectory = _tempDir });
        _fileStore.EnsureDirectories();
        _dbPath = Path.Combine(_fileStore.DatabaseDirectory, "test.db");
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
        {
            try { Directory.Delete(_tempDir, recursive: true); } catch { }
        }
    }

    [Fact]
    public async Task MigrateAsync_ExecutesInitialSchemaAndRecordsVersion()
    {
        var options = new DbContextOptionsBuilder<FolioDbContext>()
            .UseSqlite($"Data Source={_dbPath}")
            .AddInterceptors(new SqliteConnectionInterceptor())
            .Options;

        using (var context = new FolioDbContext(options))
        {
            var migrator = new DatabaseMigrator(context, _fileStore);

            int initialVersion = await migrator.GetCurrentVersionAsync();
            Assert.Equal(0, initialVersion);

            int migratedVersion = await migrator.MigrateAsync();
            Assert.Equal(DatabaseMigrator.LatestVersion, migratedVersion);

            // Re-check version
            int verifiedVersion = await migrator.GetCurrentVersionAsync();
            Assert.Equal(DatabaseMigrator.LatestVersion, verifiedVersion);

            // Verify tables exist by inserting a shelf
            await context.Shelves.AddAsync(new Domain.Entities.Shelf { Name = "Science Fiction" });
            await context.SaveChangesAsync();

            var count = await context.Shelves.CountAsync();
            Assert.Equal(1, count);
        }
    }

    [Fact]
    public async Task MigrateAsync_IsIdempotent()
    {
        var options = new DbContextOptionsBuilder<FolioDbContext>()
            .UseSqlite($"Data Source={_dbPath}")
            .AddInterceptors(new SqliteConnectionInterceptor())
            .Options;

        using var context = new FolioDbContext(options);
        var migrator = new DatabaseMigrator(context, _fileStore);

        int v1 = await migrator.MigrateAsync();
        int v2 = await migrator.MigrateAsync();

        Assert.Equal(DatabaseMigrator.LatestVersion, v1);
        Assert.Equal(DatabaseMigrator.LatestVersion, v2);
    }
}

