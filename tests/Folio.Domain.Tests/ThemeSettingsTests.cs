using Folio.Domain.Enums;
using Folio.Domain.Theme;
using Xunit;

namespace Folio.Domain.Tests;

public class ThemeSettingsTests
{
    [Theory]
    [InlineData(ReadingTheme.Paper, "#FBF6EA", "#2A2622", false)]
    [InlineData(ReadingTheme.Sepia, "#F2E6CE", "#4A3B2A", false)]
    [InlineData(ReadingTheme.Parchment, "#E9DCC0", "#3B2F22", false)]
    [InlineData(ReadingTheme.Daylight, "#FFFFFF", "#1B1B1B", false)]
    [InlineData(ReadingTheme.Night, "#1C1A17", "#D9D2C3", true)]
    [InlineData(ReadingTheme.Black, "#000000", "#CFC8B8", true)]
    public void ReadingTheme_HasAccuratePaletteColors(ReadingTheme theme, string expectedBg, string expectedInk, bool expectedDark)
    {
        Assert.Equal(expectedBg, theme.GetBackgroundHex());
        Assert.Equal(expectedInk, theme.GetInkHex());
        Assert.Equal(expectedDark, theme.IsDark());
    }

    [Fact]
    public void ThemeSettings_AlphaCalculations_AreBoundedAndAccurate()
    {
        var settings = new ThemeSettings
        {
            WarmthPercent = 100,
            BrightnessPercent = 50
        };

        Assert.Equal(0.35, settings.WarmthAlpha, 2);
        Assert.Equal(0.30, settings.DimAlpha, 2);
    }
}
