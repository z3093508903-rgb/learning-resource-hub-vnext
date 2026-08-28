'use strict';

const {
  Modal = class {},
  Notice = class {},
  setIcon = () => {}
} = require('obsidian');
const {
  findProjectNoteByPath,
  linkProjectNote,
  normalizeNoteFolder,
  projectNoteFolder,
  projectNotes,
  recentProjectNote,
  recentStudy,
  setProjectNoteFolder,
  setRecentProjectNote,
  unlinkProjectNote
} = require('./project-notes.cjs');
const { currentProductSettings } = require('./product-settings.cjs');
const { rememberNoteTarget } = require('./note-target.cjs');

function markdownFiles(plugin) {
  const vault = plugin?.app?.vault;
  const files = typeof vault?.getMarkdownFiles === 'function'
    ? vault.getMarkdownFiles()
    : (vault?.getFiles?.() || []).filter((file) => String(file.extension || '').toLowerCase() === 'md');
  return [...files].sort((a, b) => String(a.basename || a.name || a.path).localeCompare(String(b.basename || b.name || b.path), 'zh-CN'));
}

function noteDisplayName(noteOrFile) {
  const path = String(noteOrFile?.path || '');
  return String(noteOrFile?.basename || noteOrFile?.name || path.split('/').pop() || '未命名笔记').replace(/\.md$/i, '');
}

function resolveNoteFile(plugin, note) {
  if (!note?.path) return null;
  const file = plugin.app.vault.getAbstractFileByPath?.(note.path) || null;
  if (!file || Array.isArray(file.children) || String(file.extension || '').toLowerCase() !== 'md') return null;
  return file;
}

function markdownLeafForFile(plugin, file) {
  const leaves = plugin?.app?.workspace?.getLeavesOfType?.('markdown') || [];
  return leaves.find((leaf) => String(leaf?.view?.file?.path || '') === String(file?.path || '')) || null;
}

async function focusProjectNoteAtEnd(plugin, file) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  const leaf = markdownLeafForFile(plugin, file);
  const editor = leaf?.view?.editor;
  if (!editor || typeof editor.setCursor !== 'function') return false;
  const lastLine = Math.max(0, Number(typeof editor.lastLine === 'function' ? editor.lastLine() : 0));
  const lineText = typeof editor.getLine === 'function' ? String(editor.getLine(lastLine) || '') : '';
  editor.setCursor({ line: lastLine, ch: lineText.length });
  rememberNoteTarget(plugin, editor, file);
  editor.focus?.();
  return true;
}

async function openProjectNote(plugin, note, options = {}) {
  const file = resolveNoteFile(plugin, note);
  if (!file) {
    if (note) note.missingAt ||= new Date().toISOString();
    await plugin.persist?.();
    new Notice('这篇项目笔记已经移动或删除。', 4500);
    return false;
  }
  note.missingAt = '';
  setRecentProjectNote(plugin.state, note.projectId, note.id);
  await plugin.persist?.();
  await plugin.openVaultEntry(file, { newLeaf: Boolean(options.newLeaf) });
  if (options.prepareForStudy && currentProductSettings(plugin).focusStudyNoteAtEnd) {
    await focusProjectNoteAtEnd(plugin, file);
  }
  return true;
}

