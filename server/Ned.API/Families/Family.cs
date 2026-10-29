namespace Ned.API.Families;

/// <summary>
/// The parents who look after one baby, and everything they log. Each sign-up starts a family or joins one
/// with its invite code. The <c>Guid</c> also seeds the Guids of the family's Settings row and foods.
/// </summary>
[ApiEntity]
[NaturalKey(nameof(InviteCode))]
public partial class Family
{
    /// <summary>
    /// What a second parent enters when signing up, to share this family's data.
    /// </summary>
    [Required]
    [Property<DataTypes.Text>("Invite code")]
    public partial string InviteCode { get; set; }
}
