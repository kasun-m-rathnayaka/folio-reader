using Folio.Application.Annotations.DTOs;
using Folio.Application.Common.Interfaces;
using Folio.Domain.Entities;
using Folio.Domain.Enums;

namespace Folio.Application.Annotations;

public class BookmarkService : IBookmarkService
{
    private readonly IBookmarkRepository _bookmarkRepository;
    private readonly IUnitOfWork _unitOfWork;

    public BookmarkService(IBookmarkRepository bookmarkRepository, IUnitOfWork unitOfWork)
    {
        _bookmarkRepository = bookmarkRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyList<BookmarkDto>> GetBookmarksAsync(Guid bookId, CancellationToken cancellationToken = default)
    {
        var bookmarks = await _bookmarkRepository.GetByBookIdAsync(bookId, cancellationToken);
        return bookmarks.Select(ToDto).ToList();
    }

    public async Task<bool> IsPageDogEaredAsync(Guid bookId, int pageIndex, CancellationToken cancellationToken = default)
    {
        var dogEar = await _bookmarkRepository.GetDogEarAsync(bookId, pageIndex, cancellationToken);
        return dogEar != null;
    }

    public async Task<BookmarkDto?> ToggleDogEarAsync(Guid bookId, int pageIndex, CancellationToken cancellationToken = default)
    {
        var existing = await _bookmarkRepository.GetDogEarAsync(bookId, pageIndex, cancellationToken);
        if (existing != null)
        {
            _bookmarkRepository.Remove(existing);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            return null; // Toggled off
        }

        var dogEar = new Bookmark
        {
            Id = Guid.NewGuid(),
            BookId = bookId,
            PageIndex = pageIndex,
            IsDogEar = true,
            Label = $"Page {pageIndex + 1}",
            Color = HighlightColor.Yellow
        };

        await _bookmarkRepository.AddAsync(dogEar, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return ToDto(dogEar);
    }

    public async Task<BookmarkDto> CreateNamedBookmarkAsync(CreateBookmarkDto dto, CancellationToken cancellationToken = default)
    {
        var bookmark = new Bookmark
        {
            Id = Guid.NewGuid(),
            BookId = dto.BookId,
            PageIndex = dto.PageIndex,
            Label = string.IsNullOrWhiteSpace(dto.Label) ? $"Page {dto.PageIndex + 1}" : dto.Label.Trim(),
            Color = dto.Color ?? HighlightColor.Blue,
            IsDogEar = dto.IsDogEar,
            CharacterOffset = dto.CharacterOffset
        };

        await _bookmarkRepository.AddAsync(bookmark, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return ToDto(bookmark);
    }

    public async Task<BookmarkDto?> UpdateBookmarkAsync(Guid id, string? label, HighlightColor? color, CancellationToken cancellationToken = default)
    {
        var bookmark = await _bookmarkRepository.GetByIdAsync(id, cancellationToken);
        if (bookmark == null) return null;

        if (label != null) bookmark.Label = label.Trim();
        if (color.HasValue) bookmark.Color = color.Value;
        bookmark.UpdatedAt = DateTimeOffset.UtcNow;

        _bookmarkRepository.Update(bookmark);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return ToDto(bookmark);
    }

    public async Task<bool> DeleteBookmarkAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var bookmark = await _bookmarkRepository.GetByIdAsync(id, cancellationToken);
        if (bookmark == null) return false;

        _bookmarkRepository.Remove(bookmark);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static BookmarkDto ToDto(Bookmark b) => new(
        b.Id,
        b.BookId,
        b.PageIndex,
        b.Label,
        b.Color,
        b.IsDogEar,
        b.CharacterOffset,
        b.CreatedAt
    );
}
