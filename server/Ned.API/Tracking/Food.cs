using System.ComponentModel;
using Ned.API.Sync;

namespace Ned.API.Tracking;

/// <summary>
/// A food the baby has tried. Phones derive the <c>Guid</c> from the lower-cased name, so both phones adding
/// "Mango" offline end up upserting the same row.
/// </summary>
[ApiEntity]
[NaturalKey(nameof(Name))]
public partial class Food : ISynced
{
    [Required]
    [Property<DataTypes.Text>("Name")]
    public partial string Name { get; set; }

    [Property<DataTypes.Enum>("Category")]
    [DefaultValue(FoodCategory.Other)]
    public partial FoodCategory Category { get; set; }

    [Property<DataTypes.DateTime>("Last used at")]
    public partial DateTimeOffset? LastUsedAt { get; set; }

    [Property<DataTypes.Integer>("Times used")]
    public partial int UseCount { get; set; }
}

public enum FoodCategory
{
    Fruit,
    Veggies,
    Protein,
    Grains,
    Other
}
