using Folio.Application;
using Folio.AI;
using Folio.Application.Common.Interfaces;
using Folio.Application.Reading;
using Folio.Domain.Entities;
using Folio.Domain.Enums;
using Folio.Infrastructure.Persistence.Migrations;
using Microsoft.Extensions.DependencyInjection;

namespace Folio.Infrastructure.Tests;

public class CompositionTests
{
    [Fact]
    public async Task RealServiceComposition_CanSaveAnImportedPositionFromANewScope()
    {
        var root = Path.Combine(Path.GetTempPath(),"FolioComposition_"+Guid.NewGuid().ToString("N"));
        try
        {
            var services=new ServiceCollection(); services.AddLogging();
            services.AddFolioInfrastructure(o=>o.RootDirectory=root); services.AddFolioApplication(); services.AddFolioAI();
            await using var provider=services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes=true, ValidateOnBuild=true });
            var book=new Book { Sha256=new string('d',64), Title="Composed library", FilePath="fixture.pdf", PageCount=300,
                ReadingPosition=new() { PageIndex=0, Zoom=1 } };
            await using(var scope=provider.CreateAsyncScope())
            {
                await scope.ServiceProvider.GetRequiredService<IDatabaseMigrator>().MigrateAsync();
                await scope.ServiceProvider.GetRequiredService<IBookRepository>().AddAsync(book);
                await scope.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync();
            }
            await using(var scope=provider.CreateAsyncScope())
            {
                var reading=scope.ServiceProvider.GetRequiredService<IReadingPositionService>();
                await reading.SavePositionAsync(book.Id,42,.3,-2,ReaderViewMode.Continuous,5);
                Assert.Equal(42,(await reading.GetPositionAsync(book.Id))!.PageIndex);
            }
        }
        finally { Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); if(Directory.Exists(root)) Directory.Delete(root,true); }
    }
}
