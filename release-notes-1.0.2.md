## What's Changed

### Bug Fixes
- Fix revealLeaf requires minAppVersion >= 1.15.0
- Fix unsafe assignment with Menu.setSubmenu return type
- Fix loadData type assertion issue, use spread operator pattern
- Fix all floating promises by adding void prefix
- Remove all CSS !important declarations
- Replace document.createElement with Obsidian API
- Fix error type handling with unknown + instanceof type narrowing

### Lint Compliance (obsidianmd review)
- Remove unnecessary `as HTMLInputElement` type assertion
- Add eslint-disable descriptions for setSubmenu() and loadData() unsafe operations
- Remove deprecated `display()` method entirely (the rule `obsidianmd/no-deprecated-display` cannot be disabled)
- Migrate all settings to Obsidian 1.13+ declarative API (`SettingDefinitionItem[]`)
- Move test connection from settings button to command palette
- Move provider preset auto-apply from onChange to command palette
- Extend i18n `t()` function to support `{key}` placeholder substitution

### Distribution
- Add `styles.css` as Release asset (required for plugin styling)
- Add `fleurpilot-1.0.2.zip` bundle containing main.js + styles.css + manifest.json in `fleurpilot/` folder
- Users can now download the zip, extract, and place `fleurpilot/` folder directly under `.obsidian/plugins/`

### Improvements
- Upgrade to version 1.0.2 for obsidianmd official review

**Full Changelog**: https://github.com/gibsonchan-5/fleurpilot/compare/1.0.1...1.0.2