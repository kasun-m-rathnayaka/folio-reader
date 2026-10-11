using Folio.Application.Annotations.DTOs;

namespace Folio.Application.Annotations;

public interface IAnnotationExportService
{
    string ExportToMarkdown(Guid bookId, string bookTitle, string? author, IReadOnlyList<AnnotationDto> annotations);
    string ExportToJson(Guid bookId, string bookTitle, string? author, IReadOnlyList<AnnotationDto> annotations);
    string ExportToCsv(Guid bookId, string bookTitle, IReadOnlyList<AnnotationDto> annotations);
    string FormatQuoteCitation(string quote, string bookTitle, string? author, int pageIndex);
}
