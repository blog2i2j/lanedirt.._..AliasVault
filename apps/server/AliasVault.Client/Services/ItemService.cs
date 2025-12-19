//-----------------------------------------------------------------------
// <copyright file="ItemService.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.Client.Services;

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using AliasClientDb;
using AliasClientDb.Models;
using AliasVault.Client.Main.Models;
using AliasVault.Client.Utilities;
using AliasVault.Shared.Models.WebApi.Favicon;
using Microsoft.EntityFrameworkCore;

/// <summary>
/// Service class for Item operations.
/// </summary>
public sealed class ItemService(HttpClient httpClient, DbService dbService, Config config, JsInteropService jsInteropService)
{
    /// <summary>
    /// The default service URL used as placeholder in forms. When this value is set, the URL field is considered empty
    /// and a null value is stored in the database.
    /// </summary>
    public const string DefaultServiceUrl = "https://";

    /// <summary>
    /// Generates a random password for an item using the specified settings.
    /// </summary>
    /// <param name="settings">PasswordSettings model.</param>
    /// <returns>Random password.</returns>
    public async Task<string> GenerateRandomPasswordAsync(PasswordSettings settings)
    {
        // Sanity check: if all settings are false, then default to use lowercase letters only.
        if (!settings.UseLowercase && !settings.UseUppercase && !settings.UseNumbers && !settings.UseSpecialChars && !settings.UseNonAmbiguousChars)
        {
            settings.UseLowercase = true;
        }

        return await jsInteropService.GenerateRandomPasswordAsync(settings);
    }

    /// <summary>
    /// Generates a random identity for an item.
    /// </summary>
    /// <param name="item">The item to update with random identity.</param>
    /// <returns>Task with the updated item.</returns>
    public async Task<Item> GenerateRandomIdentityAsync(Item item)
    {
        const int MaxAttempts = 5;
        var attempts = 0;
        bool isEmailTaken;

        do
        {
            // Convert age range to birthdate options using shared JS utility
            var birthdateOptions = await jsInteropService.ConvertAgeRangeToBirthdateOptionsAsync(dbService.Settings.DefaultIdentityAgeRange);

            // Get the effective identity language (smart default based on UI language if no explicit override is set)
            var identityLanguage = await GetEffectiveIdentityLanguageAsync();

            // Generate a random identity using the TypeScript library
            var identity = await jsInteropService.GenerateRandomIdentityAsync(identityLanguage, dbService.Settings.DefaultIdentityGender, birthdateOptions);

            // Set username field
            SetFieldValue(item, FieldKey.LoginUsername, identity.NickName);

            // Set alias fields
            SetFieldValue(item, FieldKey.AliasFirstName, identity.FirstName);
            SetFieldValue(item, FieldKey.AliasLastName, identity.LastName);
            SetFieldValue(item, FieldKey.AliasGender, identity.Gender);

            if (!string.IsNullOrEmpty(identity.BirthDate))
            {
                SetFieldValue(item, FieldKey.AliasBirthdate, identity.BirthDate);
            }

            // Set the email
            var emailDomain = GetDefaultEmailDomain();
            var email = $"{identity.EmailPrefix}@{emailDomain}";
            SetFieldValue(item, FieldKey.LoginEmail, email);

            // Check if email is already taken
            try
            {
                var response = await httpClient.PostAsync($"v1/Identity/CheckEmail/{email}", null);
                var result = await response.Content.ReadFromJsonAsync<Dictionary<string, bool>>();
                isEmailTaken = result?["isTaken"] ?? false;
            }
            catch
            {
                // If the API call fails, assume email is not taken to allow operation to continue
                isEmailTaken = false;
            }

            attempts++;
        }
        while (isEmailTaken && attempts < MaxAttempts);

        // Generate password using the TypeScript library
        var passwordSettings = dbService.Settings.PasswordSettings;
        var password = await jsInteropService.GenerateRandomPasswordAsync(passwordSettings);
        SetFieldValue(item, FieldKey.LoginPassword, password);

        return item;
    }

