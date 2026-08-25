# Go Study Preview beta.10 settings fix

Beta.9 bundled the expanded settings model but rendered it through a DOM-injection helper that searched for a heading the legacy one-option setting tab did not create. As a result, real Obsidian continued to show only the old single setting.

Beta.10 removes settings-page DOM injection and replaces the legacy setting tab registration with a real `GoStudySettingsTab extends PluginSettingTab`.

Acceptance must confirm the native page exposes:

- Workbench: interface tips, auto-collapse left sidebar
- Video-note enhancement: master toggle, status, Alt+1..Alt+4 bindings, resume-after-save/cancel, success feedback, capture folder, reset defaults, screenshot test
- Data & safety: backup retention and current version

The workbench status dot and project context-menu course management remain lightweight UI enhancements and are independent of the settings-page implementation.
