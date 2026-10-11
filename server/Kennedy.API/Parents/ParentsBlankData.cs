using Benevia.Core.API.Communications.Authentication.Models;
using Benevia.Core.API.Database;
using Benevia.Core.API.Roles;
using Benevia.Core.DataGenerator;
using Benevia.Core.DataGenerator.Attributes;
using Benevia.Core.DataGenerator.Interfaces;
using Microsoft.AspNetCore.Identity;

namespace Kennedy.API.Parents;

/// <summary>
/// Creates one user per parent from the <c>Parents</c> configuration section (user name → password),
/// and gives them the Parent role.
/// </summary>
public class ParentsBlankData : ICreateData
{
    public const string ParentRole = "Parent";

    [DataGenerator(DataKind.BlankData, 1)]
    public void CreateParents(IDataContext dataContext, EventContext eventContext)
    {
        var passwords = eventContext.GetService<IConfiguration>().GetSection("Parents").Get<Dictionary<string, string>>();
        if (passwords is null || passwords.Count == 0)
            throw new InvalidOperationException("Configure a password for each parent under Parents:<UserName>.");

        var userManager = eventContext.GetService<UserManager<User>>();
        var users = passwords.Select(parent => CreateUser(userManager, parent.Key, parent.Value)).ToList();

        var role = new Role
        {
            Id = Guid.NewGuid(),
            Name = ParentRole,
            NormalizedName = ParentRole.ToUpperInvariant(),
            Description = "A parent can log and review everything about Kennedy."
        };
        dataContext.AddEntity(role);
        role.AddResponsibility(dataContext, ParentsBL.TrackKennedy);

        foreach (var user in users)
            dataContext.AddEntity(new UserRole { UserId = user.Id, RoleId = role.Id });
    }

    static User CreateUser(UserManager<User> userManager, string userName, string password)
    {
        var user = new User { UserName = userName, FirstName = userName, HasFullAccess = false };
        var result = userManager.CreateAsync(user, password).GetAwaiter().GetResult();
        if (!result.Succeeded)
            throw new InvalidOperationException(
                $"Could not create {userName}: {string.Join(", ", result.Errors.Select(e => e.Description))}");

        return user;
    }
}
