using Folio.Application.Common.Interfaces;
using Folio.Infrastructure.Persistence;
using Folio.Infrastructure.Persistence.Migrations;
using Folio.Infrastructure.Persistence.Repositories;
using Folio.Infrastructure.Storage;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Folio.Infrastructure;

public static class DependencyInjection
{
    /// <summary>
    /// Shared services with a disk file store and a SQLite database file under the data root.
    /// Platform packages add the rasterizer, battery monitor and host-specific services.
    /// </summary>
    public static IServiceCollection AddFolioInfrastructure(
        this IServiceCollection services,
        Action<FileStoreOptions>? configureStorage = null)
    {
        var storageOptions = new FileStoreOptions();
        configureStorage?.Invoke(storageOptions);

        var fileStore = new FileStore(storageOptions);
        fileStore.EnsureDirectories();
        services.AddSingleton<IFileStore>(fileStore);

        string dbPath = Path.Combine(fileStore.DatabaseDirectory, "folio.db");
        var connectionStringBuilder = new SqliteConnectionStringBuilder
        {
            DataSource = dbPath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            ForeignKeys = true,
            DefaultTimeout = 5
        };

        services.AddSingleton<SqliteConnectionInterceptor>();
        services.AddDbContextFactory<FolioDbContext>((sp, options) =>
        {
            var interceptor = sp.GetRequiredService<SqliteConnectionInterceptor>();
            options.UseSqlite(connectionStringBuilder.ConnectionString)
                   .AddInterceptors(interceptor);
        });

        return services.AddFolioInfrastructureCore();
    }

    /// <summary>
    /// Repositories, library, search, text and job services. The caller registers <see cref="IFileStore"/> and an
    /// <see cref="IDbContextFactory{FolioDbContext}"/> for its SQLite provider.
    /// </summary>
    public static IServiceCollection AddFolioInfrastructureCore(this IServiceCollection services)
    {
        services.TryAddSingleton<IAppPreferencesService, AppPreferencesService>();
        services.AddSingleton<LibraryMaintenanceGate>();
        services.AddSingleton<Folio.Application.Books.ILibraryService, LibraryService>();

        services.AddScoped<IBookRepository, BookRepository>();
        services.AddScoped<IReadingPositionRepository, ReadingPositionRepository>();
        services.AddScoped<IBookmarkRepository, BookmarkRepository>();
        services.AddScoped<IAnnotationRepository, AnnotationRepository>();
        services.AddScoped<IJobRepository, JobRepository>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddScoped<IDatabaseMigrator, DatabaseMigrator>();
        services.TryAddSingleton<IDatabaseSetup, MigratingDatabaseSetup>();
        services.TryAddSingleton<IPdfTextExtractor, Folio.Infrastructure.Extraction.PdfPigTextExtractor>();
        services.AddSingleton<IDocumentTextService, Folio.Infrastructure.Extraction.DocumentTextService>();
        services.AddScoped<Folio.Application.Search.ISearchService, Folio.Infrastructure.Search.LibrarySearchService>();

        services.TryAddSingleton<IBatteryMonitor, UnknownBatteryMonitor>();
        services.AddSingleton<Folio.Infrastructure.Jobs.BackgroundJobQueue>();
        services.AddSingleton<IBackgroundJobQueue>(sp => sp.GetRequiredService<Folio.Infrastructure.Jobs.BackgroundJobQueue>());
        services.AddHostedService<Folio.Infrastructure.Jobs.BackgroundJobWorker>();

        return services;
    }
}
