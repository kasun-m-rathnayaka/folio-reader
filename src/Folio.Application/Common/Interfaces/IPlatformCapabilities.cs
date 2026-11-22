namespace Folio.Application.Common.Interfaces;

/// <summary>
/// What the current host can do, so shared UI can hide actions a platform does not support.
/// </summary>
public interface IPlatformCapabilities
{
    /// <summary>True when running in a browser rather than the desktop shell.</summary>
    bool IsBrowser { get; }

    /// <summary>The user can pick a folder and import every PDF inside it.</summary>
    bool CanImportFolders { get; }

    /// <summary>A book whose PDF is missing can be re-linked to a file on disk.</summary>
    bool CanRelinkBooks { get; }

    /// <summary>PDF paths on the command line are imported at start-up.</summary>
    bool SupportsCommandLineImport { get; }

    /// <summary>The library can be exported to and restored from a backup archive.</summary>
    bool SupportsLibraryBackup { get; }
}

/// <summary>Capabilities of the Windows desktop host.</summary>
public sealed record DesktopPlatformCapabilities() : IPlatformCapabilities
{
    public bool IsBrowser => false;
    public bool CanImportFolders => true;
    public bool CanRelinkBooks => true;
    public bool SupportsCommandLineImport => true;
    public bool SupportsLibraryBackup => false;
}