    /// <summary>
    /// Gets the default email domain based on settings and available domains.
    /// </summary>
    /// <returns>Default email domain.</returns>
    public string GetDefaultEmailDomain()
    {
        var defaultDomain = dbService.Settings.DefaultEmailDomain;

        // Function to check if a domain is valid (not disabled, not hidden, and exists in domain lists)
        bool IsValidDomain(string domain) =>
            !string.IsNullOrEmpty(domain) &&
            domain != "DISABLED.TLD" &&
            !config.HiddenPrivateEmailDomains.Contains(domain) &&
            (config.PublicEmailDomains.Contains(domain) || config.PrivateEmailDomains.Contains(domain));

        // Get the first valid domain from private or public domains (excluding hidden ones)
        string GetFirstValidDomain() =>
            config.PrivateEmailDomains.Find(IsValidDomain) ??
            config.PublicEmailDomains.FirstOrDefault() ??
            "example.com";

        // Use the default domain if it's valid (not hidden), otherwise get the first valid domain
        string domainToUse = IsValidDomain(defaultDomain) ? defaultDomain : GetFirstValidDomain();

        return domainToUse;
    }

    /// <summary>
    /// Insert new item into database.
    /// </summary>
    /// <param name="item">Item to insert.</param>
    /// <param name="saveToDb">Whether to commit changes to database. Defaults to true.</param>
    /// <param name="extractFavicon">Whether to extract the favicon from the service URL. Defaults to true.</param>
    /// <returns>Guid of inserted entry.</returns>
    public async Task<Guid> InsertEntryAsync(Item item, bool saveToDb = true, bool extractFavicon = true)
    {
        var context = await dbService.GetDbContextAsync();

        // Try to extract favicon from service URL
        if (extractFavicon)
        {
            await ExtractFaviconAsync(item);
        }

        // Clean up email if it starts with @ (placeholder not filled)
        var email = GetFieldValue(item, FieldKey.LoginEmail);
        if (email != null && email.StartsWith('@'))
        {
            RemoveFieldValue(item, FieldKey.LoginEmail);
        }

        // If the URL equals the placeholder, remove it
        var url = GetFieldValue(item, FieldKey.LoginUrl);
        if (url == DefaultServiceUrl)
        {
            RemoveFieldValue(item, FieldKey.LoginUrl);
        }

        var currentDateTime = DateTime.UtcNow;
        item.Id = Guid.NewGuid();
        item.CreatedAt = currentDateTime;
        item.UpdatedAt = currentDateTime;

        // Set timestamps on all field values
        foreach (var fv in item.FieldValues)
        {
            fv.Id = Guid.NewGuid();
            fv.ItemId = item.Id;
            fv.CreatedAt = currentDateTime;
            fv.UpdatedAt = currentDateTime;
        }

        // Set timestamps on attachments
        foreach (var attachment in item.Attachments)
        {
            attachment.ItemId = item.Id;
            attachment.CreatedAt = currentDateTime;
            attachment.UpdatedAt = currentDateTime;
        }

        // Set timestamps on TOTP codes
        foreach (var totpCode in item.TotpCodes)
        {
            totpCode.ItemId = item.Id;
            totpCode.CreatedAt = currentDateTime;
            totpCode.UpdatedAt = currentDateTime;
        }

        context.Items.Add(item);

        // Save the database to the server if saveToDb is true.
        if (saveToDb && !await dbService.SaveDatabaseAsync())
        {
            // If saving database to server failed, return empty guid to indicate error.
            return Guid.Empty;
        }

        return item.Id;
    }

