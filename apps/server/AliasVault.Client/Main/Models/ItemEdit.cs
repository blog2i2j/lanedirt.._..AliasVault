//-----------------------------------------------------------------------
// <copyright file="ItemEdit.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.Client.Main.Models;

using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Linq;
using AliasClientDb;
using AliasClientDb.Models;
using AliasVault.Client.Main.Models.FormValidation;
using AliasVault.Client.Resources;
using AliasVault.Client.Services;

/// <summary>
/// Item edit model for add/edit forms.
/// </summary>
public sealed class ItemEdit
{
    /// <summary>
    /// Gets or sets the Id of the item.
    /// </summary>
    public Guid Id { get; set; }

    /// <summary>
    /// Gets or sets the item type (Login, Alias, CreditCard, Note).
    /// </summary>
    public string ItemType { get; set; } = "Login";

    /// <summary>
    /// Gets or sets the name of the service/item.
    /// </summary>
    [Required(ErrorMessageResourceType = typeof(ValidationMessages), ErrorMessageResourceName = nameof(ValidationMessages.ServiceNameRequired))]
    [Display(Name = "Service Name")]
    public string ServiceName { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the URL of the service.
    /// </summary>
    public string? ServiceUrl { get; set; }

    /// <summary>
    /// Gets or sets the logo ID.
    /// </summary>
    public Guid? LogoId { get; set; }

    /// <summary>
    /// Gets or sets the logo bytes.
    /// </summary>
    public byte[]? ServiceLogo { get; set; }

    /// <summary>
    /// Gets or sets the username field.
    /// </summary>
    public string Username { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the password field.
    /// </summary>
    public string Password { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the email field.
    /// </summary>
    public string Email { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the notes field.
    /// </summary>
    public string Notes { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the Alias first name.
    /// </summary>
    public string AliasFirstName { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the Alias last name.
    /// </summary>
    public string AliasLastName { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the Alias gender.
    /// </summary>
    public string AliasGender { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the Alias BirthDate. Can be empty string or a date in yyyy-MM-dd format.
    /// </summary>
    [StringDateFormat("yyyy-MM-dd", AllowEmpty = true)]
    public string AliasBirthDate { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the create date.
    /// </summary>
    public DateTime CreateDate { get; set; }

    /// <summary>
    /// Gets or sets the last update date.
    /// </summary>
    public DateTime LastUpdate { get; set; }

    /// <summary>
    /// Gets or sets the Attachment list.
    /// </summary>
    public List<Attachment> Attachments { get; set; } = [];

    /// <summary>
    /// Gets or sets the TOTP codes list.
    /// </summary>
    public List<TotpCode> TotpCodes { get; set; } = [];

    /// <summary>
    /// Gets or sets the Passkeys list.
    /// </summary>
    public List<Passkey> Passkeys { get; set; } = [];

    /// <summary>
    /// Creates an ItemEdit instance from an Item entity.
    /// </summary>
    /// <param name="item">The item entity to convert.</param>
    /// <returns>A new ItemEdit instance.</returns>
    public static ItemEdit FromEntity(Item item)
    {
        var birthDate = ItemService.GetFieldValue(item, FieldKey.AliasBirthdate);

        return new ItemEdit
        {
            Id = item.Id,
            ItemType = item.ItemType,
            ServiceName = item.Name ?? string.Empty,
            ServiceUrl = ItemService.GetFieldValue(item, FieldKey.LoginUrl),
            LogoId = item.LogoId,
            ServiceLogo = item.Logo?.FileData,
            Username = ItemService.GetFieldValue(item, FieldKey.LoginUsername) ?? string.Empty,
            Password = ItemService.GetFieldValue(item, FieldKey.LoginPassword) ?? string.Empty,
            Email = ItemService.GetFieldValue(item, FieldKey.LoginEmail) ?? string.Empty,
            Notes = ItemService.GetFieldValue(item, FieldKey.NotesContent) ?? string.Empty,
            AliasFirstName = ItemService.GetFieldValue(item, FieldKey.AliasFirstName) ?? string.Empty,
            AliasLastName = ItemService.GetFieldValue(item, FieldKey.AliasLastName) ?? string.Empty,
            AliasGender = ItemService.GetFieldValue(item, FieldKey.AliasGender) ?? string.Empty,
            AliasBirthDate = birthDate ?? string.Empty,
            Attachments = item.Attachments.Where(a => !a.IsDeleted).ToList(),
            TotpCodes = item.TotpCodes.Where(t => !t.IsDeleted).ToList(),
            Passkeys = item.Passkeys.Where(p => !p.IsDeleted).ToList(),
            CreateDate = item.CreatedAt,
            LastUpdate = item.UpdatedAt,
        };
    }

    /// <summary>
    /// Converts this ItemEdit instance to an Item entity.
    /// </summary>
    /// <returns>A new Item entity.</returns>
    public Item ToEntity()
    {
        var item = new Item
        {
            Id = Id,
            Name = ServiceName,
            ItemType = ItemType,
            LogoId = LogoId,
            Attachments = Attachments,
            TotpCodes = TotpCodes,
        };

        // Add login fields
        if (!string.IsNullOrEmpty(ServiceUrl))
        {
            ItemService.SetFieldValue(item, FieldKey.LoginUrl, ServiceUrl);
        }

        if (!string.IsNullOrEmpty(Username))
        {
            ItemService.SetFieldValue(item, FieldKey.LoginUsername, Username);
        }

        if (!string.IsNullOrEmpty(Password))
        {
            ItemService.SetFieldValue(item, FieldKey.LoginPassword, Password);
        }

        if (!string.IsNullOrEmpty(Email))
        {
            ItemService.SetFieldValue(item, FieldKey.LoginEmail, Email);
        }

        if (!string.IsNullOrEmpty(Notes))
        {
            ItemService.SetFieldValue(item, FieldKey.NotesContent, Notes);
        }

        // Add alias fields
        if (!string.IsNullOrEmpty(AliasFirstName))
        {
            ItemService.SetFieldValue(item, FieldKey.AliasFirstName, AliasFirstName);
        }

        if (!string.IsNullOrEmpty(AliasLastName))
        {
            ItemService.SetFieldValue(item, FieldKey.AliasLastName, AliasLastName);
        }

        if (!string.IsNullOrEmpty(AliasGender))
        {
            ItemService.SetFieldValue(item, FieldKey.AliasGender, AliasGender);
        }

        if (!string.IsNullOrEmpty(AliasBirthDate))
        {
            ItemService.SetFieldValue(item, FieldKey.AliasBirthdate, AliasBirthDate);
        }

        return item;
    }
}
