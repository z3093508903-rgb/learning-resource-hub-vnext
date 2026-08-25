'use strict';

function isEditableMarkdownEditor(editor) {
  return !!editor && typeof editor.replaceSelection === 'function';
}

function normalizeFilePath(file) {
  return String(file?.path || '').trim();
}

function rememberNoteTarget(plugin, editor, file) {
  if (!plugin || !isEditableMarkdownEditor(editor)) return false;
  const filePath = normalizeFilePath(file);
  if (!filePath) return false;
  plugin._goStudyNoteTarget = {
    editor,
    filePath,
    rememberedAt: Date.now()
  };
  return true;
}

function captureActiveNoteTarget(plugin) {
  const workspace = plugin?.app?.workspace;
  const active = workspace?.activeEditor;
  const editor = active?.editor;
  const file = active?.file || workspace?.getActiveFile?.();
  return rememberNoteTarget(plugin, editor, file);
}

function markdownLeaves(workspace) {
  if (!workspace?.getLeavesOfType) return [];
  try { return workspace.getLeavesOfType('markdown') || []; }
  catch { return []; }
}

function targetLeaf(workspace, target) {
  if (!target?.filePath || !target?.editor) return null;
  return markdownLeaves(workspace).find((leaf) => {
    const view = leaf?.view;
    return String(view?.file?.path || '') === target.filePath
      && view?.editor === target.editor
      && isEditableMarkdownEditor(view.editor);
  }) || null;
}

function resolveRememberedNoteTarget(plugin) {
  const workspace = plugin?.app?.workspace;
  const active = workspace?.activeEditor;
  if (isEditableMarkdownEditor(active?.editor) && normalizeFilePath(active?.file || workspace?.getActiveFile?.())) {
    rememberNoteTarget(plugin, active.editor, active.file || workspace.getActiveFile?.());
    return {
      editor: active.editor,
      filePath: normalizeFilePath(active.file || workspace.getActiveFile?.()),
      source: 'active'
    };
  }

  const target = plugin?._goStudyNoteTarget;
  const leaf = targetLeaf(workspace, target);
  if (!leaf) {
    if (plugin) plugin._goStudyNoteTarget = null;
    throw new Error('最近的学习笔记已经关闭或不可编辑，请先打开一个可编辑的 Markdown 笔记，并把光标放到目标正文中。');
  }
  return {
    editor: target.editor,
    filePath: target.filePath,
    source: 'remembered'
  };
}

function registerRememberedNoteTarget(plugin) {
  const workspace = plugin?.app?.workspace;
  if (!workspace?.on) return false;

  captureActiveNoteTarget(plugin);

  const onActiveLeafChange = () => {
    captureActiveNoteTarget(plugin);
  };
  const onEditorChange = (editor, info) => {
    const file = info?.file || workspace.activeEditor?.file || workspace.getActiveFile?.();
    rememberNoteTarget(plugin, editor, file);
  };
  const onFileOpen = () => {
    captureActiveNoteTarget(plugin);
  };

  for (const [event, handler] of [
    ['active-leaf-change', onActiveLeafChange],
    ['editor-change', onEditorChange],
    ['file-open', onFileOpen]
  ]) {
    try {
      const ref = workspace.on(event, handler);
      if (ref && typeof plugin.registerEvent === 'function') plugin.registerEvent(ref);
    } catch {
      // Older Obsidian versions may not expose every workspace event.
    }
  }
  return true;
}

module.exports = {
  captureActiveNoteTarget,
  isEditableMarkdownEditor,
  markdownLeaves,
  normalizeFilePath,
  registerRememberedNoteTarget,
  rememberNoteTarget,
  resolveRememberedNoteTarget,
  targetLeaf
};
