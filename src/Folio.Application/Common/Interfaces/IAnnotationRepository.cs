using Folio.Domain.Entities;
using Folio.Domain.Enums;

namespace Folio.Application.Common.Interfaces;

/// <summary>
/// Repository interface for Annotation persistence and querying (FR-ANN-01..10).
/// </summary>
public interface IAnnotationRepository
{
    Task<Annotation?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Annotation>> GetByBookIdAsync(Guid bookId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Annotation>> GetByBookAndPageAsync(Guid bookId, int pageIndex, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Annotation>> QueryAsync(
        Guid? bookId = null,
        AnnotationType? type = null,
        HighlightColor? color = null,
        string? searchText = null,
        string? tag = null,
        CancellationToken cancellationToken = default);
    Task AddAsync(Annotation annotation, CancellationToken cancellationToken = default);
    void Update(Annotation annotation);
    void Remove(Annotation annotation);
}
