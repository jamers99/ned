namespace Ned.API.Families;

/// <summary>
/// A parent's place in a family. The <c>Guid</c> is the user's id, so a signed-in parent's family is one lookup.
/// </summary>
[ApiEntity]
public partial class Member
{
    [Required]
    [ReferenceProperty("Family", DeleteAction.Cascade)]
    [OppositeSideCollection("Members", "Members", CollectionLoadMode.LoadAll)]
    public virtual partial Family? Family { get; set; }
}
