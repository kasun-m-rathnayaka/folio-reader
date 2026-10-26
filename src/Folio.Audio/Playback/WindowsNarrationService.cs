using System.Diagnostics;
using Folio.Application.Audio;
using Windows.Media.Core;
using Windows.Media.Playback;
using Windows.Media.SpeechSynthesis;

namespace Folio.Audio.Playback;

public sealed class WindowsNarrationService : INarrationService
{
    private MediaPlayer? _player;
    private bool _pauseRequested;
    private CancellationTokenSource? _active;
    public double Volume { get; set; } = 1;
    public IReadOnlyList<NarrationVoice> GetVoices() => SpeechSynthesizer.AllVoices.Select(v => new NarrationVoice(v.Id, v.DisplayName, v.Language)).ToArray();
    public async Task SpeakAsync(string text, string? voiceId, double speed, CancellationToken ct)
    {
        Stop();
        using var active = CancellationTokenSource.CreateLinkedTokenSource(ct);
        _active = active;
        _pauseRequested = false;
        try
        {
        using var synth = new SpeechSynthesizer();
        var voice = SpeechSynthesizer.AllVoices.FirstOrDefault(v => v.Id == voiceId);
        if (voice != null) synth.Voice = voice;
        synth.Options.SpeakingRate = Math.Clamp(speed, .5, 2);
        using var stream = await synth.SynthesizeTextToStreamAsync(text).AsTask(active.Token);
        using var player = new MediaPlayer { AutoPlay = false, Volume = Math.Clamp(Volume, 0, 1) };
        _player = player;
        var completed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        player.MediaEnded += (_, _) => completed.TrySetResult();
        player.MediaFailed += (_, e) => completed.TrySetException(new InvalidOperationException("Speech playback failed: " + e.ErrorMessage));
        using var cancellation = active.Token.Register(() => completed.TrySetCanceled(active.Token));
        using var source = MediaSource.CreateFromStream(stream, stream.ContentType);
        try { player.Source = source; if (!_pauseRequested) player.Play(); await completed.Task; }
        finally { player.Pause(); player.Source = null; if (ReferenceEquals(_player, player)) _player = null; }
        }
        finally { if (ReferenceEquals(_active, active)) _active = null; }
    }
    public void Pause() { _pauseRequested = true; _player?.Pause(); }
    public void Resume() { _pauseRequested = false; _player?.Play(); }
    public void Stop() { _active?.Cancel(); _player?.Pause(); }
    public void OpenVoiceSettings() => Process.Start(new ProcessStartInfo("ms-settings:speech") { UseShellExecute = true });
    public void Dispose() => Stop();
}
