namespace Folio.Domain.Enums;

/// <summary>
/// Execution state of a background job.
/// </summary>
public enum JobStatus
{
    Queued = 0,
    Running = 1,
    Completed = 2,
    Failed = 3,
    Cancelled = 4
}
