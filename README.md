# Password Me

- A simple Chrome extension that generates passwords

## Features:
- Generates passwords using crypto.getRandomValues (No Math.random())
- See gauge on password strength ranging from "very weak" to "very strong"
- Adjust password lengths (8-64 characters)
- Adjust usage of uppercase, lowercase, and symbols
- Convert password to full-width characters (Commonly for use in Japanese websites)
- See the 5 most recent passwords generated in the "History" tab
- No network requests; nothing leaves the browser

## How to build:
1. Install dependencies
```
npm install
```
2. Build extension
```
npm run build
```
3. Display extension
  1. Go to `chrome://extensions/`
  2. Enable "Developer Mode" in the upper right corner
  3. Click "Load Unpacked"
  4. Select the project (Be sure to pin the extension to the toolbar)
  5. Alternatively, on VS Code ver. 1.121 or above, you can click the globe icon in the upper right corner (Make sure you're on the HTML file)
