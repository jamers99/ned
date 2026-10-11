using System.ComponentModel;
using Kennedy.API.Sync;

namespace Kennedy.API.Tracking;

/// <summary>
/// Sleep targets shared by both phones. There is one row, with a fixed <c>Guid</c> that both phones use.
/// </summary>
[ApiEntity]
public partial class Settings : ISynced
{
    [Property<DataTypes.Integer>("Naps per day")]
    [DefaultValue(2)]
    public partial int NapsPerDay { get; set; }

    [Property<DataTypes.Integer>("Wake window before nap 1 (minutes)")]
    [DefaultValue(150)]
    public partial int Nap1WakeWindowMinutes { get; set; }

    [Property<DataTypes.Integer>("Wake window before later naps (minutes)")]
    [DefaultValue(165)]
    public partial int Nap2WakeWindowMinutes { get; set; }

    [Property<DataTypes.Integer>("Wake window before bed (minutes)")]
    [DefaultValue(210)]
    public partial int BedtimeWakeWindowMinutes { get; set; }

    [Property<DataTypes.Integer>("Earliest bedtime (minutes after midnight)")]
    [DefaultValue(18 * 60 + 30)]
    public partial int BedtimeEarliestMinutes { get; set; }

    [Property<DataTypes.Integer>("Latest bedtime (minutes after midnight)")]
    [DefaultValue(19 * 60 + 30)]
    public partial int BedtimeLatestMinutes { get; set; }
}
