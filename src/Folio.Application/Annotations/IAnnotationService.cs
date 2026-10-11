using Folio.Application.Annotations.DTOs;

namespace Folio.Application.Annotations;

public interface IAnnotationService
{
    Task<IReadOnlyList<AnnotationDto>> GetAnnotationsForPageAsync(Guid bookId, int pageIndex, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<AnnotationDto>> GetAnnotationsForBookAsync(Guid bookId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<AnnotationDto>> QueryAnnotationsAsync(AnnotationFilterDto filter, CancellationToken cancellationToken = default);
    Task<AnnotationDto?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);
    Task<AnnotationDto> CreateAnnotationAsync(CreateAnnotationDto dto, CancellationToken cancellationToken = default);
    Task<AnnotationDto?> UpdateAnnotationAsync(UpdateAnnotationDto dto, CancellationToken cancellationToken = default);
    Task<bool> DeleteAnnotationAsync(Guid id, CancellationToken cancellationToken = default);
    Task<int> ReanchorAnnotationsAsync(Guid bookId, int pageIndex, string newPageText, CancellationToken cancellationToken = default);
}
