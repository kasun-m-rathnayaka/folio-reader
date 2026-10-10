using Folio.Application.Reading;
using Folio.Domain.Entities;
using Folio.Domain.Enums;
using Folio.Infrastructure.Persistence;
using Folio.Infrastructure.Persistence.Repositories;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Folio.Infrastructure.Tests;

public class ReadingPositionServiceTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly FolioDbContext _context;
    private readonly BookRepository _bookRepository;
    private readonly ReadingPositionRepository _positionRepository;
    private readonly UnitOfWork _unitOfWork;
    private readonly ReadingPositionService _service;

    public ReadingPositionServiceTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<FolioDbContext>()
            .UseSqlite(_connection)
            .Options;

        _context = new FolioDbContext(options);
        _context.Database.EnsureCreated();

        _bookRepository = new BookRepository(_context);
        _positionRepository = new ReadingPositionRepository(_context);
        _unitOfWork = new UnitOfWork(_context);
        _service = new ReadingPositionService(_positionRepository, _bookRepository, _unitOfWork);
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
    }

    [Fact]
    public async Task SavePositionAsync_CreatesNewPosition_AndUpdatesReadingStatus()
    {
        // Arrange
        var book = new Book
        {
            Title = "The Pragmatic Programmer",
            Sha256 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            PageCount = 352,
            FilePath = "books/test.pdf",
            Status = ReadingStatus.WantToRead
        };
        await _bookRepository.AddAsync(book);
        await _unitOfWork.SaveChangesAsync();

        // Act
        await _service.SavePositionAsync(
            book.Id,
            pageIndex: 42,
            offsetPercent: 0.35,
            zoom: 1.25,
            viewMode: ReaderViewMode.Continuous,
            activeReadingSeconds: 120);

        // Assert
        var saved = await _service.GetPositionAsync(book.Id);
        Assert.NotNull(saved);
        Assert.Equal(42, saved.PageIndex);
        Assert.Equal(0.35, saved.OffsetPercent, precision: 2);
        Assert.Equal(1.25, saved.Zoom);
        Assert.Equal(ReaderViewMode.Continuous, saved.ViewMode);
        Assert.Equal(120, saved.ActiveReadingSeconds);

        var updatedBook = await _bookRepository.GetByIdAsync(book.Id);
        Assert.NotNull(updatedBook);
        Assert.Equal(ReadingStatus.Reading, updatedBook.Status);
        Assert.NotNull(updatedBook.LastReadAt);
    }

    [Fact]
    public async Task SavePositionAsync_UpdatesExistingPosition_AndAccumulatesTime()
    {
        // Arrange
        var book = new Book
        {
            Title = "Clean Architecture",
            Sha256 = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
            PageCount = 300,
            FilePath = "books/arch.pdf",
            Status = ReadingStatus.Reading
        };
        await _bookRepository.AddAsync(book);
        await _unitOfWork.SaveChangesAsync();

        await _service.SavePositionAsync(book.Id, 10, 0.2, 1.0, ReaderViewMode.Continuous, 60);

        // Act - Second session
        await _service.SavePositionAsync(book.Id, 15, 0.5, 1.5, ReaderViewMode.SinglePage, 90);

        // Assert
        var pos = await _service.GetPositionAsync(book.Id);
        Assert.NotNull(pos);
        Assert.Equal(15, pos.PageIndex);
        Assert.Equal(0.5, pos.OffsetPercent, precision: 2);
        Assert.Equal(1.5, pos.Zoom);
        Assert.Equal(ReaderViewMode.SinglePage, pos.ViewMode);
        Assert.Equal(150, pos.ActiveReadingSeconds); // 60 + 90
    }

    [Fact]
    public async Task SavePositionAsync_ClampsOffsetBetweenZeroAndOne()
    {
        // Arrange
        var book = new Book
        {
            Title = "Refactoring",
            Sha256 = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
            PageCount = 400,
            FilePath = "books/refactor.pdf"
        };
        await _bookRepository.AddAsync(book);
        await _unitOfWork.SaveChangesAsync();

        // Act
        await _service.SavePositionAsync(book.Id, 5, -0.5, 1.0, ReaderViewMode.Continuous, 30);

        // Assert
        var pos = await _service.GetPositionAsync(book.Id);
        Assert.NotNull(pos);
        Assert.Equal(0.0, pos.OffsetPercent);

        // Act with > 1.0
        await _service.SavePositionAsync(book.Id, 5, 2.5, 1.0, ReaderViewMode.Continuous, 30);
        pos = await _service.GetPositionAsync(book.Id);
        Assert.NotNull(pos);
        Assert.Equal(1.0, pos.OffsetPercent);
    }

    [Fact]
    public async Task GetPositionAsync_ReturnsNull_WhenBookHasNoPosition()
    {
        // Arrange
        var book = new Book
        {
            Title = "Domain-Driven Design",
            Sha256 = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
            PageCount = 500,
            FilePath = "books/ddd.pdf"
        };
        await _bookRepository.AddAsync(book);
        await _unitOfWork.SaveChangesAsync();

        // Act
        var pos = await _service.GetPositionAsync(book.Id);

        // Assert
        Assert.Null(pos);
    }
}
