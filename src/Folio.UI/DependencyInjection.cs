using Folio.UI.Services;
using Microsoft.Extensions.DependencyInjection;

namespace Folio.UI;

public static class DependencyInjection
{
    public static IServiceCollection AddFolioUI(this IServiceCollection services)
    {
        services.AddScoped<ReaderJsBridge>();
        return services;
    }
}
