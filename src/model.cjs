'use strict';

const SCHEMA_VERSION = 1;
const PROJECT_PANEL_IDS = ['tasks', 'files', 'memo'];
const TODAY_SIDEBAR_CARD_IDS = ['current', 'progress', 'inbox', 'memo'];
const PROJECT_BOARD_VERSION = 1;
const PROJECT_BOARD_COLUMNS = 4;
const PROJECT_BOARD_UTILITY_IDS = ['files', 'tasks'];
const VAULT_FILE_KINDS = ['markdown', 'canvas', 'base', 'pdf', 'image', 'plugin-file', 'other'];

function createId(prefix = 'id') {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    projects: {},
    vaultRefs: {},
    modules: {},
    resourceGroups: {},
    resources: {},
    plans: {},
    sources: {},
    notes: {},
    activity: [],
    inbox: [],
    uiState: {
      route: 'today',
      currentProjectId: '',
      collapsedTodayProjects: {},
      todayProjectOrder: [],
      todaySidebarOrder: TODAY_SIDEBAR_CARD_IDS.slice(),
      showInterfaceTips: true,
      collapsedProjectPlans: {},
      scrollPositions: {},
      currentResourceModuleId: '',
      selectedBiliSourceId: '',
      webOpenPreference: '',
      projectPanelOrder: PROJECT_PANEL_IDS.slice(),
      projectBoardLayouts: {},
      projectPanelCollapsedByProject: {},
      projectRecentCollapsedByProject: {},
      collapsedResourceGroupsByModule: {},
      recentVaultCreatePaths: [],
      pinnedVaultCreatePaths: [],
      lastAction: null
    }
  };
}

function objectOr(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function uniqueStrings(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter((item) => typeof item === 'string'))];
}

function normalizeProjectPanelOrder(value) {
  const allowed = uniqueStrings(value).filter((panelId) => PROJECT_PANEL_IDS.includes(panelId));
  return [...allowed, ...PROJECT_PANEL_IDS.filter((panelId) => !allowed.includes(panelId))];
}

function normalizeTodaySidebarOrder(value) {
  const allowed = uniqueStrings(value).filter((cardId) => TODAY_SIDEBAR_CARD_IDS.includes(cardId));
  return [...allowed, ...TODAY_SIDEBAR_CARD_IDS.filter((cardId) => !allowed.includes(cardId))];
}

function normalizeTodayProjectOrder(value, projects) {
  const projectIds = (Array.isArray(projects) ? projects : []).map((project) => project.id);
  const saved = uniqueStrings(value).filter((projectId) => projectIds.includes(projectId));
  return [...saved, ...projectIds.filter((projectId) => !saved.includes(projectId))];
}

function moveRelative(order, sourceId, targetId, after = false) {
  const next = uniqueStrings(order);
  const sourceIndex = next.indexOf(sourceId);
  const targetIndex = next.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceId === targetId) return next;
  next.splice(sourceIndex, 1);
  next.splice(next.indexOf(targetId) + (after ? 1 : 0), 0, sourceId);
  return next;
}

function projectBoardModuleKeys(state, projectId, includeArchived = true) {
  return Object.values(objectOr(state.modules))
    .filter((module) => module.projectId === projectId && !module.deletedAt && (includeArchived || !module.archivedAt))
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0)
      || String(left.createdAt || '').localeCompare(String(right.createdAt || ''))
      || String(left.id).localeCompare(String(right.id)))
    .map((module) => `module:${module.id}`);
}

function projectBoardUtilityKeys(panelOrder = PROJECT_BOARD_UTILITY_IDS) {
  const order = normalizeProjectPanelOrder(panelOrder).filter((panelId) => PROJECT_BOARD_UTILITY_IDS.includes(panelId));
  return order.map((panelId) => `utility:${panelId}`);
}

function projectBoardMemoKeys(state, projectId) {
  return normalizeProjectMemos(state.projects?.[projectId]?.memos, projectId).map((memo) => `memo:${memo.id}`);
}

function cloneProjectBoardLayout(layout) {
  return {
    version: PROJECT_BOARD_VERSION,
    items: Object.fromEntries(Object.entries(objectOr(layout?.items)).map(([key, anchor]) => [key, {
      column: anchor.column,
      row: anchor.row,
      ...(key.startsWith('memo:') ? { side: anchor.side === 'right' ? 'right' : 'left' } : {})
    }]))
  };
}

function validProjectBoardAnchor(anchor) {
  return Number.isInteger(anchor?.column) && anchor.column >= 1 && anchor.column <= PROJECT_BOARD_COLUMNS
    && Number.isInteger(anchor?.row) && anchor.row >= 1;
}

function projectBoardMemoSide(value) {
  return value === 'right' ? 'right' : 'left';
}

function projectBoardCellOccupants(items, column, row, excludedKey = '') {
  return Object.entries(objectOr(items)).filter(([key, anchor]) => key !== excludedKey
    && validProjectBoardAnchor(anchor) && anchor.column === column && anchor.row === row);
}

function firstAvailableProjectBoardMemoAnchor(items) {
  for (let row = 1; ; row += 1) {
    for (let column = 1; column <= PROJECT_BOARD_COLUMNS; column += 1) {
      const occupants = projectBoardCellOccupants(items, column, row);
      if (occupants.some(([key]) => !key.startsWith('memo:'))) continue;
      for (const side of ['left', 'right']) {
        if (!occupants.some(([key, anchor]) => key.startsWith('memo:') && projectBoardMemoSide(anchor.side) === side)) {
          return { column, row, side };
        }
      }
    }
  }
}

function firstAvailableProjectBoardAnchor(items) {
  for (let row = 1; ; row += 1) {
    for (let column = 1; column <= PROJECT_BOARD_COLUMNS; column += 1) {
      if (!projectBoardCellOccupants(items, column, row).length) return { column, row };
    }
  }
}

function defaultProjectBoardLayout(state, projectId, panelOrder = PROJECT_BOARD_UTILITY_IDS) {
  const items = {};
  projectBoardModuleKeys(state, projectId).forEach((key, index) => {
    items[key] = { column: (index % 3) + 1, row: Math.floor(index / 3) + 1 };
  });
  projectBoardUtilityKeys(panelOrder).forEach((key, index) => {
    items[key] = { column: PROJECT_BOARD_COLUMNS, row: index + 1 };
  });
  projectBoardMemoKeys(state, projectId).forEach((key, index) => {
    items[key] = {
      column: PROJECT_BOARD_COLUMNS,
      row: projectBoardUtilityKeys(panelOrder).length + Math.floor(index / 2) + 1,
      side: index % 2 ? 'right' : 'left'
    };
  });
  return { version: PROJECT_BOARD_VERSION, items };
}

function normalizeProjectBoardLayout(rawLayout, state, projectId, panelOrder) {
  const rawItems = objectOr(rawLayout?.items);
  const memoKeys = projectBoardMemoKeys(state, projectId);
  const legacyMemoAnchor = validProjectBoardAnchor(rawItems['utility:memo']) ? rawItems['utility:memo'] : null;
  const allowedKeys = [...projectBoardModuleKeys(state, projectId), ...projectBoardUtilityKeys(), ...memoKeys];
  const fullKeys = allowedKeys.filter((key) => !key.startsWith('memo:'));
  const items = {};
  for (const key of fullKeys) {
    const anchor = rawItems[key];
    if (!validProjectBoardAnchor(anchor) || projectBoardCellOccupants(items, anchor.column, anchor.row).length) continue;
    items[key] = { column: anchor.column, row: anchor.row };
  }
  const legacyByColumn = new Map();
  for (const key of memoKeys) {
    const rawAnchor = rawItems[key] || (key === memoKeys[0] ? legacyMemoAnchor : null);
    if (!validProjectBoardAnchor(rawAnchor)) continue;
    let anchor = { column: rawAnchor.column, row: rawAnchor.row, side: projectBoardMemoSide(rawAnchor.side) };
    if (!rawAnchor.side) {
      const previous = legacyByColumn.get(anchor.column);
      if (previous && anchor.row === previous.originalRow + 1) {
        anchor = {
          column: previous.column,
          row: previous.baseRow + Math.floor(previous.count / 2),
          side: previous.count % 2 ? 'right' : 'left'
        };
        previous.originalRow = rawAnchor.row;
        previous.count += 1;
      } else {
        legacyByColumn.set(anchor.column, { column: anchor.column, baseRow: anchor.row, originalRow: rawAnchor.row, count: 1 });
      }
    }
    const occupants = projectBoardCellOccupants(items, anchor.column, anchor.row);
    if (occupants.some(([candidateKey]) => !candidateKey.startsWith('memo:'))
      || occupants.some(([candidateKey, candidateAnchor]) => candidateKey.startsWith('memo:') && projectBoardMemoSide(candidateAnchor.side) === anchor.side)) continue;
    items[key] = anchor;
  }
  if (!Object.keys(items).length) return defaultProjectBoardLayout(state, projectId, panelOrder);
  for (const key of fullKeys) {
    if (items[key]) continue;
    items[key] = firstAvailableProjectBoardAnchor(items);
  }
  for (const key of memoKeys) {
    if (items[key]) continue;
    items[key] = firstAvailableProjectBoardMemoAnchor(items);
  }
  return { version: PROJECT_BOARD_VERSION, items };
}

function normalizeProjectBoardLayouts(value, state, panelOrder) {
  const rawLayouts = objectOr(value);
  return Object.fromEntries(Object.keys(state.projects).map((projectId) => [
    projectId,
    normalizeProjectBoardLayout(rawLayouts[projectId], state, projectId, panelOrder)
  ]));
}

function normalizeVaultPath(rawPath) {
  const parts = String(rawPath || '').trim().replace(/\\/g, '/').split('/').filter((part) => part && part !== '.');
  if (parts.some((part) => part === '..')) throw new Error('Vault 路径不能包含 ..。');
  return parts.join('/').normalize('NFC');
}

function normalizeVaultPathList(value) {
  const normalized = [];
  for (const rawPath of Array.isArray(value) ? value : []) {
    try {
      const path = normalizeVaultPath(rawPath);
      if (!normalized.includes(path)) normalized.push(path);
    } catch { /* 忽略旧状态中的非法路径。 */ }
  }
  return normalized;
}

function normalizeVaultFileKind(value) {
  const fileKind = String(value || 'other');
  return VAULT_FILE_KINDS.includes(fileKind) ? fileKind : 'other';
}

function normalizeVaultRefs(value) {
  const normalized = {};
  for (const [id, rawVaultRef] of Object.entries(objectOr(value))) {
    const vaultRef = objectOr(rawVaultRef);
    try {
      const path = normalizeVaultPath(vaultRef.path);
      if (!path) continue;
      normalized[id] = {
        ...vaultRef,
        id,
        path,
        entryType: vaultRef.entryType === 'folder' ? 'folder' : 'file',
        fileKind: normalizeVaultFileKind(vaultRef.fileKind),
        missingAt: String(vaultRef.missingAt || '')
      };
    } catch { /* 忽略旧状态中的非法引用。 */ }
  }
  return normalized;
}

