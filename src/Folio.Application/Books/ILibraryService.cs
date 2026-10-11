using Folio.Domain.Entities;
using Folio.Domain.Enums;

namespace Folio.Application.Books;

public enum LibrarySort { Recent, Title, Author, Added, Progress }
public record LibraryQuery(string? Search = null, ReadingStatus? Status = null, Guid? ShelfId = null,
    bool Trash = false, LibrarySort Sort = LibrarySort.Recent, int Start = 0, int Count = 40);
public record LibraryPage(IReadOnlyList<Book> Books, int Total);
public record LibraryCounts(int All, int Reading, int WantToRead, int Finished, int Trash);
public record LibraryNote(Annotation Annotation, string BookTitle, string? Author);

/// <summary>Each operation owns its database context; UI components never retain tracked entities.</summary>
public interface ILibraryService
{
    Task<LibraryPage> QueryAsync(LibraryQuery query, CancellationToken ct = default);
    Task<LibraryCounts> GetCountsAsync(CancellationToken ct = default);
    Task<IReadOnlyList<Book>> GetRecentAsync(CancellationToken ct = default);
    Task<IReadOnlyList<Shelf>> GetShelvesAsync(CancellationToken ct = default);
    Task<Book?> GetBookAsync(Guid id, CancellationToken ct = default);
    Task SetStatusAsync(Guid id, ReadingStatus status, CancellationToken ct = default, bool manual = true);
    Task SetPageCountAsync(Guid id, int pages, CancellationToken ct = default);
    Task SetTrashAsync(Guid id, bool trash, CancellationToken ct = default);
    Task SaveMetadataAsync(Guid id, string title, string? author, CancellationToken ct = default);
    Task<Shelf> CreateShelfAsync(string name, CancellationToken ct = default);
    Task SetShelfAsync(Guid bookId, Guid shelfId, bool included, CancellationToken ct = default);
    Task<IReadOnlyList<LibraryNote>> GetNotesAsync(string? search, CancellationToken ct = default);
    Task RelinkAsync(Guid id, string sourcePath, CancellationToken ct = default);
}
