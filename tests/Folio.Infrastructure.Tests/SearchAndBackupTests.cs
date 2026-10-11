using System.IO.Compression;
using Folio.Application.Backup;
using Folio.Application.Search;
using Folio.Domain.Entities;
using Folio.Domain.Enums;
using Folio.Infrastructure.Backup;
using Folio.Infrastructure.Persistence;
using Folio.Infrastructure.Persistence.Repositories;
using Folio.Infrastructure.Search;
using Folio.Infrastructure.Storage;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Folio.Infrastructure.Tests;

public class SearchAndBackupTests : IDisposable
{
    private readonly string _tempDir;
    private readonly FileStore _fileStore;
    private readonly SqliteConnection _connection;
    private readonly FolioDbContext _context;
    private readonly LibrarySearchService _searchService;

    public SearchAndBackupTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "FolioTests_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_tempDir);

        _fileStore = new FileStore(new FileStoreOptions { RootDirectory = _tempDir });
        _fileStore.EnsureDirectories();

        string dbPath = Path.Combine(_fileStore.DatabaseDirectory, "folio.db");
        var csb = new SqliteConnectionStringBuilder
        {
            DataSource = dbPath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            ForeignKeys = true
        };

        _connection = new SqliteConnection(csb.ConnectionString);
        _connection.Open();

        var options = new DbContextOptionsBuilder<FolioDbContext>()
            .UseSqlite(_connection)
            .AddInterceptors(new SqliteConnectionInterceptor())
            .Options;

        _context = new FolioDbContext(options);
        _context.Database.EnsureCreated();

        _searchService = new LibrarySearchService(_context);
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();

        try
        {
            if (Directory.Exists(_tempDir))
            {
                Directory.Delete(_tempDir, recursive: true);
            }
        }
        catch { }
    }

    [Fact]
    public async Task SearchLibrary_MatchesTitleAuthorAndAnnotations()
    {
        // Arrange
        var book = new Book
        {
            Sha256 = "1111222233334444555566667777888899990000111122223333444455556666",
            Title = "Quantum Computing Essentials",
            Author = "Richard Feynman",
            PageCount = 100,
            FileSizeBytes = 5000,
            FilePath = "books/quantum.pdf"
        };
        _context.Books.Add(book);

        var annotation = new Annotation
        {
            BookId = book.Id,
            PageIndex = 12,
            Color = HighlightColor.Yellow,
            SelectedText = "Entanglement creates non-local correlation",
            Note = "Fundamental physics discussion",
            CreatedAt = DateTimeOffset.UtcNow
        };
        _context.Annotations.Add(annotation);

        var bookmark = new Bookmark
        {
            BookId = book.Id,
            PageIndex = 42,
            Label = "Quantum Teleportation Experiments",
            CreatedAt = DateTimeOffset.UtcNow
        };
        _context.Bookmarks.Add(bookmark);

        await _context.SaveChangesAsync();

        // Act 1: Search by title keyword
        var titleResults = await _searchService.SearchLibraryAsync("Quantum");
        Assert.NotEmpty(titleResults);
        Assert.Contains(titleResults, r => r.Type == SearchResultType.BookTitle && r.BookTitle == "Quantum Computing Essentials");

        // Act 2: Search by author keyword
        var authorResults = await _searchService.SearchLibraryAsync("Feynman");
        Assert.NotEmpty(authorResults);
        Assert.Equal(SearchResultType.BookTitle, authorResults[0].Type);

        // Act 3: Search by annotation text
        var noteResults = await _searchService.SearchLibraryAsync("Entanglement");
        Assert.NotEmpty(noteResults);
        Assert.Contains(noteResults, r => r.Type == SearchResultType.Annotation && r.Snippet.Contains("Entanglement"));

        // Act 4: Search by bookmark label
        var bookmarkResults = await _searchService.SearchLibraryAsync("Teleportation");
        Assert.NotEmpty(bookmarkResults);
        Assert.Contains(bookmarkResults, r => r.Type == SearchResultType.Bookmark && r.Snippet.Contains("Teleportation"));

        // Act 5: Empty query
        var emptyResults = await _searchService.SearchLibraryAsync("   ");
        Assert.Empty(emptyResults);
    }

    [Fact]
    public async Task BackupService_CreatesValidArchive_AndInspectsSuccessfully()
    {
        // Arrange
        var book = new Book
        {
            Sha256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            Title = "Backup Architecture",
            Author = "Folio Arch",
            PageCount = 50,
            FileSizeBytes = 2000,
            FilePath = "books/backup.pdf"
        };
        _context.Books.Add(book);
        await _context.SaveChangesAsync();

        var backupService = new BackupService(_context, _fileStore);
        string zipPath = Path.Combine(_tempDir, "backups", "test_backup.zip");

        // Act - Create backup
        var createdPath = await backupService.CreateBackupAsync(zipPath);
        Assert.True(File.Exists(createdPath));

        // Act - Inspect backup
        var metadata = await backupService.InspectBackupAsync(createdPath);

        // Assert
        Assert.NotNull(metadata);
        Assert.Equal("0.2.0", metadata.AppVersion);
        Assert.Equal(1, metadata.BooksCount);
        Assert.Equal(0, metadata.AnnotationsCount);

        using var archive = ZipFile.OpenRead(createdPath);
        Assert.NotNull(archive.GetEntry("folio.db"));
        Assert.NotNull(archive.GetEntry("metadata.json"));
    }

    [Fact]
    public async Task BackupService_RestoreBackup_RestoresDataCorrectly()
    {
        // Arrange
        var book = new Book
        {
            Sha256 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            Title = "Pre-Backup Book",
            Author = "Author B",
            PageCount = 80,
            FileSizeBytes = 4000,
            FilePath = "books/prebackup.pdf"
        };
        _context.Books.Add(book);
        await _context.SaveChangesAsync();

        var backupService = new BackupService(_context, _fileStore);
        string zipPath = Path.Combine(_tempDir, "backups", "restore_test.zip");
        await backupService.CreateBackupAsync(zipPath);

        // Close current connection so file is not locked on disk during restore
        _connection.Close();
        SqliteConnection.ClearAllPools();

        // Act - Restore
        bool restored = await backupService.RestoreBackupAsync(zipPath);
        Assert.True(restored);

        // Reconnect and verify data
        using var verifyConn = new SqliteConnection(_connection.ConnectionString);
        verifyConn.Open();
        var verifyOptions = new DbContextOptionsBuilder<FolioDbContext>()
            .UseSqlite(verifyConn)
            .Options;
        using var verifyContext = new FolioDbContext(verifyOptions);
        var reloadedBooks = await verifyContext.Books.ToListAsync();
        Assert.Single(reloadedBooks);
        Assert.Equal("Pre-Backup Book", reloadedBooks[0].Title);
    }
}
