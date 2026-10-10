namespace Folio.Domain.Enums;

/// <summary>
/// Display mode for the reader viewport.
/// Continuous vertical scroll is default as confirmed in project decisions.
/// </summary>
public enum ReaderViewMode
{
    Continuous = 0,
    SinglePage = 1,
    TwoPage = 2
}
