using Benevia.Core.Permissions;
using Kennedy.API.Tracking;

namespace Kennedy.API.Parents;

[Logic]
public class ParentsBL(IResponsibilityRegistry access)
{
    public const string TrackKennedy = "Track Kennedy";

    [RegisterLogic]
    public void DefineResponsibilities()
    {
        // ModifiedAt is writable here, but the PreSave stamp always overwrites what a phone sends.
        access.AddResponsibility(TrackKennedy, "Log and review Kennedy's sleep, feeds, solids, notes and growth.",
            grant =>
            {
                grant.Entity<Event>().CreateAndDelete().WriteForAllProperties();
                grant.Entity<Growth>().CreateAndDelete().WriteForAllProperties();
                grant.Entity<Food>().CreateAndDelete().WriteForAllProperties();
                grant.Entity<Settings>().CreateAndDelete().WriteForAllProperties();
            });
    }
}
