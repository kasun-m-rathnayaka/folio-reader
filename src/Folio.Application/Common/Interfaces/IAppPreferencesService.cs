namespace Folio.Application.Common.Interfaces;

public record AppPreferences(bool DarkMode = true, bool GridView = true, bool SidebarCollapsed = false,
    bool ReducedMotion = false, double FontScale = 1, bool WeeklyBackup = true);

public interface IAppPreferencesService
{
    AppPreferences Current { get; }
    void Save(AppPreferences preferences);
}
