using Folio.Application.Books;
using Folio.Infrastructure.Extraction;
using Folio.Infrastructure.Persistence;
using Folio.Infrastructure.Persistence.Repositories;
using Folio.Infrastructure.Storage;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Folio.Infrastructure.Tests;

public class BookImportServiceTests : IDisposable
{
    private readonly string _tempDir;
    private readonly SqliteConnection _connection;
    private readonly FolioDbContext _context;
    private readonly FileStore _fileStore;
    private readonly BookRepository _bookRepo;
    private readonly UnitOfWork _uow;
    private readonly PdfPigTextExtractor _extractor;
    private readonly BookImportService _importService;
    private readonly string _fixturesDir;

    public BookImportServiceTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), "Folio_ImportTests_" + Guid.NewGuid().ToString("N"));
        _fileStore = new FileStore(new FileStoreOptions { RootDirectory = _tempDir });
        _fileStore.EnsureDirectories();

        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<FolioDbContext>()
            .UseSqlite(_connection)
            .AddInterceptors(new SqliteConnectionInterceptor())
            .Options;

        _context = new FolioDbContext(options);
        _context.Database.EnsureCreated();

        _bookRepo = new BookRepository(_context);
        _uow = new UnitOfWork(_context);
        _extractor = new PdfPigTextExtractor();
        _importService = new BookImportService(_bookRepo, _uow, _fileStore, _extractor, pdfRasterizer: null);

        _fixturesDir = FindFixturesDirectory();
    }

    private static string FindFixturesDirectory()
    {
        var dir = new DirectoryInfo(AppDomain.CurrentDomain.BaseDirectory);
        while (dir != null)
        {
            string candidate = Path.Combine(dir.FullName, "fixtures", "pdf");
            if (Directory.Exists(candidate))
            {
                return candidate;
            }
            dir = dir.Parent;
        }
        throw new DirectoryNotFoundException("Could not find fixtures/pdf directory.");
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
        if (Directory.Exists(_tempDir))
        {
            try { Directory.Delete(_tempDir, recursive: true); } catch { }
        }
    }

    [Fact]
    public async Task ImportFileAsync_IngestsPdfAndEnforcesDeduplication()
    {
        string fixturePath = Path.Combine(_fixturesDir, "01_single_column_book_300p.pdf");
        Assert.True(File.Exists(fixturePath));

        long originalLength = new FileInfo(fixturePath).Length;
        string originalSha = await _fileStore.ComputeSha256Async(fixturePath);

        // 1. Initial Import
        var result1 = await _importService.ImportFileAsync(fixturePath);

        Assert.True(result1.IsNew);
        Assert.NotNull(result1.Book);
        Assert.Equal(originalSha, result1.Book.Sha256);
        Assert.Equal(300, result1.Book.PageCount);
        Assert.NotNull(result1.Book.ReadingPosition);
        Assert.Equal(0, result1.Book.ReadingPosition.PageIndex);

        // Immutability check: original fixture untouched
        Assert.Equal(originalLength, new FileInfo(fixturePath).Length);

        // 2. Re-import (Deduplication FR-LIB-02)
        var result2 = await _importService.ImportFileAsync(fixturePath);

        Assert.False(result2.IsNew, "Re-importing the same PDF must return IsNew = false.");
        Assert.Equal(result1.Book.Id, result2.Book.Id);

        // Total count in database must remain 1
        var allBooks = await _bookRepo.GetAllAsync();
        Assert.Single(allBooks);
    }
}
