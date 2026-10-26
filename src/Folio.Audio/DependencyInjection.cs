using Folio.Application.Audio;
using Folio.Audio.Playback;
using Microsoft.Extensions.DependencyInjection;

namespace Folio.Audio;

public static class DependencyInjection
{
    public static IServiceCollection AddFolioAudio(this IServiceCollection services)
    {
        services.AddSingleton<ITextNormalizer, TextNormalizer>();
        services.AddSingleton<ILayoutBlockClassifier, LayoutBlockClassifier>();
        services.AddSingleton<ISentenceSegmenter, SentenceSegmenter>();
        services.AddSingleton<IAudioPlaybackService, AudioPlaybackService>();
        services.AddTransient<INarrationService, WindowsNarrationService>();
        return services;
    }
}
