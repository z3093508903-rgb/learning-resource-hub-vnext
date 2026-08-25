'use strict';

function objectOr(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function requireReferenceResource(state, resourceId) {
  const resource = objectOr(state?.resources)[String(resourceId || '')];
  if (!resource || resource.deletedAt) throw new Error('Go Study 找不到这条回链对应的学习资源。');
  return resource;
}

function normalizePlaybackPosition(position) {
  if (!position || position.type !== 'time') throw new Error('当前资源回链不包含可播放的时间位置。');
  const seconds = Number(position.seconds);
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('学习位置中的播放时间无效。');
  return { type: 'time', seconds };
}

function formatPotPlayerTime(position) {
  const normalized = normalizePlaybackPosition(position);
  const totalSeconds = Math.floor(normalized.seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function resolveReferencePlayback(state, reference, resolveActions) {
  if (typeof resolveActions !== 'function') throw new Error('Go Study 资源启动器不可用。');
  const resource = requireReferenceResource(state, reference?.resourceId);
  const position = normalizePlaybackPosition(reference?.position);
  const actions = resolveActions(resource) || {};
  if (!actions.playTarget) throw new Error('这条学习资源当前没有可用的视频播放方式。');
  return {
    resource,
    position,
    playerTime: formatPotPlayerTime(position),
    playTarget: actions.playTarget
  };
}

function updateResumePosition(resource, position, now = new Date()) {
  if (!resource || typeof resource !== 'object') throw new Error('无法更新不存在的学习资源。');
  const normalized = normalizePlaybackPosition(position);
  const updatedAt = now instanceof Date ? now.toISOString() : String(now || new Date().toISOString());
  resource.resume = {
    ...(resource.resume && typeof resource.resume === 'object' ? resource.resume : {}),
    position: normalized,
    updatedAt
  };
  resource.lastPosition = normalized.seconds;
  return resource.resume;
}

module.exports = {
  formatPotPlayerTime,
  normalizePlaybackPosition,
  requireReferenceResource,
  resolveReferencePlayback,
  updateResumePosition
};