    /// <summary>
    /// Update an existing item in database.
    /// </summary>
    /// <param name="item">Item to update.</param>
    /// <returns>Guid of updated entry.</returns>
    public async Task<Guid> UpdateEntryAsync(Item item)
    {
        var context = await dbService.GetDbContextAsync();

        // Try to extract favicon from service URL
        await ExtractFaviconAsync(item);

        // Get the existing entry.
        var existingItem = await LoadEntryAsync(item.Id);
        if (existingItem is null)
        {
            throw new InvalidOperationException("Item not found.");
        }

        // Clean up email if it starts with @ (placeholder not filled)
        var email = GetFieldValue(item, FieldKey.LoginEmail);
        if (email != null && email.StartsWith('@'))
        {
            RemoveFieldValue(item, FieldKey.LoginEmail);
        }

        // If the URL equals the placeholder, remove it
        var url = GetFieldValue(item, FieldKey.LoginUrl);
        if (url == DefaultServiceUrl)
        {
            RemoveFieldValue(item, FieldKey.LoginUrl);
        }

        var updateDateTime = DateTime.UtcNow;

        // Update basic item info
        existingItem.Name = item.Name;
        existingItem.ItemType = item.ItemType;
        existingItem.LogoId = item.LogoId;
        existingItem.UpdatedAt = updateDateTime;

        // Update field values
        UpdateFieldValues(context, existingItem, item, updateDateTime);

        // Update attachments
        UpdateAttachments(context, existingItem, item, updateDateTime);

        // Update TOTP codes
        UpdateTotpCodes(context, existingItem, item, updateDateTime);

        if (!await dbService.SaveDatabaseAsync())
        {
            return Guid.Empty;
        }

        return existingItem.Id;
    }

    /// <summary>
    /// Load existing item from database.
    /// </summary>
    /// <param name="itemId">Id of item to load.</param>
    /// <returns>Item object or null if not found.</returns>
    public async Task<Item?> LoadEntryAsync(Guid itemId)
    {
        var context = await dbService.GetDbContextAsync();

        var item = await context.Items
            .Include(x => x.FieldValues.Where(fv => !fv.IsDeleted))
            .Include(x => x.Logo)
            .Include(x => x.Attachments.Where(a => !a.IsDeleted))
            .Include(x => x.TotpCodes.Where(t => !t.IsDeleted))
            .Include(x => x.Passkeys.Where(p => !p.IsDeleted))
            .AsSplitQuery()
            .Where(x => x.Id == itemId)
            .Where(x => !x.IsDeleted)
            .FirstOrDefaultAsync();

        return item;
    }

    /// <summary>
    /// Load all items from database.
    /// </summary>
    /// <returns>List of all items.</returns>
    public async Task<List<Item>> LoadAllAsync()
    {
        var context = await dbService.GetDbContextAsync();

        var items = await context.Items
            .Include(x => x.FieldValues.Where(fv => !fv.IsDeleted))
            .Include(x => x.Logo)
            .Include(x => x.Attachments.Where(a => !a.IsDeleted))
            .Include(x => x.TotpCodes.Where(t => !t.IsDeleted))
            .Include(x => x.Passkeys.Where(p => !p.IsDeleted))
            .AsSplitQuery()
            .Where(x => !x.IsDeleted)
            .Where(x => x.DeletedAt == null) // Exclude items in trash
            .ToListAsync();

        return items;
    }

