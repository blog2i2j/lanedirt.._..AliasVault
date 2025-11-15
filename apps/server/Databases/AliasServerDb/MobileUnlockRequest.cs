//-----------------------------------------------------------------------
// <copyright file="MobileUnlockRequest.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasServerDb;

/// <summary>
/// Mobile unlock request entity for storing temporary unlock requests.
/// </summary>
public class MobileUnlockRequest
{
    /// <summary>
    /// Gets or sets the unique identifier for this unlock request.
    /// </summary>
    public string Id { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the public key from the client (base64 encoded).
    /// </summary>
    public string ClientPublicKey { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the encrypted decryption key from the mobile app (base64 encoded).
    /// Will be null until mobile app responds.
    /// </summary>
    public string? EncryptedDecryptionKey { get; set; }

    /// <summary>
    /// Gets or sets the username provided by the mobile app.
    /// Will be null until mobile app responds.
    /// </summary>
    public string? Username { get; set; }

    /// <summary>
    /// Gets or sets the salt for the user.
    /// Will be populated when mobile app provides the username.
    /// </summary>
    public string? Salt { get; set; }

    /// <summary>
    /// Gets or sets the encryption type for the user.
    /// Will be populated when mobile app provides the username.
    /// </summary>
    public string? EncryptionType { get; set; }

    /// <summary>
    /// Gets or sets the encryption settings for the user.
    /// Will be populated when mobile app provides the username.
    /// </summary>
    public string? EncryptionSettings { get; set; }

    /// <summary>
    /// Gets or sets a value indicating whether this request has been fulfilled.
    /// </summary>
    public bool Fulfilled { get; set; }

    /// <summary>
    /// Gets or sets the created timestamp.
    /// </summary>
    public DateTime CreatedAt { get; set; }

    /// <summary>
    /// Gets or sets the fulfilled timestamp (when mobile app submitted the response).
    /// </summary>
    public DateTime? FulfilledAt { get; set; }

    /// <summary>
    /// Gets or sets the retrieved timestamp (when client successfully retrieved and decrypted).
    /// </summary>
    public DateTime? RetrievedAt { get; set; }

    /// <summary>
    /// Gets or sets the IP address of the client that initiated the request.
    /// </summary>
    public string? ClientIpAddress { get; set; }

    /// <summary>
    /// Gets or sets the IP address of the mobile device that fulfilled the request.
    /// </summary>
    public string? MobileIpAddress { get; set; }
}