function safeNewNoteTitle(value) {
  const title = String(value || '').trim().replace(/[\\/:*?"<>|\x00-\x1F]/g, '-').replace(/[. ]+$/g, '');
  if (!title) throw new Error('请输入笔记名称。');
  return title.slice(0, 120);
}

function newNoteParentPath(plugin) {
  try {
    const parent = plugin.app.fileManager?.getNewFileParent?.('');
    const path = String(parent?.path || '').trim().replace(/^\/+|\/+$/g, '');
    return path === '/' ? '' : path;
  } catch {
    return '';
  }
}

function uniqueNewNotePath(plugin, title, folderOverride = undefined) {
  const parent = folderOverride === undefined ? newNoteParentPath(plugin) : normalizeNoteFolder(folderOverride);
  const stem = safeNewNoteTitle(title);
  for (let index = 1; index <= 999; index += 1) {
    const name = index === 1 ? `${stem}.md` : `${stem} ${index}.md`;
    const path = parent ? `${parent}/${name}` : name;
    if (!plugin.app.vault.getAbstractFileByPath?.(path)) return path;
  }
  throw new Error('同名笔记过多，无法创建新笔记。');
}

async function createProjectNote(plugin, projectId, title, options = {}) {
  const projectFolder = projectNoteFolder(plugin.state, projectId);
  const folder = Object.prototype.hasOwnProperty.call(options, 'folder') ? options.folder : (projectFolder || undefined);
  const path = uniqueNewNotePath(plugin, title, folder);
  const heading = safeNewNoteTitle(title);
  const file = await plugin.app.vault.create(path, `# ${heading}\n\n`);
  const result = linkProjectNote(plugin.state, projectId, file.path);
  setRecentProjectNote(plugin.state, projectId, result.note.id);
  await plugin.persist?.();
  await plugin.openVaultEntry(file);
  await plugin.workbenchLeaf?.view?.render?.();
  return result.note;
}

function vaultFolders(plugin) {
  const root = plugin?.app?.vault?.getRoot?.();
  const result = [];
  const visit = (folder) => {
    for (const child of Array.isArray(folder?.children) ? folder.children : []) {
      if (!Array.isArray(child?.children)) continue;
      const path = String(child.path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
      if (path) result.push({ path, name: String(child.name || path.split('/').pop() || path) });
      visit(child);
    }
  };
  visit(root);
  return result.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN', { numeric: true }));
}

class ProjectNoteFolderPickerModal extends Modal {
  constructor(app, plugin, options = {}) {
    super(app);
    this.plugin = plugin;
    this.options = options;
    this.settled = false;
    this.currentPath = normalizeNoteFolder(options.initialPath || '');
  }

  onOpen() {
    this.modalEl.addClass?.('rh-next-modal', 'go-study-project-note-folder-modal');
    this.render();
  }

  choose(path) {
    if (this.settled) return;
    this.settled = true;
    this.options.onChoose?.(path);
    this.close();
  }

  directChildren(all, currentPath) {
    const prefix = currentPath ? `${currentPath}/` : '';
    return all.filter((folder) => {
      if (!folder.path.startsWith(prefix)) return false;
      const rest = folder.path.slice(prefix.length);
      return rest && !rest.includes('/');
    });
  }

  breadcrumbPaths() {
    const parts = this.currentPath.split('/').filter(Boolean);
    const result = [{ label: 'Vault', path: '' }];
    let path = '';
    for (const part of parts) {
      path = path ? `${path}/${part}` : part;
      result.push({ label: part, path });
    }
    return result;
  }

  render() {
    this.contentEl.empty();
    const ui = createPickerShell(this.contentEl, {
      title: this.options.title || '选择笔记文件夹',
      description: this.options.description || '逐层进入 Vault 文件夹，或搜索完整路径；只决定新建笔记保存位置，不会自动收录整个文件夹。',
      searchLabel: '搜索 Vault 文件夹',
      placeholder: '搜索任意层级文件夹…'
    });
    const all = vaultFolders(this.plugin);

    let paint = () => {
      ui.body.empty();
      const query = String(ui.search.value || '').trim().toLocaleLowerCase('zh-CN');
      const section = ui.body.createDiv({ cls: 'go-study-picker-section' });
      if (!query) {
        const crumbs = section.createDiv({ cls: 'go-study-folder-breadcrumbs' });
        for (const [index, crumb] of this.breadcrumbPaths().entries()) {
          if (index) crumbs.createSpan({ text: '›', cls: 'go-study-folder-breadcrumb-sep' });
          const button = crumbs.createEl('button', { cls: 'go-study-folder-breadcrumb' });
          button.textContent = crumb.label;
          button.addEventListener('click', () => {
            this.currentPath = crumb.path;
            paint();
          });
        }
      } else {
        section.createEl('strong', { cls: 'go-study-picker-section-title', text: '搜索结果 · 点击进入文件夹' });
      }

      const list = section.createDiv({ cls: 'rh-next-picker-list' });
      const folders = query
        ? all.filter((item) => item.path.toLocaleLowerCase('zh-CN').includes(query)).slice(0, 160)
        : this.directChildren(all, this.currentPath);

      if (!folders.length) {
        list.createEl('p', {
          cls: 'rh-next-empty-inline',
          text: query ? '没有找到匹配文件夹。' : '当前文件夹没有子文件夹，可以直接选择当前文件夹。'
        });
      }

      for (const folder of folders) {
        const row = list.createEl('button', { cls: 'rh-next-picker-row go-study-folder-row' });
        setIcon(row.createSpan(), 'folder');
        const copy = row.createDiv();
        copy.createEl('strong', { text: folder.name });
        copy.createEl('small', { text: folder.path });
        row.addEventListener('click', () => {
          this.currentPath = folder.path;
          ui.search.value = '';
          paint();
        });
      }
    };

    ui.search.addEventListener('input', paint);

    const system = ui.footer.createEl('button', { cls: 'rh-next-button' });
    system.textContent = '跟随 Obsidian 默认位置';
    system.addEventListener('click', () => this.choose(''));

    const current = ui.footer.createEl('button', { cls: 'rh-next-button is-primary' });
    const updateCurrentButton = () => {
      current.textContent = this.currentPath ? `选择：${this.currentPath}` : '请进入要使用的文件夹';
      current.title = this.currentPath || '项目默认文件夹留空时由 Obsidian 决定';
      current.disabled = !this.currentPath;
    };
    current.addEventListener('click', () => this.choose(this.currentPath));

    const cancel = ui.footer.createEl('button', { cls: 'rh-next-button' });
    cancel.textContent = '取消';
    cancel.addEventListener('click', () => this.close());

    const originalPaint = paint;
    const wrappedPaint = () => { originalPaint(); updateCurrentButton(); };
    ui.search.removeEventListener?.('input', paint);
    ui.search.addEventListener('input', wrappedPaint);
    paint = wrappedPaint;
    paint();
  }

  onClose() {
    this.studyDropEl?.remove?.();
    this.studyDropEl = null;
    this.dragSelection = null;
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.options.onCancel?.();
    }
  }
}

function chooseProjectNoteFolder(plugin, options = {}) {
  return new Promise((resolve) => new ProjectNoteFolderPickerModal(plugin.app, plugin, {
    ...options,
    onChoose: (path) => resolve({ cancelled: false, path }),
    onCancel: () => resolve({ cancelled: true, path: '' })
  }).open());
}

function createActionButton(doc, label, icon, className = '') {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = `rh-next-button ${className}`.trim();
  if (icon) {
    const iconHost = doc.createElement('span');
    iconHost.className = 'rh-next-button-icon';
    try { setIcon(iconHost, icon); } catch {}
    button.appendChild(iconHost);
  }
  const text = doc.createElement('span');
  text.textContent = label;
  button.appendChild(text);
  return button;
}

function rowButton(container, file, secondary, onClick) {
  const row = container.createEl('button', { cls: 'rh-next-picker-row' });
  setIcon(row.createSpan(), 'file-text');
  const body = row.createDiv();
  body.createEl('strong', { text: noteDisplayName(file) });
  body.createEl('small', { text: secondary || file.path });
  row.addEventListener('click', () => void onClick());
  return row;
}

function studyRowButton(container, file, secondary, onClick, options = {}) {
  const row = rowButton(container, file, secondary, onClick);
  row.addClass?.('go-study-study-note-row');
  row.setAttribute?.('draggable', 'true');
  row.addEventListener('dragstart', (event) => {
    options.onDragStart?.({ file, note: options.note || null, row, event });
    try {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(file?.path || ''));
    } catch {}
    row.addClass?.('is-dragging');
  });
  row.addEventListener('dragend', () => {
    row.removeClass?.('is-dragging');
    options.onDragEnd?.();
  });
  return row;
}

function pickerHeading(container, title, description) {
  const heading = container.createDiv({ cls: 'rh-next-modal-heading go-study-picker-heading' });
  const copy = heading.createDiv();
  copy.createEl('h2', { text: title });
  if (description) copy.createEl('p', { text: description });
  return heading;
}

function createPickerShell(contentEl, options = {}) {
  const shell = contentEl.createDiv({ cls: 'go-study-picker-shell' });
  pickerHeading(shell, options.title || '选择', options.description || '');
  const searchWrap = shell.createDiv({ cls: 'go-study-picker-search' });
  if (options.searchLabel) searchWrap.createEl('span', { text: options.searchLabel, cls: 'go-study-picker-label' });
  const search = searchWrap.createEl('input', {
    cls: 'rh-next-input',
    attr: { type: 'search', placeholder: options.placeholder || '搜索…' }
  });
  const body = shell.createDiv({ cls: 'go-study-picker-body' });
  const footer = shell.createDiv({ cls: 'go-study-picker-footer' });
  return { shell, search, body, footer };
}

function installPickerUxStyles(plugin, doc = globalThis.document) {
  if (!doc?.createElement) return null;
  const styleId = `go-study-picker-ux-${String(plugin?.manifest?.id || 'plugin')}`;
  const existing = doc.getElementById?.(styleId);
  if (existing) return existing;
  const style = doc.createElement('style');
  style.id = styleId;
  style.textContent = `
.modal.go-study-project-note-box-modal,
.modal.go-study-study-note-picker-modal,
.modal.go-study-project-note-folder-modal,
.modal.rh-next-vault-picker-modal {
  width: min(760px, 92vw);
  height: min(680px, 84vh);
}
.modal.go-study-project-note-box-modal .modal-content,
.modal.go-study-study-note-picker-modal .modal-content,
.modal.go-study-project-note-folder-modal .modal-content,
.modal.rh-next-vault-picker-modal .modal-content {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.go-study-picker-shell {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 12px;
  height: 100%;
  min-height: 0;
}
.go-study-picker-heading { min-width: 0; }
.go-study-picker-search { display: grid; gap: 6px; }
.go-study-picker-label { color: var(--text-muted); font-size: var(--font-ui-smaller); }
.go-study-picker-body {
  min-height: 0;
  overflow: auto;
  scrollbar-gutter: stable;
  border: 1px solid var(--background-modifier-border);
  border-radius: 12px;
}
.go-study-picker-section + .go-study-picker-section { border-top: 1px solid var(--background-modifier-border); }
.go-study-picker-section-title { display: block; padding: 10px 12px 4px; color: var(--text-muted); font-size: var(--font-ui-smaller); }
.go-study-picker-body .rh-next-picker-list {
  min-height: 0;
  max-height: none;
  margin-top: 0;
  overflow: visible;
  border: 0;
  border-radius: 0;
}
.go-study-picker-footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; min-height: 38px; }
.go-study-picker-footer.is-note-box-footer { display: grid; grid-template-columns: 1fr; align-items: stretch; }
.go-study-note-folder-default { display: flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: var(--font-ui-smaller); }
.go-study-note-folder-default > span { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.go-study-picker-footer .go-study-note-create-row { display: flex; min-width: 0; flex: 1; gap: 8px; }
.go-study-picker-footer .go-study-note-create-row .rh-next-input { min-width: 0; flex: 1; }
.go-study-note-create-location { flex: 0 1 220px; min-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.go-study-picker-body .rh-next-picker-row { width: 100%; box-sizing: border-box; }
.go-study-note-management-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; width: 100%; padding: 10px 12px; border-radius: 0; border: 0; border-bottom: 1px solid var(--background-modifier-border); background: transparent; }
.go-study-note-management-row:last-child { border-bottom: 0; }
.go-study-note-management-row:hover { background: var(--background-modifier-hover); }
.go-study-note-management-row > div:nth-child(2) { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.go-study-note-management-row > div:nth-child(2) strong,
.go-study-note-management-row > div:nth-child(2) small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.go-study-note-management-row .rh-next-resource-actions { justify-self: end; }
.go-study-folder-row { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 10px; text-align: left; }
.go-study-folder-breadcrumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; padding: 9px 12px; border-bottom: 1px solid var(--background-modifier-border); }
.go-study-folder-breadcrumb { border: 0; background: transparent; color: var(--text-accent); padding: 2px 4px; border-radius: 5px; cursor: pointer; }
.go-study-folder-breadcrumb:hover { background: var(--background-modifier-hover); }
.go-study-folder-breadcrumb-sep { color: var(--text-faint); }
.rh-next-vault-picker-modal .rh-next-picker-list {
  min-height: 0;
  max-height: none;
  flex: 1 1 auto;
  overflow: auto;
  scrollbar-gutter: stable;
}
.rh-next-vault-picker-modal .rh-next-vault-path-quick { max-height: 86px; overflow: auto; scrollbar-gutter: stable; }

.modal.go-study-study-note-picker-modal {
  overflow: visible;
}
.go-study-study-note-row[draggable="true"] {
  cursor: grab;
}
.go-study-study-note-row[draggable="true"]:active,
.go-study-study-note-row.is-dragging {
  cursor: grabbing;
}
.go-study-study-note-row.is-dragging {
  opacity: .64;
  transform: scale(.995);
}
.go-study-study-mode-drop-target {
  position: absolute;
  left: calc(100% + 16px);
  top: 52%;
  z-index: 12;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 52px;
  align-items: center;
  gap: 8px;
  width: 142px;
  min-height: 104px;
  padding: 13px 12px;
  box-sizing: border-box;
  border: 1px dashed color-mix(in srgb, var(--interactive-accent) 58%, var(--background-modifier-border));
  border-radius: 12px;
  color: var(--text-muted);
  background:
    radial-gradient(circle at 82% 22%, color-mix(in srgb, var(--interactive-accent) 10%, transparent), transparent 48%),
    var(--background-secondary);
  box-shadow: 0 10px 30px rgba(0,0,0,.18);
  transform: translateY(-50%) rotate(.35deg);
  transition: border-color .14s ease, box-shadow .14s ease, transform .14s ease, background .14s ease;
}
.go-study-study-mode-drop-target.is-active {
  border-color: var(--interactive-accent);
  background:
    radial-gradient(circle at 82% 22%, color-mix(in srgb, var(--interactive-accent) 24%, transparent), transparent 52%),
    color-mix(in srgb, var(--background-secondary) 90%, var(--interactive-accent));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-accent) 18%, transparent), 0 14px 38px rgba(0,0,0,.24);
  transform: translateY(-50%) rotate(0deg) scale(1.035);
}
.go-study-study-mode-drop-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
  line-height: 1.22;
  font-size: 12px;
}
.go-study-study-mode-drop-copy span {
  color: var(--text-muted);
}
.go-study-study-mode-drop-copy strong {
  margin-top: 3px;
  color: var(--text-accent);
  font-size: 13px;
  font-weight: 700;
}
.go-study-study-mode-doodle {
  position: relative;
  width: 48px;
  height: 62px;
  color: color-mix(in srgb, var(--text-normal) 82%, var(--interactive-accent));
  transform: rotate(3deg);
}
.go-study-study-mode-note-icon {
  position: absolute;
  inset: 4px 2px auto auto;
  width: 42px;
  height: 42px;
}
.go-study-study-mode-note-icon svg {
  width: 42px;
  height: 42px;
  stroke-width: 1.45;
}
.go-study-study-mode-hand-icon {
  position: absolute;
  right: 27px;
  bottom: 0;
  width: 22px;
  height: 22px;
  color: var(--interactive-accent);
  transform: rotate(-18deg);
}
.go-study-study-mode-hand-icon svg {
  width: 22px;
  height: 22px;
  stroke-width: 1.55;
}
@media (max-width: 1050px) {
  .go-study-study-mode-drop-target {
    left: auto;
    right: 14px;
    top: auto;
    bottom: 56px;
    width: 126px;
    min-height: 92px;
    transform: none;
    opacity: .96;
  }
  .go-study-study-mode-drop-target.is-active { transform: scale(1.03); }
}
@media (max-width: 620px) {
  .modal.go-study-project-note-box-modal,
  .modal.go-study-study-note-picker-modal,
  .modal.go-study-project-note-folder-modal,
  .modal.rh-next-vault-picker-modal { width: 96vw; height: min(720px, 90vh); }
  .go-study-picker-footer { align-items: stretch; flex-direction: column; }
  .go-study-picker-footer > .rh-next-button { width: 100%; }
}
`;
  doc.head?.appendChild?.(style);
  plugin?.register?.(() => style.remove?.());
  return style;
}

class ProjectNoteBoxModal extends Modal {
  constructor(app, plugin, projectId) {
    super(app);
    this.plugin = plugin;
    this.projectId = projectId;
    this.query = '';
    this.bodyEl = null;
    this.createFolderOverride = null;
  }

  onOpen() {
    this.modalEl.addClass?.('rh-next-modal', 'go-study-project-note-box-modal');
    this.render();
  }

  render() {
    const project = this.plugin.state.projects?.[this.projectId];
    this.contentEl.empty();
    const ui = createPickerShell(this.contentEl, {
      title: `${project?.title || '项目'} · 笔记`,
      description: '这里只保存项目与 Markdown 的关联，不会移动或复制原文件。',
      searchLabel: '关联已有笔记',
      placeholder: '搜索整个 Vault 的 Markdown…'
    });
    this.bodyEl = ui.body;
    this.createStudyModeDropTarget();
    ui.search.value = this.query;
    ui.search.addEventListener('input', () => {
      this.query = ui.search.value;
      this.renderBody();
    });

    ui.footer.addClass?.('is-note-box-footer');
    const projectFolder = projectNoteFolder(this.plugin.state, this.projectId);
    const folderDefault = ui.footer.createDiv({ cls: 'go-study-note-folder-default' });
    const folderText = folderDefault.createSpan({ text: projectFolder ? `项目笔记文件夹：${projectFolder}` : '项目笔记文件夹：未设置 · 新建时跟随 Obsidian' });
    folderText.title = projectFolder || '跟随 Obsidian 默认新建位置';
    const folderButton = folderDefault.createEl('button', { cls: 'rh-next-button' });
    folderButton.textContent = projectFolder ? '更改项目默认' : '设置项目默认';
    folderButton.addEventListener('click', async () => {
      const choice = await chooseProjectNoteFolder(this.plugin, { title: '设置项目笔记文件夹', initialPath: projectNoteFolder(this.plugin.state, this.projectId) });
      if (!choice || choice.cancelled) return;
      setProjectNoteFolder(this.plugin.state, this.projectId, choice.path);
      await this.plugin.persist();
      await this.plugin.workbenchLeaf?.view?.render?.();
      this.createFolderOverride = null;
      this.render();
    });

    const createRow = ui.footer.createDiv({ cls: 'go-study-note-create-row' });
    const name = createRow.createEl('input', { cls: 'rh-next-input', attr: { placeholder: '新建项目笔记，例如：高等数学课堂笔记' } });
    const location = createRow.createEl('button', { cls: 'rh-next-button go-study-note-create-location' });
    const refreshLocationLabel = () => {
      const effective = this.createFolderOverride === null ? projectNoteFolder(this.plugin.state, this.projectId) : this.createFolderOverride;
      location.textContent = effective ? `位置：${effective}` : '位置：跟随 Obsidian';
      location.title = this.createFolderOverride === null ? '默认使用项目设置；点击可仅修改本次位置' : '仅修改本次新建位置';
    };
    location.addEventListener('click', async () => {
      const choice = await chooseProjectNoteFolder(this.plugin, { title: '选择本次新建位置', initialPath: this.createFolderOverride === null ? projectNoteFolder(this.plugin.state, this.projectId) : this.createFolderOverride });
      if (!choice || choice.cancelled) return;
      this.createFolderOverride = choice.path;
      refreshLocationLabel();
    });
    refreshLocationLabel();
    const create = createRow.createEl('button', { cls: 'rh-next-button is-primary' });
    create.textContent = '新建并打开';
    const submit = async () => {
      try {
        create.disabled = true;
        const options = this.createFolderOverride === null ? {} : { folder: this.createFolderOverride };
        await createProjectNote(this.plugin, this.projectId, name.value, options);
        this.close();
      } catch (error) {
        new Notice(`创建笔记失败：${error instanceof Error ? error.message : String(error)}`, 5000);
        create.disabled = false;
      }
    };
    create.addEventListener('click', () => void submit());
    name.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); void submit(); } });
    this.renderBody();
  }

  renderBody() {
    const container = this.bodyEl;
    if (!container) return;
    container.empty();
    const query = String(this.query || '').trim().toLocaleLowerCase('zh-CN');
    if (query) return this.renderSearchResults(container, query);

    const recent = recentProjectNote(this.plugin.state, this.projectId);
    const notes = projectNotes(this.plugin.state, this.projectId);
    const section = container.createDiv({ cls: 'go-study-picker-section' });
    section.createEl('strong', { cls: 'go-study-picker-section-title', text: `项目笔记 · ${notes.length}` });
    const list = section.createDiv({ cls: 'rh-next-picker-list' });
    if (!notes.length) {
      list.createEl('p', { cls: 'rh-next-empty-inline', text: '还没有项目笔记。直接在上方搜索 Vault，或在下方新建项目笔记。' });
      return;
    }
    for (const note of notes) {
      const file = resolveNoteFile(this.plugin, note);
      const row = list.createDiv({ cls: `rh-next-picker-row go-study-note-management-row ${note.missingAt || !file ? 'is-missing' : ''}`.trim() });
      setIcon(row.createSpan(), file ? 'file-text' : 'file-warning');
      const body = row.createDiv();
      const name = body.createEl('strong', { text: noteDisplayName(file || note) });
      if (recent?.id === note.id) name.appendText?.(' · 最近使用');
      body.createEl('small', { text: file ? note.path : `${note.path} · 已丢失` });
      const actions = row.createDiv({ cls: 'rh-next-resource-actions' });
      if (file) {
        const open = actions.createEl('button', { cls: 'rh-next-icon-button', attr: { 'aria-label': '打开笔记', title: '打开笔记' } });
        setIcon(open, 'external-link');
        open.addEventListener('click', (event) => { event.stopPropagation(); void openProjectNote(this.plugin, note).then(() => this.close()); });
      }
      const remove = actions.createEl('button', { cls: 'rh-next-icon-button', attr: { 'aria-label': '从项目移除', title: '从项目移除；不会删除文件' } });
      setIcon(remove, 'unlink');
      remove.addEventListener('click', async (event) => {
        event.stopPropagation();
        unlinkProjectNote(this.plugin.state, this.projectId, note.id);
        await this.plugin.persist();
        await this.plugin.workbenchLeaf?.view?.render?.();
        this.renderBody();
      });
      if (file) row.addEventListener('click', () => void openProjectNote(this.plugin, note).then(() => this.close()));
    }
  }

  renderSearchResults(container, query = String(this.query || '').trim().toLocaleLowerCase('zh-CN')) {
    const section = container.createDiv({ cls: 'go-study-picker-section' });
    section.createEl('strong', { cls: 'go-study-picker-section-title', text: '搜索 Vault' });
    const list = section.createDiv({ cls: 'rh-next-picker-list go-study-note-search-results' });
    const linked = new Set(projectNotes(this.plugin.state, this.projectId).map((note) => note.path.toLowerCase()));
    const matches = markdownFiles(this.plugin)
      .filter((file) => `${file.basename || ''}\n${file.path}`.toLocaleLowerCase('zh-CN').includes(query))
      .slice(0, 80);
    if (!matches.length) {
      list.createEl('p', { cls: 'rh-next-empty-inline', text: '没有找到匹配的 Markdown。' });
      return;
    }
    for (const file of matches) {
      const already = linked.has(file.path.toLowerCase());
      rowButton(list, file, already ? `${file.path} · 已在笔记盒` : `${file.path} · 点击关联`, async () => {
        const result = linkProjectNote(this.plugin.state, this.projectId, file.path);
        setRecentProjectNote(this.plugin.state, this.projectId, result.note.id);
        await this.plugin.persist();
        await this.plugin.openVaultEntry(file);
        await this.plugin.workbenchLeaf?.view?.render?.();
        this.close();
      });
    }
  }

  onClose() { this.contentEl.empty(); }
}

