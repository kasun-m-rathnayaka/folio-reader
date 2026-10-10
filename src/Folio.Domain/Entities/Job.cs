using Folio.Domain.Common;
using Folio.Domain.Enums;

namespace Folio.Domain.Entities;

/// <summary>
/// Represents a queued or executing background worker task (FR-DAT-05, NFR-10).
/// </summary>
public class Job : BaseEntity
{
    public Guid? BookId { get; set; }

    public JobType Type { get; set; }

    public JobStatus Status { get; set; } = JobStatus.Queued;

    /// <summary>
    /// Progress ratio from 0.0 to 1.0.
    /// </summary>
    public double Progress { get; set; }

    /// <summary>
    /// Priority level: High = 10 (user interactive), Normal = 5 (import), Low = 1 (idle/OCR).
    /// </summary>
    public int Priority { get; set; } = 5;

    public string? ErrorMessage { get; set; }

    public DateTimeOffset? StartedAt { get; set; }

    public DateTimeOffset? CompletedAt { get; set; }

    // Navigation property
    public Book? Book { get; set; }
}
