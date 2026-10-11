using System.Text.Json;
using Folio.Application.Annotations.DTOs;
using Folio.Application.Common.Interfaces;
using Folio.Domain.Anchors;
using Folio.Domain.Entities;
using Folio.Domain.Geometry;

namespace Folio.Application.Annotations;

public class AnnotationService : IAnnotationService
{
    private readonly IAnnotationRepository _annotationRepository;
    private readonly IUnitOfWork _unitOfWork;
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    public AnnotationService(IAnnotationRepository annotationRepository, IUnitOfWork unitOfWork)
    {
        _annotationRepository = annotationRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyList<AnnotationDto>> GetAnnotationsForPageAsync(Guid bookId, int pageIndex, CancellationToken cancellationToken = default)
    {
        var annotations = await _annotationRepository.GetByBookAndPageAsync(bookId, pageIndex, cancellationToken);
        return annotations.Select(ToDto).ToList();
    }

    public async Task<IReadOnlyList<AnnotationDto>> GetAnnotationsForBookAsync(Guid bookId, CancellationToken cancellationToken = default)
    {
        var annotations = await _annotationRepository.GetByBookIdAsync(bookId, cancellationToken);
        return annotations.Select(ToDto).ToList();
    }

    public async Task<IReadOnlyList<AnnotationDto>> QueryAnnotationsAsync(AnnotationFilterDto filter, CancellationToken cancellationToken = default)
    {
        var annotations = await _annotationRepository.QueryAsync(
            filter.BookId,
            filter.Type,
            filter.Color,
            filter.SearchText,
            filter.Tag,
            cancellationToken);

        return annotations.Select(ToDto).ToList();
    }

    public async Task<AnnotationDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var annotation = await _annotationRepository.GetByIdAsync(id, cancellationToken);
        return annotation != null ? ToDto(annotation) : null;
    }

    public async Task<AnnotationDto> CreateAnnotationAsync(CreateAnnotationDto dto, CancellationToken cancellationToken = default)
    {
        var annotation = new Annotation
        {
            Id = Guid.NewGuid(),
            BookId = dto.BookId,
            PageIndex = dto.PageIndex,
            Type = dto.Type,
            Color = dto.Color,
            RectsJson = JsonSerializer.Serialize(dto.Rects, JsonOptions),
            SelectedText = dto.SelectedText,
            AnchorPrefix = dto.AnchorPrefix,
            AnchorSuffix = dto.AnchorSuffix,
            CharacterOffset = dto.CharacterOffset,
            ExtractorVersion = 1,
            IsDetached = false,
            Note = dto.Note,
            Tags = dto.Tags
        };

        await _annotationRepository.AddAsync(annotation, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return ToDto(annotation);
    }

    public async Task<AnnotationDto?> UpdateAnnotationAsync(UpdateAnnotationDto dto, CancellationToken cancellationToken = default)
    {
        var annotation = await _annotationRepository.GetByIdAsync(dto.Id, cancellationToken);
        if (annotation == null) return null;

        if (dto.Color.HasValue) annotation.Color = dto.Color.Value;
        if (dto.Note != null) annotation.Note = dto.Note;
        if (dto.Tags != null) annotation.Tags = dto.Tags;
        if (dto.Rects != null) annotation.RectsJson = JsonSerializer.Serialize(dto.Rects, JsonOptions);
        if (dto.IsDetached.HasValue) annotation.IsDetached = dto.IsDetached.Value;
        annotation.UpdatedAt = DateTimeOffset.UtcNow;

        _annotationRepository.Update(annotation);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return ToDto(annotation);
    }

    public async Task<bool> DeleteAnnotationAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var annotation = await _annotationRepository.GetByIdAsync(id, cancellationToken);
        if (annotation == null) return false;

        _annotationRepository.Remove(annotation);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<int> ReanchorAnnotationsAsync(Guid bookId, int pageIndex, string newPageText, CancellationToken cancellationToken = default)
    {
        var annotations = await _annotationRepository.GetByBookAndPageAsync(bookId, pageIndex, cancellationToken);
        int reanchoredCount = 0;

        foreach (var ann in annotations)
        {
            if (string.IsNullOrEmpty(ann.SelectedText)) continue;

            var rects = DeserializeRects(ann.RectsJson);
            var anchor = new TextAnchor
            {
                PageIndex = ann.PageIndex,
                ExactText = ann.SelectedText,
                Prefix = ann.AnchorPrefix ?? string.Empty,
                Suffix = ann.AnchorSuffix ?? string.Empty,
                CharacterOffset = ann.CharacterOffset,
                Rects = rects,
                ExtractorVersion = ann.ExtractorVersion
            };

            var result = anchor.Reanchor(newPageText);
            if (result.IsSuccess)
            {
                ann.CharacterOffset = result.CharacterOffset;
                ann.IsDetached = false;
                reanchoredCount++;
            }
            else
            {
                ann.IsDetached = true;
            }

            ann.UpdatedAt = DateTimeOffset.UtcNow;
            _annotationRepository.Update(ann);
        }

        if (annotations.Count > 0)
        {
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }

        return reanchoredCount;
    }

    private static AnnotationDto ToDto(Annotation a)
    {
        var rects = DeserializeRects(a.RectsJson);
        return new AnnotationDto(
            a.Id,
            a.BookId,
            a.PageIndex,
            a.Type,
            a.Color,
            rects,
            a.SelectedText,
            a.AnchorPrefix,
            a.AnchorSuffix,
            a.CharacterOffset,
            a.ExtractorVersion,
            a.IsDetached,
            a.Note,
            a.Tags,
            a.CreatedAt,
            a.UpdatedAt
        );
    }

    private static IReadOnlyList<NormalizedRect> DeserializeRects(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return Array.Empty<NormalizedRect>();
        try
        {
            return JsonSerializer.Deserialize<List<NormalizedRect>>(json, JsonOptions) ?? (IReadOnlyList<NormalizedRect>)Array.Empty<NormalizedRect>();
        }
        catch
        {
            return Array.Empty<NormalizedRect>();
        }
    }
}