class StudyNotePickerModal extends Modal {
  constructor(app, plugin, projectId, resource, resolve) {
    super(app);
    this.plugin = plugin;
    this.projectId = projectId;
    this.resource = resource;
    this.resolveChoice = resolve;
    this.query = '';
    this.settled = false;
    this.bodyEl = null;
    this.dragSelection = null;
    this.studyDropEl = null;
  }

  onOpen() {
    this.modalEl.addClass?.('rh-next-modal', 'go-study-study-note-picker-modal');
    this.render();
  }

  finish(choice) {
    if (this.settled) return;
    this.settled = true;
    this.resolveChoice(choice);
    this.close();
  }

  async resolveSelectedNote(note, file = null) {
    let selected = note;
    if (!selected && file) selected = linkProjectNote(this.plugin.state, this.projectId, file.path).note;
    if (!selected) return null;
    setRecentProjectNote(this.plugin.state, this.projectId, selected.id);
    await this.plugin.persist?.();
    return selected;
  }

  async chooseNote(note, file = null) {
    try {
      const selected = await this.resolveSelectedNote(note, file);
      if (!selected) return this.finish({ cancelled: false, note: null, studyMode: false });
      const opened = await openProjectNote(this.plugin, selected, { prepareForStudy: true });
      if (!opened) return;
      await this.plugin.workbenchLeaf?.view?.render?.();
      this.finish({ cancelled: false, note: selected, studyMode: false });
    } catch (error) {
      new Notice(`打开学习笔记失败：${error instanceof Error ? error.message : String(error)}`, 5000);
    }
  }

