using Folio.Domain.Audio;

namespace Folio.Application.Audio;

public interface IAudioPlaybackService : IAsyncDisposable
{
    bool IsPlaying { get; }
    bool IsPaused { get; }
    SentenceSpoken? CurrentSentence { get; }
    float Speed { get; }

    event Action<SentenceSpoken>? SentenceStarted;
    event Action? PlaybackEnded;
    event Action<bool>? PlaybackStateChanged;

    Task PlayAsync(IReadOnlyList<SentenceSpoken> sentences, int startIndex = 0);
    Task PauseAsync();
    Task ResumeAsync();
    Task StopAsync();
    Task NextAsync();
    Task PreviousAsync();
    Task SetSpeedAsync(float speed);
}
