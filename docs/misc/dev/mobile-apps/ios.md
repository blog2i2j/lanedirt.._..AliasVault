---
layout: default
title: iOS
parent: Mobile Apps
grand_parent: Development
nav_order: 2
---

# iOS
This article covers iOS specific parts of the React Native AliasVault app codebase.

## Unit tests
The iOS project contains unit tests that test the `VaultStoreKit` native Swift implementation. The `VaultStoreKit` logic is responsible for handling vault encryption/decryption, contains the SQLite client and acts as a proxy for all queries made by the React Native and autofill components.

Tests can be ran via XCode test interface.

In order to test this query logic behavior the tests contain a static encrypted client vault (SQLite database) that is provided to the tests.

This static encrypted database can be (re)generated by running the `apps/server/Tests/AliasVault.E2ETests/Tests/Extensions/TestVaultGeneratorTests.cs` in the .NET solution. This E2E test generates a deterministic vault and saves it to a local temporary file. This file can then be used as the input for these unittests.