  async chooseStudyMode(note, file = null) {
    try {
      const selected = await this.resolveSelectedNote(note, file);
      if (!selected) return;
      await this.plugin.workbenchLeaf?.view?.render?.();
      this.finish({ cancelled: false, note: selected, studyMode: true });
    } catch (error) {
      new Notice(`进入学习模式失败：${error instanceof Error ? error.message : String(error)}`, 5000);
    }
  }

  createStudyModeDropTarget() {
    this.studyDropEl?.remove?.();
    const target = this.modalEl.createDiv({ cls: 'go-study-study-mode-drop-target' });
    target.setAttribute?.('aria-label', '拖入笔记，进入学习模式');

    const copy = target.createDiv({ cls: 'go-study-study-mode-drop-copy' });
    copy.createSpan({ text: '拖入' });
    copy.createSpan({ text: '右侧小窗' });
    copy.createEl('strong', { text: '学习模式' });

    const doodle = target.createDiv({ cls: 'go-study-study-mode-doodle' });
    const noteIcon = doodle.createSpan({ cls: 'go-study-study-mode-note-icon' });
    const handIcon = doodle.createSpan({ cls: 'go-study-study-mode-hand-icon' });
    try { setIcon(noteIcon, 'notebook-pen'); } catch {}
    try { setIcon(handIcon, 'mouse-pointer-2'); } catch {}

    const activate = (event) => {
      event.preventDefault();
      target.addClass?.('is-active');
      try { event.dataTransfer.dropEffect = 'move'; } catch {}
    };
    target.addEventListener('dragenter', activate);
    target.addEventListener('dragover', activate);
    target.addEventListener('dragleave', (event) => {
      if (!target.contains?.(event.relatedTarget)) target.removeClass?.('is-active');
    });
    target.addEventListener('drop', (event) => {
      event.preventDefault();
      target.removeClass?.('is-active');
      const selection = this.dragSelection;
      this.dragSelection = null;
      if (selection?.file) void this.chooseStudyMode(selection.note, selection.file);
    });
    this.studyDropEl = target;
    return target;
  }

