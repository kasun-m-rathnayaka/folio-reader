using Folio.UI.Services;

namespace Microsoft.Extensions.DependencyInjection;

public static class FolioUIServiceCollectionExtensions
{
    public static IServiceCollection AddFolioUI(this IServiceCollection services)
    {
        services.AddScoped<ReaderJsBridge>();
        services.AddScoped<NotificationService>();
        services.AddSingleton<Folio.Application.Common.Interfaces.IReadingSessionLifetime, ReadingSessionLifetime>();
        return services;
    }
}
