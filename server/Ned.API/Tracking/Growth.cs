using Benevia.Core.Events.DataTypes.Attributes;
using Ned.API.Sync;

namespace Ned.API.Tracking;

[ApiEntity]
public partial class Growth : ISynced
{
    [Required]
    [Property<DataTypes.DateTime>("Measured at")]
    public partial DateTimeOffset MeasuredAt { get; set; }

    [Property<Measurement>("Weight (kg)")]
    public partial decimal? WeightKg { get; set; }

    [Property<Measurement>("Length (cm)")]
    public partial decimal? LengthCm { get; set; }

    [Property<Measurement>("Head (cm)")]
    public partial decimal? HeadCm { get; set; }
}

/// <summary>
/// A body measurement stored to three decimals, so converting from lb/oz and inches keeps its precision.
/// </summary>
[DataType<decimal>]
[DecimalPrecision(3, 2)]
public partial class Measurement : DataTypes.Decimal
{
}