  render() {
    const project = this.plugin.state.projects?.[this.projectId];
    this.contentEl.empty();
    const ui = createPickerShell(this.contentEl, {
      title: '开始学习',
      description: `${project?.title || '项目'} · ${this.resource?.title || '学习资源'} · 选择这次学习要带上的笔记，不会建立永久的资源绑定。`,
      searchLabel: '搜索 Vault',
      placeholder: '搜索 Markdown…'
    });
    this.bodyEl = ui.body;
    ui.search.value = this.query;
    ui.search.addEventListener('input', () => {
      this.query = ui.search.value;
      this.renderBody();
    });

    const manage = ui.footer.createEl('button', { cls: 'rh-next-button' }); manage.textContent = '管理笔记盒';
    manage.addEventListener('click', () => { new ProjectNoteBoxModal(this.app, this.plugin, this.projectId).open(); });
    const none = ui.footer.createEl('button', { cls: 'rh-next-button' }); none.textContent = '这次不使用笔记';
    none.addEventListener('click', () => this.finish({ cancelled: false, note: null }));
    const cancel = ui.footer.createEl('button', { cls: 'rh-next-button' }); cancel.textContent = '取消';
    cancel.addEventListener('click', () => this.finish({ cancelled: true, note: null }));
    this.renderBody();
  }

