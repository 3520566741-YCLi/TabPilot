# Installing TabPilot on a Mac

## Which file to download
- Apple silicon Mac (M1/M2/M3/M4…): `TabPilot-<version>-mac-apple-silicon.dmg`
- Intel Mac: `TabPilot-<version>-mac-intel.dmg`
- Not sure? Apple menu > About This Mac: “Chip: Apple M…” means M chip, “Intel” means Intel.

Not sure? Apple menu → About This Mac, and look at "Chip".

## Install
1. Double-click the .dmg and drag TabPilot into Applications.
2. The first time you open it, macOS may say it can't verify the developer. That's because the app isn't signed with a paid Apple certificate; it isn't malware.
   - In Applications, **right-click** TabPilot → Open → Open.
   - If it still won't open: System Settings → Privacy & Security, scroll down to TabPilot and click "Open Anyway".
3. After that, just double-click it.
4. When TabPilot first reads your saved API key, macOS asks whether TabPilot may use "TabPilot Safe Storage" in your keychain. Click "Always Allow" (macOS asks for your Mac password; that prompt comes from macOS, and the password never goes through TabPilot). This happens again once after each update.

## First use
1. Choose a model provider and enter your own API key. TabPilot tests the key, lists the models you can use and recommends one. The key is encrypted with the macOS keychain and stays on your Mac.
2. The right side is Tableau Public. To save your work you need a Tableau Public account (sign in yourself on the right; TabPilot never types passwords for you). You can build charts without signing in.
3. Type what you want on the left, for example "Create a new Web Authoring workbook and upload 'Sales data.xlsx' from my Desktop", then "What charts can you make with my data?".
4. To switch the interface and TabPilot's replies to English or Chinese, open Settings → Language.

## FAQ
- **Voice input does nothing**: the first time, macOS asks for Microphone and Speech Recognition access; allow both. If you clicked Don't Allow earlier, turn TabPilot on under System Settings → Privacy & Security → Microphone / Speech Recognition.
- **Where are exported files?** In the "TabPilot" folder inside Downloads.
- **Saving or publishing to Tableau Public**: the content becomes public, so TabPilot always asks first and only clicks after you agree.
