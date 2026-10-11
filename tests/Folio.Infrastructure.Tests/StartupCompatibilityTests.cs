using Folio.Domain.Entities;
using Folio.Domain.Study;
using Folio.Infrastructure.Persistence;
using Folio.Infrastructure.Persistence.Migrations;
using Folio.Infrastructure.Storage;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Folio.Infrastructure.Tests;

public class StartupCompatibilityTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "FolioStartup_" + Guid.NewGuid().ToString("N"));
    private readonly FileStore _files;
    private readonly DbContextOptions<FolioDbContext> _options;
    public StartupCompatibilityTests()
    {
        _files = new FileStore(new() { RootDirectory = _root }); _files.EnsureDirectories();
        _options = new DbContextOptionsBuilder<FolioDbContext>().UseSqlite($"Data Source={Path.Combine(_files.DatabaseDirectory, "folio.db")};Pooling=False")
            .AddInterceptors(new SqliteConnectionInterceptor()).Options;
    }

    [Fact]
    public async Task FreshStartup_SupportsBookmarksAnnotationsAndAllStudyEntities()
    {
        await using var db = new FolioDbContext(_options);
        await new DatabaseMigrator(db, _files).MigrateAsync();
        var book = new Book { Title = "Real startup path", Sha256 = new string('a', 64), FilePath = "test.pdf", PageCount = 10 };
        db.Books.Add(book);
        db.Bookmarks.Add(new() { BookId = book.Id, PageIndex = 2, CharacterOffset = 27, IsDogEar = true });
        db.Annotations.Add(new() { BookId = book.Id, PageIndex = 2, AnchorPrefix = "prefix", Tags = "study", CharacterOffset = 27 });
        db.ChapterSummaries.Add(new() { BookId = book.Id, ChapterTitle = "Chapter", SummaryMarkdown = "Summary" });
        db.Flashcards.Add(new() { BookId = book.Id, Front = "Question", Back = "Answer" });
        db.VocabularyItems.Add(new() { BookId = book.Id, Word = "Reliable", Definition = "Dependable" });
        await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        Assert.Equal(27, (await db.Bookmarks.SingleAsync()).CharacterOffset);
        Assert.Equal("prefix", (await db.Annotations.SingleAsync()).AnchorPrefix);
        Assert.Single(await db.ChapterSummaries.ToListAsync());
        Assert.Single(await db.Flashcards.ToListAsync());
        Assert.Single(await db.VocabularyItems.ToListAsync());
    }

    [Fact]
    public async Task HistoricalVersionOne_UpgradesWithoutLosingNotesOrIsoDates()
    {
        var id = Guid.NewGuid();
        var date = new DateTimeOffset(2026, 10, 8, 12, 0, 0, TimeSpan.Zero);
        await using (var connection = new SqliteConnection($"Data Source={Path.Combine(_files.DatabaseDirectory, "folio.db")};Pooling=False"))
        {
            await connection.OpenAsync();
            var command = connection.CreateCommand();
            command.CommandText = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "Fixtures", "v1-schema.sql"));
            await command.ExecuteNonQueryAsync();
            command.CommandText = """
                CREATE TABLE _SchemaVersions (Version INTEGER PRIMARY KEY NOT NULL, Name TEXT NOT NULL, AppliedAt TEXT NOT NULL);
                INSERT INTO _SchemaVersions VALUES (1, '001_InitialSchema', '2026-10-08');
                INSERT INTO Books (Id, Sha256, Title, PageCount, FileSizeBytes, FilePath, Status, CreatedAt, UpdatedAt)
                VALUES (@id, @hash, 'Saved book', 100, 3000, 'old.pdf', 1, @date, @date);
                INSERT INTO Annotations (Id, BookId, PageIndex, Type, Color, RectsJson, Note, CreatedAt, UpdatedAt)
                VALUES (@annotation, @id, 4, 0, 0, '[]', 'Keep this thought', @date, @date);
                """;
            command.Parameters.AddWithValue("@id", id.ToString().ToUpperInvariant());
            command.Parameters.AddWithValue("@annotation", Guid.NewGuid().ToString().ToUpperInvariant());
            command.Parameters.AddWithValue("@hash", new string('b', 64)); command.Parameters.AddWithValue("@date", date.ToString("O"));
            await command.ExecuteNonQueryAsync();
        }
        await using var db = new FolioDbContext(_options);
        var migrator = new DatabaseMigrator(db, _files);
        Assert.Equal(DatabaseMigrator.LatestVersion, await migrator.MigrateAsync());
        Assert.Equal(date, (await db.Books.SingleAsync()).CreatedAt);
        Assert.Equal("Keep this thought", (await db.Annotations.SingleAsync()).Note);
        db.Bookmarks.Add(new() { BookId = id, PageIndex = 4, CharacterOffset = 19 });
        await db.SaveChangesAsync();
        Assert.Equal(19, (await db.Bookmarks.SingleAsync()).CharacterOffset);
        Assert.NotEmpty(Directory.GetFiles(_files.BackupsDirectory, "pre_migration_v1_*.db"));
    }

    [Fact]
    public async Task FutureVersion_IsRejectedWithoutChangingTheLibrary()
    {
        await using var db = new FolioDbContext(_options);
        var migrator = new DatabaseMigrator(db, _files); await migrator.MigrateAsync();
        await db.Database.ExecuteSqlRawAsync("INSERT INTO _SchemaVersions VALUES (99, 'future', '2026-10-11');");
        await Assert.ThrowsAsync<InvalidOperationException>(() => migrator.MigrateAsync());
        Assert.Equal(99, await migrator.GetCurrentVersionAsync());
    }

    public void Dispose() { SqliteConnection.ClearAllPools(); if (Directory.Exists(_root)) Directory.Delete(_root, true); }
}
