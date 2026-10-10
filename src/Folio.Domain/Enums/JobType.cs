namespace Folio.Domain.Enums;

/// <summary>
/// Type of background task queued in Folio.
/// </summary>
public enum JobType
{
    Thumbnail = 0,
    ExtractText = 1,
    OcrScan = 2,
    IndexFts = 3
}
