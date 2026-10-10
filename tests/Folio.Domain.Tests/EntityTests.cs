using Folio.Domain.Entities;

namespace Folio.Domain.Tests;

public class EntityTests
{
    [Fact]
    public void BaseEntity_GeneratesSequentialGuidV7()
    {
        var book1 = new Book { Title = "Book 1", Sha256 = "hash1" };
        Thread.Sleep(2); // Small delay to advance timestamp
        var book2 = new Book { Title = "Book 2", Sha256 = "hash2" };

        Assert.NotEqual(Guid.Empty, book1.Id);
        Assert.NotEqual(Guid.Empty, book2.Id);
        Assert.NotEqual(book1.Id, book2.Id);

        // Guid v7 comparison: chronological ordering matches CompareTo
        int comparison = book1.Id.CompareTo(book2.Id);
        Assert.True(comparison <= 0, "Guid v7 primary keys must be chronologically ordered.");
    }

    [Fact]
    public void Book_InitializesWithDefaultValues()
    {
        var book = new Book();

        Assert.Equal(Folio.Domain.Enums.ReadingStatus.WantToRead, book.Status);
        Assert.Empty(book.Annotations);
        Assert.Empty(book.Bookmarks);
        Assert.Empty(book.BookShelves);
        Assert.Empty(book.BookTags);
    }
}

