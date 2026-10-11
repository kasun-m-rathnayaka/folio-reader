using Folio.Application.Common.Interfaces;
using Folio.Application.Study;
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
        services.AddScoped<IBookmarkRepository, BookmarkRepository>();
        services.AddScoped<IAnnotationRepository, AnnotationRepository>();
        services.AddScoped<IJobRepository, JobRepository>();
        services.AddScoped<IStudyRepository, StudyRepository>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddScoped<IDatabaseMigrator, DatabaseMigrator>();
        services.AddSingleton<IPdfTextExtractor, Folio.Infrastructure.Extraction.PdfPigTextExtractor>();
        services.AddSingleton<IPdfRasterizer, Folio.Infrastructure.Rasterization.WinRtPdfRasterizer>();
        services.AddSingleton<Folio.Application.OCR.IOcrService, Folio.Infrastructure.OCR.WindowsOcrService>();
        services.AddSingleton<Folio.Application.Reflow.IReflowService, Folio.Infrastructure.Reflow.ReflowService>();
        services.AddScoped<Folio.Application.Search.ISearchService, Folio.Infrastructure.Search.LibrarySearchService>();
        services.AddScoped<Folio.Application.Backup.IBackupService, Folio.Infrastructure.Backup.BackupService>();

        services.AddSingleton<IBatteryMonitor, Folio.Infrastructure.Jobs.WindowsBatteryMonitor>();
        services.AddSingleton<Folio.Infrastructure.Jobs.BackgroundJobQueue>();
        services.AddSingleton<IBackgroundJobQueue>(sp => sp.GetRequiredService<Folio.Infrastructure.Jobs.BackgroundJobQueue>());
        services.AddHostedService<Folio.Infrastructure.Jobs.BackgroundJobWorker>();

        return services;
    }
}

