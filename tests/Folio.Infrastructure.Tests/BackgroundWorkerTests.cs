using Folio.Application.Common.Interfaces;
using Folio.Domain.Entities;
using Folio.Domain.Enums;
using Folio.Domain.Geometry;
using Folio.Infrastructure.Jobs;
using Folio.Infrastructure.Persistence;
using Folio.Infrastructure.Persistence.Migrations;
using Folio.Infrastructure.Persistence.Repositories;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace Folio.Infrastructure.Tests;

public class BackgroundWorkerTests
{
    private sealed class PollCount { public int Value; }
    private sealed class CountedJobs(IJobRepository inner, PollCount count) : IJobRepository
    {
        public Task<Job?> GetNextPendingJobAsync(CancellationToken ct=default) { Interlocked.Increment(ref count.Value);return inner.GetNextPendingJobAsync(ct); }
        public Task<IReadOnlyList<Job>> GetActiveJobsAsync(CancellationToken ct=default)=>inner.GetActiveJobsAsync(ct);
        public Task AddAsync(Job job,CancellationToken ct=default)=>inner.AddAsync(job,ct);
        public void Update(Job job)=>inner.Update(job);
    }
    private sealed class Power : IBatteryMonitor { public bool IsRunningOnBattery=>false; public int? BatteryPercent=>100; }
    private sealed class Text : IPdfTextExtractor
    {
        public Task<ExtractedMetadata> ExtractMetadataAsync(string path,CancellationToken ct=default)=>Task.FromResult(new ExtractedMetadata("Fixture",null,1,null));
        public Task<ExtractedPage> ExtractPageAsync(string path,int page,CancellationToken ct=default)=>Task.FromResult(new ExtractedPage(page,new(612,792),[],"verified text"));
        public async Task<IReadOnlyList<ExtractedPage>> ExtractAllPagesAsync(string path,IProgress<double>? progress=null,CancellationToken ct=default)=>[await ExtractPageAsync(path,0,ct)];
    }
    [Fact]
    public async Task CompletedJob_ProducesACacheAndReturnsToIdleInsteadOfSpinningOnItsSignal()
    {
        var root=Path.Combine(Path.GetTempPath(),"FolioWorker_"+Guid.NewGuid().ToString("N"));
        try
        {
            var services=new ServiceCollection(); services.AddLogging(); services.AddFolioInfrastructure(o=>o.RootDirectory=root);
            var count=new PollCount();
            services.AddScoped<IJobRepository>(sp=>new CountedJobs(new JobRepository(sp.GetRequiredService<FolioDbContext>()),count));
            await using var provider=services.BuildServiceProvider();
            var files=provider.GetRequiredService<IFileStore>();
            var book=new Book { Title="Worker fixture",Sha256=new string('c',64),FilePath=Path.Combine(root,"source.pdf"),PageCount=1 };
            await File.WriteAllTextAsync(book.FilePath,"test fixture");
            await using(var scope=provider.CreateAsyncScope())
            {
                await scope.ServiceProvider.GetRequiredService<IDatabaseMigrator>().MigrateAsync();
                await scope.ServiceProvider.GetRequiredService<IBookRepository>().AddAsync(book);
                await scope.ServiceProvider.GetRequiredService<IUnitOfWork>().SaveChangesAsync();
            }
            var queue=provider.GetRequiredService<BackgroundJobQueue>();
            var completed=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            queue.JobUpdated+=job=>{if(job.Status==JobStatus.Completed)completed.TrySetResult();};
            using var worker=new BackgroundJobWorker(provider.GetRequiredService<IServiceScopeFactory>(),queue,new Power(),new Text(),files,NullLogger<BackgroundJobWorker>.Instance);
            await worker.StartAsync(CancellationToken.None);
            try
            {
                await queue.EnqueueAsync(book.Id,JobType.ExtractText);
                await completed.Task.WaitAsync(TimeSpan.FromSeconds(5));
                await Task.Delay(250);
                var before=Volatile.Read(ref count.Value);await Task.Delay(250);
                Assert.InRange(Volatile.Read(ref count.Value)-before,0,2);
                Assert.Contains("verified text",await File.ReadAllTextAsync(Path.Combine(files.CacheDirectory,"text",$"{book.Sha256}.v1.json")));
            }
            finally { await worker.StopAsync(CancellationToken.None); }
        }
        finally { Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();if(Directory.Exists(root))Directory.Delete(root,true); }
    }
}
