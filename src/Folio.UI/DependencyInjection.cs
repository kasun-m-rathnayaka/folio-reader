using Folio.UI.Services;

namespace Microsoft.Extensions.DependencyInjection;

public static class FolioUIServiceCollectionExtensions
{
    public static IServiceCollection AddFolioUI(this IServiceCollection services)
    {
        services.AddScoped<ReaderJsBridge>();
        return services;
    }
}
