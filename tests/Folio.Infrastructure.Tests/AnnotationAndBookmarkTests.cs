using System.Security.Cryptography;
using Folio.Application.Annotations;
using Folio.Application.Annotations.DTOs;
using Folio.Domain.Entities;
using Folio.Domain.Enums;
using Folio.Domain.Geometry;
using Folio.Infrastructure.Persistence;
using Folio.Infrastructure.Persistence.Repositories;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Folio.Infrastructure.Tests;

public class AnnotationAndBookmarkTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly FolioDbContext _context;
    private readonly BookmarkRepository _bookmarkRepo;
    private readonly AnnotationRepository _annotationRepo;
    private readonly UnitOfWork _unitOfWork;
    private readonly BookmarkService _bookmarkService;
    private readonly AnnotationService _annotationService;
    private readonly AnnotationExportService _exportService;

    public AnnotationAndBookmarkTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<FolioDbContext>()
            .UseSqlite(_connection)
            .Options;

        _context = new FolioDbContext(options);
        _context.Database.EnsureCreated();

        _bookmarkRepo = new BookmarkRepository(_context);
        _annotationRepo = new AnnotationRepository(_context);
        _unitOfWork = new UnitOfWork(_context);

        _bookmarkService = new BookmarkService(_bookmarkRepo, _unitOfWork);
        _annotationService = new AnnotationService(_annotationRepo, _unitOfWork);
        _exportService = new AnnotationExportService();
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
    }

    private async Task<Book> CreateTestBookAsync()
    {
        var book = new Book
        {
            Id = Guid.NewGuid(),
            Sha256 = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N"),
            Title = "Testing Systems in Depth",
            Author = "Dr. Alan Turing",
            FilePath = "C:\\fake\\testing.pdf",
            PageCount = 100,
            Status = ReadingStatus.WantToRead
        };
        await _context.Books.AddAsync(book);
        await _context.SaveChangesAsync();
        return book;
    }

    [Fact]
    public async Task DogEar_ToggleOnAndOff_PersistsAccurately()
    {
        var book = await CreateTestBookAsync();

        // 1. Initially false
        Assert.False(await _bookmarkService.IsPageDogEaredAsync(book.Id, 5));

        // 2. Toggle on
        var created = await _bookmarkService.ToggleDogEarAsync(book.Id, 5);
        Assert.NotNull(created);
        Assert.True(created.IsDogEar);
        Assert.Equal(5, created.PageIndex);
        Assert.True(await _bookmarkService.IsPageDogEaredAsync(book.Id, 5));

        // 3. Toggle off
        var toggledOff = await _bookmarkService.ToggleDogEarAsync(book.Id, 5);
        Assert.Null(toggledOff);
        Assert.False(await _bookmarkService.IsPageDogEaredAsync(book.Id, 5));
    }

    [Fact]
    public async Task NamedBookmarks_CreateUpdateDelete_WorksCorrectly()
    {
        var book = await CreateTestBookAsync();

        var bkm = await _bookmarkService.CreateNamedBookmarkAsync(new CreateBookmarkDto(
            BookId: book.Id,
            PageIndex: 12,
            Label: "Chapter 3: Memory Layout",
            Color: HighlightColor.Blue
        ));

        Assert.Equal("Chapter 3: Memory Layout", bkm.Label);
        Assert.Equal(12, bkm.PageIndex);

        // Update
        var updated = await _bookmarkService.UpdateBookmarkAsync(bkm.Id, "Chapter 3: Memory Models", HighlightColor.Purple);
        Assert.NotNull(updated);
        Assert.Equal("Chapter 3: Memory Models", updated.Label);
        Assert.Equal(HighlightColor.Purple, updated.Color);

        // List
        var list = await _bookmarkService.GetBookmarksAsync(book.Id);
        Assert.Single(list);

        // Delete
        bool deleted = await _bookmarkService.DeleteBookmarkAsync(bkm.Id);
        Assert.True(deleted);

        var listAfter = await _bookmarkService.GetBookmarksAsync(book.Id);
        Assert.Empty(listAfter);
    }

    [Fact]
    public async Task AnnotationService_CreateQueryAndFilter_ReturnsMatchingItems()
    {
        var book = await CreateTestBookAsync();

        var rects = new[] { new NormalizedRect(0.1, 0.2, 0.5, 0.04) };

        // 1. Highlight
        var h1 = await _annotationService.CreateAnnotationAsync(new CreateAnnotationDto(
            BookId: book.Id,
            PageIndex: 3,
            Type: AnnotationType.Highlight,
            Color: HighlightColor.Yellow,
            Rects: rects,
            SelectedText: "Invariant state must never mutate.",
            Note: "Crucial rule for state machines",
            Tags: "architecture,safety"
        ));

        // 2. Margin Note
        var n1 = await _annotationService.CreateAnnotationAsync(new CreateAnnotationDto(
            BookId: book.Id,
            PageIndex: 3,
            Type: AnnotationType.MarginNote,
            Color: HighlightColor.Green,
            Rects: rects,
            Note: "Check section 4.2 for details",
            Tags: "todo"
        ));

        // 3. Area Snip
        var s1 = await _annotationService.CreateAnnotationAsync(new CreateAnnotationDto(
            BookId: book.Id,
            PageIndex: 4,
            Type: AnnotationType.AreaSnip,
            Color: HighlightColor.Blue,
            Rects: new[] { new NormalizedRect(0.2, 0.3, 0.6, 0.4) },
            Note: "Figure 3.1 Architecture Overview"
        ));

        // Query by page
        var page3 = await _annotationService.GetAnnotationsForPageAsync(book.Id, 3);
        Assert.Equal(2, page3.Count);

        // Query by Tag
        var tagged = await _annotationService.QueryAnnotationsAsync(new AnnotationFilterDto(BookId: book.Id, Tag: "architecture"));
        Assert.Single(tagged);
        Assert.Equal("Invariant state must never mutate.", tagged[0].SelectedText);

        // Query by Type
        var snips = await _annotationService.QueryAnnotationsAsync(new AnnotationFilterDto(BookId: book.Id, Type: AnnotationType.AreaSnip));
        Assert.Single(snips);

        // Query by Search Text
        var searchResults = await _annotationService.QueryAnnotationsAsync(new AnnotationFilterDto(BookId: book.Id, SearchText: "machine"));
        Assert.Single(searchResults);
    }

    [Fact]
    public async Task ExportService_ExportsMarkdownJsonAndCsvCleanly()
    {
        var book = await CreateTestBookAsync();
        var ann = await _annotationService.CreateAnnotationAsync(new CreateAnnotationDto(
            BookId: book.Id,
            PageIndex: 0,
            Type: AnnotationType.Highlight,
            Color: HighlightColor.Yellow,
            Rects: new[] { new NormalizedRect(0.1, 0.1, 0.8, 0.05) },
            SelectedText: "Computer Science is no more about computers than astronomy is about telescopes.",
            Note: "Famous Edsger W. Dijkstra quote",
            Tags: "quotes,wisdom"
        ));

        var list = new[] { ann };

        // Markdown
        string md = _exportService.ExportToMarkdown(book.Id, book.Title, book.Author, list);
        Assert.Contains("# Annotations & Notes — Testing Systems in Depth", md);
        Assert.Contains("Computer Science is no more about computers", md);
        Assert.Contains("Famous Edsger W. Dijkstra quote", md);
        Assert.Contains($"folio://book/{book.Id}?page=0&ann={ann.Id}", md);

        // JSON
        string json = _exportService.ExportToJson(book.Id, book.Title, book.Author, list);
        Assert.Contains(book.Title, json);
        Assert.Contains("Computer Science", json);

        // CSV
        string csv = _exportService.ExportToCsv(book.Id, book.Title, list);
        Assert.Contains("Computer Science is no more about computers", csv);
        Assert.Contains("Highlight", csv);

        // Quote Citation
        string citation = _exportService.FormatQuoteCitation(ann.SelectedText!, book.Title, book.Author, ann.PageIndex);
        Assert.Equal("\"Computer Science is no more about computers than astronomy is about telescopes.\" — Dr. Alan Turing, Testing Systems in Depth (p. 1)", citation);
    }

    [Fact]
    public async Task Immutability_PdfFileHashUnchangedAfterHeavyAnnotationOperations()
    {
        // Golden Invariant 1: Source PDFs are strictly immutable (FR-ANN-04)
        string tempPdf = Path.GetTempFileName();
        try
        {
            byte[] dummyPdfContent = new byte[1024 * 64];
            Random.Shared.NextBytes(dummyPdfContent);
            await File.WriteAllBytesAsync(tempPdf, dummyPdfContent);

            string initialHash = Convert.ToHexString(SHA256.HashData(dummyPdfContent));

            var book = new Book
            {
                Id = Guid.NewGuid(),
                Sha256 = initialHash,
                Title = "Immutable Source Test",
                FilePath = tempPdf,
                PageCount = 20,
                Status = ReadingStatus.Reading
            };
            await _context.Books.AddAsync(book);
            await _context.SaveChangesAsync();

            // Simulate heavy annotation session: 50 bookmarks, highlights, notes, edits
            for (int i = 0; i < 25; i++)
            {
                await _bookmarkService.ToggleDogEarAsync(book.Id, i % 20);
                await _annotationService.CreateAnnotationAsync(new CreateAnnotationDto(
                    BookId: book.Id,
                    PageIndex: i % 20,
                    Type: AnnotationType.Highlight,
                    Color: HighlightColor.Yellow,
                    Rects: new[] { new NormalizedRect(0.1, 0.1 * (i % 8), 0.5, 0.03) },
                    SelectedText: $"Test span {i}",
                    Note: $"Note for span {i}"
                ));
            }

            // Verify file bytes on disk are 100% byte-identical
            byte[] finalPdfContent = await File.ReadAllBytesAsync(tempPdf);
            string finalHash = Convert.ToHexString(SHA256.HashData(finalPdfContent));

            Assert.Equal(initialHash, finalHash);
        }
        finally
        {
            if (File.Exists(tempPdf))
            {
                File.Delete(tempPdf);
            }
        }
    }
}
