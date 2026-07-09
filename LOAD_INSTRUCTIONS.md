# Load ZENOME — Chrome Extension

Follow these steps to load the ZENOME extension into Google Chrome as an unpacked local extension.

## Step-by-Step Instructions

1. **Open Google Chrome** and navigate to your Extensions page by typing `chrome://extensions` in the address bar.
2. **Enable Developer Mode** by toggling the switch in the top right corner of the Extensions page.
3. **Click "Load unpacked"** which will appear in the top-left toolbar after Developer Mode is enabled.
4. **Select the Project Folder**: Navigate to your `zenome/` project folder (the directory containing `manifest.json`) and click Select/Open.
5. **Verify Installation**: ZENOME should now appear in your list of extensions with its dark blue placeholder icon. Ensure it is toggled "ON".
6. **Open the Dashboard**: Click the ZENOME icon in your Chrome extensions toolbar (or pin it to the toolbar for easy access). This will open the ZENOME Dashboard in a new browser tab.
7. **First-Run Behavior**:
   - The dashboard will load with the 7 model cards displayed on the left.
   - The app will automatically poll your browser cookies to check your login status for each platform.
   - You should see the login status dots refresh to green (logged in) or red (not logged in) on each platform card.

> **Note**: For ZENOME to work, you must be actively logged into the web interfaces of the platforms you wish to orchestrate!
