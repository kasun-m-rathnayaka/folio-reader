using Folio.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Folio.Infrastructure.Persistence;

/// <summary>
/// Entity Framework Core database context for Folio's local SQLite store.
/// </summary>
public class FolioDbContext : DbContext
{
    public FolioDbContext(DbContextOptions<FolioDbContext> options) : base(options)
    {
    }

    public DbSet<Book> Books => Set<Book>();
    public DbSet<ReadingPosition> ReadingPositions => Set<ReadingPosition>();
    public DbSet<Annotation> Annotations => Set<Annotation>();
    public DbSet<Bookmark> Bookmarks => Set<Bookmark>();
    public DbSet<Shelf> Shelves => Set<Shelf>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<BookShelf> BookShelves => Set<BookShelf>();
    public DbSet<BookTag> BookTags => Set<BookTag>();
    public DbSet<Job> Jobs => Set<Job>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        base.ConfigureConventions(configurationBuilder);
        configurationBuilder.Properties<DateTimeOffset>().HaveConversion<Microsoft.EntityFrameworkCore.Storage.ValueConversion.DateTimeOffsetToBinaryConverter>();
        configurationBuilder.Properties<DateTimeOffset?>().HaveConversion<Microsoft.EntityFrameworkCore.Storage.ValueConversion.DateTimeOffsetToBinaryConverter>();
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Book
        modelBuilder.Entity<Book>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Sha256).HasMaxLength(64).IsRequired();
            entity.HasIndex(e => e.Sha256).IsUnique();

            entity.Property(e => e.Title).HasMaxLength(500).IsRequired();
            entity.HasIndex(e => e.Title);

            entity.Property(e => e.Author).HasMaxLength(250);
            entity.Property(e => e.FilePath).HasMaxLength(1000).IsRequired();
            entity.Property(e => e.CoverPath).HasMaxLength(1000);

            entity.Property(e => e.Status).HasConversion<int>();
            entity.HasIndex(e => e.Status);
            entity.HasIndex(e => e.LastReadAt);
        });

        // ReadingPosition (1:1 with Book)
        modelBuilder.Entity<ReadingPosition>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.BookId).IsUnique();
            entity.Property(e => e.ViewMode).HasConversion<int>();

            entity.HasOne(e => e.Book)
                  .WithOne(b => b.ReadingPosition)
                  .HasForeignKey<ReadingPosition>(e => e.BookId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // Annotation
        modelBuilder.Entity<Annotation>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Type).HasConversion<int>();
            entity.Property(e => e.Color).HasConversion<int>();
            entity.Property(e => e.RectsJson).IsRequired();

            entity.HasIndex(e => new { e.BookId, e.PageIndex });

            entity.HasOne(e => e.Book)
                  .WithMany(b => b.Annotations)
                  .HasForeignKey(e => e.BookId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // Bookmark
        modelBuilder.Entity<Bookmark>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Label).HasMaxLength(200);
            entity.Property(e => e.Color).HasConversion<int>();

            entity.HasIndex(e => new { e.BookId, e.PageIndex });

            entity.HasOne(e => e.Book)
                  .WithMany(b => b.Bookmarks)
                  .HasForeignKey(e => e.BookId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // Shelf
        modelBuilder.Entity<Shelf>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).HasMaxLength(100).IsRequired();
            entity.HasIndex(e => e.Name).IsUnique();
        });

        // Tag
        modelBuilder.Entity<Tag>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Name).HasMaxLength(100).IsRequired();
            entity.HasIndex(e => e.Name).IsUnique();
            entity.Property(e => e.ColorHex).HasMaxLength(10);
        });

        // BookShelf (many-to-many join)
        modelBuilder.Entity<BookShelf>(entity =>
        {
            entity.HasKey(e => new { e.BookId, e.ShelfId });

            entity.HasOne(e => e.Book)
                  .WithMany(b => b.BookShelves)
                  .HasForeignKey(e => e.BookId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Shelf)
                  .WithMany(s => s.BookShelves)
                  .HasForeignKey(e => e.ShelfId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // BookTag (many-to-many join)
        modelBuilder.Entity<BookTag>(entity =>
        {
            entity.HasKey(e => new { e.BookId, e.TagId });

            entity.HasOne(e => e.Book)
                  .WithMany(b => b.BookTags)
                  .HasForeignKey(e => e.BookId)
                  .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(e => e.Tag)
                  .WithMany(t => t.BookTags)
                  .HasForeignKey(e => e.TagId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // Job
        modelBuilder.Entity<Job>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.Property(e => e.Type).HasConversion<int>();
            entity.Property(e => e.Status).HasConversion<int>();

            entity.HasIndex(e => new { e.Status, e.Priority });

            entity.HasOne(e => e.Book)
                  .WithMany()
                  .HasForeignKey(e => e.BookId)
                  .OnDelete(DeleteBehavior.SetNull);
        });
    }
}