    /// <summary>
    /// Get list with all item entries for display.
    /// </summary>
    /// <returns>List of ItemListEntry objects.</returns>
    public async Task<List<ItemListEntry>?> GetListAsync()
    {
        var context = await dbService.GetDbContextAsync();

        // Retrieve all items from client DB.
        var items = await context.Items
            .Include(x => x.FieldValues.Where(fv => !fv.IsDeleted))
            .Include(x => x.Logo)
            .Include(x => x.Folder)
            .Include(x => x.Passkeys.Where(p => !p.IsDeleted))
            .Include(x => x.Attachments.Where(a => !a.IsDeleted))
            .Include(x => x.TotpCodes.Where(t => !t.IsDeleted))
            .AsSplitQuery()
            .Where(x => !x.IsDeleted)
            .Where(x => x.DeletedAt == null) // Exclude items in trash
            .ToListAsync();

        // Map to ItemListEntry with proper boolean logic
        return items.Select(x => new ItemListEntry
        {
            Id = x.Id,
            ItemType = x.ItemType ?? "Login",
            Logo = x.Logo?.FileData,
            Service = x.Name,
            Username = GetFieldValue(x, FieldKey.LoginUsername),
            Email = GetFieldValue(x, FieldKey.LoginEmail),
            CardNumber = GetFieldValue(x, FieldKey.CardNumber),
            CreatedAt = x.CreatedAt,
            HasPasskey = x.Passkeys != null && x.Passkeys.Any(),
            HasAlias = !string.IsNullOrWhiteSpace(GetFieldValue(x, FieldKey.AliasFirstName)) ||
                       !string.IsNullOrWhiteSpace(GetFieldValue(x, FieldKey.AliasLastName)) ||
                       !string.IsNullOrWhiteSpace(GetFieldValue(x, FieldKey.AliasGender)) ||
                       !string.IsNullOrWhiteSpace(GetFieldValue(x, FieldKey.AliasBirthdate)),
            HasUsernameOrPassword = !string.IsNullOrWhiteSpace(GetFieldValue(x, FieldKey.LoginUsername)) ||
                                    !string.IsNullOrWhiteSpace(GetFieldValue(x, FieldKey.LoginPassword)),
            HasAttachment = x.Attachments != null && x.Attachments.Any(),
            HasTotp = x.TotpCodes != null && x.TotpCodes.Any(),
            FolderId = x.FolderId,
            FolderName = x.Folder?.Name,
        }).ToList();
    }

    /// <summary>
    /// Soft deletes an existing item from database by moving it to trash.
    /// </summary>
    /// <param name="id">Id of item to delete.</param>
    /// <returns>Bool which indicates if deletion and saving database was successful.</returns>
    public async Task<bool> TrashItemAsync(Guid id)
    {
        var context = await dbService.GetDbContextAsync();

        var item = await context.Items
            .Include(x => x.Passkeys)
            .Where(x => x.Id == id)
            .FirstAsync();

        var deleteDateTime = DateTime.UtcNow;

        // Move to trash (soft delete)
        item.DeletedAt = deleteDateTime;
        item.UpdatedAt = deleteDateTime;

        return await dbService.SaveDatabaseAsync();
    }

    /// <summary>
    /// Permanently deletes an item (sets IsDeleted = true).
    /// </summary>
    /// <param name="id">Id of item to permanently delete.</param>
    /// <returns>Bool which indicates if deletion was successful.</returns>
    public async Task<bool> PermanentlyDeleteItemAsync(Guid id)
    {
        var context = await dbService.GetDbContextAsync();

        var item = await context.Items
            .Include(x => x.FieldValues)
            .Include(x => x.Passkeys)
            .Include(x => x.Attachments)
            .Include(x => x.TotpCodes)
            .Where(x => x.Id == id)
            .FirstAsync();

        var deleteDateTime = DateTime.UtcNow;

        // Mark item and all related entities as deleted
        item.IsDeleted = true;
        item.UpdatedAt = deleteDateTime;

        foreach (var fv in item.FieldValues)
        {
            fv.IsDeleted = true;
            fv.UpdatedAt = deleteDateTime;
        }

        foreach (var passkey in item.Passkeys)
        {
            passkey.IsDeleted = true;
            passkey.UpdatedAt = deleteDateTime;
        }

        foreach (var attachment in item.Attachments)
        {
            attachment.IsDeleted = true;
            attachment.UpdatedAt = deleteDateTime;
        }

        foreach (var totp in item.TotpCodes)
        {
            totp.IsDeleted = true;
            totp.UpdatedAt = deleteDateTime;
        }

        return await dbService.SaveDatabaseAsync();
    }

