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
using System.Linq;
using AliasClientDb;
using AliasClientDb.Models;
using AliasVault.Client.Resources;
using AliasVault.Client.Services;

/// <summary>
/// Item edit model for add/edit forms.
/// Uses a dynamic fields-based approach for flexibility when adding new system fields.
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
    /// Gets or sets the create date.
    /// </summary>
    public DateTime CreateDate { get; set; }

    /// <summary>
    /// Gets or sets the last update date.
    /// </summary>
    public DateTime LastUpdate { get; set; }

    /// <summary>
    /// Gets or sets the dynamic fields list (both system and custom fields).
    /// </summary>
    public List<SystemFieldEdit> Fields { get; set; } = [];

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
        var edit = new ItemEdit
        {
            Id = item.Id,
            ItemType = item.ItemType,
            ServiceName = item.Name ?? string.Empty,
            LogoId = item.LogoId,
            ServiceLogo = item.Logo?.FileData,
            FolderId = item.FolderId,
            Attachments = item.Attachments.Where(a => !a.IsDeleted).ToList(),
            TotpCodes = item.TotpCodes.Where(t => !t.IsDeleted).ToList(),
            Passkeys = item.Passkeys.Where(p => !p.IsDeleted).ToList(),
            CreateDate = item.CreatedAt,
            LastUpdate = item.UpdatedAt,
        };

        // Convert all field values to SystemFieldEdit
        foreach (var fv in item.FieldValues.Where(f => !f.IsDeleted))
        {
            var isCustomField = fv.FieldDefinitionId != null && string.IsNullOrEmpty(fv.FieldKey);
            var systemField = !string.IsNullOrEmpty(fv.FieldKey) ? SystemFieldRegistry.GetSystemField(fv.FieldKey) : null;

            edit.Fields.Add(new SystemFieldEdit
            {
                FieldKey = fv.FieldKey ?? fv.FieldDefinitionId?.ToString() ?? string.Empty,
                FieldValueId = fv.Id,
                FieldDefinitionId = fv.FieldDefinitionId,
                Label = isCustomField
                    ? fv.FieldDefinition?.Label ?? "Custom Field"
                    : fv.FieldKey ?? string.Empty,
                FieldType = isCustomField
                    ? fv.FieldDefinition?.FieldType ?? "Text"
                    : systemField?.FieldType ?? "Text",
                Value = fv.Value ?? string.Empty,
                IsCustomField = isCustomField,
                IsHidden = isCustomField
                    ? fv.FieldDefinition?.IsHidden ?? false
                    : systemField?.IsHidden ?? false,
                EnableHistory = isCustomField
                    ? fv.FieldDefinition?.EnableHistory ?? false
                    : systemField?.EnableHistory ?? false,
                DisplayOrder = systemField?.DefaultDisplayOrder ?? fv.Weight,
                Category = GetCategoryFromFieldKey(fv.FieldKey),
                IsMultiValue = systemField?.IsMultiValue ?? false,
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

        // Convert all fields to FieldValue entities
        foreach (var field in Fields.Where(f => !string.IsNullOrEmpty(f.Value)))
        {
            if (field.IsCustomField)
            {
                // Custom field handling
                var now = DateTime.UtcNow;

                if (field.FieldDefinitionId == null || field.FieldDefinitionId == Guid.Empty)
                {
                    // New custom field - create FieldDefinition
                    var fieldDefinitionId = !string.IsNullOrEmpty(field.TempId) && Guid.TryParse(field.TempId, out var parsedGuid)
                        ? parsedGuid
                        : Guid.NewGuid();

                    var fieldDefinition = new FieldDefinition
                    {
                        Id = fieldDefinitionId,
                        FieldType = field.FieldType,
                        Label = field.Label,
                        IsHidden = field.IsHidden,
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
                        Value = field.Value,
                        Weight = 0,
                    });
                }
                else
                {
                    // Existing custom field - update value and include FieldDefinition
                    var fieldValue = new FieldValue
                    {
                        Id = field.FieldValueId != Guid.Empty ? field.FieldValueId : Guid.NewGuid(),
                        ItemId = item.Id,
                        FieldDefinitionId = field.FieldDefinitionId,
                        FieldKey = null,
                        Value = field.Value,
                        Weight = 0,
                    };

                    // Include FieldDefinition with potentially updated label
                    fieldValue.FieldDefinition = new FieldDefinition
                    {
                        Id = field.FieldDefinitionId.Value,
                        Label = field.Label,
                        FieldType = field.FieldType,
                        IsHidden = field.IsHidden,
                        IsMultiValue = false,
                        EnableHistory = false,
                        Weight = 0,
                    };

                    item.FieldValues.Add(fieldValue);
                }
            }
            else
            {
                // System field
                ItemService.SetFieldValue(item, field.FieldKey, field.Value);
            }
        }

        return item;
    }

    /// <summary>
    /// Gets the value of a field by its field key.
    /// </summary>
    /// <param name="fieldKey">The field key.</param>
    /// <returns>The field value or empty string.</returns>
    public string GetFieldValue(string fieldKey)
    {
        return Fields.FirstOrDefault(f => f.FieldKey == fieldKey)?.Value ?? string.Empty;
    }

    /// <summary>
    /// Gets a field by its field key.
    /// If the field doesn't exist, creates it based on the system field definition.
    /// </summary>
    /// <param name="fieldKey">The field key.</param>
    /// <returns>The field or null if not a valid system field.</returns>
    public SystemFieldEdit? GetField(string fieldKey)
    {
        var field = Fields.FirstOrDefault(f => f.FieldKey == fieldKey);
        if (field != null)
        {
            return field;
        }

        // Field doesn't exist - create it if it's a valid system field
        var systemField = SystemFieldRegistry.GetSystemField(fieldKey);
        if (systemField == null)
        {
            return null;
        }

        field = new SystemFieldEdit
        {
            FieldKey = fieldKey,
            Label = fieldKey,
            FieldType = systemField.FieldType,
            Value = string.Empty,
            IsCustomField = false,
            IsHidden = systemField.IsHidden,
            EnableHistory = systemField.EnableHistory,
            DisplayOrder = systemField.DefaultDisplayOrder,
            Category = systemField.Category,
            IsMultiValue = systemField.IsMultiValue,
        };
        Fields.Add(field);
        return field;
    }

    /// <summary>
    /// Sets the value of a field by its field key.
    /// If the field doesn't exist, it will be added.
    /// </summary>
    /// <param name="fieldKey">The field key.</param>
    /// <param name="value">The value to set.</param>
    public void SetFieldValue(string fieldKey, string value)
    {
        var field = Fields.FirstOrDefault(f => f.FieldKey == fieldKey);
        if (field != null)
        {
            field.Value = value;
        }
        else
        {
            // Add new field based on system field definition
            var systemField = SystemFieldRegistry.GetSystemField(fieldKey);
            if (systemField != null)
            {
                Fields.Add(new SystemFieldEdit
                {
                    FieldKey = fieldKey,
                    Label = fieldKey,
                    FieldType = systemField.FieldType,
                    Value = value,
                    IsCustomField = false,
                    IsHidden = systemField.IsHidden,
                    EnableHistory = systemField.EnableHistory,
                    DisplayOrder = systemField.DefaultDisplayOrder,
                    Category = systemField.Category,
                    IsMultiValue = systemField.IsMultiValue,
                });
            }
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

    /// <summary>
    /// Gets all custom fields.
    /// </summary>
    /// <returns>List of custom fields.</returns>
    public List<SystemFieldEdit> GetCustomFields()
    {
        return Fields.Where(f => f.IsCustomField).ToList();
    }

    /// <summary>
    /// Gets all system fields.
    /// </summary>
    /// <returns>List of system fields.</returns>
    public List<SystemFieldEdit> GetSystemFields()
    {
        return Fields.Where(f => !f.IsCustomField).ToList();
    }

    /// <summary>
    /// Adds a new custom field.
    /// </summary>
    /// <param name="label">The field label.</param>
    /// <param name="fieldType">The field type.</param>
    public void AddCustomField(string label, string fieldType)
    {
        var tempId = Guid.NewGuid().ToString();
        Fields.Add(new SystemFieldEdit
        {
            FieldKey = tempId,
            TempId = tempId,
            Label = label,
            FieldType = fieldType,
            Value = string.Empty,
            IsCustomField = true,
            IsHidden = fieldType == "Hidden" || fieldType == "Password",
            EnableHistory = false,
            DisplayOrder = Fields.Count,
            Category = FieldCategory.Custom,
            IsMultiValue = false,
        });
    }

    /// <summary>
    /// Removes a custom field by its field key (TempId or FieldDefinitionId).
    /// </summary>
    /// <param name="fieldKey">The field key to remove.</param>
    public void RemoveCustomField(string fieldKey)
    {
        var field = Fields.FirstOrDefault(f => f.FieldKey == fieldKey && f.IsCustomField);
        if (field != null)
        {
            Fields.Remove(field);
        }
    }

    /// <summary>
    /// Updates the label of a custom field.
    /// </summary>
    /// <param name="fieldKey">The field key.</param>
    /// <param name="newLabel">The new label.</param>
    public void UpdateCustomFieldLabel(string fieldKey, string newLabel)
    {
        var field = Fields.FirstOrDefault(f => f.FieldKey == fieldKey && f.IsCustomField);
        if (field != null)
        {
            field.Label = newLabel;
        }
    }

    /// <summary>
    /// Removes a field by its field key and clears its value.
    /// </summary>
    /// <param name="fieldKey">The field key to remove.</param>
    public void RemoveField(string fieldKey)
    {
        var field = Fields.FirstOrDefault(f => f.FieldKey == fieldKey);
        if (field != null)
        {
            if (field.IsCustomField)
            {
                Fields.Remove(field);
            }
            else
            {
                // For system fields, just clear the value (they can be re-added)
                field.Value = string.Empty;
            }
        }
    }

    /// <summary>
    /// Gets fields by category.
    /// </summary>
    /// <param name="category">The category to filter by.</param>
    /// <returns>List of fields in the specified category.</returns>
    public List<SystemFieldEdit> GetFieldsByCategory(FieldCategory category)
    {
        return Fields
            .Where(f => f.Category == category && !string.IsNullOrEmpty(f.Value))
            .OrderBy(f => f.DisplayOrder)
            .ToList();
    }

    /// <summary>
    /// Clears all field values for a specific item type that don't apply to the new type.
    /// </summary>
    /// <param name="newItemType">The new item type.</param>
    public void ClearFieldsNotApplicableToType(string newItemType)
    {
        foreach (var field in Fields.Where(f => !f.IsCustomField).ToList())
        {
            var systemField = SystemFieldRegistry.GetSystemField(field.FieldKey);
            if (systemField != null && !SystemFieldRegistry.FieldAppliesToType(systemField, newItemType))
            {
                field.Value = string.Empty;
            }
        }
    }

    /// <summary>
    /// Gets the field category from a field key based on its prefix.
    /// </summary>
    private static FieldCategory GetCategoryFromFieldKey(string? fieldKey)
    {
        if (string.IsNullOrEmpty(fieldKey))
        {
            return FieldCategory.Custom;
        }

        if (fieldKey.StartsWith("login."))
        {
            // URL is in Primary category
            if (fieldKey == FieldKey.LoginUrl)
            {
                return FieldCategory.Primary;
            }

            return FieldCategory.Login;
        }

        if (fieldKey.StartsWith("alias."))
        {
            return FieldCategory.Alias;
        }

        if (fieldKey.StartsWith("card."))
        {
            return FieldCategory.Card;
        }

        if (fieldKey.StartsWith("notes."))
        {
            return FieldCategory.Notes;
        }

        if (fieldKey.StartsWith("metadata."))
        {
            return FieldCategory.Metadata;
        }

        return FieldCategory.Custom;
    }
}
