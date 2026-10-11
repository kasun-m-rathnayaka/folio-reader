using System.Text.Json;
using Folio.Application.Common.Interfaces;

namespace Folio.Infrastructure.Storage;

public class AppPreferencesService : IAppPreferencesService
{
    private readonly string _path;
    public AppPreferences Current { get; private set; } = new();

    public AppPreferencesService(IFileStore files)
    {
        _path = Path.Combine(files.RootDirectory, "settings.json");
        try
        {
            if (File.Exists(_path)) Current = JsonSerializer.Deserialize<AppPreferences>(File.ReadAllText(_path)) ?? new();
        }
        catch (JsonException) { /* Leave the original file intact; use readable defaults. */ }
        catch (IOException) { }
    }

    public void Save(AppPreferences preferences)
    {
        preferences = preferences with { FontScale = Math.Clamp(preferences.FontScale, 1, 2) };
        var temporary = _path + ".tmp";
        File.WriteAllText(temporary, JsonSerializer.Serialize(preferences, new JsonSerializerOptions { WriteIndented = true }));
        File.Move(temporary, _path, overwrite: true);
        Current = preferences;
    }
}
