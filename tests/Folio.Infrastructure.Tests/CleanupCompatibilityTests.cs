using Folio.Infrastructure.Storage;

namespace Folio.Infrastructure.Tests;

public class CleanupCompatibilityTests
{
    [Fact]
    public void OlderSettings_PreserveSupportedPreferencesAndIgnoreRemovedFeatures()
    {
        var root = Path.Combine(Path.GetTempPath(), "FolioSettings_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            var path = Path.Combine(root, "settings.json");
            File.WriteAllText(path, """
                {"DarkMode":false,"GridView":false,"SidebarCollapsed":true,"FontScale":1.25,
                 "ReflowFontSize":28,"SpeechVoiceId":"old-voice","SpeechRate":1.5}
                """);
            var files = new FileStore(new FileStoreOptions { RootDirectory = root });
            var preferences = new AppPreferencesService(files);
            Assert.False(preferences.Current.DarkMode);
            Assert.False(preferences.Current.GridView);
            Assert.True(preferences.Current.SidebarCollapsed);
            Assert.Equal(1.25, preferences.Current.FontScale);
            preferences.Save(preferences.Current);
            var saved = File.ReadAllText(path);
            Assert.DoesNotContain("ReflowFontSize", saved);
            Assert.DoesNotContain("Speech", saved);
            Assert.Equal(preferences.Current, new AppPreferencesService(files).Current);
        }
        finally { Directory.Delete(root, true); }
    }
}
