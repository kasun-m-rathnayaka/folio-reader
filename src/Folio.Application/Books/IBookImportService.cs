using Folio.Domain.Entities;

namespace Folio.Application.Books;

public record ImportResult(
    bool IsNew,
    Book Book,
    string? Error = null);

/// <summary>
/// Service port for PDF file ingestion, metadata extraction, deduplication, and cover thumbnailing (FR-LIB-01..03).
/// </summary>
public interface IBookImportService
{
    Task<ImportResult> ImportFileAsync(string sourceFilePath, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ImportResult>> ImportFilesAsync(
        IEnumerable<string> sourceFilePaths,
        IProgress<double>? progress = null,
        CancellationToken cancellationToken = default);
}

