using Folio.Domain.Common;
using Folio.Domain.Enums;

namespace Folio.Domain.Entities;

/// <summary>
/// Represents a managed book in the Folio library.
/// Non-destructive storage: pristine source PDF stored under %LocalAppData%\Folio\library\books\&lt;Sha256&gt;.pdf.
/// </summary>
public class Book : BaseEntity
{
    /// <summary>
    /// Hexadecimal lowercase SHA-256 hash of the pristine PDF file (unique identifier).
    /// </summary>
    public string Sha256 { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;

    public string? Author { get; set; }

    public int PageCount { get; set; }

    public long FileSizeBytes { get; set; }

    /// <summary>
    /// Relative or absolute path to the managed PDF file.
    /// </summary>
    public string FilePath { get; set; } = string.Empty;

    /// <summary>
    /// Path to the generated cover thumbnail image (e.g. WebP format).
    /// </summary>
    public string? CoverPath { get; set; }

    public ReadingStatus Status { get; set; } = ReadingStatus.WantToRead;

    public DateTimeOffset? LastReadAt { get; set; }

    // Navigation properties
    public ReadingPosition? ReadingPosition { get; set; }

    public ICollection<Annotation> Annotations { get; set; } = new List<Annotation>();

    public ICollection<Bookmark> Bookmarks { get; set; } = new List<Bookmark>();

    public ICollection<BookShelf> BookShelves { get; set; } = new List<BookShelf>();

    public ICollection<BookTag> BookTags { get; set; } = new List<BookTag>();
}

