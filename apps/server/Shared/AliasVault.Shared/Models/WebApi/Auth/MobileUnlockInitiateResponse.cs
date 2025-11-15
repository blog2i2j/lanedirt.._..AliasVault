//-----------------------------------------------------------------------
// <copyright file="MobileUnlockInitiateResponse.cs" company="aliasvault">
// Copyright (c) aliasvault. All rights reserved.
// Licensed under the AGPLv3 license. See LICENSE.md file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

namespace AliasVault.Shared.Models.WebApi.Auth;

/// <summary>
/// Response model for mobile unlock initiate request.
/// </summary>
/// <param name="RequestId">The unique identifier for this unlock request.</param>
public record MobileUnlockInitiateResponse(string RequestId);
