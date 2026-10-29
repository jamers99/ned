using Benevia.Core.Events;
using Benevia.Core.Postgres;

[assembly: BusinessLogicAssembly]
// Lets Core's database upgrade find data upgrade subscribers ([PropertyAdded] and the like), when there are any.
[assembly: DataMigrationAssembly]
