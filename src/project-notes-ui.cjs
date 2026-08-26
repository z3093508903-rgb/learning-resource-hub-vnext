'use strict';

const {
  Modal = class {},
  Notice = class {},
  setIcon = () => {}
} = require('obsidian');
const {
  findProjectNoteByPath,
  linkProjectNote,
  projectNotes,
  recentProjectNote,
  recentStudy,
  setRecentProjectNote,
  unlinkProjectNote
} = require('./project-notes.cjs');

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

function uniqueNewNotePath(plugin, title) {
  const parent = newNoteParentPath(plugin);
  const stem = safeNewNoteTitle(title);
  for (let index = 1; index <= 999; index += 1) {
    const name = index === 1 ? `${stem}.md` : `${stem} ${index}.md`;
    const path = parent ? `${parent}/${name}` : name;
    if (!plugin.app.vault.getAbstractFileByPath?.(path)) return path;
  }
  throw new Error('同名笔记过多，无法创建新笔记。');
}

async function createProjectNote(plugin, projectId, title) {
  const path = uniqueNewNotePath(plugin, title);
  const heading = safeNewNoteTitle(title);
  const file = await plugin.app.vault.create(path, `# ${heading}\n\n`);
  const result = linkProjectNote(plugin.state, projectId, file.path);
  setRecentProjectNote(plugin.state, projectId, result.note.id);
  await plugin.persist?.();
  await plugin.openVaultEntry(file);
  await plugin.workbenchLeaf?.view?.render?.();
  return result.note;
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
.modal.rh-next-vault-picker-modal {
  width: min(760px, 92vw);
  height: min(680px, 84vh);
}
.modal.go-study-project-note-box-modal .modal-content,
.modal.go-study-study-note-picker-modal .modal-content,
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
.go-study-picker-footer .go-study-note-create-row { display: flex; min-width: 0; flex: 1; gap: 8px; }
.go-study-picker-footer .go-study-note-create-row .rh-next-input { min-width: 0; flex: 1; }
.rh-next-vault-picker-modal .rh-next-picker-list {
  min-height: 0;
  max-height: none;
  flex: 1 1 auto;
  overflow: auto;
  scrollbar-gutter: stable;
}
.rh-next-vault-picker-modal .rh-next-vault-path-quick { max-height: 86px; overflow: auto; scrollbar-gutter: stable; }
@media (max-width: 620px) {
  .modal.go-study-project-note-box-modal,
  .modal.go-study-study-note-picker-modal,
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
    ui.search.value = this.query;
    ui.search.addEventListener('input', () => {
      this.query = ui.search.value;
      this.renderBody();
    });

    const createRow = ui.footer.createDiv({ cls: 'go-study-note-create-row' });
    const name = createRow.createEl('input', { cls: 'rh-next-input', attr: { placeholder: '新建项目笔记，例如：高等数学课堂笔记' } });
    const create = createRow.createEl('button', { cls: 'rh-next-button is-primary' });
    create.textContent = '新建并打开';
    const submit = async () => {
      try {
        create.disabled = true;
        await createProjectNote(this.plugin, this.projectId, name.value);
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

  async chooseNote(note, file = null) {
    try {
      let selected = note;
      if (!selected && file) selected = linkProjectNote(this.plugin.state, this.projectId, file.path).note;
      if (!selected) return this.finish({ cancelled: false, note: null });
      const opened = await openProjectNote(this.plugin, selected);
      if (!opened) return;
      await this.plugin.workbenchLeaf?.view?.render?.();
      this.finish({ cancelled: false, note: selected });
    } catch (error) {
      new Notice(`打开学习笔记失败：${error instanceof Error ? error.message : String(error)}`, 5000);
    }
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
      if (file) rowButton(list, file, `${recent.path} · 上次使用`, () => this.chooseNote(recent));
    }

    const projectSection = container.createDiv({ cls: 'go-study-picker-section' });
    projectSection.createEl('strong', { cls: 'go-study-picker-section-title', text: '项目笔记盒' });
    const list = projectSection.createDiv({ cls: 'rh-next-picker-list' });
    const visible = notes.filter((note) => note.id !== recent?.id);
    if (!visible.length) list.createEl('p', { cls: 'rh-next-empty-inline', text: recent ? '没有其他项目笔记。输入上方搜索框可从整个 Vault 选择。' : '笔记盒还是空的。输入上方搜索框可从整个 Vault 选择。' });
    for (const note of visible) {
      const file = resolveNoteFile(this.plugin, note);
      if (file) rowButton(list, file, note.path, () => this.chooseNote(note));
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
      rowButton(results, file, linked ? `${file.path} · 已在笔记盒` : `${file.path} · 选择后加入笔记盒`, () => this.chooseNote(linked, file));
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
  StudyNotePickerModal,
  chooseStudyNote,
  createPickerShell,
  createProjectNote,
  installPickerUxStyles,
  installProjectNoteEntryPoints,
  markdownFiles,
  newNoteParentPath,
  noteDisplayName,
  openProjectNote,
  resolveNoteFile,
  safeNewNoteTitle,
  uniqueNewNotePath
};
