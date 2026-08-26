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

class ProjectNoteBoxModal extends Modal {
  constructor(app, plugin, projectId) {
    super(app);
    this.plugin = plugin;
    this.projectId = projectId;
    this.query = '';
  }

  onOpen() {
    this.modalEl.addClass?.('rh-next-modal', 'go-study-project-note-box-modal');
    this.render();
  }

  render() {
    const project = this.plugin.state.projects?.[this.projectId];
    this.contentEl.empty();
    const heading = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = heading.createDiv();
    copy.createEl('h2', { text: `${project?.title || '项目'} · 笔记` });
    copy.createEl('p', { text: '这里只保存项目与 Markdown 的关联，不会移动或复制原文件。' });

    const recent = recentProjectNote(this.plugin.state, this.projectId);
    const notes = projectNotes(this.plugin.state, this.projectId);
    const section = this.contentEl.createDiv({ cls: 'go-study-note-box-section' });
    const title = section.createDiv({ cls: 'rh-next-section-heading' });
    title.createEl('strong', { text: `项目笔记 · ${notes.length}` });

    if (!notes.length) {
      section.createEl('p', { cls: 'rh-next-empty-inline', text: '还没有项目笔记。可以搜索 Vault 中已有的 Markdown，或在下面新建。' });
    } else {
      const list = section.createDiv({ cls: 'rh-next-picker-list' });
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
          this.render();
        });
        if (file) row.addEventListener('click', () => void openProjectNote(this.plugin, note).then(() => this.close()));
      }
    }

    const searchSection = this.contentEl.createDiv({ cls: 'go-study-note-box-section' });
    searchSection.createEl('strong', { text: '关联已有笔记' });
    const search = searchSection.createEl('input', { cls: 'rh-next-input', attr: { type: 'search', placeholder: '搜索整个 Vault 的 Markdown…' } });
    search.value = this.query;
    search.addEventListener('input', () => { this.query = search.value; this.renderSearchResults(results); });
    const results = searchSection.createDiv({ cls: 'rh-next-picker-list go-study-note-search-results' });
    this.renderSearchResults(results);

    const createSection = this.contentEl.createDiv({ cls: 'go-study-note-box-section' });
    createSection.createEl('strong', { text: '新建项目笔记' });
    const createRow = createSection.createDiv({ cls: 'go-study-note-create-row' });
    const name = createRow.createEl('input', { cls: 'rh-next-input', attr: { placeholder: '例如：高等数学课堂笔记' } });
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
  }

  renderSearchResults(container) {
    if (!container) return;
    container.empty();
    const query = String(this.query || '').trim().toLocaleLowerCase('zh-CN');
    if (!query) {
      container.createEl('p', { cls: 'rh-next-empty-inline', text: '输入名称或路径开始搜索。' });
      return;
    }
    const linked = new Set(projectNotes(this.plugin.state, this.projectId).map((note) => note.path.toLowerCase()));
    const matches = markdownFiles(this.plugin)
      .filter((file) => `${file.basename || ''}\n${file.path}`.toLocaleLowerCase('zh-CN').includes(query))
      .slice(0, 50);
    if (!matches.length) {
      container.createEl('p', { cls: 'rh-next-empty-inline', text: '没有找到匹配的 Markdown。' });
      return;
    }
    for (const file of matches) {
      const already = linked.has(file.path.toLowerCase());
      rowButton(container, file, already ? `${file.path} · 已在笔记盒` : file.path, async () => {
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
    const recent = recentProjectNote(this.plugin.state, this.projectId);
    const notes = projectNotes(this.plugin.state, this.projectId).filter((note) => !note.missingAt && resolveNoteFile(this.plugin, note));
    this.contentEl.empty();
    const head = this.contentEl.createDiv({ cls: 'rh-next-modal-heading' });
    const copy = head.createDiv();
    copy.createEl('h2', { text: '开始学习' });
    copy.createEl('p', { text: `${project?.title || '项目'} · ${this.resource?.title || '学习资源'}` });
    this.contentEl.createEl('p', { cls: 'setting-item-description', text: '选择这次学习要带上的笔记。它只是“本次使用”，不会建立永久的资源绑定。' });

    if (recent && !recent.missingAt) {
      const recentSection = this.contentEl.createDiv({ cls: 'go-study-note-box-section' });
      recentSection.createEl('strong', { text: '最近使用' });
      const file = resolveNoteFile(this.plugin, recent);
      if (file) rowButton(recentSection, file, `${recent.path} · 上次使用`, () => this.chooseNote(recent));
    }

    const projectSection = this.contentEl.createDiv({ cls: 'go-study-note-box-section' });
    projectSection.createEl('strong', { text: '项目笔记盒' });
    const list = projectSection.createDiv({ cls: 'rh-next-picker-list' });
    const visible = notes.filter((note) => note.id !== recent?.id);
    if (!visible.length) list.createEl('p', { cls: 'rh-next-empty-inline', text: recent ? '其他项目笔记会显示在这里。' : '笔记盒还是空的，可以搜索 Vault。' });
    for (const note of visible) {
      const file = resolveNoteFile(this.plugin, note);
      if (file) rowButton(list, file, note.path, () => this.chooseNote(note));
    }

    const searchSection = this.contentEl.createDiv({ cls: 'go-study-note-box-section' });
    searchSection.createEl('strong', { text: '搜索 Vault' });
    const search = searchSection.createEl('input', { cls: 'rh-next-input', attr: { type: 'search', placeholder: '搜索 Markdown…' } });
    const results = searchSection.createDiv({ cls: 'rh-next-picker-list' });
    const renderSearch = () => {
      results.empty();
      const query = String(search.value || '').trim().toLocaleLowerCase('zh-CN');
      if (!query) return results.createEl('p', { cls: 'rh-next-empty-inline', text: '输入名称或路径。' });
      const matches = markdownFiles(this.plugin).filter((file) => `${file.basename || ''}\n${file.path}`.toLocaleLowerCase('zh-CN').includes(query)).slice(0, 40);
      if (!matches.length) return results.createEl('p', { cls: 'rh-next-empty-inline', text: '没有找到匹配笔记。' });
      for (const file of matches) {
        const linked = findProjectNoteByPath(this.plugin.state, this.projectId, file.path);
        rowButton(results, file, linked ? `${file.path} · 已在笔记盒` : `${file.path} · 选择后加入笔记盒`, () => this.chooseNote(linked, file));
      }
    };
    search.addEventListener('input', renderSearch);
    renderSearch();

    const footer = this.contentEl.createDiv({ cls: 'rh-next-modal-actions' });
    const manage = footer.createEl('button', { cls: 'rh-next-button' }); manage.textContent = '管理笔记盒';
    manage.addEventListener('click', () => { new ProjectNoteBoxModal(this.app, this.plugin, this.projectId).open(); });
    const none = footer.createEl('button', { cls: 'rh-next-button' }); none.textContent = '这次不使用笔记';
    none.addEventListener('click', () => this.finish({ cancelled: false, note: null }));
    const cancel = footer.createEl('button', { cls: 'rh-next-button' }); cancel.textContent = '取消';
    cancel.addEventListener('click', () => this.finish({ cancelled: true, note: null }));
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
  createProjectNote,
  installProjectNoteEntryPoints,
  markdownFiles,
  newNoteParentPath,
  noteDisplayName,
  openProjectNote,
  resolveNoteFile,
  safeNewNoteTitle,
  uniqueNewNotePath
};
