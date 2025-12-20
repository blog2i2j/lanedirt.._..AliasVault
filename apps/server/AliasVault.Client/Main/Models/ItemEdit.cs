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
    /// Gets or sets the folder ID.
    /// </summary>
    public Guid? FolderId { get; set; }

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
    /// Gets or sets the credit card number.
    /// </summary>
    public string CardNumber { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the credit card cardholder name.
    /// </summary>
    public string CardCardholderName { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the credit card expiry month.
    /// </summary>
    public string CardExpiryMonth { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the credit card expiry year.
    /// </summary>
    public string CardExpiryYear { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the credit card CVV.
    /// </summary>
    public string CardCvv { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the credit card PIN.
    /// </summary>
    public string CardPin { get; set; } = string.Empty;

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
    /// Gets or sets the custom fields.
    /// </summary>
    public List<CustomFieldEdit> CustomFields { get; set; } = [];

    /// <summary>
    /// Creates an ItemEdit instance from an Item entity.
    /// </summary>
    /// <param name="item">The item entity to convert.</param>
    /// <returns>A new ItemEdit instance.</returns>
    public static ItemEdit FromEntity(Item item)
    {
        var birthDate = ItemService.GetFieldValue(item, FieldKey.AliasBirthdate);

        var edit = new ItemEdit
        {
            Id = item.Id,
            ItemType = item.ItemType,
            ServiceName = item.Name ?? string.Empty,
            ServiceUrl = ItemService.GetFieldValue(item, FieldKey.LoginUrl),
            LogoId = item.LogoId,
            ServiceLogo = item.Logo?.FileData,
            FolderId = item.FolderId,
            Username = ItemService.GetFieldValue(item, FieldKey.LoginUsername) ?? string.Empty,
            Password = ItemService.GetFieldValue(item, FieldKey.LoginPassword) ?? string.Empty,
            Email = ItemService.GetFieldValue(item, FieldKey.LoginEmail) ?? string.Empty,
            Notes = ItemService.GetFieldValue(item, FieldKey.NotesContent) ?? string.Empty,
            AliasFirstName = ItemService.GetFieldValue(item, FieldKey.AliasFirstName) ?? string.Empty,
            AliasLastName = ItemService.GetFieldValue(item, FieldKey.AliasLastName) ?? string.Empty,
            AliasGender = ItemService.GetFieldValue(item, FieldKey.AliasGender) ?? string.Empty,
            AliasBirthDate = birthDate ?? string.Empty,
            CardNumber = ItemService.GetFieldValue(item, FieldKey.CardNumber) ?? string.Empty,
            CardCardholderName = ItemService.GetFieldValue(item, FieldKey.CardCardholderName) ?? string.Empty,
            CardExpiryMonth = ItemService.GetFieldValue(item, FieldKey.CardExpiryMonth) ?? string.Empty,
            CardExpiryYear = ItemService.GetFieldValue(item, FieldKey.CardExpiryYear) ?? string.Empty,
            CardCvv = ItemService.GetFieldValue(item, FieldKey.CardCvv) ?? string.Empty,
            CardPin = ItemService.GetFieldValue(item, FieldKey.CardPin) ?? string.Empty,
            Attachments = item.Attachments.Where(a => !a.IsDeleted).ToList(),
            TotpCodes = item.TotpCodes.Where(t => !t.IsDeleted).ToList(),
            Passkeys = item.Passkeys.Where(p => !p.IsDeleted).ToList(),
            CreateDate = item.CreatedAt,
            LastUpdate = item.UpdatedAt,
        };

        // Extract custom fields (non-system fields that have FieldDefinitionId set)
        foreach (var fv in item.FieldValues.Where(f => !f.IsDeleted && f.FieldDefinitionId != null))
        {
            edit.CustomFields.Add(new CustomFieldEdit
            {
                Id = fv.Id,
                FieldDefinitionId = fv.FieldDefinitionId!.Value,
                Label = fv.FieldDefinition?.Label ?? "Custom Field",
                FieldType = fv.FieldDefinition?.FieldType ?? "Text",
                Value = fv.Value ?? string.Empty,
                IsHidden = fv.FieldDefinition?.IsHidden ?? false,
            });
        }

        return edit;
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
            FolderId = FolderId,
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

        // Add card fields
        if (!string.IsNullOrEmpty(CardNumber))
        {
            ItemService.SetFieldValue(item, FieldKey.CardNumber, CardNumber);
        }

        if (!string.IsNullOrEmpty(CardCardholderName))
        {
            ItemService.SetFieldValue(item, FieldKey.CardCardholderName, CardCardholderName);
        }

        if (!string.IsNullOrEmpty(CardExpiryMonth))
        {
            ItemService.SetFieldValue(item, FieldKey.CardExpiryMonth, CardExpiryMonth);
        }

        if (!string.IsNullOrEmpty(CardExpiryYear))
        {
            ItemService.SetFieldValue(item, FieldKey.CardExpiryYear, CardExpiryYear);
        }

        if (!string.IsNullOrEmpty(CardCvv))
        {
            ItemService.SetFieldValue(item, FieldKey.CardCvv, CardCvv);
        }

        if (!string.IsNullOrEmpty(CardPin))
        {
            ItemService.SetFieldValue(item, FieldKey.CardPin, CardPin);
        }

        // Add custom fields
        foreach (var customField in CustomFields.Where(cf => !string.IsNullOrEmpty(cf.Value)))
        {
            // For new custom fields (TempId set, FieldDefinitionId is empty), create a new FieldDefinition
            if (customField.FieldDefinitionId == Guid.Empty && !string.IsNullOrEmpty(customField.TempId))
            {
                var now = DateTime.UtcNow;
                var fieldDefinitionId = Guid.NewGuid();
                var fieldDefinition = new FieldDefinition
                {
                    Id = fieldDefinitionId,
                    FieldType = customField.FieldType,
                    Label = customField.Label,
                    IsHidden = customField.IsHidden,
                    IsMultiValue = false,
                    EnableHistory = false,
                    Weight = 0,
                    CreatedAt = now,
                    UpdatedAt = now,
                };

                item.FieldValues.Add(new FieldValue
                {
                    Id = Guid.NewGuid(),
                    ItemId = item.Id,
                    FieldDefinitionId = fieldDefinitionId,
                    FieldDefinition = fieldDefinition,
                    FieldKey = null,
                    Value = customField.Value,
                    Weight = 0,
                });
            }
            else
            {
                // Existing custom field - update value and include FieldDefinition with updated label
                var fieldValue = new FieldValue
                {
                    Id = customField.Id != Guid.Empty ? customField.Id : Guid.NewGuid(),
                    ItemId = item.Id,
                    FieldDefinitionId = customField.FieldDefinitionId,
                    FieldKey = null,
                    Value = customField.Value,
                    Weight = 0,
                };

                // Include FieldDefinition with potentially updated label for update logic
                if (customField.FieldDefinitionId != Guid.Empty)
                {
                    fieldValue.FieldDefinition = new FieldDefinition
                    {
                        Id = customField.FieldDefinitionId,
                        Label = customField.Label,
                        FieldType = customField.FieldType,
                        IsHidden = customField.IsHidden,
                        IsMultiValue = false,
                        EnableHistory = false,
                        Weight = 0,
                    };
                }

                item.FieldValues.Add(fieldValue);
            }
        }

        return item;
    }

    /// <summary>
    /// Gets the value of a system field by its field key.
    /// </summary>
    /// <param name="fieldKey">The field key.</param>
    /// <returns>The field value or empty string.</returns>
    public string GetFieldValue(string fieldKey)
    {
        return fieldKey switch
        {
            FieldKey.LoginUrl => ServiceUrl ?? string.Empty,
            FieldKey.LoginUsername => Username,
            FieldKey.LoginPassword => Password,
            FieldKey.LoginEmail => Email,
            FieldKey.NotesContent => Notes,
            FieldKey.AliasFirstName => AliasFirstName,
            FieldKey.AliasLastName => AliasLastName,
            FieldKey.AliasGender => AliasGender,
            FieldKey.AliasBirthdate => AliasBirthDate,
            FieldKey.CardNumber => CardNumber,
            FieldKey.CardCardholderName => CardCardholderName,
            FieldKey.CardExpiryMonth => CardExpiryMonth,
            FieldKey.CardExpiryYear => CardExpiryYear,
            FieldKey.CardCvv => CardCvv,
            FieldKey.CardPin => CardPin,
            _ => string.Empty,
        };
    }

    /// <summary>
    /// Sets the value of a system field by its field key.
    /// </summary>
    /// <param name="fieldKey">The field key.</param>
    /// <param name="value">The value to set.</param>
    public void SetFieldValue(string fieldKey, string value)
    {
        switch (fieldKey)
        {
            case FieldKey.LoginUrl:
                ServiceUrl = value;
                break;
            case FieldKey.LoginUsername:
                Username = value;
                break;
            case FieldKey.LoginPassword:
                Password = value;
                break;
            case FieldKey.LoginEmail:
                Email = value;
                break;
            case FieldKey.NotesContent:
                Notes = value;
                break;
            case FieldKey.AliasFirstName:
                AliasFirstName = value;
                break;
            case FieldKey.AliasLastName:
                AliasLastName = value;
                break;
            case FieldKey.AliasGender:
                AliasGender = value;
                break;
            case FieldKey.AliasBirthdate:
                AliasBirthDate = value;
                break;
            case FieldKey.CardNumber:
                CardNumber = value;
                break;
            case FieldKey.CardCardholderName:
                CardCardholderName = value;
                break;
            case FieldKey.CardExpiryMonth:
                CardExpiryMonth = value;
                break;
            case FieldKey.CardExpiryYear:
                CardExpiryYear = value;
                break;
            case FieldKey.CardCvv:
                CardCvv = value;
                break;
            case FieldKey.CardPin:
                CardPin = value;
                break;
        }
    }

    /// <summary>
    /// Checks if a field has a non-empty value.
    /// </summary>
    /// <param name="fieldKey">The field key.</param>
    /// <returns>True if the field has a value.</returns>
    public bool HasFieldValue(string fieldKey)
    {
        return !string.IsNullOrEmpty(GetFieldValue(fieldKey));
    }
}
