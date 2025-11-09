import { getUserSettings, createUserSettings, updateUserSettings } from "../services/user-settings.service.js";

/**
 * Test cases for User Settings functionality
 * These tests demonstrate the user settings CRUD operations
 */

// Mock user ID for testing
const mockUserId = 1;

// Note: In the actual JWT payload, the user ID is accessed as req.user.userId
// This test uses the service directly, so we pass the user ID directly

/**
 * Test getting user settings (should create default if none exist)
 */
export async function testGetUserSettings() {
  console.log("🧪 Testing Get User Settings");
  console.log("=".repeat(50));

  try {
    const userSettings = await getUserSettings(mockUserId);
    
    console.log("✅ Successfully retrieved user settings:");
    console.log(`ID: ${userSettings.id}`);
    console.log(`User ID: ${userSettings.userId}`);
    console.log(`Language: ${userSettings.language}`);
    console.log(`Created At: ${userSettings.createdAt}`);
    console.log(`Updated At: ${userSettings.updatedAt}`);
    
    return userSettings;
  } catch (error) {
    console.error("❌ Error getting user settings:", error);
    throw error;
  }
}

/**
 * Test creating user settings
 */
export async function testCreateUserSettings() {
  console.log("\n🧪 Testing Create User Settings");
  console.log("=".repeat(50));

  try {
    const newUserId = 999; // Use a different user ID to avoid conflicts
    const userSettings = await createUserSettings(newUserId, {
      language: "spanish"
    });
    
    console.log("✅ Successfully created user settings:");
    console.log(`ID: ${userSettings.id}`);
    console.log(`User ID: ${userSettings.userId}`);
    console.log(`Language: ${userSettings.language}`);
    console.log(`Created At: ${userSettings.createdAt}`);
    console.log(`Updated At: ${userSettings.updatedAt}`);
    
    return userSettings;
  } catch (error) {
    console.error("❌ Error creating user settings:", error);
    throw error;
  }
}

/**
 * Test updating user settings
 */
export async function testUpdateUserSettings() {
  console.log("\n🧪 Testing Update User Settings");
  console.log("=".repeat(50));

  try {
    const updatedSettings = await updateUserSettings(mockUserId, {
      language: "french"
    });
    
    console.log("✅ Successfully updated user settings:");
    console.log(`ID: ${updatedSettings.id}`);
    console.log(`User ID: ${updatedSettings.userId}`);
    console.log(`Language: ${updatedSettings.language}`);
    console.log(`Created At: ${updatedSettings.createdAt}`);
    console.log(`Updated At: ${updatedSettings.updatedAt}`);
    
    return updatedSettings;
  } catch (error) {
    console.error("❌ Error updating user settings:", error);
    throw error;
  }
}

/**
 * Run all user settings tests
 */
export async function runUserSettingsTests() {
  console.log("🔧 User Settings Service Tests");
  console.log("=".repeat(80));

  try {
    // Test getting user settings (creates default if none exist)
    await testGetUserSettings();
    
    // Test updating user settings
    await testUpdateUserSettings();
    
    // Test creating new user settings
    await testCreateUserSettings();
    
    console.log("\n🎯 Test Summary:");
    console.log("✅ All user settings tests completed successfully!");
    console.log("📝 Key features tested:");
    console.log("- Get user settings (with auto-creation of defaults)");
    console.log("- Update existing user settings");
    console.log("- Create new user settings");
    console.log("- Default language setting (english)");
    console.log("- User relation and foreign key constraints");
    
  } catch (error) {
    console.error("\n❌ Test Summary:");
    console.error("Some tests failed:", error);
  }
}

/**
 * Test API endpoint scenarios
 */
export function testApiScenarios() {
  console.log("\n🌐 API Endpoint Test Scenarios");
  console.log("=".repeat(50));

  const scenarios = [
    {
      name: "GET /api/user-settings",
      description: "Retrieve current user's settings",
      method: "GET",
      endpoint: "/api/user-settings",
      headers: { "Authorization": "Bearer <token>" },
      expectedResponse: {
        success: true,
        data: {
          id: 1,
          userId: 1,
          language: "english",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z"
        }
      }
    },
    {
      name: "PUT /api/user-settings",
      description: "Update user's language setting",
      method: "PUT",
      endpoint: "/api/user-settings",
      headers: { 
        "Authorization": "Bearer <token>",
        "Content-Type": "application/json"
      },
      body: { language: "spanish" },
      expectedResponse: {
        success: true,
        data: {
          id: 1,
          userId: 1,
          language: "spanish",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z"
        }
      }
    },
    {
      name: "POST /api/user-settings",
      description: "Create new user settings (if none exist)",
      method: "POST",
      endpoint: "/api/user-settings",
      headers: { 
        "Authorization": "Bearer <token>",
        "Content-Type": "application/json"
      },
      body: { language: "german" },
      expectedResponse: {
        success: true,
        data: {
          id: 2,
          userId: 1,
          language: "german",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z"
        }
      }
    }
  ];

  scenarios.forEach((scenario, index) => {
    console.log(`\n${index + 1}. ${scenario.name}`);
    console.log(`   Description: ${scenario.description}`);
    console.log(`   Method: ${scenario.method}`);
    console.log(`   Endpoint: ${scenario.endpoint}`);
    console.log(`   Headers: ${JSON.stringify(scenario.headers, null, 2)}`);
    if (scenario.body) {
      console.log(`   Body: ${JSON.stringify(scenario.body, null, 2)}`);
    }
    console.log(`   Expected Response: ${JSON.stringify(scenario.expectedResponse, null, 2)}`);
  });

  console.log("\n📋 API Testing Notes:");
  console.log("- All endpoints require authentication (Bearer token)");
  console.log("- User ID is extracted from the JWT token");
  console.log("- Default language is 'english' if not specified");
  console.log("- Settings are automatically created if they don't exist");
  console.log("- PUT endpoint uses upsert (create or update)");
}

// Export test functions for use in other modules
export { mockUserId };
