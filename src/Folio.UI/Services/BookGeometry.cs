using Folio.Domain.Entities;

namespace Folio.UI.Services;

/// <summary>
/// Physical book proportions shared by the CSS books and the 3D stage (LIB-4): thickness grows with page count
/// (0.075 mm per page, about 80 gsm paper counted per leaf side) and is clamped to 8–60 mm.
/// </summary>
public static class BookGeometry
{
    public const double HeightMm = 210, WidthMm = 140;
    public static double ThicknessMm(int pageCount) => Math.Clamp(pageCount * 0.075, 8, 60);
    /// <summary>Share of the book read: the current page over the page count; 0 until the book is first opened.</summary>
    public static double Progress(Book book) =>
        book.LastReadAt == null || book.PageCount <= 0 ? 0 : Math.Clamp(((book.ReadingPosition?.PageIndex ?? 0) + 1d) / book.PageCount, 0, 1);
    public static int ProgressPercent(Book book) => (int)Math.Round(Progress(book) * 100);
    public static string AccessibleName(Book book) =>
        $"{book.Title}, by {(string.IsNullOrWhiteSpace(book.Author) ? "unknown author" : book.Author)}, {ProgressPercent(book)}% read";
}
