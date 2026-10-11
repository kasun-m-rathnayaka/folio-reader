namespace Folio.Domain.Enums;

/// <summary>
/// Palette colors for highlights and bookmarks.
/// </summary>
public enum HighlightColor
{
    Yellow = 0,
    Green = 1,
    Blue = 2,
    Pink = 3,
    Purple = 4
}

public static class HighlightColorExtensions
{
    public static string ToHex(this HighlightColor color) => color switch
    {
        HighlightColor.Yellow => "#FFEB3B",
        HighlightColor.Green => "#81C784",
        HighlightColor.Blue => "#64B5F6",
        HighlightColor.Pink => "#F48FB1",
        HighlightColor.Purple => "#BA68C8",
        _ => "#FFEB3B"
    };

    public static string ToRgba(this HighlightColor color, double opacity = 0.35) => color switch
    {
        HighlightColor.Yellow => $"rgba(255, 235, 59, {opacity})",
        HighlightColor.Green => $"rgba(129, 199, 132, {opacity})",
        HighlightColor.Blue => $"rgba(100, 181, 246, {opacity})",
        HighlightColor.Pink => $"rgba(244, 143, 177, {opacity})",
        HighlightColor.Purple => $"rgba(186, 104, 200, {opacity})",
        _ => $"rgba(255, 235, 59, {opacity})"
    };
}
