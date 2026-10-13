using Benevia.Core.Events;
using Benevia.Core.Postgres;

[assembly: BusinessLogicAssembly]
// Lets Core's database upgrade find the data upgrade subscribers, such as SettingsUpgrade.
[assembly: DataMigrationAssembly]
