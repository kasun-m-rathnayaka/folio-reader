using Folio.Application;
using Folio.Platform.Browser;
using Folio.Web;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using MudBlazor.Services;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");
builder.Logging.AddFilter("Microsoft.EntityFrameworkCore", Microsoft.Extensions.Logging.LogLevel.Warning);
// EF Core warns that it cannot register its ef_* SQL helpers on SqliteWasmConnection; Folio's queries do not use them.
builder.Logging.AddFilter("Microsoft.EntityFrameworkCore.Infrastructure", Microsoft.Extensions.Logging.LogLevel.Error);

builder.Services.AddMudServices();
builder.Services.AddFolioBrowserPlatform(new Uri(builder.HostEnvironment.BaseAddress).AbsolutePath);
builder.Services.AddFolioApplication();
builder.Services.AddFolioUI();
builder.Services.AddSingleton<Folio.Application.Common.Interfaces.IExternalLinkService, BrowserExternalLinkService>();

await builder.Build().RunAsync();
