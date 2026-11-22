namespace Folio.Application.Common.Interfaces;

/// <summary>Motion setting (SET-1). <see cref="System"/> follows the operating system's reduced-motion preference.</summary>
public enum MotionPreference { System, Full, Reduced, Off }

/// <summary>Library presentation (SET-2). 3D falls back to 2D automatically when the device cannot draw it.</summary>
public enum LibraryStyle { ThreeD, TwoD }

/// <summary>How a book is read (SPEC-V2): as an open 3D book you turn page by page, or on flat pages (the Zoom reader).</summary>
public enum ReadingView { Book3D, Flat }

/// <summary>3D rendering quality (SET-3).</summary>
public enum StageQuality { Auto, High, Low }

public record AppPreferences(bool DarkMode = true, bool GridView = true, bool SidebarCollapsed = false,
    double FontScale = 1, MotionPreference Motion = MotionPreference.System, LibraryStyle LibraryStyle = LibraryStyle.ThreeD,
    StageQuality Quality = StageQuality.Auto, DateTimeOffset? BackupReminderAt = null, ReadingView ReadingView = ReadingView.Book3D);

public interface IAppPreferencesService
{
    AppPreferences Current { get; }
    void Save(AppPreferences preferences);
}
