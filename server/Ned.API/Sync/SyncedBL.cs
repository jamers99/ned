using Benevia.Core.Events.LogicBuilders;

namespace Ned.API.Sync;

[Logic]
public class SyncedBL(ISynced.Logic synced, IHttpContextAccessor http)
{
    [RegisterLogic]
    public void StampModifiedAt()
    {
        synced.OnPreSave().Do(record => record.ModifiedAt = DateTimeOffset.UtcNow);
    }

    /// <summary>
    /// Phones say who logged a row, except rows logged before signing in. A connected AI app may not say either.
    /// Those rows were logged by the parent whose token saves them.
    /// </summary>
    [RegisterLogic]
    public void DefaultLoggedByToTheSignedInParent()
    {
        synced.OnPreSave(record => record.LoggedBy).IfEmpty()
            .From(_ => http.HttpContext?.User.FindFirst("username")?.Value ?? string.Empty);
    }
}
