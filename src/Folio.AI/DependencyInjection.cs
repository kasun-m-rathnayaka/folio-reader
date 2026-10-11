using Folio.Application.AI;
using Microsoft.Extensions.DependencyInjection;

namespace Folio.AI;

public static class DependencyInjection
{
    public static IServiceCollection AddFolioAI(this IServiceCollection services)
    {
        services.AddSingleton<HttpClient>();
        services.AddSingleton<IResourceGovernor, ResourceGovernor>();
        services.AddSingleton<IModelManager, ModelManager>();
        services.AddSingleton<ILlamaServerProcessManager, LlamaServerProcessManager>();
        services.AddSingleton<ILocalAiService, LocalAiService>();
        return services;
    }
}
