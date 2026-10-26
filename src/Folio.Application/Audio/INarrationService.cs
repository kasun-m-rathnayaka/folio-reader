namespace Folio.Application.Audio;

public record NarrationVoice(string Id, string Name, string Language);
public interface INarrationService : IDisposable
{
    IReadOnlyList<NarrationVoice> GetVoices();
    Task SpeakAsync(string text, string? voiceId, double speed, CancellationToken ct);
    void Pause();
    void Resume();
    void Stop();
    void OpenVoiceSettings();
}
