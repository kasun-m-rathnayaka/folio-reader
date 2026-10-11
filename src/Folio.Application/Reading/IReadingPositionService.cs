using Folio.Domain.Entities;
using Folio.Domain.Enums;

namespace Folio.Application.Reading;

/// <summary>
/// Manages loading and persisting reading positions and reading session telemetry (FR-MEM-01..04).
/// </summary>
public interface IReadingPositionService
{
    Task<ReadingPosition?> GetPositionAsync(Guid bookId, CancellationToken cancellationToken = default);

    Task SavePositionAsync(
        Guid bookId,
        int pageIndex,
        double offsetPercent,
        double zoom,
        ReaderViewMode viewMode,
        long activeReadingSeconds,
        CancellationToken cancellationToken = default);
}

