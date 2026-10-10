using System;
using System.IO;
using System.Windows;

namespace Spike_ReaderHost;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        AppDomain.CurrentDomain.UnhandledException += (s, args) =>
        {
            File.WriteAllText("spike_crash.txt", args.ExceptionObject.ToString());
            Console.WriteLine($"[CRASH] {args.ExceptionObject}");
        };
    }
}

