'use strict';

function normalizeVaultPath(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
}

function leafVaultPath(leaf) {
  const viewStatePath = leaf?.getViewState?.()?.state?.file;
  const loadedPath = leaf?.view?.file?.path;
  return normalizeVaultPath(viewStatePath || loadedPath || '');
}

function findOpenVaultLeaf(workspace, targetPath) {
  const target = normalizeVaultPath(targetPath);
  if (!target) return null;
  let found = null;
  const visit = (leaf) => {
    if (!found && leafVaultPath(leaf) === target) found = leaf;
  };
  if (typeof workspace?.iterateAllLeaves === 'function') workspace.iterateAllLeaves(visit);
  else if (typeof workspace?.rootSplit?.iterateAllLeaves === 'function') workspace.rootSplit.iterateAllLeaves(visit);
  return found;
}

function clampMemoHeight(value) {
  const numeric = Math.round(Number(value || 0));
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.min(1200, Math.max(92, numeric));
}

function memoHeightStore(state) {
  state.uiState ||= {};
  state.uiState.projectMemoHeights ||= {};
  return state.uiState.projectMemoHeights;
}

function getMemoHeight(state, projectId, memoId) {
  return clampMemoHeight(state?.uiState?.projectMemoHeights?.[projectId]?.[memoId]);
}

function setMemoHeight(state, projectId, memoId, heightPx) {
  const height = clampMemoHeight(heightPx);
  if (!projectId || !memoId || !height) return 0;
  const store = memoHeightStore(state);
  store[projectId] ||= {};
  store[projectId][memoId] = height;
  return height;
}

function deleteMemoHeight(state, projectId, memoId) {
  const projectStore = state?.uiState?.projectMemoHeights?.[projectId];
  if (!projectStore || !memoId) return false;
  const existed = Object.prototype.hasOwnProperty.call(projectStore, memoId);
  delete projectStore[memoId];
  if (!Object.keys(projectStore).length) delete state.uiState.projectMemoHeights[projectId];
  return existed;
}

function findMemoProjectId(state, memoId) {
  if (!memoId) return '';
  for (const [projectId, project] of Object.entries(state?.projects || {})) {
    if (project?.deletedAt) continue;
    if ((Array.isArray(project?.memos) ? project.memos : []).some((memo) => memo?.id === memoId)) return projectId;
  }
  return '';
}

module.exports = {
  clampMemoHeight,
  deleteMemoHeight,
  findMemoProjectId,
  findOpenVaultLeaf,
  getMemoHeight,
  leafVaultPath,
  normalizeVaultPath,
  setMemoHeight
};
