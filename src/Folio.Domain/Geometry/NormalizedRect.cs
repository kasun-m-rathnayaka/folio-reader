namespace Folio.Domain.Geometry;

/// <summary>
/// A bounding rectangle normalized to [0.0, 1.0] in visible page space (top-left origin).
/// Used across text selection, highlights, OCR words, and search result overlays.
/// </summary>
public readonly record struct NormalizedRect(double X, double Y, double Width, double Height)
{
    public static readonly NormalizedRect Empty = new(0.0, 0.0, 0.0, 0.0);

    public double Left => X;
    public double Top => Y;
    public double Right => X + Width;
    public double Bottom => Y + Height;

    public bool IsEmpty => Width <= 0.0 || Height <= 0.0;

    public bool Contains(NormalizedPoint point) =>
        point.X >= Left && point.X <= Right &&
        point.Y >= Top && point.Y <= Bottom;

    public bool IntersectsWith(NormalizedRect other) =>
        Left < other.Right && Right > other.Left &&
        Top < other.Bottom && Bottom > other.Top;

    public NormalizedRect Clamp()
    {
        double clampedX = Math.Clamp(X, 0.0, 1.0);
        double clampedY = Math.Clamp(Y, 0.0, 1.0);
        double clampedW = Math.Clamp(Width, 0.0, 1.0 - clampedX);
        double clampedH = Math.Clamp(Height, 0.0, 1.0 - clampedY);
        return new NormalizedRect(clampedX, clampedY, clampedW, clampedH);
    }

    public NormalizedRect Union(NormalizedRect other)
    {
        if (IsEmpty) return other;
        if (other.IsEmpty) return this;

        double minX = Math.Min(Left, other.Left);
        double minY = Math.Min(Top, other.Top);
        double maxX = Math.Max(Right, other.Right);
        double maxY = Math.Max(Bottom, other.Bottom);

        return new NormalizedRect(minX, minY, maxX - minX, maxY - minY);
    }
}
