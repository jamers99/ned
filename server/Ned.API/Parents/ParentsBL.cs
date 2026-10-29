using Benevia.Core.Permissions;
using Benevia.Core.Permissions.Api;
using Ned.API.Families;
using Ned.API.Sync;
using Ned.API.Tracking;

namespace Ned.API.Parents;

[Logic]
public class ParentsBL(IResponsibilityRegistry access)
{
    public const string TrackBaby = "Track the baby";

    [RegisterLogic]
    public void DefineResponsibilities()
    {
        // ModifiedAt and Family are writable here, but the server stamps them (FamiliesBL, SyncedBL).
        // No deletes: rows are deleted softly, so the other phone hears about it.
        access.AddResponsibility(TrackBaby, "Log and review the baby's sleep, feeds, solids, notes and growth.",
            grant =>
            {
                OwnFamilyOnly(grant.Entity<Event>().Create().WriteForAllProperties());
                OwnFamilyOnly(grant.Entity<Growth>().Create().WriteForAllProperties());
                OwnFamilyOnly(grant.Entity<Food>().Create().WriteForAllProperties());
                OwnFamilyOnly(grant.Entity<Settings>().Create().WriteForAllProperties());
                // Writing Family lets a parent see families; see only their own, for its invite code.
                grant.Entity<Family>().View().ReadForAllProperties()
                    .FilterRows((query, user) => query.Where(f => f.Members.Any(m => m.Guid == user.Id)));
                grant.Entity<Member>().View().ReadForAllProperties()
                    .FilterRows((query, user) => query.Where(m => m.Family!.Members.Any(other => other.Guid == user.Id)));
            });
    }

    static void OwnFamilyOnly<T>(EntityPermissionBuilder<T> entity) where T : ISynced =>
        entity.FilterRows((query, user) => query.Where(r => r.Family != null && r.Family.Members.Any(m => m.Guid == user.Id)));
}
