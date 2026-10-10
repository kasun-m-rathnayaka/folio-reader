namespace Folio.Domain.Geometry;

/// <summary>
/// A point normalized to [0.0, 1.0] in visible page space (top-left origin).
/// </summary>
public readonly record struct NormalizedPoint(double X, double Y)
{
    public static readonly NormalizedPoint Zero = new(0.0, 0.0);

    public bool IsValid => X >= 0.0 && X <= 1.0 && Y >= 0.0 && Y <= 1.0;
}
