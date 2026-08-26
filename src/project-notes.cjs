'use strict';

function objectOr(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function createId(prefix = 'note-ref') {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function normalizeNotePath(rawPath) {
  const parts = String(rawPath || '')
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.');
  if (!parts.length || parts.some((part) => part === '..')) throw new Error('笔记路径无效。');
  const normalized = parts.join('/').normalize('NFC');
  if (!/\.md$/i.test(normalized)) throw new Error('项目笔记必须是 Markdown 文件。');
  return normalized;
}

function ensureProjectNotesState(state) {
  if (!state || typeof state !== 'object') throw new Error('Go Study 状态不可用。');
  state.projectNotes = objectOr(state.projectNotes);
  state.uiState = objectOr(state.uiState);
  state.uiState.recentProjectNoteIds = objectOr(state.uiState.recentProjectNoteIds);
  state.uiState.recentStudyByProject = objectOr(state.uiState.recentStudyByProject);

  const normalized = {};
  const seen = new Set();
  for (const [id, raw] of Object.entries(state.projectNotes)) {
    const item = objectOr(raw);
    if (!state.projects?.[item.projectId] || state.projects[item.projectId].deletedAt) continue;
    try {
      const path = normalizeNotePath(item.path);
      const key = `${item.projectId}\u0000${path.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      normalized[id] = {
        ...item,
        id,
        projectId: String(item.projectId),
        path,
        missingAt: String(item.missingAt || ''),
        createdAt: String(item.createdAt || ''),
        updatedAt: String(item.updatedAt || '')
      };
    } catch {}
  }
  state.projectNotes = normalized;

  for (const [projectId, noteId] of Object.entries(state.uiState.recentProjectNoteIds)) {
    if (!state.projects?.[projectId] || !normalized[noteId] || normalized[noteId].projectId !== projectId) {
      delete state.uiState.recentProjectNoteIds[projectId];
    }
  }
  for (const [projectId, rawStudy] of Object.entries(state.uiState.recentStudyByProject)) {
    const study = objectOr(rawStudy);
    if (!state.projects?.[projectId] || !state.resources?.[study.resourceId]) {
      delete state.uiState.recentStudyByProject[projectId];
      continue;
    }
    const noteId = String(study.noteId || '');
    if (noteId && (!normalized[noteId] || normalized[noteId].projectId !== projectId)) study.noteId = '';
    state.uiState.recentStudyByProject[projectId] = {
      projectId,
      resourceId: String(study.resourceId),
      noteId: String(study.noteId || ''),
      updatedAt: String(study.updatedAt || '')
    };
  }
  return state;
}

function projectNotes(state, projectId) {
  ensureProjectNotesState(state);
  return Object.values(state.projectNotes)
    .filter((note) => note.projectId === projectId)
    .sort((a, b) => Number(Boolean(a.missingAt)) - Number(Boolean(b.missingAt))
      || String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
      || String(a.path).localeCompare(String(b.path), 'zh-CN'));
}

function findProjectNoteByPath(state, projectId, rawPath) {
  const path = normalizeNotePath(rawPath);
  return projectNotes(state, projectId).find((note) => note.path.toLowerCase() === path.toLowerCase()) || null;
}

function linkProjectNote(state, projectId, rawPath, at = new Date()) {
  ensureProjectNotesState(state);
  const project = state.projects?.[projectId];
  if (!project || project.deletedAt) throw new Error('找不到项目。');
  const path = normalizeNotePath(rawPath);
  const existing = findProjectNoteByPath(state, projectId, path);
  const timestamp = at.toISOString();
  if (existing) {
    existing.missingAt = '';
    existing.updatedAt = timestamp;
    return { note: existing, reused: true };
  }
  const id = createId('project-note');
  const note = {
    id,
    projectId,
    path,
    missingAt: '',
    createdAt: timestamp,
    updatedAt: timestamp
  };
  state.projectNotes[id] = note;
  return { note, reused: false };
}

function unlinkProjectNote(state, projectId, noteId) {
  ensureProjectNotesState(state);
  const note = state.projectNotes?.[noteId];
  if (!note || note.projectId !== projectId) return { removed: false, note: null };
  delete state.projectNotes[noteId];
  if (state.uiState.recentProjectNoteIds[projectId] === noteId) delete state.uiState.recentProjectNoteIds[projectId];
  const study = state.uiState.recentStudyByProject[projectId];
  if (study?.noteId === noteId) study.noteId = '';
  return { removed: true, note };
}

function setRecentProjectNote(state, projectId, noteId, at = new Date()) {
  ensureProjectNotesState(state);
  const note = state.projectNotes?.[noteId];
  if (!note || note.projectId !== projectId) throw new Error('找不到项目笔记。');
  state.uiState.recentProjectNoteIds[projectId] = note.id;
  note.updatedAt = at.toISOString();
  return note;
}

function recentProjectNote(state, projectId) {
  ensureProjectNotesState(state);
  const noteId = String(state.uiState.recentProjectNoteIds?.[projectId] || '');
  const note = noteId ? state.projectNotes?.[noteId] : null;
  return note && note.projectId === projectId ? note : null;
}

function projectIdForResource(state, resourceId) {
  const id = String(resourceId || '');
  if (!id || !state.resources?.[id] || state.resources[id].deletedAt) return '';
  const currentProjectId = String(state.uiState?.currentProjectId || '');
  const memberships = Object.values(objectOr(state.modules))
    .filter((module) => !module.deletedAt && (module.resourceIds || []).includes(id) && state.projects?.[module.projectId] && !state.projects[module.projectId].deletedAt);
  if (!memberships.length) return '';
  if (currentProjectId && memberships.some((module) => module.projectId === currentProjectId)) return currentProjectId;
  memberships.sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.id).localeCompare(String(b.id)));
  return String(memberships[0].projectId || '');
}

function recordRecentStudy(state, projectId, resourceId, noteId = '', at = new Date()) {
  ensureProjectNotesState(state);
  if (!state.projects?.[projectId] || state.projects[projectId].deletedAt) throw new Error('找不到项目。');
  if (!state.resources?.[resourceId] || state.resources[resourceId].deletedAt) throw new Error('找不到学习资源。');
  const safeNoteId = String(noteId || '');
  if (safeNoteId) {
    const note = state.projectNotes?.[safeNoteId];
    if (!note || note.projectId !== projectId) throw new Error('学习笔记不属于当前项目。');
    setRecentProjectNote(state, projectId, safeNoteId, at);
  }
  state.uiState.recentStudyByProject[projectId] = {
    projectId,
    resourceId,
    noteId: safeNoteId,
    updatedAt: at.toISOString()
  };
  return state.uiState.recentStudyByProject[projectId];
}

function recentStudy(state, projectId) {
  ensureProjectNotesState(state);
  const study = state.uiState.recentStudyByProject?.[projectId];
  if (!study || !state.resources?.[study.resourceId] || state.resources[study.resourceId].deletedAt) return null;
  const note = study.noteId ? state.projectNotes?.[study.noteId] || null : null;
  return { ...study, resource: state.resources[study.resourceId], note };
}

function updateProjectNotePathsOnRename(state, oldRawPath, newRawPath, at = new Date()) {
  ensureProjectNotesState(state);
  const oldPath = String(oldRawPath || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').normalize('NFC');
  const newPath = String(newRawPath || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').normalize('NFC');
  if (!oldPath || !newPath) return 0;
  let changed = 0;
  for (const note of Object.values(state.projectNotes)) {
    const current = note.path;
    if (current !== oldPath && !current.startsWith(`${oldPath}/`)) continue;
    const next = current === oldPath ? newPath : `${newPath}${current.slice(oldPath.length)}`;
    try {
      note.path = normalizeNotePath(next);
      note.missingAt = '';
      note.updatedAt = at.toISOString();
      changed += 1;
    } catch {
      note.missingAt = at.toISOString();
      note.updatedAt = at.toISOString();
    }
  }
  return changed;
}

function markProjectNotesMissing(state, rawPath, at = new Date()) {
  ensureProjectNotesState(state);
  const path = String(rawPath || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').normalize('NFC');
  if (!path) return 0;
  let changed = 0;
  for (const note of Object.values(state.projectNotes)) {
    if (note.path !== path && !note.path.startsWith(`${path}/`)) continue;
    if (!note.missingAt) note.missingAt = at.toISOString();
    note.updatedAt = at.toISOString();
    changed += 1;
  }
  return changed;
}

function restoreProjectNotePath(state, rawPath, at = new Date()) {
  ensureProjectNotesState(state);
  let path;
  try { path = normalizeNotePath(rawPath); } catch { return 0; }
  let changed = 0;
  for (const note of Object.values(state.projectNotes)) {
    if (note.path !== path || !note.missingAt) continue;
    note.missingAt = '';
    note.updatedAt = at.toISOString();
    changed += 1;
  }
  return changed;
}

function playerTimeFromSeconds(value) {
  const total = Math.max(0, Math.floor(Number(value || 0)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

module.exports = {
  ensureProjectNotesState,
  findProjectNoteByPath,
  linkProjectNote,
  markProjectNotesMissing,
  normalizeNotePath,
  playerTimeFromSeconds,
  projectIdForResource,
  projectNotes,
  recentProjectNote,
  recentStudy,
  recordRecentStudy,
  restoreProjectNotePath,
  setRecentProjectNote,
  unlinkProjectNote,
  updateProjectNotePathsOnRename
};
