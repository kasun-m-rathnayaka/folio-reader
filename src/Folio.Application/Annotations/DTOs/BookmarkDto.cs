using Folio.Domain.Enums;

namespace Folio.Application.Annotations.DTOs;

public record BookmarkDto(
    Guid Id,
    Guid BookId,
    int PageIndex,
    string? Label,
    HighlightColor? Color,
    bool IsDogEar,
    int? CharacterOffset,
    DateTimeOffset CreatedAt
);

public record CreateBookmarkDto(
    Guid BookId,
    int PageIndex,
    string? Label = null,
    HighlightColor? Color = null,
    bool IsDogEar = false,
    int? CharacterOffset = null
);
