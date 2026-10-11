using Folio.Domain.Enums;
using Folio.Domain.Geometry;

namespace Folio.Application.Annotations.DTOs;

public record AnnotationDto(
    Guid Id,
    Guid BookId,
    int PageIndex,
    AnnotationType Type,
    HighlightColor Color,
    IReadOnlyList<NormalizedRect> Rects,
    string? SelectedText,
    string? AnchorPrefix,
    string? AnchorSuffix,
    int? CharacterOffset,
    int ExtractorVersion,
    bool IsDetached,
    string? Note,
    string? Tags,
    DateTimeOffset CreatedAt,
    DateTimeOffset? UpdatedAt
);

public record CreateAnnotationDto(
    Guid BookId,
    int PageIndex,
    AnnotationType Type,
    HighlightColor Color,
    IReadOnlyList<NormalizedRect> Rects,
    string? SelectedText = null,
    string? AnchorPrefix = null,
    string? AnchorSuffix = null,
    int? CharacterOffset = null,
    string? Note = null,
    string? Tags = null
);

public record UpdateAnnotationDto(
    Guid Id,
    HighlightColor? Color = null,
    string? Note = null,
    string? Tags = null,
    IReadOnlyList<NormalizedRect>? Rects = null,
    bool? IsDetached = null
);

public record AnnotationFilterDto(
    Guid? BookId = null,
    AnnotationType? Type = null,
    HighlightColor? Color = null,
    string? SearchText = null,
    string? Tag = null
);
