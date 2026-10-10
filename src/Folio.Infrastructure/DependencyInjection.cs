using Folio.Application.Common.Interfaces;
using Folio.Infrastructure.Persistence;
using Folio.Infrastructure.Persistence.Migrations;
using Folio.Infrastructure.Persistence.Repositories;
using Folio.Infrastructure.Storage;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Folio.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddFolioInfrastructure(
        this IServiceCollection services,
        Action<FileStoreOptions>? configureStorage = null)
    {
        var storageOptions = new FileStoreOptions();
        configureStorage?.Invoke(storageOptions);

        var fileStore = new FileStore(storageOptions);
        fileStore.EnsureDirectories();

        services.AddSingleton<IFileStore>(fileStore);
        services.AddSingleton<SqliteConnectionInterceptor>();

        string dbPath = Path.Combine(fileStore.DatabaseDirectory, "folio.db");
        var connectionStringBuilder = new SqliteConnectionStringBuilder
        {
            DataSource = dbPath,
            Mode = SqliteOpenMode.ReadWriteCreate,
            ForeignKeys = true,
            DefaultTimeout = 5
        };

        services.AddDbContext<FolioDbContext>((sp, options) =>
        {
            var interceptor = sp.GetRequiredService<SqliteConnectionInterceptor>();
            options.UseSqlite(connectionStringBuilder.ConnectionString)
                   .AddInterceptors(interceptor);
        });

        services.AddScoped<IBookRepository, BookRepository>();
        services.AddScoped<IReadingPositionRepository, ReadingPositionRepository>();
        services.AddScoped<IJobRepository, JobRepository>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddScoped<IDatabaseMigrator, DatabaseMigrator>();
        services.AddSingleton<IPdfTextExtractor, Folio.Infrastructure.Extraction.PdfPigTextExtractor>();
        services.AddSingleton<IPdfRasterizer, Folio.Infrastructure.Rasterization.WinRtPdfRasterizer>();

        services.AddSingleton<IBatteryMonitor, Folio.Infrastructure.Jobs.WindowsBatteryMonitor>();
        services.AddSingleton<Folio.Infrastructure.Jobs.BackgroundJobQueue>();
        services.AddSingleton<IBackgroundJobQueue>(sp => sp.GetRequiredService<Folio.Infrastructure.Jobs.BackgroundJobQueue>());
        services.AddHostedService<Folio.Infrastructure.Jobs.BackgroundJobWorker>();

        return services;
    }
}

