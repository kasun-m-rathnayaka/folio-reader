using Folio.Application.Annotations.DTOs;
using Folio.Domain.Enums;

namespace Folio.Application.Annotations;

public interface IBookmarkService
{
    Task<IReadOnlyList<BookmarkDto>> GetBookmarksAsync(Guid bookId, CancellationToken cancellationToken = default);
    Task<bool> IsPageDogEaredAsync(Guid bookId, int pageIndex, CancellationToken cancellationToken = default);
    Task<BookmarkDto?> ToggleDogEarAsync(Guid bookId, int pageIndex, CancellationToken cancellationToken = default);
    Task<BookmarkDto> CreateNamedBookmarkAsync(CreateBookmarkDto dto, CancellationToken cancellationToken = default);
    Task<BookmarkDto?> UpdateBookmarkAsync(Guid id, string? label, HighlightColor? color, CancellationToken cancellationToken = default);
    Task<bool> DeleteBookmarkAsync(Guid id, CancellationToken cancellationToken = default);
}
