using Benevia.Core.API.Communications.Authentication.Models;
using Benevia.Core.API.Database;
using Benevia.Core.API.Roles;
using Benevia.Core.DataGenerator;
using Benevia.Core.DataGenerator.Attributes;
using Benevia.Core.DataGenerator.Interfaces;
using Microsoft.AspNetCore.Identity;
using Ned.API.Families;

namespace Ned.API.Parents;

/// <summary>
/// Creates the Parent role that every sign-up gets. For development, it also creates one family with a user per
/// entry in the <c>Parents</c> configuration section (user name → password).
/// </summary>
public class ParentsBlankData : ICreateData
{
    public const string ParentRole = "Parent";

    [DataGenerator(DataKind.BlankData, 1)]
    public void CreateParents(IDataContext dataContext, EventContext eventContext)
    {
        var role = new Role
        {
            Id = Guid.NewGuid(),
            Name = ParentRole,
            NormalizedName = ParentRole.ToUpperInvariant(),
            Description = "A parent can log and review everything about their baby."
        };
        dataContext.AddEntity(role);
        role.AddResponsibility(dataContext, ParentsBL.TrackBaby);

        var passwords = eventContext.GetService<IConfiguration>().GetSection("Parents").Get<Dictionary<string, string>>();
        if (passwords is null || passwords.Count == 0)
            return;

        var userManager = eventContext.GetService<UserManager<User>>();
        var family = new Family(eventContext) { InviteCode = InviteCode.New() };
        foreach (var (userName, password) in passwords)
        {
            var user = CreateUser(userManager, userName, password);
            dataContext.AddEntity(new UserRole { UserId = user.Id, RoleId = role.Id });
            _ = new Member(eventContext) { Guid = user.Id, Family = family };
        }
    }

    static User CreateUser(UserManager<User> userManager, string userName, string password)
    {
        // A first start that failed part-way (say, on the second parent's password) may have saved the first parent.
        if (userManager.FindByNameAsync(userName).GetAwaiter().GetResult() is { } existing)
            return existing;

        var user = new User { UserName = userName, FirstName = userName, HasFullAccess = false };
        var result = userManager.CreateAsync(user, password).GetAwaiter().GetResult();
        if (!result.Succeeded)
            throw new InvalidOperationException(
                $"Could not create {userName}: {string.Join(", ", result.Errors.Select(e => e.Description))}");

        return user;
    }
}
