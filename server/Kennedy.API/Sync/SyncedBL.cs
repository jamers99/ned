using Benevia.Core.Events.LogicBuilders;

namespace Kennedy.API.Sync;

[Logic]
public class SyncedBL(ISynced.Logic synced)
{
    [RegisterLogic]
    public void StampModifiedAt()
    {
        synced.OnPreSave().Do(record => record.ModifiedAt = DateTimeOffset.UtcNow);
    }
}