function normalizeProjectMemos(value, projectId = 'project') {
  const normalized = [];
  const usedIds = new Set();
  const rawMemos = Array.isArray(value) ? value : [];
  rawMemos.forEach((rawMemo, index) => {
    const source = typeof rawMemo === 'string' ? { text: rawMemo } : objectOr(rawMemo);
    const baseId = String(source.id || '').trim() || `memo-${projectId}-${index + 1}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    const text = String(source.text ?? source.memoText ?? source.content ?? '');
    const createdAt = String(source.createdAt ?? source.updatedAt ?? source.memoUpdatedAt ?? '');
    const updatedAt = String(source.updatedAt ?? source.memoUpdatedAt ?? source.createdAt ?? '');
    normalized.push({ ...source, id, title: String(source.title || '').trim(), text, createdAt, updatedAt });
    usedIds.add(id);
  });
  return normalized;
}

function normalizeProjectRecentCollapsedByProject(value, projects) {
  const input = objectOr(value);
  const normalized = {};
  for (const [projectId, collapsed] of Object.entries(input)) {
    if (!projects[projectId]) continue;
    normalized[projectId] = Boolean(collapsed);
  }
  return normalized;
}

function normalizeModules(value, resources) {
  return Object.fromEntries(Object.entries(objectOr(value)).map(([id, rawModule]) => {
    const module = objectOr(rawModule);
    const resourceIds = uniqueStrings(module.resourceIds).filter((resourceId) => resources[resourceId]);
    const resourceRoots = {};
    for (const [resourceId, rootPath] of Object.entries(objectOr(module.resourceRoots))) {
      if (!resourceIds.includes(resourceId) || (!resourceOpenListPath(resources[resourceId]) && !resourceLocalPath(resources[resourceId]))) continue;
      resourceRoots[resourceId] = normalizeResourceRoot(resources[resourceId], rootPath);
    }
    return [id, { ...module, id, resourceIds, resourceRoots, resourceGroupIds: uniqueStrings(module.resourceGroupIds) }];
  }));
}

function normalizeResourceGroups(value, modules, resources) {
  const normalized = {};
  const candidateResourceIds = new Map();
  for (const [id, rawGroup] of Object.entries(objectOr(value))) {
    const group = objectOr(rawGroup);
    const module = modules[group.moduleId];
    const title = String(group.title || '').trim();
    if (!module || !title) continue;
    candidateResourceIds.set(id, uniqueStrings(group.resourceIds));
    normalized[id] = {
      ...group,
      id,
      moduleId: module.id,
      title,
      scopePath: normalizeResourceGroupScopePath(group.scopePath || String(group.autoGroupKey || '').split(':folder:').slice(1).join(':folder:')),
      resourceIds: [],
      sortOrder: Number.isFinite(Number(group.sortOrder)) ? Number(group.sortOrder) : 0
    };
  }
  for (const module of Object.values(modules)) {
    const listed = uniqueStrings(module.resourceGroupIds).filter((groupId) => normalized[groupId]?.moduleId === module.id);
    const remaining = Object.values(normalized)
      .filter((group) => group.moduleId === module.id && !listed.includes(group.id))
      .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0) || String(left.createdAt || '').localeCompare(String(right.createdAt || '')))
      .map((group) => group.id);
    module.resourceGroupIds = [...listed, ...remaining];
    const assigned = new Set();
    module.resourceGroupIds.forEach((groupId, index) => {
      const group = normalized[groupId];
      group.sortOrder = index;
      group.resourceIds = (candidateResourceIds.get(groupId) || []).filter((resourceId) => {
        if (!resources[resourceId] || !module.resourceIds.includes(resourceId) || assigned.has(resourceId)) return false;
        assigned.add(resourceId);
        return true;
      });
    });
  }
  return normalized;
}

function normalizeResourceGroupScopePath(value) {
  return String(value || '').replace(/\\/g, '/').split('/').filter(Boolean).join('/');
}

function normalizeCollapsedResourceGroups(value, modules, resourceGroups) {
  const normalized = {};
  for (const [moduleId, rawGroups] of Object.entries(objectOr(value))) {
    if (!modules[moduleId]) continue;
    const groups = {};
    for (const [groupId, collapsed] of Object.entries(objectOr(rawGroups))) {
      if (resourceGroups[groupId]?.moduleId === moduleId) groups[groupId] = Boolean(collapsed);
    }
    if (Object.keys(groups).length) normalized[moduleId] = groups;
  }
  return normalized;
}

function normalizeProjectMemoFields(project, projectId) {
  const legacyText = String(project.memoText ?? '');
  const legacyUpdatedAt = String(project.memoUpdatedAt ?? '');
  const memos = normalizeProjectMemos(project.memos, projectId);
  if (legacyText.length > 0) {
    const existing = memos.find((memo) => memo.text === legacyText);
    if (!existing) {
      const blankDefault = memos.length === 1 && !memos[0].text;
      if (blankDefault) {
        memos[0] = {
          ...memos[0],
          title: String(memos[0].title || '').trim(),
          text: legacyText,
          createdAt: memos[0].createdAt || legacyUpdatedAt,
          updatedAt: legacyUpdatedAt
        };
      } else {
        const baseId = `memo-${projectId}-legacy`;
        const usedIds = new Set(memos.map((memo) => memo.id));
        let id = baseId;
        let suffix = 2;
        while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
        memos.push({ id, title: '', text: legacyText, createdAt: legacyUpdatedAt, updatedAt: legacyUpdatedAt });
      }
    }
  }
  const firstMemo = memos[0];
  const memoText = legacyText || String(firstMemo?.text || '');
  const memoUpdatedAt = legacyUpdatedAt || String(firstMemo?.updatedAt || '');
  return { memos, memoText, memoUpdatedAt };
}

function normalizeState(raw) {
  const base = defaultState();
  const input = objectOr(raw);
  const inputSchemaVersion = Number(input.schemaVersion || 0);
  if (Number.isFinite(inputSchemaVersion) && inputSchemaVersion > SCHEMA_VERSION) {
    throw new Error(`数据版本 ${inputSchemaVersion} 高于当前支持的 ${SCHEMA_VERSION}，已停止加载以避免覆盖较新数据。`);
  }
  const inputProjects = objectOr(input.projects);
  const vaultRefs = normalizeVaultRefs(input.vaultRefs);
  const projects = Object.fromEntries(Object.entries(inputProjects).map(([id, rawProject]) => {
    const project = objectOr(rawProject);
    const memoFields = normalizeProjectMemoFields(project, id);
    const vaultRefIds = uniqueStrings(project.vaultRefIds).filter((vaultRefId) => vaultRefs[vaultRefId]);
    return [id, {
      ...project,
      vaultRefIds,
      pinnedVaultRefIds: uniqueStrings(project.pinnedVaultRefIds).filter((vaultRefId) => vaultRefIds.includes(vaultRefId)),
      memos: memoFields.memos,
      memoText: memoFields.memoText,
      memoUpdatedAt: memoFields.memoUpdatedAt
    }];
  }));
  const resources = objectOr(input.resources);
  const modules = normalizeModules(input.modules, resources);
  const resourceGroups = normalizeResourceGroups(input.resourceGroups, modules, resources);
  const state = {
    ...base,
    ...input,
    projects,
    vaultRefs,
    modules,
    resourceGroups,
    resources,
    plans: objectOr(input.plans),
    sources: objectOr(input.sources),
    notes: objectOr(input.notes),
    activity: Array.isArray(input.activity) ? input.activity.slice(-500) : [],
    inbox: Array.isArray(input.inbox) ? input.inbox : [],
    uiState: {
      ...base.uiState,
      ...objectOr(input.uiState),
      collapsedTodayProjects: objectOr(input.uiState?.collapsedTodayProjects),
      todayProjectOrder: uniqueStrings(input.uiState?.todayProjectOrder),
      todaySidebarOrder: normalizeTodaySidebarOrder(input.uiState?.todaySidebarOrder),
      showInterfaceTips: input.uiState?.showInterfaceTips !== false,
      collapsedProjectPlans: objectOr(input.uiState?.collapsedProjectPlans),
      scrollPositions: objectOr(input.uiState?.scrollPositions),
      projectPanelOrder: normalizeProjectPanelOrder(input.uiState?.projectPanelOrder),
      projectBoardLayouts: {},
      projectPanelCollapsedByProject: objectOr(input.uiState?.projectPanelCollapsedByProject),
      projectRecentCollapsedByProject: normalizeProjectRecentCollapsedByProject(input.uiState?.projectRecentCollapsedByProject, projects),
      collapsedResourceGroupsByModule: normalizeCollapsedResourceGroups(input.uiState?.collapsedResourceGroupsByModule, modules, resourceGroups),
      recentVaultCreatePaths: normalizeVaultPathList(input.uiState?.recentVaultCreatePaths).slice(0, 5),
      pinnedVaultCreatePaths: normalizeVaultPathList(input.uiState?.pinnedVaultCreatePaths)
    }
  };
  state.uiState.projectBoardLayouts = normalizeProjectBoardLayouts(
    input.uiState?.projectBoardLayouts,
    state,
    state.uiState.projectPanelOrder
  );
  state.uiState.todayProjectOrder = normalizeTodayProjectOrder(state.uiState.todayProjectOrder, activeProjects(state));
  state.schemaVersion = SCHEMA_VERSION;
  if (!state.uiState.currentProjectId || !state.projects[state.uiState.currentProjectId]) {
    state.uiState.currentProjectId = activeProjects(state)[0]?.id || '';
  }
  return state;
}

function nowIso() {
  return new Date().toISOString();
}

function activeProjects(state) {
  return Object.values(state.projects)
    .filter((project) => !project.archivedAt && !project.deletedAt)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

function todayProjects(state) {
  const projects = activeProjects(state);
  const order = normalizeTodayProjectOrder(state.uiState?.todayProjectOrder, projects);
  const byId = new Map(projects.map((project) => [project.id, project]));
  return order.map((projectId) => byId.get(projectId)).filter(Boolean);
}

function moveTodayProjectBefore(state, sourceId, targetId, options = {}) {
  state.uiState = objectOr(state.uiState);
  const order = normalizeTodayProjectOrder(state.uiState.todayProjectOrder, activeProjects(state));
  state.uiState.todayProjectOrder = moveRelative(order, sourceId, targetId, Boolean(options.after));
  return state.uiState.todayProjectOrder;
}

function moveTodaySidebarCardBefore(state, sourceId, targetId, options = {}) {
  state.uiState = objectOr(state.uiState);
  const order = normalizeTodaySidebarOrder(state.uiState.todaySidebarOrder);
  state.uiState.todaySidebarOrder = moveRelative(order, sourceId, targetId, Boolean(options.after));
  return state.uiState.todaySidebarOrder;
}

function projectModules(state, projectId) {
  return Object.values(state.modules)
    .filter((module) => module.projectId === projectId && !module.archivedAt && !module.deletedAt)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

function ensureProjectBoardLayout(state, projectId) {
  if (!state.projects[projectId]) throw new Error('找不到项目。');
  state.uiState = objectOr(state.uiState);
  state.uiState.projectBoardLayouts = objectOr(state.uiState.projectBoardLayouts);
  const rawLayout = state.uiState.projectBoardLayouts[projectId];
  const layout = normalizeProjectBoardLayout(rawLayout, state, projectId, state.uiState.projectPanelOrder);
  state.uiState.projectBoardLayouts[projectId] = layout;
  return layout;
}

function projectBoardItems(state, projectId, options = {}) {
  const layout = ensureProjectBoardLayout(state, projectId);
  const visibleKeys = new Set([
    ...projectBoardModuleKeys(state, projectId, Boolean(options.includeArchived)),
    ...projectBoardUtilityKeys(),
    ...projectBoardMemoKeys(state, projectId)
  ]);
  return Object.entries(layout.items)
    .filter(([key]) => visibleKeys.has(key))
    .map(([key, anchor]) => {
      if (key.startsWith('module:')) {
        const moduleId = key.slice('module:'.length);
        return { key, kind: 'module', moduleId, module: state.modules[moduleId], ...anchor };
      }
      if (key.startsWith('memo:')) {
        const memoId = key.slice('memo:'.length);
        return { key, kind: 'memo', memoId, memo: state.projects[projectId]?.memos?.find((memo) => memo.id === memoId), ...anchor };
      }
      return { key, kind: 'utility', utilityId: key.slice('utility:'.length), ...anchor };
    })
    .sort((left, right) => left.row - right.row || left.column - right.column || left.key.localeCompare(right.key));
}

function moveProjectBoardItem(state, projectId, itemKey, column, row, options = {}) {
  const layout = ensureProjectBoardLayout(state, projectId);
  if (!layout.items[itemKey]) throw new Error('找不到布局项。');
  const memoItem = itemKey.startsWith('memo:');
  const target = {
    column: Number(column),
    row: Number(row),
    ...(memoItem ? { side: projectBoardMemoSide(options.side) } : {})
  };
  if (!validProjectBoardAnchor(target)) throw new Error('布局位置无效。');
  const source = layout.items[itemKey];
  if (source.column === target.column && source.row === target.row
    && (!memoItem || projectBoardMemoSide(source.side) === target.side)) return { layout, itemKey, swappedWith: '' };
  const layoutBefore = cloneProjectBoardLayout(layout);
  const targetOccupants = projectBoardCellOccupants(layout.items, target.column, target.row, itemKey);
  let occupied = null;
  if (memoItem) {
    if (targetOccupants.some(([key]) => !key.startsWith('memo:'))) throw new Error('目标整格已被其他组件占用。');
    occupied = targetOccupants.find(([key, anchor]) => key.startsWith('memo:') && projectBoardMemoSide(anchor.side) === target.side) || null;
  } else {
    if (targetOccupants.some(([key]) => key.startsWith('memo:'))) throw new Error('目标格包含便签，请先移动便签。');
    occupied = targetOccupants[0] || null;
  }
  layout.items[itemKey] = target;
  if (occupied) layout.items[occupied[0]] = {
    column: source.column,
    row: source.row,
    ...(occupied[0].startsWith('memo:') ? { side: projectBoardMemoSide(source.side) } : {})
  };
  recordLastAction(state, {
    type: 'project-board-layout',
    label: '调整项目布局',
    projectId,
    layoutBefore
  });
  return { layout, itemKey, swappedWith: occupied?.[0] || '' };
}

function resetProjectBoardLayout(state, projectId) {
  const layoutBefore = cloneProjectBoardLayout(ensureProjectBoardLayout(state, projectId));
  const layout = defaultProjectBoardLayout(state, projectId);
  state.uiState.projectBoardLayouts[projectId] = layout;
  recordLastAction(state, {
    type: 'project-board-layout',
    label: '恢复默认项目布局',
    projectId,
    layoutBefore
  });
  return layout;
}

function moduleResources(state, moduleId) {
  const resourceIds = state.modules[moduleId]?.resourceIds || [];
  return resourceIds.map((id) => state.resources[id]).filter((resource) => resource && !resource.deletedAt);
}

function moduleResourceGroups(state, moduleId) {
  const module = state.modules[moduleId];
  if (!module) return [];
  const listed = uniqueStrings(module.resourceGroupIds)
    .map((groupId) => state.resourceGroups[groupId])
    .filter((group) => group?.moduleId === moduleId);
  const listedIds = new Set(listed.map((group) => group.id));
  const remaining = Object.values(objectOr(state.resourceGroups))
    .filter((group) => group.moduleId === moduleId && !listedIds.has(group.id));
  return [...listed, ...remaining]
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0) || String(left.createdAt || '').localeCompare(String(right.createdAt || '')));
}

function resourceGroupProgress(state, groupId) {
  const group = state.resourceGroups[groupId];
  if (!group || !state.modules[group.moduleId]) throw new Error('找不到资源分组。');
  const moduleIds = new Set(state.modules[group.moduleId].resourceIds || []);
  const resources = uniqueStrings(group.resourceIds)
    .filter((resourceId) => moduleIds.has(resourceId))
    .map((resourceId) => state.resources[resourceId])
    .filter((resource) => resource && !resource.deletedAt);
  const completed = resources.filter((resource) => resource.completedAt).length;
  return { total: resources.length, completed, done: resources.length > 0 && completed === resources.length };
}

function touchModule(state, moduleId, at = new Date()) {
  const module = state.modules[moduleId];
  if (!module) return '';
  const timestamp = at.toISOString();
  module.updatedAt = timestamp;
  if (state.projects[module.projectId]) state.projects[module.projectId].updatedAt = timestamp;
  return timestamp;
}

function createResourceGroup(state, moduleId, title, resourceIds = [], at = new Date()) {
  const module = state.modules[moduleId];
  if (!module) throw new Error('找不到目标模块。');
  const value = String(title || '').trim();
  if (!value) throw new Error('分组名称不能为空。');
  const id = createId('resource-group');
  const timestamp = at.toISOString();
  const sortOrder = moduleResourceGroups(state, moduleId).length;
  state.resourceGroups = objectOr(state.resourceGroups);
  state.resourceGroups[id] = {
    id,
    moduleId,
    title: value,
    resourceIds: [],
    sortOrder,
    createdAt: timestamp,
    updatedAt: timestamp
  };
  module.resourceGroupIds = [...new Set([...(module.resourceGroupIds || []), id])];
  if (resourceIds.length) moveResourcesToGroup(state, moduleId, resourceIds, id, at);
  else touchModule(state, moduleId, at);
  return state.resourceGroups[id];
}

function renameResourceGroup(state, groupId, title, at = new Date()) {
  const group = state.resourceGroups[groupId];
  if (!group) throw new Error('找不到资源分组。');
  const value = String(title || '').trim();
  if (!value) throw new Error('分组名称不能为空。');
  group.title = value;
  group.updatedAt = touchModule(state, group.moduleId, at);
  return group;
}

function moveResourceGroup(state, moduleId, groupId, targetGroupId, at = new Date()) {
  const ordered = moduleResourceGroups(state, moduleId);
  const from = ordered.findIndex((group) => group.id === groupId);
  const to = ordered.findIndex((group) => group.id === targetGroupId);
  if (from < 0 || to < 0 || from === to) return ordered;
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);
  const timestamp = touchModule(state, moduleId, at);
  ordered.forEach((group, index) => {
    group.sortOrder = index;
    group.updatedAt = timestamp;
  });
  state.modules[moduleId].resourceGroupIds = ordered.map((group) => group.id);
  return ordered;
}

function moveResourcesToGroup(state, moduleId, resourceIds, groupId = '', at = new Date()) {
  const module = state.modules[moduleId];
  if (!module) throw new Error('找不到目标模块。');
  const target = groupId ? state.resourceGroups[groupId] : null;
  if (groupId && target?.moduleId !== moduleId) throw new Error('找不到目标资源分组。');
  const moduleIds = new Set(module.resourceIds || []);
  const ids = [...new Set((Array.isArray(resourceIds) ? resourceIds : [resourceIds]).filter((resourceId) => moduleIds.has(resourceId) && state.resources[resourceId]))];
  const affected = new Set(ids);
  const timestamp = touchModule(state, moduleId, at);
  for (const group of moduleResourceGroups(state, moduleId)) {
    const nextIds = uniqueStrings(group.resourceIds).filter((resourceId) => !affected.has(resourceId));
    if (nextIds.length !== uniqueStrings(group.resourceIds).length) {
      group.resourceIds = nextIds;
      group.updatedAt = timestamp;
    }
  }
  if (target) {
    target.resourceIds = [...new Set([...(target.resourceIds || []), ...ids])];
    target.updatedAt = timestamp;
  }
  return { group: target, resourceIds: ids };
}

function moveResourceToGroup(state, moduleId, resourceId, groupId = '', at = new Date()) {
  return moveResourcesToGroup(state, moduleId, [resourceId], groupId, at);
}

function deleteResourceGroup(state, groupId, at = new Date()) {
  const group = state.resourceGroups[groupId];
  if (!group) throw new Error('找不到资源分组。');
  const module = state.modules[group.moduleId];
  const snapshot = { ...group, resourceIds: [...(group.resourceIds || [])] };
  delete state.resourceGroups[groupId];
  if (module) {
    module.resourceGroupIds = (module.resourceGroupIds || []).filter((id) => id !== groupId);
    const ordered = moduleResourceGroups(state, module.id);
    ordered.forEach((item, index) => { item.sortOrder = index; });
    touchModule(state, module.id, at);
  }
  delete state.uiState.collapsedResourceGroupsByModule?.[group.moduleId]?.[groupId];
  if (state.uiState.collapsedResourceGroupsByModule?.[group.moduleId] && !Object.keys(state.uiState.collapsedResourceGroupsByModule[group.moduleId]).length) {
    delete state.uiState.collapsedResourceGroupsByModule[group.moduleId];
  }
  return { group: snapshot, ungroupedResourceIds: snapshot.resourceIds };
}

function setResourceGroupCollapsed(state, moduleId, groupId, collapsed) {
  if (state.resourceGroups[groupId]?.moduleId !== moduleId) throw new Error('找不到资源分组。');
  state.uiState.collapsedResourceGroupsByModule = objectOr(state.uiState.collapsedResourceGroupsByModule);
  state.uiState.collapsedResourceGroupsByModule[moduleId] = {
    ...objectOr(state.uiState.collapsedResourceGroupsByModule[moduleId]),
    [groupId]: Boolean(collapsed)
  };
  return state.uiState.collapsedResourceGroupsByModule[moduleId][groupId];
}

function defaultResourceAutoGroupEnabled(resourceCount) {
  return Number(resourceCount || 0) > 20;
}

function resourceGroupTitle(index) {
  const value = Math.max(1, Math.floor(Number(index || 1)));
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const chineseNumber = value < 10
    ? digits[value]
    : value < 20
      ? `十${value % 10 ? digits[value % 10] : ''}`
      : value < 100
        ? `${digits[Math.floor(value / 10)]}十${value % 10 ? digits[value % 10] : ''}`
        : String(value);
  return `第${chineseNumber}组`;
}

function autoGroupResources(state, moduleId, orderedResourceIds, options = {}) {
  const module = state.modules[moduleId];
  if (!module) throw new Error('找不到目标模块。');
  const size = Math.max(1, Math.min(200, Math.floor(Number(options.size || 20))));
  const key = String(options.key || '').trim();
  const scopePath = normalizeResourceGroupScopePath(options.scopePath);
  if (!key) throw new Error('自动分组缺少稳定批次身份。');
  const ids = [...new Set((Array.isArray(orderedResourceIds) ? orderedResourceIds : []).filter((resourceId) => (module.resourceIds || []).includes(resourceId) && state.resources[resourceId]))];
  const assigned = new Map();
  for (const group of moduleResourceGroups(state, moduleId)) {
    for (const resourceId of group.resourceIds || []) assigned.set(resourceId, group);
  }
  const groups = [];
  const createdGroupIds = [];
  const timestamp = options.at instanceof Date ? options.at : new Date();
  for (let offset = 0; offset < ids.length; offset += size) {
    const index = Math.floor(offset / size) + 1;
    const chunk = ids.slice(offset, offset + size);
    let group = moduleResourceGroups(state, moduleId).find((candidate) => candidate.autoGroupKey === key && Number(candidate.autoGroupIndex) === index);
    const available = chunk.filter((resourceId) => !assigned.has(resourceId) || assigned.get(resourceId)?.id === group?.id);
    if (!group && !available.length) continue;
    if (!group) {
      group = createResourceGroup(state, moduleId, options.titleForIndex?.(index) || resourceGroupTitle(index), [], timestamp);
      group.autoGroupKey = key;
      group.autoGroupIndex = index;
      group.autoGroupSize = size;
      group.scopePath = scopePath;
      createdGroupIds.push(group.id);
    }
    if (!group.scopePath && scopePath) group.scopePath = scopePath;
    if (available.length) {
      moveResourcesToGroup(state, moduleId, available, group.id, timestamp);
      for (const resourceId of available) assigned.set(resourceId, group);
    }
    groups.push(group);
  }
  return { groups, createdGroupIds, resourceIds: ids, skippedResourceIds: ids.filter((resourceId) => !groups.some((group) => group.resourceIds.includes(resourceId))) };
}

function removeResourcesFromModule(state, moduleId, resourceIds, at = new Date()) {
  const module = state.modules[moduleId];
  if (!module) throw new Error('找不到目标模块。');
  const removed = new Set((Array.isArray(resourceIds) ? resourceIds : [resourceIds]).filter(Boolean));
  module.resourceIds = (module.resourceIds || []).filter((resourceId) => !removed.has(resourceId));
  for (const resourceId of removed) delete module.resourceRoots?.[resourceId];
  for (const group of moduleResourceGroups(state, moduleId)) {
    const nextIds = (group.resourceIds || []).filter((resourceId) => !removed.has(resourceId));
    if (nextIds.length !== (group.resourceIds || []).length) {
      group.resourceIds = nextIds;
      group.updatedAt = at.toISOString();
    }
  }
  touchModule(state, moduleId, at);
  return [...removed];
}

function resourceOpenListPath(resource) {
  return resource?.launcher?.type === 'openlist' || resource?.launcher?.type === 'openlist-file' || resource?.metadata?.remotePath
    ? normalizeOpenListPath(resource.launcher?.remotePath || resource.metadata?.remotePath || '/')
    : '';
}

function resourceLocalPath(resource) {
  return resource?.launcher?.type === 'file' ? String(resource.launcher.path || resource.metadata?.localPath || '') : String(resource?.metadata?.localPath || '');
}

function normalizeResourceRoot(resource, rootPath) {
  if (resourceOpenListPath(resource)) return normalizeOpenListPath(rootPath || '/');
  if (resourceLocalPath(resource)) return String(rootPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  return '';
}

function commonOpenListParent(resources) {
  const parents = (Array.isArray(resources) ? resources : []).map((resource) => {
    const remotePath = resourceOpenListPath(resource);
    if (!remotePath) return null;
    const parts = remotePath.split('/').filter(Boolean);
    parts.pop();
    return parts;
  }).filter(Boolean);
  if (!parents.length) return '';
  const common = [];
  for (let index = 0; index < parents[0].length; index += 1) {
    const segment = parents[0][index];
    if (!parents.every((parts) => parts[index] === segment)) break;
    common.push(segment);
  }
  return normalizeOpenListPath(`/${common.join('/')}`);
}

function moduleResourceRoot(state, moduleId, resourceId) {
  const module = state.modules[moduleId];
  const resource = state.resources[resourceId];
  if (!module || (!resourceOpenListPath(resource) && !resourceLocalPath(resource))) return '';
  const stored = module.resourceRoots?.[resourceId];
  if (stored) return normalizeResourceRoot(resource, stored);
  if (resourceLocalPath(resource)) return normalizeResourceRoot(resource, resource.metadata?.rootPath);
  const peers = moduleResources(state, moduleId).filter((candidate) => resourceOpenListPath(candidate) && String(candidate.sourceId || candidate.launcher?.sourceId || '') === String(resource.sourceId || resource.launcher?.sourceId || ''));
  return commonOpenListParent(peers) || normalizeOpenListPath(resource.metadata?.rootPath || '/');
}

function resourceFolderPath(resource, rootPathValue = '') {
  const resourcePath = String(resource?.metadata?.remotePath || resource?.launcher?.remotePath || resource?.metadata?.localPath || (resource?.launcher?.type === 'file' ? resource.launcher.path : '') || '').replace(/\\/g, '/');
  if (!resourcePath) return '';
  const rootPath = String(rootPathValue || resource?.metadata?.rootPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const localResource = Boolean(resource?.metadata?.localPath || resource?.launcher?.type === 'file');
  const rootMatches = rootPath && rootPath !== '/' && (localResource
    ? resourcePath.toLowerCase() === rootPath.toLowerCase() || resourcePath.toLowerCase().startsWith(`${rootPath.toLowerCase()}/`)
    : resourcePath === rootPath || resourcePath.startsWith(`${rootPath}/`));
  const relative = rootMatches ? resourcePath.slice(rootPath.length).replace(/^\/+/, '') : resourcePath.replace(/^\/+/, '');
  const relativeFolder = relative.split('/').filter(Boolean).slice(0, -1).join('/');
  if (!localResource || !rootMatches) return relativeFolder;
  const rootLabel = rootPath.split('/').filter(Boolean).at(-1) || rootPath;
  return [rootLabel, relativeFolder].filter(Boolean).join('/');
}

function linkResourcesToModule(state, moduleId, resourceIds, options = {}) {
  const module = state.modules[moduleId];
  if (!module) throw new Error('找不到目标模块。');
  const ids = [...new Set((Array.isArray(resourceIds) ? resourceIds : []).filter((resourceId) => state.resources[resourceId] && !state.resources[resourceId].deletedAt))];
  const existing = new Set(module.resourceIds || []);
  const linkedResourceIds = ids.filter((resourceId) => !existing.has(resourceId));
  module.resourceIds = [...new Set([...(module.resourceIds || []), ...ids])];
  module.resourceRoots = objectOr(module.resourceRoots);
  if (options.rootPath) {
    for (const resourceId of ids) {
      const rootPath = normalizeResourceRoot(state.resources[resourceId], options.rootPath);
      if (rootPath) module.resourceRoots[resourceId] = rootPath;
    }
  } else {
    const groups = new Map();
    for (const resourceId of ids) {
      const resource = state.resources[resourceId];
      if (!resourceOpenListPath(resource)) continue;
      const key = String(resource.sourceId || resource.launcher?.sourceId || '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(resource);
    }
    for (const resources of groups.values()) {
      const rootPath = commonOpenListParent(resources);
      if (rootPath) for (const resource of resources) module.resourceRoots[resource.id] = rootPath;
    }
  }
  module.updatedAt = nowIso();
  if (state.projects[module.projectId]) state.projects[module.projectId].updatedAt = module.updatedAt;
  return { module, resourceIds: ids, linkedResourceIds };
}

function projectPlans(state, projectId) {
  return Object.values(state.plans)
    .filter((plan) => plan.projectId === projectId && !plan.archivedAt && !plan.deletedAt)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

function createProject(state, title) {
  const value = String(title || '').trim();
  if (!value) throw new Error('项目名称不能为空。');
  const id = createId('project');
  const timestamp = nowIso();
  const memoId = createId('memo');
  state.projects[id] = {
    id,
    title: value,
    moduleIds: [],
    noteIds: [],
    vaultRefIds: [],
    pinnedVaultRefIds: [],
    memos: [{ id: memoId, text: '', createdAt: timestamp, updatedAt: '' }],
    memoText: '',
    memoUpdatedAt: '',
    sortOrder: activeProjects(state).length,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: '',
    deletedAt: ''
  };
  state.uiState.currentProjectId = id;
  return state.projects[id];
}

function inferVaultFileKind(path, entryType) {
  if (entryType === 'folder') return 'other';
  const lower = String(path || '').toLowerCase();
  if (lower.endsWith('.excalidraw.md')) return 'plugin-file';
  const extension = lower.split('.').pop();
  if (extension === 'md') return 'markdown';
  if (extension === 'canvas') return 'canvas';
  if (extension === 'base') return 'base';
  if (extension === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(extension)) return 'image';
  return 'other';
}

function projectVaultRefs(state, projectId) {
  const project = state.projects[projectId];
  if (!project || project.deletedAt) return [];
  const pinnedIds = new Set(project.pinnedVaultRefIds || []);
  return (project.vaultRefIds || [])
    .map((vaultRefId, index) => ({ vaultRef: state.vaultRefs[vaultRefId], index }))
    .filter(({ vaultRef }) => vaultRef)
    .sort((left, right) => Number(pinnedIds.has(right.vaultRef.id)) - Number(pinnedIds.has(left.vaultRef.id)) || left.index - right.index)
    .map(({ vaultRef }) => vaultRef);
}

function upsertVaultRef(state, input, at = new Date()) {
  const path = normalizeVaultPath(input?.path);
  if (!path) throw new Error('Vault 路径不能为空。');
  const entryType = input?.entryType === 'folder' ? 'folder' : input?.entryType === 'file' ? 'file' : '';
  if (!entryType) throw new Error('项目文件类型必须是 file 或 folder。');
  const existing = Object.values(state.vaultRefs).find((vaultRef) => vaultRef.path === path && vaultRef.entryType === entryType);
  const timestamp = at.toISOString();
  if (existing) {
    if (input.fileKind) existing.fileKind = normalizeVaultFileKind(input.fileKind);
    existing.missingAt = '';
    existing.updatedAt = timestamp;
    return { vaultRef: existing, reused: true };
  }
  const id = createId('vault-ref');
  const vaultRef = {
    id,
    path,
    entryType,
    fileKind: normalizeVaultFileKind(input?.fileKind || inferVaultFileKind(path, entryType)),
    createdAt: timestamp,
    updatedAt: timestamp,
    missingAt: ''
  };
  state.vaultRefs[id] = vaultRef;
  return { vaultRef, reused: false };
}

function linkVaultRefToProject(state, projectId, vaultRefId, at = new Date()) {
  const project = state.projects[projectId];
  if (!project || project.deletedAt) throw new Error('找不到项目。');
  if (!state.vaultRefs[vaultRefId]) throw new Error('找不到项目文件引用。');
  const wasLinked = (project.vaultRefIds || []).includes(vaultRefId);
  project.vaultRefIds = uniqueStrings([...(project.vaultRefIds || []), vaultRefId]);
  project.updatedAt = at.toISOString();
  return { vaultRef: state.vaultRefs[vaultRefId], reused: wasLinked };
}

function linkVaultEntriesToProject(state, projectId, inputs, at = new Date()) {
  const project = state.projects[projectId];
  if (!project || project.deletedAt) throw new Error('找不到项目。');
  const vaultRefsBefore = Object.fromEntries(Object.entries(state.vaultRefs).map(([id, vaultRef]) => [id, { ...vaultRef }]));
  const projectBefore = { vaultRefIds: [...(project.vaultRefIds || [])], pinnedVaultRefIds: [...(project.pinnedVaultRefIds || [])], updatedAt: project.updatedAt };
  const lastActionBefore = state.uiState.lastAction;
  const linkedVaultRefIds = [];
  const createdVaultRefIds = [];
  const reusedVaultRefSnapshots = [];
  try {
    for (const input of Array.isArray(inputs) ? inputs : []) {
      const normalizedPath = normalizeVaultPath(input?.path);
      const entryType = input?.entryType === 'folder' ? 'folder' : input?.entryType === 'file' ? 'file' : '';
      const existingBefore = Object.values(state.vaultRefs).find((vaultRef) => vaultRef.path === normalizedPath && vaultRef.entryType === entryType);
      const result = upsertVaultRef(state, input, at);
      if (!result.reused) createdVaultRefIds.push(result.vaultRef.id);
      const linked = linkVaultRefToProject(state, projectId, result.vaultRef.id, at);
      if (!linked.reused) {
        linkedVaultRefIds.push(result.vaultRef.id);
        if (existingBefore && !reusedVaultRefSnapshots.some((snapshot) => snapshot.id === existingBefore.id)) reusedVaultRefSnapshots.push({ ...vaultRefsBefore[existingBefore.id] });
      }
    }
    if (linkedVaultRefIds.length) {
      recordLastAction(state, {
        type: 'link-vault-refs',
        label: `关联 ${linkedVaultRefIds.length} 个项目文件`,
        projectId,
        linkedVaultRefIds,
        createdVaultRefIds,
        reusedVaultRefSnapshots
      });
    }
  } catch (error) {
    state.vaultRefs = vaultRefsBefore;
    project.vaultRefIds = projectBefore.vaultRefIds;
    project.pinnedVaultRefIds = projectBefore.pinnedVaultRefIds;
    project.updatedAt = projectBefore.updatedAt;
    state.uiState.lastAction = lastActionBefore;
    throw error;
  }
  return { linkedVaultRefIds, createdVaultRefIds };
}

function unlinkVaultRefFromProject(state, projectId, vaultRefId, at = new Date()) {
  const project = state.projects[projectId];
  if (!project || project.deletedAt) throw new Error('找不到项目。');
  const vaultRef = state.vaultRefs[vaultRefId] || null;
  const removed = (project.vaultRefIds || []).includes(vaultRefId);
  project.vaultRefIds = (project.vaultRefIds || []).filter((id) => id !== vaultRefId);
  project.pinnedVaultRefIds = (project.pinnedVaultRefIds || []).filter((id) => id !== vaultRefId);
  project.updatedAt = at.toISOString();
  const stillReferenced = Object.values(state.projects).some((candidate) => (candidate.vaultRefIds || []).includes(vaultRefId));
  if (vaultRef && !stillReferenced) delete state.vaultRefs[vaultRefId];
  return { vaultRef, removed, cleaned: Boolean(vaultRef && !stillReferenced) };
}

function updateVaultRefPath(state, vaultRefId, path, at = new Date()) {
  const vaultRef = state.vaultRefs[vaultRefId];
  if (!vaultRef) throw new Error('找不到项目文件引用。');
  const normalizedPath = normalizeVaultPath(path);
  if (!normalizedPath) throw new Error('Vault 路径不能为空。');
  const existing = Object.values(state.vaultRefs).find((candidate) => candidate.id !== vaultRefId && candidate.path === normalizedPath && candidate.entryType === vaultRef.entryType);
  if (existing) {
    for (const project of Object.values(state.projects)) {
      if (!(project.vaultRefIds || []).includes(vaultRefId)) continue;
      project.vaultRefIds = uniqueStrings((project.vaultRefIds || []).map((id) => id === vaultRefId ? existing.id : id));
      project.pinnedVaultRefIds = uniqueStrings((project.pinnedVaultRefIds || []).map((id) => id === vaultRefId ? existing.id : id)).filter((id) => project.vaultRefIds.includes(id));
      project.updatedAt = at.toISOString();
    }
    existing.missingAt = '';
    existing.updatedAt = at.toISOString();
    delete state.vaultRefs[vaultRefId];
    return existing;
  }
  vaultRef.path = normalizedPath;
  const inferredFileKind = inferVaultFileKind(normalizedPath, vaultRef.entryType);
  if (inferredFileKind !== 'other' || vaultRef.fileKind === 'other') vaultRef.fileKind = inferredFileKind;
  vaultRef.updatedAt = at.toISOString();
  return vaultRef;
}

function markVaultRefMissing(state, vaultRefId, at = new Date()) {
  const vaultRef = state.vaultRefs[vaultRefId];
  if (!vaultRef) throw new Error('找不到项目文件引用。');
  if (!vaultRef.missingAt) vaultRef.missingAt = at.toISOString();
  vaultRef.updatedAt = at.toISOString();
  return vaultRef;
}

function restoreVaultRef(state, vaultRefId, at = new Date()) {
  const vaultRef = state.vaultRefs[vaultRefId];
  if (!vaultRef) throw new Error('找不到项目文件引用。');
  vaultRef.missingAt = '';
  vaultRef.updatedAt = at.toISOString();
  return vaultRef;
}

function togglePinnedVaultRef(state, projectId, vaultRefId, at = new Date()) {
  const project = state.projects[projectId];
  if (!project || project.deletedAt) throw new Error('找不到项目。');
  if (!(project.vaultRefIds || []).includes(vaultRefId)) throw new Error('项目尚未关联该项目文件。');
  const pinned = new Set(project.pinnedVaultRefIds || []);
  if (pinned.has(vaultRefId)) pinned.delete(vaultRefId);
  else pinned.add(vaultRefId);
  project.pinnedVaultRefIds = [...pinned].filter((id) => (project.vaultRefIds || []).includes(id));
  project.updatedAt = at.toISOString();
  return pinned.has(vaultRefId);
}

function projectForMemo(state, projectId) {
  const project = state.projects[projectId];
  if (!project || project.deletedAt) throw new Error('找不到项目。');
  return project;
}

function isoAt(at = new Date()) {
  const date = at instanceof Date ? at : new Date(at);
  return date.toISOString();
}

function memoTextValue(value) {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return String(value.text ?? value.memoText ?? value.content ?? '');
  }
  return String(value ?? '');
}

function ensureProjectMemos(project) {
  project.memos = normalizeProjectMemos(project.memos, project.id || 'project');
  return project.memos;
}

function syncLegacyProjectMemo(project) {
  const firstMemo = Array.isArray(project.memos) ? project.memos[0] : null;
  project.memoText = String(firstMemo?.text || '');
  project.memoUpdatedAt = String(firstMemo?.updatedAt || '');
}

function createProjectMemo(state, projectId, text = '', at = new Date()) {
  const project = projectForMemo(state, projectId);
  const timestamp = isoAt(at);
  const memo = {
    id: createId('memo'),
    title: '',
    text: memoTextValue(text),
    createdAt: timestamp,
    updatedAt: timestamp
  };
  ensureProjectMemos(project).push(memo);
  project.updatedAt = timestamp;
  if (project.memos.length === 1) syncLegacyProjectMemo(project);
  ensureProjectBoardLayout(state, projectId);
  return memo;
}

function updateProjectMemoTitle(state, projectId, memoId, title, at = new Date()) {
  const project = projectForMemo(state, projectId);
  const memo = ensureProjectMemos(project).find((candidate) => candidate.id === memoId);
  if (!memo) throw new Error('找不到项目便签。');
  const timestamp = isoAt(at);
  memo.title = String(title || '').trim();
  memo.updatedAt = timestamp;
  project.updatedAt = timestamp;
  if (project.memos[0] === memo) syncLegacyProjectMemo(project);
  return memo;
}

function updateProjectMemo(state, projectId, memoId, text, at = new Date()) {
  const project = projectForMemo(state, projectId);
  const memo = ensureProjectMemos(project).find((candidate) => candidate.id === memoId);
  if (!memo) throw new Error('找不到项目便签。');
  const timestamp = isoAt(at);
  memo.text = memoTextValue(text);
  memo.updatedAt = timestamp;
  if (!memo.createdAt) memo.createdAt = timestamp;
  project.updatedAt = timestamp;
  if (project.memos[0] === memo) syncLegacyProjectMemo(project);
  return memo;
}

function deleteProjectMemo(state, projectId, memoId, at = new Date()) {
  const project = projectForMemo(state, projectId);
  const memos = ensureProjectMemos(project);
  const index = memos.findIndex((candidate) => candidate.id === memoId);
  if (index < 0) throw new Error('找不到项目便签。');
  const [removed] = memos.splice(index, 1);
  const layout = state.uiState?.projectBoardLayouts?.[projectId];
  if (layout?.items) delete layout.items[`memo:${memoId}`];
  project.updatedAt = isoAt(at);
  syncLegacyProjectMemo(project);
  return removed;
}

function setProjectMemo(state, projectId, text, at = new Date()) {
  const project = projectForMemo(state, projectId);
  const memos = ensureProjectMemos(project);
  const timestamp = isoAt(at);
  if (!memos.length) {
    memos.push({ id: createId('memo'), text: '', createdAt: timestamp, updatedAt: '' });
  }
  const memo = memos[0];
  memo.text = memoTextValue(text);
  memo.updatedAt = timestamp;
  if (!memo.createdAt) memo.createdAt = timestamp;
  project.memoText = memo.text;
  project.memoUpdatedAt = timestamp;
  project.updatedAt = timestamp;
  return project;
}

function setProjectPanelOrder(state, panelIds) {
  state.uiState.projectPanelOrder = normalizeProjectPanelOrder(panelIds);
  return state.uiState.projectPanelOrder;
}

function setProjectPanelCollapsed(state, projectId, panelId, collapsed) {
  if (!state.projects[projectId]) throw new Error('找不到项目。');
  if (!PROJECT_PANEL_IDS.includes(panelId)) throw new Error('未知的项目辅助区组件。');
  const byProject = objectOr(state.uiState.projectPanelCollapsedByProject);
  byProject[projectId] = { ...objectOr(byProject[projectId]), [panelId]: Boolean(collapsed) };
  state.uiState.projectPanelCollapsedByProject = byProject;
  return byProject[projectId];
}

function setProjectRecentCollapsed(state, projectId, collapsed) {
  if (!state.projects[projectId]) throw new Error('找不到项目。');
  const byProject = objectOr(state.uiState?.projectRecentCollapsedByProject);
  byProject[projectId] = Boolean(collapsed);
  state.uiState.projectRecentCollapsedByProject = byProject;
  return byProject[projectId];
}

function recordRecentVaultCreatePath(state, path) {
  const normalizedPath = normalizeVaultPath(path);
  state.uiState.recentVaultCreatePaths = [
    normalizedPath,
    ...normalizeVaultPathList(state.uiState.recentVaultCreatePaths).filter((item) => item !== normalizedPath)
  ].slice(0, 5);
  return state.uiState.recentVaultCreatePaths;
}

function togglePinnedVaultCreatePath(state, path) {
  const normalizedPath = normalizeVaultPath(path);
  const pinned = normalizeVaultPathList(state.uiState.pinnedVaultCreatePaths);
  state.uiState.pinnedVaultCreatePaths = pinned.includes(normalizedPath)
    ? pinned.filter((item) => item !== normalizedPath)
    : [...pinned, normalizedPath];
  return state.uiState.pinnedVaultCreatePaths.includes(normalizedPath);
}

function renameProject(state, projectId, title, at = new Date()) {
  const project = state.projects[projectId];
  if (!project || project.deletedAt) throw new Error('找不到项目。');
  const value = String(title || '').trim();
  if (!value) throw new Error('项目名称不能为空。');
  project.title = value;
  project.updatedAt = at.toISOString();
  return project;
}

function createModule(state, projectId, title) {
  if (!state.projects[projectId]) throw new Error('找不到目标项目。');
  const value = String(title || '').trim();
  if (!value) throw new Error('模块名称不能为空。');
  const id = createId('module');
  const timestamp = nowIso();
  const siblings = projectModules(state, projectId);
  state.modules[id] = {
    id,
    projectId,
    title: value,
    resourceIds: [],
    resourceRoots: {},
    resourceGroupIds: [],
    sortOrder: siblings.length,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: ''
  };
  state.projects[projectId].moduleIds = [...new Set([...(state.projects[projectId].moduleIds || []), id])];
  state.projects[projectId].updatedAt = timestamp;
  ensureProjectBoardLayout(state, projectId);
  return state.modules[id];
}

function moveModule(state, projectId, moduleId, targetModuleId) {
  const ordered = projectModules(state, projectId);
  const from = ordered.findIndex((module) => module.id === moduleId);
  const to = ordered.findIndex((module) => module.id === targetModuleId);
  if (from < 0 || to < 0 || from === to) return ordered;
  const [moved] = ordered.splice(from, 1);
  ordered.splice(to, 0, moved);
  const timestamp = nowIso();
  ordered.forEach((module, index) => {
    module.sortOrder = index;
    module.updatedAt = timestamp;
  });
  state.projects[projectId].moduleIds = ordered.map((module) => module.id);
  state.projects[projectId].updatedAt = timestamp;
  return ordered;
}

function modulePlans(state, moduleId) {
  return Object.values(state.plans).filter((plan) => plan.targetType === 'module' && plan.targetIds?.includes(moduleId) && !plan.deletedAt);
}

function archiveModule(state, moduleId, at = new Date()) {
  const module = state.modules[moduleId];
  if (!module || module.deletedAt) throw new Error('找不到模块。');
  if (module.archivedAt) return module;
  const timestamp = at.toISOString();
  module.archivedAt = timestamp;
  module.updatedAt = timestamp;
  for (const plan of modulePlans(state, moduleId)) {
    if (plan.archivedAt) continue;
    plan.archivedAt = timestamp;
    plan.moduleArchivedBy = moduleId;
    plan.updatedAt = timestamp;
  }
  if (state.modules[moduleId]?.projectId && state.projects[module.projectId]) state.projects[module.projectId].updatedAt = timestamp;
  return module;
}

function restoreModule(state, moduleId, at = new Date()) {
  const module = state.modules[moduleId];
  if (!module || module.deletedAt) throw new Error('找不到模块。');
  const timestamp = at.toISOString();
  module.archivedAt = '';
  module.updatedAt = timestamp;
  for (const plan of modulePlans(state, moduleId)) {
    if (plan.moduleArchivedBy !== moduleId) continue;
    plan.archivedAt = '';
    delete plan.moduleArchivedBy;
    plan.updatedAt = timestamp;
  }
  if (state.projects[module.projectId]) state.projects[module.projectId].updatedAt = timestamp;
  return module;
}

function deleteModule(state, moduleId, at = new Date()) {
  const module = state.modules[moduleId];
  if (!module || module.deletedAt) throw new Error('找不到模块。');
  const project = state.projects[module.projectId];
  const planSnapshots = modulePlans(state, moduleId).map((plan) => ({ ...plan, targetIds: [...(plan.targetIds || [])], schedule: Array.isArray(plan.schedule) ? [...plan.schedule] : plan.schedule }));
  const moduleSnapshot = { ...module, resourceIds: [...(module.resourceIds || [])], resourceRoots: { ...objectOr(module.resourceRoots) }, resourceGroupIds: [...(module.resourceGroupIds || [])] };
  const resourceGroupSnapshots = moduleResourceGroups(state, moduleId).map((group) => ({ ...group, resourceIds: [...(group.resourceIds || [])] }));
  const collapsedResourceGroups = { ...objectOr(state.uiState.collapsedResourceGroupsByModule?.[moduleId]) };
  const boardLayout = project ? ensureProjectBoardLayout(state, module.projectId) : null;
  const projectBoardLayoutBefore = boardLayout ? cloneProjectBoardLayout(boardLayout) : null;
  const detachedResourceCount = moduleSnapshot.resourceIds.filter((resourceId) => state.resources[resourceId]).length;
  for (const plan of planSnapshots) delete state.plans[plan.id];
  for (const group of resourceGroupSnapshots) delete state.resourceGroups[group.id];
  delete state.uiState.collapsedResourceGroupsByModule?.[moduleId];
  if (boardLayout) delete boardLayout.items[`module:${moduleId}`];
  delete state.modules[moduleId];
  if (project) {
    project.moduleIds = (project.moduleIds || []).filter((id) => id !== moduleId);
    project.updatedAt = at.toISOString();
  }
  recordLastAction(state, {
    type: 'delete-module',
    label: `删除模块：${module.title}`,
    projectId: module.projectId,
    moduleSnapshot,
    planSnapshots,
    resourceGroupSnapshots,
    collapsedResourceGroups,
    projectBoardLayoutBefore
  });
  return { module: moduleSnapshot, removedPlanCount: planSnapshots.length, removedResourceGroupCount: resourceGroupSnapshots.length, detachedResourceCount };
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString();
  } catch {
    return String(value || '').trim();
  }
}

function validateExternalUri(raw, allowedProtocols = ['https:', 'http:']) {
  const value = String(raw || '').trim();
  let url;
  try { url = new URL(value); } catch { throw new Error('外部地址无效。'); }
  if (!allowedProtocols.includes(url.protocol.toLowerCase())) {
    throw new Error(`不允许打开 ${url.protocol || '未知'} 协议。`);
  }
  return value;
}

function normalizeOpenListBaseUrl(raw) {
  const url = new URL(String(raw || '').trim());
  if (!/^https?:$/.test(url.protocol)) throw new Error('OpenList 地址必须使用 HTTP 或 HTTPS。');
  const hostname = url.hostname.toLowerCase() === 'localhost' ? '127.0.0.1' : url.hostname.toLowerCase();
  const isLoopback = hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
  if (url.protocol === 'http:' && !isLoopback) {
    throw new Error('远程 OpenList 必须使用 HTTPS；HTTP 仅允许本机回环地址。');
  }
  url.pathname = '';
  url.search = '';
  url.hash = '';
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  const defaultPort = (url.protocol === 'http:' && port === '80') || (url.protocol === 'https:' && port === '443');
  return `${url.protocol}//${hostname}${defaultPort ? '' : `:${port}`}`;
}

function normalizeOpenListPath(rawPath) {
  const decoded = decodeURIComponent(String(rawPath || '/').split(/[?#]/, 1)[0] || '/');
  const parts = decoded.replace(/\\/g, '/').split('/').filter((part) => part && part !== '.');
  if (parts.some((part) => part === '..')) throw new Error('OpenList 路径不能包含 ..。');
  return `/${parts.join('/')}`.normalize('NFC');
}

function openListImportRoot(entries) {
  const roots = (Array.isArray(entries) ? entries : []).map((entry) => {
    const remotePath = normalizeOpenListPath(entry?.remotePath || '/');
    if (entry?.is_dir) return remotePath;
    const parts = remotePath.split('/').filter(Boolean);
    parts.pop();
    return normalizeOpenListPath(`/${parts.join('/')}`);
  });
  if (!roots.length) return '/';
  const segments = roots.map((rootPath) => rootPath.split('/').filter(Boolean));
  const common = [];
  for (let index = 0; index < segments[0].length; index += 1) {
    const segment = segments[0][index];
    if (!segments.every((parts) => parts[index] === segment)) break;
    common.push(segment);
  }
  return normalizeOpenListPath(`/${common.join('/')}`);
}

function sourceForResource(resource, sources = {}) {
  if (!resource?.sourceId) return null;
  if (Array.isArray(sources)) return sources.find((source) => source?.id === resource.sourceId) || null;
  return objectOr(sources)[resource.sourceId] || null;
}

function resourcePickerGroupInfo(resource, sources = {}) {
  const metadata = objectOr(resource?.metadata);
  const launcher = objectOr(resource?.launcher);
  const source = sourceForResource(resource, sources);
  const sourceName = String(source?.alias || source?.title || '').trim();

  if (launcher.type === 'openlist' || metadata.remotePath) {
    const remotePath = String(launcher.remotePath || metadata.remotePath || '').replace(/\\/g, '/');
    const parts = remotePath.split('/').filter(Boolean);
    const storedRoot = String(metadata.rootPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
    const fallbackRoot = parts.length > 1 ? `/${parts.slice(0, 2).join('/')}` : `/${parts.join('/')}`;
    const groupRoot = storedRoot && storedRoot !== '/' ? storedRoot : fallbackRoot || '/';
    const rootParts = groupRoot.split('/').filter(Boolean);
    const label = rootParts.at(-1) || sourceName || 'OpenList 视频';
    return {
      key: `openlist:${resource.sourceId || source?.id || ''}:${groupRoot.toLowerCase()}`,
      label,
      detail: `OpenList · ${groupRoot}`
    };
  }

  if (metadata.collectionTitle || metadata.collectionId) {
    const identity = String(metadata.collectionId || metadata.collectionTitle).toLowerCase();
    return {
      key: `bili-collection:${resource.sourceId || ''}:${identity}`,
      label: String(metadata.collectionTitle || sourceName || 'B站合集'),
      detail: sourceName ? `B站合集 · ${sourceName}` : 'B站合集'
    };
  }

  if (metadata.bvid || source?.type === 'bilibili') {
    return {
      key: `bili-source:${resource.sourceId || metadata.mid || 'standalone'}`,
      label: sourceName || source?.alias || 'B站视频',
      detail: 'B站投稿'
    };
  }

  if (launcher.type === 'file' || /^file:/i.test(resource?.canonicalKey || '')) {
    const filePath = String(launcher.path || resource.canonicalKey?.slice(5) || '').replace(/\//g, '\\');
    const parts = filePath.split('\\').filter(Boolean);
    const parentPath = parts.slice(0, -1).join('\\');
    return {
      key: `file:${resource.sourceId || ''}:${parentPath.toLowerCase()}`,
      label: parts.at(-2) || sourceName || '本地文件',
      detail: parentPath || '本地文件'
    };
  }

  if (resource?.kind === 'anki' || launcher.type === 'anki') {
    const deck = String(launcher.deck || metadata.deck || resource.title || 'Anki');
    const parentDeck = deck.split('::')[0] || 'Anki';
    return { key: `anki:${resource.sourceId || ''}:${parentDeck.toLowerCase()}`, label: parentDeck, detail: 'Anki 卡组' };
  }

  const kind = String(resource?.kind || 'other');
  const label = ({ video: '视频', anki: 'Anki', pdf: 'PDF', file: '文件', web: '网页' })[kind] || '其他资源';
  return { key: `kind:${kind}`, label, detail: '其他资源' };
}

function buildResourcePickerIndex(resources = [], sources = {}) {
  const entries = [];
  const groupMap = new Map();
  for (const resource of resources) {
    const group = resourcePickerGroupInfo(resource, sources);
    const entry = {
      resource,
      groupKey: group.key,
      searchText: `${resource.title || ''} ${resource.kind || ''} ${group.label} ${group.detail}`.toLocaleLowerCase()
    };
    entries.push(entry);
    if (!groupMap.has(group.key)) groupMap.set(group.key, { ...group, resources: [] });
    groupMap.get(group.key).resources.push(resource);
  }
  const groups = [...groupMap.values()].sort((left, right) =>
    String(left.label).localeCompare(String(right.label), 'zh-CN', { numeric: true, sensitivity: 'base' })
  );
  return { entries, groups };
}

function parseOpenListUrl(raw, sources = []) {
  const extracted = extractResourceInput(raw);
  let url;
  try { url = new URL(extracted.value); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  const rootPath = normalizeOpenListPath(url.pathname);
  if (/^\/(?:api|d|dav)(?:\/|$)/i.test(rootPath)) return null;
  const baseUrl = normalizeOpenListBaseUrl(url.origin);
  const matchingSource = (sources || []).find((source) => {
    if (source?.type !== 'openlist' || source.deletedAt) return false;
    try { return normalizeOpenListBaseUrl(source.baseUrl) === baseUrl; } catch { return false; }
  });
  const localService = /^(?:localhost|127\.0\.0\.1)$/i.test(url.hostname) && (url.port === '5244' || Boolean(matchingSource));
  if (!matchingSource && !localService) return null;
  const share = rootPath.match(/^\/@s\/([^/]+)(\/.*)?$/i);
  return {
    baseUrl,
    rootPath,
    sourceId: matchingSource?.id || '',
    sourceUrl: url.toString(),
    isShare: Boolean(share),
    shareId: share?.[1] || '',
    sharePath: share?.[2] || '/',
    title: extracted.title || rootPath.split('/').filter(Boolean).pop() || 'OpenList 目录'
  };
}

function parseBiliVideoUrl(raw) {
  const extracted = extractResourceInput(raw);
  const value = extracted.value;
  if (!/^https?:\/\//i.test(value)) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (!/(^|\.)bilibili\.com$/i.test(url.hostname)) return null;
  const bvid = url.pathname.match(/\/(BV[0-9A-Za-z]+)/i)?.[1];
  if (!bvid) return null;
  const page = Math.max(1, Number(url.searchParams.get('p') || 1));
  const canonicalUrl = `https://www.bilibili.com/video/${bvid}${page > 1 ? `?p=${page}` : ''}`;
  return { bvid, page, canonicalUrl, title: extracted.title || '' };
}

function normalizeBiliUserSearchResults(data) {
  const results = Array.isArray(data?.result) ? data.result : [];
  return results
    .filter((item) => item && item.mid && item.uname)
    .map((item) => {
      const avatar = String(item.upic || '');
      return {
        mid: String(item.mid),
        name: String(item.uname),
        description: String(item.usign || item.official_verify?.desc || ''),
        avatar: avatar.startsWith('//') ? `https:${avatar}` : avatar,
        followers: Math.max(0, Number(item.fans || 0)),
        videos: Math.max(0, Number(item.videos || 0)),
        verified: String(item.official_verify?.desc || '')
      };
    });
}

function parseBiliUserInput(raw) {
  const value = String(raw || '').trim();
  if (/^\d+$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (!/(^|\.)bilibili\.com$/i.test(url.hostname)) return '';
    return url.hostname.toLowerCase() === 'space.bilibili.com'
      ? (url.pathname.match(/^\/(\d+)/)?.[1] || '')
      : '';
  } catch { return ''; }
}

function extractResourceInput(raw) {
  const text = String(raw || '').trim();
  if (!text) return { value: '', title: '' };

  const tableCells = /^\s*\|/.test(text)
    ? text.split('|').map((cell) => cell.trim()).filter(Boolean)
    : [];
  let title = tableCells[0] || '';

  const markdownLink = text.match(/\[([^\]]+)\]\(\s*((?:https?:\/\/|jv:\/\/)[^)\s]+)\s*\)/i);
  if (markdownLink) {
    return {
      value: markdownLink[2].trim(),
      title: title || markdownLink[1].trim()
    };
  }

  const angleLink = text.match(/<((?:https?:\/\/|jv:\/\/)[^>\s]+)>/i);
  if (angleLink) return { value: angleLink[1].trim(), title };

  if (tableCells.length) {
    const structured = tableCells.find((cell) => /^(?:https?:\/\/|jv:\/\/|anki\s*:|[a-zA-Z]:[\\/]|\\\\)/i.test(cell));
    if (structured) return { value: structured.trim(), title };
  }

  const bareLink = text.match(/(?:https?:\/\/|jv:\/\/)[^\s|<>]+/i);
  if (bareLink) return { value: bareLink[0].replace(/[),.;，。；]+$/, ''), title };

  return { value: text, title: '' };
}

function inferResource(raw) {
  const extracted = extractResourceInput(raw);
  const value = extracted.value;
  if (!value) throw new Error('资源内容不能为空。');
  const anki = value.match(/^anki\s*:\s*(.+)$/i);
  if (anki) {
    const deck = anki[1].trim();
    return { kind: 'anki', title: extracted.title || deck, canonicalKey: `anki:${deck.toLowerCase()}`, launcher: { type: 'anki', deck } };
  }
  if (/^jv:\/\//i.test(value)) {
    return { kind: 'video', title: extracted.title || '视频资源', canonicalKey: `uri:${value}`, launcher: { type: 'uri', uri: value } };
  }
  if (/^https?:\/\//i.test(value)) {
    const openList = parseOpenListUrl(raw);
    if (openList) {
      return {
        kind: 'openlist-folder',
        title: openList.title,
        canonicalKey: `openlist-folder:${openList.baseUrl}:${openList.rootPath.toLowerCase()}`,
        launcher: { type: 'openlist-folder', baseUrl: openList.baseUrl, rootPath: openList.rootPath },
        metadata: openList
      };
    }
    const bili = parseBiliVideoUrl(raw);
    if (bili) {
      return {
        kind: 'video',
        title: bili.title || bili.bvid,
        canonicalKey: `bili:${bili.bvid.toUpperCase()}:p${bili.page}`,
        launcher: { type: 'potplayer', target: bili.canonicalUrl },
        metadata: { bvid: bili.bvid, page: bili.page, originalUrl: bili.canonicalUrl }
      };
    }
    const normalized = normalizeUrl(value);
    let title = extracted.title || normalized;
    try { title = new URL(normalized).hostname; } catch { /* keep input */ }
    if (extracted.title) title = extracted.title;
    const extension = normalized.split(/[?#]/)[0].split('.').pop()?.toLowerCase();
    const kind = ['pdf'].includes(extension) ? 'pdf' : /bilibili\.com|youtube\.com|youtu\.be|\.mp4(?:$|[?#])|\.mkv(?:$|[?#])/i.test(normalized) ? 'video' : 'web';
    return { kind, title, canonicalKey: `url:${normalized.toLowerCase()}`, launcher: { type: 'uri', uri: normalized } };
  }
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\')) {
    const normalized = value.replace(/\//g, '\\');
    const name = normalized.split('\\').filter(Boolean).pop() || normalized;
    const extension = name.split('.').pop()?.toLowerCase();
    const kind = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'ts', 'm2ts'].includes(extension) ? 'video' : extension === 'pdf' ? 'pdf' : 'file';
    return { kind, title: extracted.title || name, canonicalKey: `file:${normalized.toLowerCase()}`, launcher: { type: 'file', path: normalized } };
  }
  throw new Error(`暂时无法识别：${value}`);
}

function resolveResourceActions(resource, sources = {}) {
  const launcher = objectOr(resource?.launcher);
  const metadata = objectOr(resource?.metadata);
  const source = sourceForResource(resource, sources);
  const actions = { webTarget: null, playTarget: null, defaultTarget: null };

  if (launcher.type === 'openlist') {
    const remotePath = String(launcher.remotePath || metadata.remotePath || '');
    actions.playTarget = { type: 'openlist', sourceId: launcher.sourceId || resource?.sourceId || '', remotePath };
    const baseUrl = String(source?.baseUrl || '').replace(/\/+$/, '');
    if (metadata.sourceUrl) actions.webTarget = String(metadata.sourceUrl);
    else if (baseUrl && remotePath) actions.webTarget = `${baseUrl}${remotePath.split('/').map((part) => encodeURIComponent(part)).join('/')}`;
    return actions;
  }

  if (launcher.type === 'openlist-file') {
    const remotePath = String(launcher.remotePath || metadata.remotePath || '');
    actions.defaultTarget = { type: 'openlist-file', sourceId: launcher.sourceId || resource?.sourceId || '', remotePath };
    return actions;
  }

  if (launcher.type === 'potplayer') {
    actions.playTarget = { type: 'potplayer', target: launcher.target };
    actions.webTarget = String(metadata.sourceUrl || metadata.originalUrl || (/^https?:\/\//i.test(launcher.target || '') ? launcher.target : '')) || null;
    return actions;
  }

  if (launcher.type === 'file') {
    const extension = String(launcher.path || '').split('.').pop()?.toLowerCase();
    if (resource?.kind === 'video' || ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'ts', 'm2ts'].includes(extension)) {
      actions.playTarget = { type: 'potplayer', target: launcher.path };
    } else actions.defaultTarget = { type: 'file', path: launcher.path };
    return actions;
  }

  if (launcher.type === 'anki') {
    actions.defaultTarget = { type: 'anki', deck: launcher.deck };
    return actions;
  }

  if (launcher.type === 'uri' || launcher.uri) {
    const uri = String(launcher.uri || '');
    const bili = parseBiliVideoUrl(uri);
    if (bili) {
      actions.webTarget = bili.canonicalUrl;
      actions.playTarget = { type: 'potplayer', target: bili.canonicalUrl };
    } else if (/^https?:\/\//i.test(uri)) actions.webTarget = uri;
    else actions.defaultTarget = { type: 'uri', uri };
  }
  return actions;
}

function legacyBiliHomepageResources(state) {
  const sources = Object.values(objectOr(state?.sources)).filter((source) => source.type === 'bilibili' && !source.deletedAt);
  const keys = new Set(sources.flatMap((source) => [source.homepage, source.mid ? `https://space.bilibili.com/${source.mid}` : ''].filter(Boolean).map((value) => String(value).replace(/\/+$/, '').toLowerCase())));
  return Object.values(objectOr(state?.resources)).filter((resource) => {
    if (resource.deletedAt) return false;
    const uri = String(resource.launcher?.uri || resource.metadata?.originalUrl || '').replace(/\/+$/, '').toLowerCase();
    return keys.has(uri) || (resource.sourceId && sources.some((source) => source.id === resource.sourceId) && /^https:\/\/space\.bilibili\.com\/\d+$/i.test(uri));
  });
}

function addResource(state, moduleId, input, titleOverride = '') {
  const module = state.modules[moduleId];
  if (!module) throw new Error('找不到目标模块。');
  const inferred = inferResource(input);
  const duplicate = Object.values(state.resources).find((resource) => resource.canonicalKey === inferred.canonicalKey && !resource.deletedAt);
  const timestamp = nowIso();
  const resource = duplicate || {
    id: createId('resource'),
    ...inferred,
    title: String(titleOverride || inferred.title).trim(),
    sourceId: '',
    lastOpenedAt: '',
    lastPosition: '',
    completedAt: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: '',
    deletedAt: ''
  };
  state.resources[resource.id] = resource;
  const linked = linkResourcesToModule(state, moduleId, [resource.id]);
  return { resource, reused: Boolean(duplicate), linked: linked.linkedResourceIds.includes(resource.id) };
}

function addInboxResource(state, input, titleOverride = '') {
  const inferred = inferResource(input);
  const duplicate = Object.values(state.resources).find((resource) => resource.canonicalKey === inferred.canonicalKey && !resource.deletedAt);
  const timestamp = nowIso();
  const resource = duplicate || {
    id: createId('resource'),
    ...inferred,
    title: String(titleOverride || inferred.title).trim(),
    sourceId: '',
    lastOpenedAt: '',
    lastPosition: '',
    completedAt: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: '',
    deletedAt: ''
  };
  state.resources[resource.id] = resource;
  const inboxAdded = !(state.inbox || []).includes(resource.id);
  state.inbox = [...new Set([...(state.inbox || []), resource.id])];
  return { resource, reused: Boolean(duplicate), inboxAdded };
}

function upsertResourceDescriptor(state, moduleId, descriptor) {
  const module = state.modules[moduleId];
  if (!module) throw new Error('找不到目标模块。');
  const canonicalKey = String(descriptor?.canonicalKey || '').trim();
  if (!canonicalKey) throw new Error('资源缺少稳定身份。');
  const timestamp = nowIso();
  const existing = Object.values(state.resources).find((resource) => resource.canonicalKey === canonicalKey && !resource.deletedAt);
  const resource = existing || {
    id: createId('resource'),
    canonicalKey,
    lastOpenedAt: '',
    lastPosition: '',
    completedAt: '',
    createdAt: timestamp,
    archivedAt: '',
    deletedAt: ''
  };
  Object.assign(resource, descriptor, {
    id: resource.id,
    canonicalKey,
    title: String(descriptor.title || resource.title || '未命名资源').trim(),
    updatedAt: timestamp
  });
  state.resources[resource.id] = resource;
  const linked = linkResourcesToModule(state, moduleId, [resource.id], { rootPath: descriptor.metadata?.rootPath });
  return { resource, reused: Boolean(existing), linked: linked.linkedResourceIds.includes(resource.id) };
}

function upsertInboxDescriptor(state, descriptor) {
  const canonicalKey = String(descriptor?.canonicalKey || '').trim();
  if (!canonicalKey) throw new Error('资源缺少稳定身份。');
  const timestamp = nowIso();
  const existing = Object.values(state.resources).find((resource) => resource.canonicalKey === canonicalKey && !resource.deletedAt);
  const resource = existing || {
    id: createId('resource'),
    canonicalKey,
    lastOpenedAt: '',
    lastPosition: '',
    completedAt: '',
    createdAt: timestamp,
    archivedAt: '',
    deletedAt: ''
  };
  Object.assign(resource, descriptor, {
    id: resource.id,
    canonicalKey,
    title: String(descriptor.title || resource.title || '未命名资源').trim(),
    updatedAt: timestamp
  });
  state.resources[resource.id] = resource;
  const inboxAdded = !(state.inbox || []).includes(resource.id);
  state.inbox = [...new Set([...(state.inbox || []), resource.id])];
  return { resource, reused: Boolean(existing), inboxAdded };
}

function linkResourceToModule(state, moduleId, resourceId, options = {}) {
  const module = state.modules[moduleId];
  const resource = state.resources[resourceId];
  if (!module) throw new Error('找不到目标模块。');
  if (!resource || resource.deletedAt) throw new Error('找不到可用资源。');
  linkResourcesToModule(state, moduleId, [resourceId], options);
  state.inbox = (state.inbox || []).filter((id) => id !== resourceId);
  return resource;
}

function archiveProject(state, projectId, at = new Date()) {
  const project = state.projects[projectId];
  if (!project) throw new Error('找不到项目。');
  project.archivedAt = at.toISOString();
  project.updatedAt = at.toISOString();
  if (state.uiState.currentProjectId === projectId) state.uiState.currentProjectId = activeProjects(state)[0]?.id || '';
  return project;
}

function restoreProject(state, projectId, at = new Date()) {
  const project = state.projects[projectId];
  if (!project) throw new Error('找不到项目。');
  project.archivedAt = '';
  project.updatedAt = at.toISOString();
  return project;
}

function referencedResourceIds(state) {
  const referenced = new Set(state.inbox || []);
  for (const module of Object.values(state.modules)) {
    if (module.deletedAt) continue;
    for (const resourceId of module.resourceIds || []) referenced.add(resourceId);
  }
  for (const plan of Object.values(state.plans)) {
    if (plan.deletedAt || plan.archivedAt || plan.targetType !== 'resource') continue;
    for (const resourceId of plan.targetIds || []) referenced.add(resourceId);
  }
  for (const note of Object.values(state.notes)) {
    if (note.deletedAt) continue;
    if (note.resourceId) referenced.add(note.resourceId);
    for (const resourceId of note.resourceIds || []) referenced.add(resourceId);
  }
  for (const entry of state.activity || []) {
    if (entry?.resourceId) referenced.add(entry.resourceId);
  }
  for (const resource of Object.values(state.resources)) {
    if (resource.lastOpenedAt || resource.completedAt) referenced.add(resource.id);
  }
  return referenced;
}

function orphanResources(state) {
  const referenced = referencedResourceIds(state);
  return Object.values(state.resources).filter((resource) => !resource.deletedAt && !referenced.has(resource.id));
}

function orphanCleanupPreview(state) {
  const active = Object.values(state.resources).filter((resource) => !resource.deletedAt);
  const candidates = orphanResources(state);
  const index = buildResourcePickerIndex(candidates, state.sources);
  return {
    totalActive: active.length,
    candidateCount: candidates.length,
    retainedCount: active.length - candidates.length,
    candidates,
    groups: index.groups
  };
}

function deleteOrphanResources(state, candidateIds = null) {
  const referenced = referencedResourceIds(state);
  const candidates = candidateIds ? new Set(candidateIds) : null;
  const removedIds = [];
  for (const [resourceId, resource] of Object.entries(state.resources)) {
    if (referenced.has(resourceId) || (candidates && !candidates.has(resourceId))) continue;
    delete state.resources[resourceId];
    removedIds.push(resourceId);
  }
  state.inbox = (state.inbox || []).filter((resourceId) => state.resources[resourceId]);
  return removedIds;
}

function deleteProject(state, projectId, options = {}) {
  const project = state.projects[projectId];
  if (!project) throw new Error('找不到项目。');
  const moduleIds = new Set(Object.values(state.modules).filter((module) => module.projectId === projectId).map((module) => module.id));
  const candidateResourceIds = new Set();
  for (const moduleId of moduleIds) {
    for (const resourceId of state.modules[moduleId]?.resourceIds || []) candidateResourceIds.add(resourceId);
  }
  for (const [groupId, group] of Object.entries(objectOr(state.resourceGroups))) {
    if (moduleIds.has(group.moduleId)) delete state.resourceGroups[groupId];
  }
  for (const moduleId of moduleIds) delete state.uiState.collapsedResourceGroupsByModule?.[moduleId];
  for (const moduleId of moduleIds) delete state.modules[moduleId];
  for (const [planId, plan] of Object.entries(state.plans)) {
    if (plan.projectId === projectId || (plan.targetType === 'module' && plan.targetIds?.some((id) => moduleIds.has(id)))) delete state.plans[planId];
  }
  for (const [noteId, note] of Object.entries(state.notes)) {
    if (note.projectId === projectId) delete state.notes[noteId];
  }
  const vaultRefIds = [...(project.vaultRefIds || [])];
  delete state.projects[projectId];
  for (const vaultRefId of vaultRefIds) {
    const stillReferenced = Object.values(state.projects).some((candidate) => (candidate.vaultRefIds || []).includes(vaultRefId));
    if (!stillReferenced) delete state.vaultRefs[vaultRefId];
  }
  delete state.uiState.collapsedTodayProjects[projectId];
  delete state.uiState.projectPanelCollapsedByProject[projectId];
  delete state.uiState.projectRecentCollapsedByProject[projectId];
  delete state.uiState.projectBoardLayouts[projectId];
  state.uiState.todayProjectOrder = uniqueStrings(state.uiState.todayProjectOrder).filter((id) => id !== projectId);
  if (state.uiState.currentProjectId === projectId) state.uiState.currentProjectId = activeProjects(state)[0]?.id || '';
  // 保留旧 API 的显式孤立资源清理语义；Vault 引用清理始终只删索引，不操作真实文件。
  const removedResourceIds = options.deleteOrphans ? deleteOrphanResources(state, candidateResourceIds) : [];
  return { project, removedModuleCount: moduleIds.size, removedResourceIds };
}

function recordLastAction(state, action) {
  state.uiState.lastAction = action ? { ...action, at: action.at || nowIso() } : null;
  return state.uiState.lastAction;
}

function undoLastAction(state) {
  const action = state.uiState.lastAction;
  if (!action) return { undone: false, removedResourceIds: [] };
  if (action.type === 'link-vault-refs') {
    const project = state.projects[action.projectId];
    if (!project || project.deletedAt) {
      state.uiState.lastAction = null;
      return { undone: false, action, removedResourceIds: [], reason: 'project-missing' };
    }
    let unlinkedVaultRefCount = 0;
    for (const vaultRefId of action.linkedVaultRefIds || []) {
      const result = unlinkVaultRefFromProject(state, action.projectId, vaultRefId);
      if (result.removed) unlinkedVaultRefCount += 1;
    }
    for (const snapshot of action.reusedVaultRefSnapshots || []) {
      state.vaultRefs[snapshot.id] = { ...snapshot };
    }
    state.uiState.lastAction = null;
    return { undone: true, action, removedResourceIds: [], unlinkedVaultRefCount };
  }
  if (action.type === 'project-board-layout') {
    if (!state.projects[action.projectId]) {
      state.uiState.lastAction = null;
      return { undone: false, action, removedResourceIds: [], reason: 'project-missing' };
    }
    state.uiState.projectBoardLayouts = objectOr(state.uiState.projectBoardLayouts);
    state.uiState.projectBoardLayouts[action.projectId] = normalizeProjectBoardLayout(
      action.layoutBefore,
      state,
      action.projectId,
      state.uiState.projectPanelOrder
    );
    state.uiState.lastAction = null;
    return { undone: true, action, removedResourceIds: [], restoredProjectBoardLayout: true };
  }
  if (action.type === 'auto-group-resources') {
    const module = state.modules[action.moduleId];
    if (!module) { state.uiState.lastAction = null; return { undone: false, action, removedResourceIds: [], reason: 'module-missing' }; }
    for (const group of moduleResourceGroups(state, module.id).filter((candidate) => candidate.autoGroupKey === action.autoGroupKey)) deleteResourceGroup(state, group.id);
    state.resourceGroups = objectOr(state.resourceGroups);
    for (const snapshot of action.resourceGroupSnapshotsBefore || []) state.resourceGroups[snapshot.id] = { ...snapshot, resourceIds: [...(snapshot.resourceIds || [])] };
    const currentIds = moduleResourceGroups(state, module.id).map((group) => group.id);
    module.resourceGroupIds = [...new Set([...(action.moduleResourceGroupIdsBefore || []).filter((groupId) => state.resourceGroups[groupId]?.moduleId === module.id), ...currentIds])];
    const collapsed = objectOr(state.uiState.collapsedResourceGroupsByModule?.[module.id]);
    for (const groupId of action.autoGroupIdsAfter || []) delete collapsed[groupId];
    Object.assign(collapsed, objectOr(action.collapsedBefore));
    state.uiState.collapsedResourceGroupsByModule = objectOr(state.uiState.collapsedResourceGroupsByModule);
    if (Object.keys(collapsed).length) state.uiState.collapsedResourceGroupsByModule[module.id] = collapsed;
    else delete state.uiState.collapsedResourceGroupsByModule[module.id];
    state.uiState.lastAction = null;
    return { undone: true, action, removedResourceIds: [], restoredResourceGroupCount: (action.resourceGroupSnapshotsBefore || []).length };
  }
  if (action.type === 'delete-module') {
    const module = action.moduleSnapshot;
    const groupConflict = (action.resourceGroupSnapshots || []).some((group) => state.resourceGroups[group.id]);
    if (!module || state.modules[module.id] || !state.projects[module.projectId] || groupConflict) {
      state.uiState.lastAction = null;
      return { undone: false, action, removedResourceIds: [], reason: groupConflict ? 'group-restore-conflict' : 'restore-conflict' };
    }
    state.modules[module.id] = { ...module, resourceIds: [...(module.resourceIds || [])], resourceRoots: { ...objectOr(module.resourceRoots) }, resourceGroupIds: [...(module.resourceGroupIds || [])] };
    const project = state.projects[module.projectId];
    project.moduleIds = [...new Set([...(project.moduleIds || []), module.id])];
    state.uiState.projectBoardLayouts = objectOr(state.uiState.projectBoardLayouts);
    state.uiState.projectBoardLayouts[module.projectId] = normalizeProjectBoardLayout(
      action.projectBoardLayoutBefore,
      state,
      module.projectId,
      state.uiState.projectPanelOrder
    );
    project.updatedAt = nowIso();
    let restoredPlanCount = 0;
    for (const plan of action.planSnapshots || []) {
      if (state.plans[plan.id]) continue;
      state.plans[plan.id] = { ...plan, targetIds: [...(plan.targetIds || [])], schedule: Array.isArray(plan.schedule) ? [...plan.schedule] : plan.schedule };
      restoredPlanCount += 1;
    }
    state.resourceGroups = objectOr(state.resourceGroups);
    let restoredResourceGroupCount = 0;
    for (const group of action.resourceGroupSnapshots || []) {
      state.resourceGroups[group.id] = { ...group, resourceIds: [...(group.resourceIds || [])] };
      restoredResourceGroupCount += 1;
    }
    state.modules[module.id].resourceGroupIds = (state.modules[module.id].resourceGroupIds || []).filter((groupId) => state.resourceGroups[groupId]?.moduleId === module.id);
    const collapsed = {};
    for (const [groupId, value] of Object.entries(objectOr(action.collapsedResourceGroups))) {
      if (state.resourceGroups[groupId]?.moduleId === module.id) collapsed[groupId] = Boolean(value);
    }
    if (Object.keys(collapsed).length) {
      state.uiState.collapsedResourceGroupsByModule = objectOr(state.uiState.collapsedResourceGroupsByModule);
      state.uiState.collapsedResourceGroupsByModule[module.id] = collapsed;
    }
    state.uiState.lastAction = null;
    return { undone: true, action, removedResourceIds: [], restoredModuleCount: 1, restoredPlanCount, restoredResourceGroupCount };
  }
  const moduleAffected = new Set(action.linkedResourceIds ?? action.resourceIds ?? []);
  const inboxAffected = new Set(action.inboxAddedResourceIds ?? action.resourceIds ?? []);
  if (action.type === 'add-resources') {
    if (action.moduleId && state.modules[action.moduleId]) {
      removeResourcesFromModule(state, action.moduleId, [...moduleAffected]);
    }
    if (action.inbox) state.inbox = (state.inbox || []).filter((id) => !inboxAffected.has(id));
    if (action.restoreInboxIds?.length) state.inbox = [...new Set([...(state.inbox || []), ...action.restoreInboxIds.filter((id) => state.resources[id])])];
    for (const groupId of action.createdResourceGroupIds || []) {
      const group = state.resourceGroups[groupId];
      if (group && group.moduleId === action.moduleId && !(group.resourceIds || []).length) deleteResourceGroup(state, groupId);
    }
  }
  const removedResourceIds = deleteOrphanResources(state, action.createdResourceIds || []);
  state.uiState.lastAction = null;
  return { undone: true, action, removedResourceIds };
}

function trashResource(state, resourceId, at = new Date()) {
  const resource = state.resources[resourceId];
  if (!resource) throw new Error('找不到资源。');
  resource.deletedAt = at.toISOString();
  resource.updatedAt = at.toISOString();
  state.inbox = (state.inbox || []).filter((id) => id !== resourceId);
  return resource;
}

function restoreResource(state, resourceId, at = new Date()) {
  const resource = state.resources[resourceId];
  if (!resource) throw new Error('找不到资源。');
  resource.deletedAt = '';
  resource.updatedAt = at.toISOString();
  return resource;
}

function upsertSource(state, input) {
  const type = String(input?.type || '').trim();
  if (!type) throw new Error('来源类型不能为空。');
  const identity = String(input.identity || input.baseUrl || input.path || input.endpoint || input.mid || type).trim().toLowerCase();
  const existing = Object.values(state.sources).find((source) => source.type === type && source.identity === identity && !source.deletedAt);
  const timestamp = nowIso();
  const source = existing || {
    id: createId('source'),
    type,
    identity,
    createdAt: timestamp,
    deletedAt: ''
  };
  Object.assign(source, input, { id: source.id, type, identity, updatedAt: timestamp });
  state.sources[source.id] = source;
  return { source, reused: Boolean(existing) };
}

function createPlanForTarget(state, projectId, targetType, targetId, title) {
  if (!state.projects[projectId]) throw new Error('找不到目标项目。');
  if (targetType === 'module' && !state.modules[targetId]) throw new Error('找不到目标模块。');
  if (targetType === 'resource' && !state.resources[targetId]) throw new Error('找不到目标资源。');
  const existing = Object.values(state.plans).find((plan) => plan.projectId === projectId && plan.targetType === targetType && plan.targetIds?.includes(targetId) && !plan.deletedAt && !plan.archivedAt);
  if (existing) return { plan: existing, reused: true };
  const id = createId('plan');
  const timestamp = nowIso();
  const plan = {
    id,
    projectId,
    title: String(title || '学习计划').trim(),
    targetType,
    targetIds: [targetId],
    schedule: { type: 'daily', weekdays: [1, 2, 3, 4, 5, 6, 0] },
    dailyTarget: 1,
    resetHour: 4,
    history: {},
    sortOrder: projectPlans(state, projectId).length,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: '',
    deletedAt: ''
  };
  state.plans[id] = plan;
  return { plan, reused: false };
}

function studyDate(now = new Date(), resetHour = 4) {
  const shifted = new Date(now.getTime());
  shifted.setHours(shifted.getHours() - Number(resetHour || 0));
  const year = shifted.getFullYear();
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function planScheduledFor(plan, now = new Date()) {
  const shifted = new Date(now.getTime());
  shifted.setHours(shifted.getHours() - Number(plan?.resetHour || 0));
  const weekdays = Array.isArray(plan?.schedule?.weekdays) && plan.schedule.weekdays.length
    ? plan.schedule.weekdays.map(Number)
    : [1, 2, 3, 4, 5, 6, 0];
  return weekdays.includes(shifted.getDay());
}

function planProgress(plan, now = new Date()) {
  const key = studyDate(now, plan.resetHour);
  const entry = objectOr(plan.history?.[key]);
  const completed = Math.max(0, Number(entry.completed || 0));
  const target = Math.max(1, Number(plan.dailyTarget || 1));
  return { key, completed, target, done: completed >= target };
}

function incrementPlan(state, planId, delta = 1, now = new Date()) {
  const plan = state.plans[planId];
  if (!plan) throw new Error('找不到学习计划。');
  const progress = planProgress(plan, now);
  plan.history = objectOr(plan.history);
  plan.history[progress.key] = {
    completed: Math.max(0, Math.min(progress.target, progress.completed + Number(delta || 0))),
    updatedAt: now.toISOString()
  };
  plan.updatedAt = now.toISOString();
  return planProgress(plan, now);
}

function markResourceOpened(state, resourceId, at = new Date()) {
  const resource = state.resources[resourceId];
  if (!resource) throw new Error('找不到资源。');
  resource.lastOpenedAt = at.toISOString();
  resource.updatedAt = at.toISOString();
  state.activity.push({ id: createId('activity'), type: 'resource-opened', resourceId, at: at.toISOString() });
  state.activity = state.activity.slice(-500);
  return resource;
}

function toggleResourceComplete(state, resourceId, at = new Date()) {
  const resource = state.resources[resourceId];
  if (!resource) throw new Error('找不到资源。');
  resource.completedAt = resource.completedAt ? '' : at.toISOString();
  resource.updatedAt = at.toISOString();
  return resource;
}

function markResourceComplete(state, resourceId, at = new Date()) {
  const resource = state.resources[resourceId];
  if (!resource) throw new Error('找不到资源。');
  if (!resource.completedAt) resource.completedAt = at.toISOString();
  resource.updatedAt = at.toISOString();
  return resource;
}

module.exports = {
  SCHEMA_VERSION,
  activeProjects,
  addInboxResource,
  addResource,
  autoGroupResources,
  archiveProject,
  archiveModule,
  buildResourcePickerIndex,
  createId,
  createModule,
  createPlanForTarget,
  createProjectMemo,
  createProject,
  createResourceGroup,
  deleteProjectMemo,
  deleteOrphanResources,
  deleteProject,
  deleteModule,
  deleteResourceGroup,
  defaultState,
  defaultResourceAutoGroupEnabled,
  extractResourceInput,
  incrementPlan,
  inferResource,
  ensureProjectBoardLayout,
  linkResourceToModule,
  linkResourcesToModule,
  linkVaultEntriesToProject,
  linkVaultRefToProject,
  markResourceOpened,
  markResourceComplete,
  markVaultRefMissing,
  moveModule,
  moveTodayProjectBefore,
  moveTodaySidebarCardBefore,
  moveProjectBoardItem,
  moveResourceGroup,
  moveResourceToGroup,
  moveResourcesToGroup,
  moduleResources,
  moduleResourceGroups,
  moduleResourceRoot,
  normalizeState,
  validateExternalUri,
  normalizeVaultPath,
  normalizeOpenListBaseUrl,
  openListImportRoot,
  normalizeOpenListPath,
  normalizeBiliUserSearchResults,
  orphanCleanupPreview,
  parseBiliUserInput,
  orphanResources,
  parseBiliVideoUrl,
  parseOpenListUrl,
  planScheduledFor,
  planProgress,
  projectModules,
  projectBoardItems,
  projectPlans,
  projectVaultRefs,
  recordRecentVaultCreatePath,
  recordLastAction,
  removeResourcesFromModule,
  renameResourceGroup,
  resourcePickerGroupInfo,
  resourceGroupProgress,
  resourceGroupTitle,
  resourceFolderPath,
  renameProject,
  resetProjectBoardLayout,
  resolveResourceActions,
  legacyBiliHomepageResources,
  restoreProject,
  restoreModule,
  restoreResource,
  restoreVaultRef,
  setProjectRecentCollapsed,
  setProjectMemo,
  setProjectPanelCollapsed,
  setProjectPanelOrder,
  setResourceGroupCollapsed,
  studyDate,
  todayProjects,
  trashResource,
  toggleResourceComplete,
  togglePinnedVaultRef,
  togglePinnedVaultCreatePath,
  undoLastAction,
  updateProjectMemo,
  updateProjectMemoTitle,
  upsertResourceDescriptor,
  upsertInboxDescriptor,
  unlinkVaultRefFromProject,
  updateVaultRefPath,
  upsertSource,
  upsertVaultRef
};
