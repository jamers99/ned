using Benevia.Core.Events.LogicBuilders;
using Ned.API.Sync;
using Ned.API.Tracking;

namespace Ned.API.Families;

/// <summary>
/// Every record belongs to the family of the parent who first saved it, and only that family can change it.
/// Reads are kept to the family by the row filters in <see cref="Parents.ParentsBL"/>.
/// </summary>
[Logic]
public class FamiliesBL(
    ISynced.Logic synced, Event.Logic events, Growth.Logic growth, Food.Logic foods, Settings.Logic settings,
    IHttpContextAccessor http)
{
    const string UserIdClaim = "userId";

    [RegisterLogic]
    public void StampTheFamily()
    {
        // On creation rather than save, so the row filters find a row a connected app has staged but not saved.
        // Added doesn't reach an interface's logic, so each entity registers it.
        events.OnAdded().Do(StampTheFamily);
        growth.OnAdded().Do(StampTheFamily);
        foods.OnAdded().Do(StampTheFamily);
        settings.OnAdded().Do(StampTheFamily);

        synced.ReadOnly(record => record.Family).If(record => record.Family is not null);
    }

    /// <summary>
    /// Guids are global, so a phone could name another family's row (or claim another family for a new one).
    /// </summary>
    [RegisterLogic]
    public void KeepOtherFamiliesOut()
    {
        synced.ValidateOnSave()
            .RejectIf((record, args) => http.HttpContext is not null
                && (SignedInMember(http, args.GetEntity<Member>) is not { } member
                    || record.Family is null || record.Family.Guid != member.Family?.Guid))
            .WithMessage("This record belongs to another family.");
    }

    void StampTheFamily<T>(T record, Benevia.Core.Events.Events.Args.AddedEventArgs<T> args) where T : ISynced
    {
        if (record.Family is null && SignedInMember(http, args.GetEntity<Member>) is { } member)
            record.Family = member.Family;
    }

    /// <summary>
    /// The signed-in parent's membership, or null when nobody is signed in.
    /// </summary>
    static Member? SignedInMember(IHttpContextAccessor http, Func<Guid, Member?> getMember) =>
        Guid.TryParse(http.HttpContext?.User.FindFirst(UserIdClaim)?.Value, out var userId) ? getMember(userId) : null;
}