  renderBody() {
    const container = this.bodyEl;
    if (!container) return;
    container.empty();
    const query = String(this.query || '').trim().toLocaleLowerCase('zh-CN');
    if (query) return this.renderSearchResults(container, query);

    const recent = recentProjectNote(this.plugin.state, this.projectId);
    const notes = projectNotes(this.plugin.state, this.projectId).filter((note) => !note.missingAt && resolveNoteFile(this.plugin, note));
    if (recent && !recent.missingAt) {
      const recentSection = container.createDiv({ cls: 'go-study-picker-section' });
      recentSection.createEl('strong', { cls: 'go-study-picker-section-title', text: '最近使用' });
      const list = recentSection.createDiv({ cls: 'rh-next-picker-list' });
      const file = resolveNoteFile(this.plugin, recent);
      if (file) studyRowButton(list, file, `${recent.path} · 上次使用`, () => this.chooseNote(recent), {
        note: recent,
        onDragStart: (selection) => { this.dragSelection = selection; },
        onDragEnd: () => { this.studyDropEl?.removeClass?.('is-active'); }
      });
    }

    const projectSection = container.createDiv({ cls: 'go-study-picker-section' });
    projectSection.createEl('strong', { cls: 'go-study-picker-section-title', text: '项目笔记盒' });
    const list = projectSection.createDiv({ cls: 'rh-next-picker-list' });
    const visible = notes.filter((note) => note.id !== recent?.id);
    if (!visible.length) list.createEl('p', { cls: 'rh-next-empty-inline', text: recent ? '没有其他项目笔记。输入上方搜索框可从整个 Vault 选择。' : '笔记盒还是空的。输入上方搜索框可从整个 Vault 选择。' });
    for (const note of visible) {
      const file = resolveNoteFile(this.plugin, note);
      if (file) studyRowButton(list, file, note.path, () => this.chooseNote(note), {
        note,
        onDragStart: (selection) => { this.dragSelection = selection; },
        onDragEnd: () => { this.studyDropEl?.removeClass?.('is-active'); }
      });
    }
  }

