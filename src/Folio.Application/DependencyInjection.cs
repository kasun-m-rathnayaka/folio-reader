using Folio.Application.Books;
using Microsoft.Extensions.DependencyInjection;

namespace Folio.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddFolioApplication(this IServiceCollection services)
    {
        services.AddScoped<IBookImportService, BookImportService>();
        services.AddScoped<Folio.Application.Reading.IReadingPositionService, Folio.Application.Reading.ReadingPositionService>();
        return services;
    }
}

