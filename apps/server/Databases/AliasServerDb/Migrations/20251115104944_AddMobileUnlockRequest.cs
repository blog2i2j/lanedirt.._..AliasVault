using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AliasServerDb.Migrations
{
    /// <inheritdoc />
    public partial class AddMobileUnlockRequest : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MobileUnlockRequests",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    ClientPublicKey = table.Column<string>(type: "text", nullable: false),
                    EncryptedDecryptionKey = table.Column<string>(type: "text", nullable: true),
                    Username = table.Column<string>(type: "text", nullable: true),
                    Salt = table.Column<string>(type: "text", nullable: true),
                    EncryptionType = table.Column<string>(type: "text", nullable: true),
                    EncryptionSettings = table.Column<string>(type: "text", nullable: true),
                    Fulfilled = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    FulfilledAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RetrievedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ClientIpAddress = table.Column<string>(type: "text", nullable: true),
                    MobileIpAddress = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MobileUnlockRequests", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MobileUnlockRequests");
        }
    }
}
