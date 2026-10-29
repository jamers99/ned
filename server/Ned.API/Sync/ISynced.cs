using Ned.API.Families;

namespace Ned.API.Sync;

/// <summary>
/// A record that every phone in a family keeps a copy of. Phones generate the <c>Guid</c>, write locally first, and push
/// upserts later; the server is a store that stamps <see cref="ModifiedAt"/> so phones can pull changes.
/// </summary>
public partial interface ISynced
{
    /// <summary>
    /// When the server last saved this record. Stamped on every save; phones pull rows modified since a cursor.
    /// </summary>
    [Property<DataTypes.DateTime>("Modified at",
        Description = "When the server last saved this record.")]
    DateTimeOffset ModifiedAt { get; set; }

    /// <summary>
    /// Soft delete flag. Deletes must reach the other phone through the pull, so rows are never removed.
    /// Named <c>Deleted</c> because the generated entity state already has an <c>IsDeleted</c> member.
    /// </summary>
    [Property<DataTypes.Boolean>("Deleted")]
    bool Deleted { get; set; }

    /// <summary>
    /// The parent who logged the record, for example "John".
    /// </summary>
    [Property<DataTypes.Text>("Logged by")]
    string LoggedBy { get; set; }

    /// <summary>
    /// Whose record this is. The server stamps it from the signed-in parent; phones never send it.
    /// </summary>
    [ReferenceProperty("Family", DeleteAction.Restrict)]
    Family? Family { get; set; }
}