  renderSearchResults(container, query) {
    const section = container.createDiv({ cls: 'go-study-picker-section' });
    section.createEl('strong', { cls: 'go-study-picker-section-title', text: '搜索 Vault' });
    const results = section.createDiv({ cls: 'rh-next-picker-list' });
    const matches = markdownFiles(this.plugin)
      .filter((file) => `${file.basename || ''}\n${file.path}`.toLocaleLowerCase('zh-CN').includes(query))
      .slice(0, 80);
    if (!matches.length) {
      results.createEl('p', { cls: 'rh-next-empty-inline', text: '没有找到匹配笔记。' });
      return;
    }
    for (const file of matches) {
      const linked = findProjectNoteByPath(this.plugin.state, this.projectId, file.path);
      studyRowButton(results, file, linked ? `${file.path} · 已在笔记盒` : `${file.path} · 选择后加入笔记盒`, () => this.chooseNote(linked, file), {
        note: linked,
        onDragStart: (selection) => { this.dragSelection = selection; },
        onDragEnd: () => { this.studyDropEl?.removeClass?.('is-active'); }
      });
    }
  }

  onClose() {
    this.contentEl.empty();
    if (!this.settled) {
      this.settled = true;
      this.resolveChoice({ cancelled: true, note: null });
    }
  }
}

