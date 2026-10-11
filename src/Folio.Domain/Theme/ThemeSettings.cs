using Folio.Domain.Enums;

namespace Folio.Domain.Theme;

/// <summary>
/// Physical-book feel configuration and lighting parameters (FR-FEL-01..04).
/// </summary>
public record ThemeSettings
{
    public ReadingTheme Theme { get; init; } = ReadingTheme.Paper;
    public int WarmthPercent { get; init; } = 0;          // 0 to 100% (amber warmth overlay)
    public int BrightnessPercent { get; init; } = 100;    // 50 to 100% (dimmer overlay)
    public bool EnableVignette { get; init; } = false;    // Radial reading-lamp vignette
    public bool EnableGrain { get; init; } = false;       // Subtle paper grain overlay
    public bool EnableRuler { get; init; } = false;       // Reading ruler guide bar
    public int FocusLines { get; init; } = 0;             // 0 = Off, 1 = 1 line, 3 = 3 lines, 5 = 5 lines

    public static ThemeSettings Default => new();

    public double WarmthAlpha => (Math.Clamp(WarmthPercent, 0, 100) / 100.0) * 0.35;
    public double DimAlpha => ((100 - Math.Clamp(BrightnessPercent, 30, 100)) / 100.0) * 0.60;
}
