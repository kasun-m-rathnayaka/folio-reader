namespace Folio.Domain.Enums;

/// <summary>
/// Status of a book in the library.
/// </summary>
public enum ReadingStatus
{
    WantToRead = 0,
    Reading = 1,
    Finished = 2,
    Abandoned = 3
}