function chooseStudyNote(plugin, projectId, resource) {
  return new Promise((resolve) => new StudyNotePickerModal(plugin.app, plugin, projectId, resource, resolve).open());
}

function installProjectNoteEntryPoints(plugin, doc = globalThis.document) {
  if (!doc?.querySelectorAll || !plugin?.manifest?.id) return null;
  installPickerUxStyles(plugin, doc);
  const selector = `.workspace-leaf-content[data-type="${plugin.manifest.id}-workbench"]`;
  const inject = () => {
    const projectId = String(plugin.state?.uiState?.currentProjectId || '');
    if (plugin.state?.uiState?.route !== 'project' || !plugin.state?.projects?.[projectId]) return;
    const study = recentStudy(plugin.state, projectId);
    const noteCount = projectNotes(plugin.state, projectId).length;
    for (const leaf of doc.querySelectorAll(selector)) {
      const actions = leaf.querySelector?.('.rh-next-project-heading .rh-next-section-actions');
      if (!actions || actions.querySelector?.('[data-go-study-project-notes]')) continue;
      const noteButton = createActionButton(doc, noteCount ? `笔记 ${noteCount}` : '笔记', 'notebook-tabs');
      noteButton.setAttribute('data-go-study-project-notes', 'true');
      noteButton.addEventListener('click', () => new ProjectNoteBoxModal(plugin.app, plugin, projectId).open());
      actions.appendChild(noteButton);
      if (study) {
        const continueButton = createActionButton(doc, '继续学习', 'play', 'is-primary');
        continueButton.setAttribute('data-go-study-continue-study', 'true');
        continueButton.title = `${study.resource?.title || '上次资源'}${study.note ? ` + ${noteDisplayName(study.note)}` : ''}`;
        continueButton.addEventListener('click', () => void plugin.continueRecentProjectStudy?.(projectId));
        actions.insertBefore(continueButton, noteButton);
      }
    }
  };
  inject();
  const Observer = doc.defaultView?.MutationObserver || globalThis.MutationObserver;
  const observer = Observer ? new Observer(inject) : null;
  observer?.observe?.(doc.body, { childList: true, subtree: true });
  plugin.register?.(() => observer?.disconnect?.());
  return { inject, observer };
}

module.exports = {
  ProjectNoteBoxModal,
  ProjectNoteFolderPickerModal,
  StudyNotePickerModal,
  chooseProjectNoteFolder,
  chooseStudyNote,
  createPickerShell,
  createProjectNote,
  installPickerUxStyles,
  focusProjectNoteAtEnd,
  installProjectNoteEntryPoints,
  markdownFiles,
  newNoteParentPath,
  noteDisplayName,
  openProjectNote,
  resolveNoteFile,
  safeNewNoteTitle,
  uniqueNewNotePath,
  vaultFolders
};
