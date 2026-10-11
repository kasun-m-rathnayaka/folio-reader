
                    CREATE TABLE IF NOT EXISTS Books (
                        Id TEXT PRIMARY KEY NOT NULL,
                        Sha256 TEXT NOT NULL,
                        Title TEXT NOT NULL,
                        Author TEXT,
                        PageCount INTEGER NOT NULL,
                        FileSizeBytes INTEGER NOT NULL,
                        FilePath TEXT NOT NULL,
                        CoverPath TEXT,
                        Status INTEGER NOT NULL DEFAULT 0,
                        LastReadAt TEXT,
                        CreatedAt TEXT NOT NULL,
                        UpdatedAt TEXT NOT NULL
                    );

                    CREATE UNIQUE INDEX IF NOT EXISTS IX_Books_Sha256 ON Books (Sha256);
                    CREATE INDEX IF NOT EXISTS IX_Books_Title ON Books (Title);
                    CREATE INDEX IF NOT EXISTS IX_Books_Status ON Books (Status);
                    CREATE INDEX IF NOT EXISTS IX_Books_LastReadAt ON Books (LastReadAt);

                    CREATE TABLE IF NOT EXISTS ReadingPositions (
                        Id TEXT PRIMARY KEY NOT NULL,
                        BookId TEXT NOT NULL UNIQUE,
                        PageIndex INTEGER NOT NULL,
                        OffsetPercent REAL NOT NULL,
                        Zoom REAL NOT NULL DEFAULT 1.0,
                        ViewMode INTEGER NOT NULL DEFAULT 0,
                        ActiveReadingSeconds INTEGER NOT NULL DEFAULT 0,
                        CreatedAt TEXT NOT NULL,
                        UpdatedAt TEXT NOT NULL,
                        FOREIGN KEY (BookId) REFERENCES Books (Id) ON DELETE CASCADE
                    );

                    CREATE UNIQUE INDEX IF NOT EXISTS IX_ReadingPositions_BookId ON ReadingPositions (BookId);

                    CREATE TABLE IF NOT EXISTS Annotations (
                        Id TEXT PRIMARY KEY NOT NULL,
                        BookId TEXT NOT NULL,
                        PageIndex INTEGER NOT NULL,
                        Type INTEGER NOT NULL,
                        Color INTEGER NOT NULL,
                        RectsJson TEXT NOT NULL,
                        SelectedText TEXT,
                        Note TEXT,
                        CreatedAt TEXT NOT NULL,
                        UpdatedAt TEXT NOT NULL,
                        FOREIGN KEY (BookId) REFERENCES Books (Id) ON DELETE CASCADE
                    );

                    CREATE INDEX IF NOT EXISTS IX_Annotations_BookId_PageIndex ON Annotations (BookId, PageIndex);

                    CREATE TABLE IF NOT EXISTS Bookmarks (
                        Id TEXT PRIMARY KEY NOT NULL,
                        BookId TEXT NOT NULL,
                        PageIndex INTEGER NOT NULL,
                        Label TEXT,
                        Color INTEGER,
                        IsDogEar INTEGER NOT NULL DEFAULT 0,
                        CreatedAt TEXT NOT NULL,
                        UpdatedAt TEXT NOT NULL,
                        FOREIGN KEY (BookId) REFERENCES Books (Id) ON DELETE CASCADE
                    );

                    CREATE INDEX IF NOT EXISTS IX_Bookmarks_BookId_PageIndex ON Bookmarks (BookId, PageIndex);

                    CREATE TABLE IF NOT EXISTS Shelves (
                        Id TEXT PRIMARY KEY NOT NULL,
                        Name TEXT NOT NULL UNIQUE,
                        SortOrder INTEGER NOT NULL DEFAULT 0,
                        CreatedAt TEXT NOT NULL,
                        UpdatedAt TEXT NOT NULL
                    );

                    CREATE UNIQUE INDEX IF NOT EXISTS IX_Shelves_Name ON Shelves (Name);

                    CREATE TABLE IF NOT EXISTS Tags (
                        Id TEXT PRIMARY KEY NOT NULL,
                        Name TEXT NOT NULL UNIQUE,
                        ColorHex TEXT,
                        CreatedAt TEXT NOT NULL,
                        UpdatedAt TEXT NOT NULL
                    );

                    CREATE UNIQUE INDEX IF NOT EXISTS IX_Tags_Name ON Tags (Name);

                    CREATE TABLE IF NOT EXISTS BookShelves (
                        BookId TEXT NOT NULL,
                        ShelfId TEXT NOT NULL,
                        AddedAt TEXT NOT NULL,
                        PRIMARY KEY (BookId, ShelfId),
                        FOREIGN KEY (BookId) REFERENCES Books (Id) ON DELETE CASCADE,
                        FOREIGN KEY (ShelfId) REFERENCES Shelves (Id) ON DELETE CASCADE
                    );

                    CREATE TABLE IF NOT EXISTS BookTags (
                        BookId TEXT NOT NULL,
                        TagId TEXT NOT NULL,
                        AddedAt TEXT NOT NULL,
                        PRIMARY KEY (BookId, TagId),
                        FOREIGN KEY (BookId) REFERENCES Books (Id) ON DELETE CASCADE,
                        FOREIGN KEY (TagId) REFERENCES Tags (Id) ON DELETE CASCADE
                    );

                    CREATE TABLE IF NOT EXISTS Jobs (
                        Id TEXT PRIMARY KEY NOT NULL,
                        BookId TEXT,
                        Type INTEGER NOT NULL,
                        Status INTEGER NOT NULL DEFAULT 0,
                        Progress REAL NOT NULL DEFAULT 0.0,
                        Priority INTEGER NOT NULL DEFAULT 5,
                        ErrorMessage TEXT,
                        StartedAt TEXT,
                        CompletedAt TEXT,
                        CreatedAt TEXT NOT NULL,
                        UpdatedAt TEXT NOT NULL,
                        FOREIGN KEY (BookId) REFERENCES Books (Id) ON DELETE SET NULL
                    );

                    CREATE INDEX IF NOT EXISTS IX_Jobs_Status_Priority ON Jobs (Status, Priority);
                