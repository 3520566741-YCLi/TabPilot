# Installing TabPilot on Windows

## Which file to download
- Most PCs: `TabPilot-<version>-windows-x64.exe`
- Snapdragon laptops: `TabPilot-<version>-windows-arm64.exe`

How to tell: open Settings → System → About and look at "Processor". If it says Snapdragon, pick the windows-arm64 file; for anything else (Intel, AMD, …) pick the windows-x64 file.

## Install (Windows will show a warning; that's expected)
The installer isn't signed with a paid certificate, so SmartScreen shows "Windows protected your PC":
1. Double-click the installer.
2. Click **More info**, then **Run anyway**.
3. Choose an install location (the default is fine) and click through. A TabPilot icon appears on your desktop.
If your antivirus blocks it, allow/trust the file. It is not malware.

## First use
1. Choose a model provider and enter your own API key. TabPilot tests the key, lists the models you can use and recommends one. The key is encrypted with your Windows account and stays on your PC (data folder: `%APPDATA%\TabPilot`).
2. The right side is Tableau Public. To save your work you need a Tableau Public account (sign in yourself on the right; TabPilot never types passwords for you). You can build charts without signing in.
3. Type what you want on the left, for example "Create a new Web Authoring workbook and upload 'Sales data.xlsx' from my Desktop", then "What charts can you make with my data?".
4. To switch the interface and TabPilot's replies between English and Chinese, open Settings → Language.

## Voice input
- Click the microphone, speak, then click again to finish. It uses Windows' built-in on-device recognizer, no internet needed.
- It needs the Simplified Chinese speech pack (Settings → Time & language → Language & region → Chinese (Simplified) → Language options → Speech) and microphone access for desktop apps (Settings → Privacy & security → Microphone).
- If recognition is poor or the speech pack is missing, click the input box and press **Win+H** to use Windows dictation instead.

## Updating
Just run the newer installer (the version number is in the file name). You don't need to uninstall first: it replaces the old version in the same folder and keeps your API keys, sign-ins and settings. If "Installed apps" ever lists two TabPilot entries, uninstall the older one; uninstalling does not delete your data.

## Uninstalling
Settings → Apps → Installed apps → TabPilot → Uninstall.

## FAQ
- **Where are exported files?** In the "TabPilot" folder inside Downloads.
- **Saving or publishing to Tableau Public**: the content becomes public, so TabPilot always asks first and only clicks after you agree.
- **Shortcuts** use Ctrl (Ctrl+C / V / X / A / Z).

## Known limitations
This Windows build was cross-compiled on a Mac and has not been tested on a real Windows PC yet. If something misbehaves, please send a screenshot.
