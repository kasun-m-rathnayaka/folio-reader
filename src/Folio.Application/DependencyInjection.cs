using Folio.Application.Books;
using Microsoft.Extensions.DependencyInjection;

namespace Folio.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddFolioApplication(this IServiceCollection services)
    {
        services.AddScoped<IBookImportService, BookImportService>();
        services.AddSingleton<ImportInbox>();
        services.AddScoped<Folio.Application.Reading.IReadingPositionService, Folio.Application.Reading.ReadingPositionService>();
        services.AddScoped<Folio.Application.Annotations.IBookmarkService, Folio.Application.Annotations.BookmarkService>();
        services.AddScoped<Folio.Application.Annotations.IAnnotationService, Folio.Application.Annotations.AnnotationService>();
        return services;
    }
}

