using Folio.Domain.Entities;
using Folio.Domain.Enums;
using Folio.Infrastructure.Persistence;
using Folio.Infrastructure.Persistence.Repositories;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Folio.Infrastructure.Tests;

public class DatabasePersistenceTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly FolioDbContext _context;
    private readonly BookRepository _bookRepository;
    private readonly UnitOfWork _unitOfWork;

    public DatabasePersistenceTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<FolioDbContext>()
            .UseSqlite(_connection)
            .AddInterceptors(new SqliteConnectionInterceptor())
            .Options;

        _context = new FolioDbContext(options);
        _context.Database.EnsureCreated();

        _bookRepository = new BookRepository(_context);
        _unitOfWork = new UnitOfWork(_context);
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
    }

    [Fact]
    public async Task AddBook_PersistsAndLoadsCorrectly()
    {
        var book = new Book
        {
            Sha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            Title = "The Pragmatic Reader",
            Author = "Folio Author",
            PageCount = 320,
            FileSizeBytes = 1048576,
            FilePath = "library/books/sample.pdf",
            Status = ReadingStatus.Reading,
            LastReadAt = DateTimeOffset.UtcNow
        };

        await _bookRepository.AddAsync(book);
        await _unitOfWork.SaveChangesAsync();

        var loaded = await _bookRepository.GetBySha256Async(book.Sha256);
        Assert.NotNull(loaded);
        Assert.Equal("The Pragmatic Reader", loaded.Title);
        Assert.Equal(ReadingStatus.Reading, loaded.Status);
    }

    [Fact]
    public async Task CascadeDelete_DeletesChildEntitiesWhenBookIsDeleted()
    {
        var book = new Book
        {
            Sha256 = "dummy_sha256_for_cascade_test",
            Title = "Cascade Test Book",
            FilePath = "test.pdf"
        };

        await _bookRepository.AddAsync(book);

        var position = new ReadingPosition
        {
            BookId = book.Id,
            PageIndex = 14,
            OffsetPercent = 0.5,
            Zoom = 1.25,
            ViewMode = ReaderViewMode.Continuous
        };
        await _context.ReadingPositions.AddAsync(position);

        var annotation = new Annotation
        {
            BookId = book.Id,
            PageIndex = 14,
            Type = AnnotationType.Highlight,
            Color = HighlightColor.Yellow,
            RectsJson = "[{\"x\":0.1,\"y\":0.2,\"width\":0.5,\"height\":0.05}]",
            SelectedText = "Highlighted text"
        };
        await _context.Annotations.AddAsync(annotation);

        await _unitOfWork.SaveChangesAsync();

        // Remove book
        _bookRepository.Remove(book);
        await _unitOfWork.SaveChangesAsync();

        // Verify child entities were deleted
        var remainingPositions = await _context.ReadingPositions.Where(p => p.BookId == book.Id).ToListAsync();
        var remainingAnnotations = await _context.Annotations.Where(a => a.BookId == book.Id).ToListAsync();

        Assert.Empty(remainingPositions);
        Assert.Empty(remainingAnnotations);
    }

    [Fact]
    public async Task GetRecentlyReadAsync_ReturnsDescendingByLastReadAt()
    {
        var book1 = new Book
        {
            Sha256 = "hash1",
            Title = "Book One",
            FilePath = "p1.pdf",
            LastReadAt = DateTimeOffset.UtcNow.AddHours(-2)
        };
        var book2 = new Book
        {
            Sha256 = "hash2",
            Title = "Book Two",
            FilePath = "p2.pdf",
            LastReadAt = DateTimeOffset.UtcNow.AddMinutes(-10) // more recent
        };

        await _bookRepository.AddAsync(book1);
        await _bookRepository.AddAsync(book2);
        await _unitOfWork.SaveChangesAsync();

        var recent = await _bookRepository.GetRecentlyReadAsync(count: 2);
        Assert.Equal(2, recent.Count);
        Assert.Equal("Book Two", recent[0].Title);
        Assert.Equal("Book One", recent[1].Title);
    }
}

