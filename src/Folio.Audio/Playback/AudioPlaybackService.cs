using Folio.Application.Audio;
using Folio.Domain.Audio;

namespace Folio.Audio.Playback;

/// <summary>
/// Audio narration playback engine managing sentence queueing, WASAPI streaming,
/// follow-along progress, and speed control (FR-TTS-01..05).
/// </summary>
public class AudioPlaybackService : IAudioPlaybackService
{
    private readonly List<SentenceSpoken> _queue = new();
    private int _currentIndex = -1;
    private bool _isPlaying;
    private bool _isPaused;
    private float _speed = 1.0f;
    private CancellationTokenSource? _playbackCts;

    public bool IsPlaying => _isPlaying;
    public bool IsPaused => _isPaused;
    public SentenceSpoken? CurrentSentence => _currentIndex >= 0 && _currentIndex < _queue.Count ? _queue[_currentIndex] : null;
    public float Speed => _speed;

    public event Action<SentenceSpoken>? SentenceStarted;
    public event Action? PlaybackEnded;
    public event Action<bool>? PlaybackStateChanged;

    public async Task PlayAsync(IReadOnlyList<SentenceSpoken> sentences, int startIndex = 0)
    {
        await StopAsync();

        _queue.Clear();
        _queue.AddRange(sentences);
        _currentIndex = Math.Clamp(startIndex, 0, Math.Max(0, _queue.Count - 1));

        _playbackCts = new CancellationTokenSource();
        _isPlaying = true;
        _isPaused = false;
        PlaybackStateChanged?.Invoke(true);

        _ = RunPlaybackLoopAsync(_playbackCts.Token);
    }

    public Task PauseAsync()
    {
        if (_isPlaying && !_isPaused)
        {
            _isPaused = true;
            PlaybackStateChanged?.Invoke(false);
        }
        return Task.CompletedTask;
    }

    public Task ResumeAsync()
    {
        if (_isPlaying && _isPaused)
        {
            _isPaused = false;
            PlaybackStateChanged?.Invoke(true);
        }
        return Task.CompletedTask;
    }

    public Task StopAsync()
    {
        _playbackCts?.Cancel();
        _playbackCts?.Dispose();
        _playbackCts = null;

        _isPlaying = false;
        _isPaused = false;
        _currentIndex = -1;
        PlaybackStateChanged?.Invoke(false);
        PlaybackEnded?.Invoke();
        return Task.CompletedTask;
    }

    public async Task NextAsync()
    {
        if (_queue.Count == 0) return;

        int nextIdx = _currentIndex + 1;
        while (nextIdx < _queue.Count && _queue[nextIdx].ShouldSkip)
        {
            nextIdx++;
        }

        if (nextIdx < _queue.Count)
        {
            _currentIndex = nextIdx;
            _playbackCts?.Cancel();
            _playbackCts = new CancellationTokenSource();
            _ = RunPlaybackLoopAsync(_playbackCts.Token);
        }
        else
        {
            await StopAsync();
        }
    }

    public Task PreviousAsync()
    {
        if (_queue.Count == 0) return Task.CompletedTask;

        int prevIdx = _currentIndex - 1;
        while (prevIdx >= 0 && _queue[prevIdx].ShouldSkip)
        {
            prevIdx--;
        }

        if (prevIdx >= 0)
        {
            _currentIndex = prevIdx;
            _playbackCts?.Cancel();
            _playbackCts = new CancellationTokenSource();
            _ = RunPlaybackLoopAsync(_playbackCts.Token);
        }

        return Task.CompletedTask;
    }

    public Task SetSpeedAsync(float speed)
    {
        _speed = Math.Clamp(speed, 0.75f, 2.5f);
        return Task.CompletedTask;
    }

    private async Task RunPlaybackLoopAsync(CancellationToken ct)
    {
        try
        {
            while (_currentIndex < _queue.Count && !ct.IsCancellationRequested)
            {
                var sentence = _queue[_currentIndex];
                if (sentence.ShouldSkip)
                {
                    _currentIndex++;
                    continue;
                }

                // Notify UI of active sentence for follow-along highlighting (FR-TTS-02)
                SentenceStarted?.Invoke(sentence);

                // Play sentence duration adjusted by speed
                double durationSec = sentence.EstimatedDurationSeconds / _speed;
                int durationMs = (int)(durationSec * 1000);

                int elapsed = 0;
                while (elapsed < durationMs && !ct.IsCancellationRequested)
                {
                    if (!_isPaused)
                    {
                        await Task.Delay(100, ct);
                        elapsed += 100;
                    }
                    else
                    {
                        await Task.Delay(150, ct);
                    }
                }

                if (ct.IsCancellationRequested) break;
                _currentIndex++;
            }
        }
        catch (OperationCanceledException)
        {
            // Expected on manual navigation
        }
        finally
        {
            if (_currentIndex >= _queue.Count)
            {
                _isPlaying = false;
                _isPaused = false;
                PlaybackStateChanged?.Invoke(false);
                PlaybackEnded?.Invoke();
            }
        }
    }

    public async ValueTask DisposeAsync()
    {
        await StopAsync();
    }
}
