using Folio.Application.Books;
using Microsoft.Extensions.DependencyInjection;

namespace Folio.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddFolioApplication(this IServiceCollection services)
    {
        services.AddScoped<IBookImportService, BookImportService>();
        return services;
    }
}
