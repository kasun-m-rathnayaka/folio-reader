using Folio.Application.Books;
using Folio.Application.Reading;
using Folio.Domain.Entities;
using Folio.Domain.Enums;
using Folio.Infrastructure.Persistence;
using Folio.Infrastructure.Persistence.Migrations;
using Folio.Infrastructure.Persistence.Repositories;
using Folio.Infrastructure.Storage;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Folio.Infrastructure.Tests;

public class LibraryWorkflowTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "FolioLibrary_" + Guid.NewGuid().ToString("N"));
    private readonly FileStore _files;
    private readonly DbContextOptions<FolioDbContext> _options;
    private readonly LibraryService _library;
    private sealed class Factory(DbContextOptions<FolioDbContext> options) : IDbContextFactory<FolioDbContext>
    {
        public FolioDbContext CreateDbContext() => new(options);
    }
    public LibraryWorkflowTests()
    {
        _files = new(new() { RootDirectory = _root }); _files.EnsureDirectories();
        _options = new DbContextOptionsBuilder<FolioDbContext>().UseSqlite($"Data Source={Path.Combine(_files.DatabaseDirectory, "folio.db")};Pooling=False").Options;
        _library = new(new Factory(_options), _files);
    }
    private async Task<Book> Seed()
    {
        await using var db = new FolioDbContext(_options); await new DatabaseMigrator(db, _files).MigrateAsync();
        var book = new Book { Title = "A Reliable Reader", Author = "Test Author", FilePath = "sample.pdf", Sha256 = new string('a',64), PageCount = 100 };
        db.Books.Add(book); db.Annotations.Add(new() { BookId = book.Id, PageIndex = 4, Note = "Important thought" });
        await db.SaveChangesAsync(); return book;
    }
    [Fact]
    public async Task ShelfCreation_RejectsConcurrentDuplicates_ThenAllowsRetry()
    {
        await Seed();
        var results = await Task.WhenAll(Enumerable.Range(0, 6).Select(async i =>
        {
            try { await _library.CreateShelfAsync(i % 2 == 0 ? " Research " : "research"); return true; }
            catch (ArgumentException) { return false; }
        }));
        Assert.Single(results, created => created);
        Assert.Single(await _library.GetShelvesAsync());
        var second = await _library.CreateShelfAsync("Reference");
        Assert.Equal("Reference", second.Name);
    }

    [Fact]
    public async Task ShelfCreation_CancelledRequestDoesNotWrite_OrBlockNextRequest()
    {
        await Seed();
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => _library.CreateShelfAsync("Cancelled", cancellation.Token));
        Assert.Empty(await _library.GetShelvesAsync());
        await _library.CreateShelfAsync("Saved");
        Assert.Equal("Saved", (await _library.GetShelvesAsync()).Single().Name);
    }

    [Fact]
    public async Task TrashRestore_PreservesNotesAndReadingPosition()
    {
        var book = await Seed();
        await _library.SetTrashAsync(book.Id, true);
        Assert.Equal(0, (await _library.QueryAsync(new())).Total);
        Assert.Equal(1, (await _library.QueryAsync(new(Trash:true))).Total);
        Assert.Empty(await _library.GetNotesAsync(null));
        await _library.SetTrashAsync(book.Id, false);
        Assert.Equal(1, (await _library.QueryAsync(new())).Total);
        Assert.Equal("Important thought", (await _library.GetNotesAsync(null)).Single().Annotation.Note);
    }
    [Fact]
    public async Task PagedQueries_FilterByAuthorStatusAndShelf_WithStableBoundaries()
    {
        var book = await Seed();
        var shelf = await _library.CreateShelfAsync("Research"); await _library.SetShelfAsync(book.Id, shelf.Id, true);
        await _library.SetStatusAsync(book.Id, ReadingStatus.Finished);
        Assert.Equal(1, (await _library.QueryAsync(new("test author", ReadingStatus.Finished, shelf.Id))).Total);
        Assert.Equal(0, (await _library.QueryAsync(new("test author", ReadingStatus.Reading, shelf.Id))).Total);
        await using var db = new FolioDbContext(_options);
        for (var i=0;i<130;i++) db.Books.Add(new() { Title=$"Book {i:D3}", Sha256=i.ToString("x64"), FilePath="fixture.pdf" });
        await db.SaveChangesAsync();
        var first = await _library.QueryAsync(new(Sort:LibrarySort.Title, Count:20));
        var next = await _library.QueryAsync(new(Sort:LibrarySort.Title, Start:20, Count:20));
        Assert.Equal(131, first.Total); Assert.Equal(20, first.Books.Count); Assert.Equal(20, next.Books.Count);
        Assert.Empty(first.Books.Select(b=>b.Id).Intersect(next.Books.Select(b=>b.Id)));
    }
    [Fact]
    public async Task PositionSave_PreservesFitModesFinishedStatusAndFurthestProgress()
    {
        var book = await Seed(); await _library.SetStatusAsync(book.Id, ReadingStatus.Finished);
        await using var db = new FolioDbContext(_options);
        var service = new ReadingPositionService(new ReadingPositionRepository(db), new BookRepository(db), new UnitOfWork(db));
        await service.SavePositionAsync(book.Id, 70, .35, -2, ReaderViewMode.SinglePage, 5);
        await service.SavePositionAsync(book.Id, 10, .1, -1, ReaderViewMode.Continuous, 3);
        db.ChangeTracker.Clear();
        var position = await db.ReadingPositions.SingleAsync(); var stored = await db.Books.SingleAsync();
        Assert.Equal(-1, position.Zoom); Assert.Equal(8, position.ActiveReadingSeconds);
        Assert.Equal(70, stored.FurthestPageIndex); Assert.Equal(ReadingStatus.Finished, stored.Status);
    }
    [Fact]
    public async Task AutomaticStatus_CompletesAtFurthestPageWithoutOverridingManualChoices()
    {
        var book = await Seed();
        await using var db = new FolioDbContext(_options);
        var service = new ReadingPositionService(new ReadingPositionRepository(db),new BookRepository(db),new UnitOfWork(db));
        await service.SavePositionAsync(book.Id,97,0,1,ReaderViewMode.Continuous,1);
        Assert.Equal(ReadingStatus.Finished,(await _library.GetBookAsync(book.Id))!.Status);
        await _library.SetStatusAsync(book.Id,ReadingStatus.Reading);
        db.ChangeTracker.Clear();
        await service.SavePositionAsync(book.Id,98,0,1,ReaderViewMode.Continuous,1);
        Assert.Equal(ReadingStatus.Reading,(await _library.GetBookAsync(book.Id))!.Status);
    }

    [Fact]
    public async Task RestoreGeneration_PreventsOldContextsFromWritingIntoRestoredLibrary()
    {
        await Seed(); var gate = new LibraryMaintenanceGate();
        await using var stale = new FolioDbContext(_options, gate);
        var book = await stale.Books.SingleAsync(); book.Title = "Stale update";
        gate.CompleteRestore();
        await Assert.ThrowsAsync<InvalidOperationException>(()=>stale.SaveChangesAsync());
        Assert.Equal("A Reliable Reader", (await _library.QueryAsync(new())).Books.Single().Title);
    }
    public void Dispose() { SqliteConnection.ClearAllPools(); if (Directory.Exists(_root)) Directory.Delete(_root,true); }

    [Fact]
    public async Task Shelves_CanRenameReorderAndDeleteWithoutDeletingBooks()
    {
        var book = await Seed();
        var first = await _library.CreateShelfAsync("First");
        var second = await _library.CreateShelfAsync("Second");
        await _library.SetShelfAsync(book.Id, first.Id, true);
        await _library.MoveShelfAsync(second.Id, -1);
        Assert.Equal(second.Id, (await _library.GetShelvesAsync())[0].Id);
        await _library.RenameShelfAsync(first.Id, "Renamed");
        await Assert.ThrowsAsync<ArgumentException>(() => _library.RenameShelfAsync(first.Id, " second "));
        await _library.DeleteShelfAsync(first.Id);
        Assert.NotNull(await _library.GetBookAsync(book.Id));
        Assert.Empty((await _library.GetBookAsync(book.Id))!.BookShelves);
        Assert.Equal("Important thought", (await _library.GetNotesAsync(null)).Single().Annotation.Note);
    }

    [Fact]
    public async Task PermanentDeletion_RequiresTrash_CascadesNotesAndText_AndPreservesOriginal()
    {
        var book = await Seed();
        var original = Path.Combine(_root, "original.pdf");
        await File.WriteAllTextAsync(original, "original");
        await File.WriteAllTextAsync(_files.GetBookPath(book.Sha256), "managed");
        await Assert.ThrowsAsync<InvalidOperationException>(() => _library.DeletePermanentlyAsync(book.Id));
        await using (var db = new FolioDbContext(_options))
        {
            db.DocumentPages.Add(new() { BookId = book.Id, PageIndex = 0, Text = "indexed" });
            await db.SaveChangesAsync();
        }
        await _library.SetTrashAsync(book.Id, true);
        await _library.EmptyTrashAsync();
        Assert.Equal("original", await File.ReadAllTextAsync(original));
        Assert.False(File.Exists(_files.GetBookPath(book.Sha256)));
        await using var check = new FolioDbContext(_options);
        Assert.Empty(await check.Books.ToListAsync());
        Assert.Empty(await check.Annotations.ToListAsync());
        Assert.Empty(await check.DocumentPages.ToListAsync());
    }

    [Fact]
    public async Task FolderImport_RecursesFiltersAndDeduplicates()
    {
        await Seed();
        var nested = Path.Combine(_root, "incoming", "nested"); Directory.CreateDirectory(nested);
        var pdf = Path.Combine(nested, "Book.PDF"); await File.WriteAllTextAsync(pdf, "sample");
        await File.WriteAllTextAsync(Path.Combine(nested, "ignore.txt"), "ignore");
        Assert.Equal(new[] { Path.GetFullPath(pdf) }, ImportInbox.Expand([Path.GetDirectoryName(nested)!, pdf]));
        using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
        Assert.Throws<OperationCanceledException>(() => ImportInbox.Expand([nested], cancellation.Token));
    }
}