    /// <summary>
    /// Hard delete all items from the database. This permanently removes all item records
    /// (including soft-deleted ones) from the database for a complete vault reset.
    /// </summary>
    /// <returns>True if successful, false otherwise.</returns>
    public async Task<bool> HardDeleteAllItemsAsync()
    {
        var context = await dbService.GetDbContextAsync();

        // Hard delete all related entities and items.
        context.Attachments.RemoveRange(context.Attachments);
        context.FieldValues.RemoveRange(context.FieldValues);
        context.TotpCodes.RemoveRange(context.TotpCodes);
        context.Passkeys.RemoveRange(context.Passkeys);
        context.Items.RemoveRange(context.Items);

        // Save changes locally
        await context.SaveChangesAsync();

        // Save the database to server
        return await dbService.SaveDatabaseAsync();
    }

    /// <summary>
    /// Deletes a passkey by marking it as deleted.
    /// </summary>
    /// <param name="passkeyId">The ID of the passkey to delete.</param>
    /// <returns>A value indicating whether the deletion was successful.</returns>
    public async Task<bool> DeletePasskeyAsync(Guid passkeyId)
    {
        var context = await dbService.GetDbContextAsync();
        var passkey = await context.Passkeys.FirstOrDefaultAsync(p => p.Id == passkeyId);

        if (passkey != null)
        {
            var deleteDateTime = DateTime.UtcNow;
            passkey.IsDeleted = true;
            passkey.UpdatedAt = deleteDateTime;
            await context.SaveChangesAsync();

            // Save to server
            return await dbService.SaveDatabaseAsync();
        }

        return false;
    }

    /// <summary>
    /// Gets a field value from an item by field key.
    /// </summary>
    /// <param name="item">The item to get the field from.</param>
    /// <param name="fieldKey">The field key.</param>
    /// <returns>The field value or null.</returns>
#pragma warning disable SA1204 // Static members should appear before non-static members
    public static string? GetFieldValue(Item item, string fieldKey)
#pragma warning restore SA1204
    {
        return item.FieldValues
            .FirstOrDefault(fv => fv.FieldKey == fieldKey && !fv.IsDeleted)
            ?.Value;
    }

    /// <summary>
    /// Gets all field values for a multi-value field key.
    /// </summary>
    /// <param name="item">The item to get the fields from.</param>
    /// <param name="fieldKey">The field key.</param>
    /// <returns>List of field values.</returns>
    public static List<string> GetFieldValues(Item item, string fieldKey)
    {
        return item.FieldValues
            .Where(fv => fv.FieldKey == fieldKey && !fv.IsDeleted)
            .OrderBy(fv => fv.Weight)
            .Select(fv => fv.Value ?? string.Empty)
            .ToList();
    }

    /// <summary>
    /// Sets or updates a field value on an item.
    /// </summary>
    /// <param name="item">The item to update.</param>
    /// <param name="fieldKey">The field key.</param>
    /// <param name="value">The value to set.</param>
    public static void SetFieldValue(Item item, string fieldKey, string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            RemoveFieldValue(item, fieldKey);
            return;
        }

