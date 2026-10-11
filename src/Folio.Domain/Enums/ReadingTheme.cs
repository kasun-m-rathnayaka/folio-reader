namespace Folio.Domain.Enums;

/// <summary>
/// Reading themes for physical-book feel and eye comfort (FR-FEL-01, §6.4).
/// </summary>
public enum ReadingTheme
{
    Paper = 0,     // Warm white #FBF6EA, ink #2A2622 (Default)
    Sepia = 1,     // Softer contrast #F2E6CE, ink #4A3B2A
    Parchment = 2, // Aged paper #E9DCC0, ink #3B2F22
    Daylight = 3,  // Neutral white #FFFFFF, ink #1B1B1B
    Night = 4,     // Warm dark #1C1A17, ink #D9D2C3
    Black = 5      // OLED pitch black #000000, ink #CFC8B8
}

public static class ReadingThemeExtensions
{
    public static string GetBackgroundHex(this ReadingTheme theme) => theme switch
    {
        ReadingTheme.Paper => "#FBF6EA",
        ReadingTheme.Sepia => "#F2E6CE",
        ReadingTheme.Parchment => "#E9DCC0",
        ReadingTheme.Daylight => "#FFFFFF",
        ReadingTheme.Night => "#1C1A17",
        ReadingTheme.Black => "#000000",
        _ => "#FBF6EA"
    };

    public static string GetInkHex(this ReadingTheme theme) => theme switch
    {
        ReadingTheme.Paper => "#2A2622",
        ReadingTheme.Sepia => "#4A3B2A",
        ReadingTheme.Parchment => "#3B2F22",
        ReadingTheme.Daylight => "#1B1B1B",
        ReadingTheme.Night => "#D9D2C3",
        ReadingTheme.Black => "#CFC8B8",
        _ => "#2A2622"
    };

    public static bool IsDark(this ReadingTheme theme) =>
        theme is ReadingTheme.Night or ReadingTheme.Black;

    public static string GetCssFilter(this ReadingTheme theme) => theme switch
    {
        ReadingTheme.Night => "invert(0.92) hue-rotate(180deg) brightness(0.95) contrast(0.95)",
        ReadingTheme.Black => "invert(1) hue-rotate(180deg) contrast(1.1)",
        _ => "none"
    };
}
