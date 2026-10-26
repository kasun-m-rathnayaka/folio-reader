namespace Folio.Application.Common.Interfaces;

public record AppPreferences(bool DarkMode = true, bool GridView = true, bool SidebarCollapsed = false,
    double FontScale = 1, int ReflowFontSize = 20, string? SpeechVoiceId = null, double SpeechRate = 1);

public interface IAppPreferencesService
{
    AppPreferences Current { get; }
    void Save(AppPreferences preferences);
}
