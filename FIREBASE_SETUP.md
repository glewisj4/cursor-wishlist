# Firebase Setup Guide - Fix Firestore Permissions

## Problem
Your Firebase Auth is working ✅, but Firestore is blocked by security rules ❌

Error: `Missing or insufficient permissions`

## Solution: Update Firestore Security Rules

### Step 1: Open Firebase Console
1. Go to https://console.firebase.google.com/
2. Select your project: **dealhunter-29a11**

### Step 2: Navigate to Firestore Rules
1. Click **Firestore Database** in the left sidebar
2. Click on the **Rules** tab at the top

### Step 3: Replace the Rules
Copy and paste these rules into the editor:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Allow authenticated users (including anonymous) to access wishlist items
    match /artifacts/{appId}/public/data/wishlist_items/{itemId} {
      allow read, write: if request.auth != null;
    }
    
    // Allow access to all documents under public/data
    match /artifacts/{appId}/public/data/{document=**} {
      allow read, write: if request.auth != null;
    }
    
    // Deny everything else
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### Step 4: Publish the Rules
1. Click **Publish** button
2. Wait for confirmation that rules are published

### Step 5: Test
1. Refresh your app at `localhost:5173`
2. Check the browser console - you should see:
   - ✅ Firestore snapshot received: X items
   - No more permission errors!

## Alternative: More Permissive Rules (for testing only)

If you want to test without authentication restrictions (NOT recommended for production):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;  // ⚠️ Allows anyone to read/write - TESTING ONLY!
    }
  }
}
```

⚠️ **Warning**: The alternative rules allow anyone to access your database. Only use for testing!

## What These Rules Do

- **`request.auth != null`**: Allows any authenticated user (including anonymous sign-in)
- **`/artifacts/{appId}/public/data/wishlist_items/{itemId}`**: Matches your app's data path
- **`allow read, write`**: Permits both reading and writing data

## After Updating Rules

Once you publish the rules, your app should:
- ✅ Connect to Firestore successfully
- ✅ Show green "Firebase ✓" status in the header
- ✅ Load and save wishlist items