        var existingField = item.FieldValues.FirstOrDefault(fv => fv.FieldKey == fieldKey && !fv.IsDeleted);
        if (existingField != null)
        {
            existingField.Value = value;
            existingField.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            item.FieldValues.Add(new FieldValue
            {
                Id = Guid.NewGuid(),
                ItemId = item.Id,
                FieldKey = fieldKey,
                Value = value,
                Weight = 0,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            });
        }
    }

    /// <summary>
    /// Removes a field value from an item.
    /// </summary>
    /// <param name="item">The item to update.</param>
    /// <param name="fieldKey">The field key to remove.</param>
    public static void RemoveFieldValue(Item item, string fieldKey)
    {
        var existingField = item.FieldValues.FirstOrDefault(fv => fv.FieldKey == fieldKey && !fv.IsDeleted);
        if (existingField != null)
        {
            existingField.IsDeleted = true;
            existingField.UpdatedAt = DateTime.UtcNow;
        }
    }

    /// <summary>
    /// Update the field values for an item.
    /// </summary>
    /// <param name="context">The database context.</param>
    /// <param name="existingItem">The existing item in the database.</param>
    /// <param name="newItem">The new item with updated field values.</param>
    /// <param name="updateDateTime">The timestamp for updates.</param>
    private static void UpdateFieldValues(DbContext context, Item existingItem, Item newItem, DateTime updateDateTime)
    {
        // Get existing field values
        var existingFields = existingItem.FieldValues.Where(fv => !fv.IsDeleted).ToList();

        // Track which fields we've processed
        var processedFieldKeys = new HashSet<string>();

        // Process new field values
        foreach (var newField in newItem.FieldValues.Where(fv => !fv.IsDeleted))
        {
            var fieldKey = newField.FieldKey;
            if (fieldKey == null)
            {
                continue;
            }

            processedFieldKeys.Add(fieldKey);

            var existingField = existingFields.FirstOrDefault(fv => fv.FieldKey == fieldKey);
            if (existingField != null)
            {
                // Update existing field
                if (existingField.Value != newField.Value)
                {
                    existingField.Value = newField.Value;
                    existingField.UpdatedAt = updateDateTime;
                }
            }
            else
            {
                // Add new field
                existingItem.FieldValues.Add(new FieldValue
                {
                    Id = Guid.NewGuid(),
                    ItemId = existingItem.Id,
                    FieldKey = fieldKey,
                    Value = newField.Value,
                    Weight = newField.Weight,
                    CreatedAt = updateDateTime,
                    UpdatedAt = updateDateTime,
                });
            }
        }

        // Soft-delete removed fields
        foreach (var existingField in existingFields)
        {
            if (existingField.FieldKey != null && !processedFieldKeys.Contains(existingField.FieldKey))
            {
                existingField.IsDeleted = true;
                existingField.UpdatedAt = updateDateTime;
            }
        }
    }

    /// <summary>
    /// Update the attachments for an item.
    /// </summary>
    /// <param name="context">The database context.</param>
    /// <param name="existingItem">The existing item in the database.</param>
    /// <param name="newItem">The new item with updated attachments.</param>
    /// <param name="updateDateTime">The timestamp for updates.</param>
    private static void UpdateAttachments(DbContext context, Item existingItem, Item newItem, DateTime updateDateTime)
    {
        var attachmentsToRemove = existingItem.Attachments
            .Where(existingAttachment => !newItem.Attachments.Any(a => a.Id == existingAttachment.Id))
            .ToList();

        foreach (var attachmentToRemove in attachmentsToRemove)
        {
            attachmentToRemove.IsDeleted = true;
            attachmentToRemove.UpdatedAt = updateDateTime;
        }

        foreach (var attachment in newItem.Attachments)
        {
            if (attachment.Id != Guid.Empty)
            {
                var existingAttachment = existingItem.Attachments.FirstOrDefault(a => a.Id == attachment.Id);
                if (existingAttachment != null)
                {
                    context.Entry(existingAttachment).CurrentValues.SetValues(attachment);
                    existingAttachment.UpdatedAt = updateDateTime;
                }
            }
            else
            {
                attachment.Id = Guid.NewGuid();
                attachment.ItemId = existingItem.Id;
                attachment.CreatedAt = updateDateTime;
                attachment.UpdatedAt = updateDateTime;
                existingItem.Attachments.Add(attachment);
            }
        }
    }

    /// <summary>
    /// Update the TOTP codes for an item.
    /// </summary>
    /// <param name="context">The database context.</param>
    /// <param name="existingItem">The existing item in the database.</param>
    /// <param name="newItem">The new item with updated TOTP codes.</param>
    /// <param name="updateDateTime">The timestamp for updates.</param>
    private static void UpdateTotpCodes(DbContext context, Item existingItem, Item newItem, DateTime updateDateTime)
    {
        var totpCodesToRemove = existingItem.TotpCodes
            .Where(existingTotp => !newItem.TotpCodes.Any(t => t.Id == existingTotp.Id))
            .ToList();

        foreach (var totpToRemove in totpCodesToRemove)
        {
            totpToRemove.IsDeleted = true;
            totpToRemove.UpdatedAt = updateDateTime;
        }

        foreach (var totpCode in newItem.TotpCodes)
        {
            if (totpCode.Id != Guid.Empty)
            {
                var existingTotpCode = existingItem.TotpCodes.FirstOrDefault(t => t.Id == totpCode.Id);
                if (existingTotpCode != null)
                {
                    context.Entry(existingTotpCode).CurrentValues.SetValues(totpCode);
                    existingTotpCode.UpdatedAt = updateDateTime;
                }
            }
            else
            {
                totpCode.Id = Guid.NewGuid();
                totpCode.ItemId = existingItem.Id;
                totpCode.CreatedAt = updateDateTime;
                totpCode.UpdatedAt = updateDateTime;
                existingItem.TotpCodes.Add(totpCode);
            }
        }
    }

    /// <summary>
    /// Extract favicon from service URL if available. If successful, links the item to the logo.
    /// </summary>
    /// <param name="item">The Item to extract the favicon for.</param>
    /// <returns>Task.</returns>
    private async Task ExtractFaviconAsync(Item item)
    {
        // Try to extract favicon from service URL
        var url = GetFieldValue(item, FieldKey.LoginUrl);
        if (url != null && !string.IsNullOrEmpty(url) && url != DefaultServiceUrl)
        {
            // Request favicon from service URL via WebApi
            try
            {
                var apiReturn = await httpClient.GetFromJsonAsync<FaviconExtractModel>($"v1/Favicon/Extract?url={url}");
                if (apiReturn?.Image is not null)
                {
                    // For now, we store the favicon directly on the item's logo
                    // In the future, we should use the Logo deduplication table
                    var context = await dbService.GetDbContextAsync();

                    // Try to find existing logo by source
                    var domain = new Uri(url).Host;
                    var existingLogo = await context.Logos.FirstOrDefaultAsync(l => l.Source == domain);

                    if (existingLogo != null)
                    {
                        item.LogoId = existingLogo.Id;
                    }
                    else
                    {
                        // Create new logo
                        var newLogo = new Logo
                        {
                            Id = Guid.NewGuid(),
                            Source = domain,
                            FileData = apiReturn.Image,
                            MimeType = "image/png",
                            FetchedAt = DateTime.UtcNow,
                            CreatedAt = DateTime.UtcNow,
                            UpdatedAt = DateTime.UtcNow,
                        };
                        context.Logos.Add(newLogo);
                        item.LogoId = newLogo.Id;
                    }
                }
            }
            catch
            {
                // Ignore favicon extraction errors
            }
        }
    }

    /// <summary>
    /// Gets the effective identity generator language to use.
    /// If user has explicitly set a language preference, use that.
    /// Otherwise, intelligently match the UI language to an available identity generator language.
    /// Falls back to "en" if no match is found.
    /// </summary>
    /// <returns>The identity generator language code to use.</returns>
    private async Task<string> GetEffectiveIdentityLanguageAsync()
    {
        var explicitLanguage = dbService.Settings.DefaultIdentityLanguage;

        // If user has explicitly set a language preference, use it
        if (!string.IsNullOrWhiteSpace(explicitLanguage))
        {
            return explicitLanguage;
        }

        // Otherwise, try to match UI language to an identity generator language
        var uiLanguage = dbService.Settings.AppLanguage;
        var mappedLanguage = await jsInteropService.MapUiLanguageToIdentityLanguageAsync(uiLanguage);

        // Return the mapped language, or fall back to "en" if no match found
        return mappedLanguage ?? "en";
    }
}
